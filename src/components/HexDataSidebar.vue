<template>
    <div class="hex-data-sidebar">
        <!-- Header: dark theme bar with location + overall rating card -->
        <div class="sidebar-header">
            <div class="header-top">
                <div class="header-title-block">
                    <span class="location-pin" aria-hidden="true">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                    </span>
                    <div>
                        <h2 class="location-title">Hexagon {{ hexId }}</h2>
                        <p class="location-subtitle">Geographic Area</p>
                    </div>
                </div>
                <button class="close-button" @click="$emit('close')" aria-label="Close sidebar">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                    </svg>
                </button>
            </div>
            <div class="overall-rating-card" :class="getOverallRankClass()">
                <span class="rating-label">Overall environmental burden</span>
                <p class="rating-definition">Average of this area’s rankings across the factors below. Higher = greater environmental burden (e.g. more pollution, higher vulnerability).</p>
                <div class="rating-row">
                    <span class="rating-value">{{ getOverallRank() }}</span>
                    <span class="rating-tag" :style="{ backgroundColor: getRankStyle(getOverallRank()).tagBg, color: getRankStyle(getOverallRank()).tagFg }">{{ getRankTagLabel(getOverallRank()) }}</span>
                    <span v-if="isFavorable(getOverallRank())" class="rating-check" aria-hidden="true">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </span>
                </div>
            </div>
        </div>

        <div class="sidebar-content">
            <p class="intro-text">
                Environmental conditions and characteristics of this region.
            </p>

            <h3 class="section-title">Environmental Factors</h3>
            <div class="factors-list">
                <div v-for="factor in factors" :key="factor.id" class="factor-card" :style="{ backgroundColor: getRankStyle(getRankLabel(factor)).cardBg }">
                    <div class="factor-card-header">
                        <h4 class="factor-name">{{ factor.name }}</h4>
                        <span class="factor-tag" :style="{ backgroundColor: getRankStyle(getRankLabel(factor)).tagBg, color: getRankStyle(getRankLabel(factor)).tagFg }">{{ getRankLabel(factor) }}</span>
                    </div>
                    <p class="factor-variable">{{ factor.key || factor.valueField }}</p>
                    <p class="factor-value">{{ formatValue(factor) }}<span class="factor-unit">{{ factor.unit }}</span></p>
                    <div class="percentile-block">
                        <div class="percentile-bar">
                            <div class="percentile-fill" :style="{ width: getPercentile(factor) + '%', backgroundColor: getRankStyle(getRankLabel(factor)).tagBg }"></div>
                            <div class="percentile-marker" :style="{ left: getPercentile(factor) + '%' }"></div>
                        </div>
                        <div class="percentile-labels">
                            <span>0</span>
                            <span>50</span>
                            <span>100</span>
                        </div>
                        <p class="percentile-value">{{ getPercentileOrdinal(factor) }} percentile</p>
                    </div>
                    <p class="factor-description">
                        <span class="factor-bullet" :style="{ backgroundColor: getRankStyle(getRankLabel(factor)).tagBg }"></span>
                        This area shows a <strong>{{ getRankLabel(factor).toLowerCase() }}</strong> level compared to other areas. {{ getFactorShortDescription(factor) }}
                    </p>
                </div>
            </div>

            <div v-if="stats" class="data-section">
                <h3 class="section-title">Demographic Information</h3>
                <p class="description-text" v-if="properties.E_TOTPOP != null">
                    Population in this area is approximately <strong>{{ formatNumber(properties.E_TOTPOP, 0) }} people</strong>
                    ({{ getPopulationContext() }}).
                </p>
                <p class="description-text" v-else>
                    Population data for this hexagon is not available.
                </p>
            </div>

            <div class="data-section data-sources">
                <h3 class="section-title">Data Sources</h3>
                <p class="description-text">
                    Data from the CHEL 2022 (Climate and Health Equity Index) dataset. Values may be estimates or interpolations.
                </p>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
    feature: {
        type: Object,
        required: true
    },
    factors: {
        type: Array,
        required: true
    },
    stats: {
        type: Object,
        default: null
    }
})

const emit = defineEmits(['close'])

const properties = computed(() => props.feature?.properties || {})
const hexId = computed(() => properties.value.hex_id ?? properties.value.fid ?? 'N/A')

function formatNumber(value, digits = 2) {
    if (value === null || value === undefined || Number.isNaN(value)) return 'N/A'
    const formatter = new Intl.NumberFormat('en-US', {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits > 0 ? 0 : undefined
    })
    return formatter.format(value)
}

function formatValue(factor) {
    const value = properties.value[factor.valueField || factor.key]
    if (value === null || value === undefined || Number.isNaN(value)) return 'N/A'

    // Use appropriate digits based on factor type (CHEL fields)
    let digits = 2
    if (factor.id === 'pop' || factor.valueField === 'E_TOTPOP') digits = 0
    else if (factor.id === 'asthma' || factor.valueField === 'EP_ASTHMA') digits = 1

    return formatNumber(value, digits)
}

function getRankLabel(factor) {
    const fieldKey = factor.valueField || factor.key
    const value = properties.value[fieldKey]
    if (value === null || value === undefined || Number.isNaN(value)) return 'N/A'

    // Get stats for this factor
    if (!props.stats || !props.stats[fieldKey]) {
        // If stats not available, try to use breaks from factor if available
        if (factor.breaks && Array.isArray(factor.breaks) && factor.breaks.length >= 4) {
            const breaks = factor.breaks
            if (value < breaks[0]) return 'Very Low'
            if (value < breaks[1]) return 'Low'
            if (value < breaks[2]) return 'Moderate'
            if (value < breaks[3]) return 'High'
            return 'Very High'
        }
        return 'N/A'
    }

    const factorStats = props.stats[fieldKey]
    const breaks = [factorStats.q20, factorStats.q40, factorStats.q60, factorStats.q80]

    // Determine which bucket the value falls into
    if (value < breaks[0]) return 'Very Low'
    if (value < breaks[1]) return 'Low'
    if (value < breaks[2]) return 'Moderate'
    if (value < breaks[3]) return 'High'
    return 'Very High'
}

function getOverallRank() {
    // Calculate an average rank across all factors
    const ranks = props.factors
        .map(factor => {
            const rank = getRankLabel(factor)
            if (rank === 'Very Low') return 1
            if (rank === 'Low') return 2
            if (rank === 'Moderate') return 3
            if (rank === 'High') return 4
            if (rank === 'Very High') return 5
            return null // Use null instead of 0 to distinguish from valid ranks
        })
        .filter(r => r !== null && r > 0) // Filter out null and invalid ranks

    if (ranks.length === 0) return 'N/A'

    const avgRank = ranks.reduce((a, b) => a + b, 0) / ranks.length
    if (avgRank < 1.5) return 'Very Low'
    if (avgRank < 2.5) return 'Low'
    if (avgRank < 3.5) return 'Moderate'
    if (avgRank < 4.5) return 'High'
    return 'Very High'
}

function getRankDescription() {
    const rank = getOverallRank()
    if (rank === 'Very Low') return 'favorable'
    if (rank === 'Low') return 'relatively favorable'
    if (rank === 'Moderate') return 'moderate'
    if (rank === 'High') return 'concerning'
    if (rank === 'Very High') return 'highly concerning'
    return 'varying'
}

function getFactorDescription(factor) {
    const descriptions = {
        'pm25': 'E_PM: Fine particulate matter (PM2.5) concentration from the CHEL 2022 dataset. Lower values indicate better air quality.',
        'asthma': 'EP_ASTHMA: Asthma prevalence in the population, from the CHEL 2022 dataset.',
        'pm25pct': 'EPL_PM: Percentile ranking of air pollution (0–1), from the CHEL 2022 dataset.',
        'ozone': 'E_OZONE: Ozone concentration from the CHEL 2022 dataset.',
        'ozonepct': 'EPL_OZONE: Percentile ranking of ozone (0–1), from the CHEL 2022 dataset.',
        'svm': 'SPL_SVM: Social Vulnerability Index from the CHEL 2022 dataset.',
        'pop': 'E_TOTPOP: Total population in this hex, from the CHEL 2022 dataset.'
    }
    return descriptions[factor.id] || `${factor.name} is an environmental indicator from the CHEL 2022 dataset.`
}

function getFactorContext(factor) {
    const rank = getRankLabel(factor)
    const contexts = {
        'Very Low': 'This represents one of the best-performing areas in the dataset for this metric.',
        'Low': 'This area performs better than most other areas for this metric.',
        'Moderate': 'This area shows average performance for this metric relative to the dataset.',
        'High': 'This area shows concerning levels that are higher than most other areas.',
        'Very High': 'This area shows some of the highest levels in the dataset, requiring attention.'
    }
    return contexts[rank] || ''
}

function getPopulationContext() {
    const pop = properties.value.E_TOTPOP
    if (!pop || !props.stats || !props.stats.E_TOTPOP) return 'in a typical range'

    const popStats = props.stats.E_TOTPOP
    const breaks = [popStats.q20, popStats.q40, popStats.q60, popStats.q80]

    if (pop < breaks[0]) return 'among the smallest population areas'
    if (pop < breaks[1]) return 'below average in population size'
    if (pop < breaks[2]) return 'around the median population size'
    if (pop < breaks[3]) return 'above average in population size'
    return 'among the largest population areas'
}

/* Colorblind-friendly: blues (theme) for favorable, amber/orange for moderate, no red-green only */
const RANK_STYLES = {
    'Very Low': { cardBg: '#e8f4fc', tagBg: '#1e4f86', tagFg: '#fff' },
    'Low': { cardBg: '#e0f0fa', tagBg: '#5aa5d6', tagFg: '#fff' },
    'Moderate': { cardBg: '#fef3c7', tagBg: '#d97706', tagFg: '#fff' },
    'High': { cardBg: '#ffedd5', tagBg: '#ea580c', tagFg: '#fff' },
    'Very High': { cardBg: '#fef2f2', tagBg: '#b91c1c', tagFg: '#fff' },
    'N/A': { cardBg: '#f3f4f6', tagBg: '#6b7280', tagFg: '#fff' }
}

function getRankStyle(rank) {
    return RANK_STYLES[rank] || RANK_STYLES['N/A']
}

function getRankTagLabel(rank) {
    const labels = { 'Very Low': 'Favorable', 'Low': 'Favorable', 'Moderate': 'Moderate', 'High': 'Elevated', 'Very High': 'High' }
    return labels[rank] || rank
}

function isFavorable(rank) {
    return rank === 'Very Low' || rank === 'Low'
}

function getOverallRankClass() {
    const rank = getOverallRank()
    if (rank === 'Very Low' || rank === 'Low') return 'rating-favorable'
    if (rank === 'Moderate') return 'rating-moderate'
    return 'rating-elevated'
}

function getPercentile(factor) {
    const fieldKey = factor.valueField || factor.key
    const value = Number(properties.value[fieldKey])
    if (value === null || value === undefined || Number.isNaN(value)) return 50
    // EPL_PM, EPL_OZONE are already 0–1 in the dataset
    if (fieldKey === 'EPL_PM' || fieldKey === 'EPL_OZONE') return Math.round((value || 0) * 100)
    const factorStats = props.stats?.[fieldKey]
    if (!factorStats || factorStats.min == null || factorStats.max == null) return 50
    const { min, max, q20, q40, q60, q80 } = factorStats
    if (value <= min) return 0
    if (value >= max) return 100
    // Linear interpolation between quantiles for a proper percentile estimate
    const lerp = (v, a, b, pctLow, pctHigh) => {
        if (b === a) return (pctLow + pctHigh) / 2
        const t = (v - a) / (b - a)
        return pctLow + t * (pctHigh - pctLow)
    }
    let pct
    if (value <= q20) pct = lerp(value, min, q20, 0, 20)
    else if (value <= q40) pct = lerp(value, q20, q40, 20, 40)
    else if (value <= q60) pct = lerp(value, q40, q60, 40, 60)
    else if (value <= q80) pct = lerp(value, q60, q80, 60, 80)
    else pct = lerp(value, q80, max, 80, 100)
    return Math.min(100, Math.max(0, Math.round(pct)))
}

function getPercentileOrdinal(factor) {
    const p = getPercentile(factor)
    if (p >= 11 && p <= 13) return p + 'th'
    const d = p % 10
    if (d === 1) return p + 'st'
    if (d === 2) return p + 'nd'
    if (d === 3) return p + 'rd'
    return p + 'th'
}

function getFactorShortDescription(factor) {
    const descriptions = {
        pm25: 'Fine particulate matter (PM2.5) concentration. Lower values indicate better air quality.',
        asthma: 'Asthma prevalence in the population.',
        pm25pct: 'Percentile ranking of air pollution.',
        ozone: 'Ozone concentration.',
        ozonepct: 'Percentile ranking of ozone.',
        svm: 'Social Vulnerability Index.',
        pop: 'Total population in this hex.'
    }
    return descriptions[factor.id] || `${factor.name} (CHEL 2022 dataset).`
}
</script>

<style scoped>
.hex-data-sidebar {
    position: fixed;
    top: 0;
    right: 0;
    width: 400px;
    max-width: calc(100vw - 320px);
    height: 100vh;
    background: #ffffff;
    box-shadow: -2px 0 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideIn 0.3s ease-out;
}

/* Mobile Responsive Styles */
@media (max-width: 768px) {
    .hex-data-sidebar {
        width: 100%;
        max-width: 100vw;
        right: 0;
        left: 0;
    }
}

@media (max-width: 480px) {
    .hex-data-sidebar {
        padding: 16px;
    }

    .sidebar-header h3 {
        font-size: 18px;
    }

    .stat-item-label {
        font-size: 12px;
    }

    .stat-item-value {
        font-size: 20px;
    }
}

@keyframes slideIn {
    from {
        transform: translateX(100%);
    }

    to {
        transform: translateX(0);
    }
}

/* Header: theme blue, matches app primary */
.sidebar-header {
    flex-shrink: 0;
    background: #1e4f86;
    color: #fff;
    padding: 20px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}

.header-title-block {
    display: flex;
    align-items: center;
    gap: 12px;
}

.location-pin {
    display: flex;
    color: rgba(255, 255, 255, 0.9);
}

.location-title {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.02em;
}

.location-subtitle {
    margin: 4px 0 0 0;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.85);
}

.close-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.9);
    transition: color 0.2s;
}

.close-button:hover {
    color: #fff;
}

.overall-rating-card {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.overall-rating-card.rating-favorable {
    background: rgba(255, 255, 255, 0.2);
}

.rating-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(255, 255, 255, 0.85);
}

.rating-definition {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.9);
    margin: 6px 0 10px 0;
    line-height: 1.4;
}

.rating-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.rating-value {
    font-size: 20px;
    font-weight: 700;
    color: #fff;
}

.rating-tag {
    font-size: 12px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 999px;
}

.rating-check {
    color: #93c5fd;
    display: flex;
    margin-left: auto;
}

.sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    background: #fff;
}

.intro-text {
    font-size: 14px;
    color: #6b7280;
    margin: 0 0 24px 0;
    line-height: 1.5;
}

.data-section {
    margin-bottom: 28px;
}

.data-sources .description-text {
    margin-bottom: 0;
}

.section-title {
    font-size: 14px;
    font-weight: 600;
    color: #374151;
    margin: 0 0 16px 0;
    letter-spacing: 0.02em;
}

.description-text {
    font-size: 14px;
    line-height: 1.6;
    color: #374151;
    margin: 0 0 12px 0;
}

.description-text:last-child {
    margin-bottom: 0;
}

.description-text strong {
    color: #111827;
    font-weight: 600;
}

.factors-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.factor-card {
    border-radius: 12px;
    padding: 16px;
    border: 1px solid rgba(0, 0, 0, 0.06);
}

.factor-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
}

.factor-name {
    font-size: 15px;
    font-weight: 600;
    color: #111827;
    margin: 0;
}

.factor-tag {
    font-size: 11px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 6px;
    flex-shrink: 0;
}

.factor-variable {
    font-size: 12px;
    color: #6b7280;
    margin: 0 0 4px 0;
}

.factor-value {
    font-size: 24px;
    font-weight: 700;
    color: #111827;
    margin: 0 0 12px 0;
}

.factor-unit {
    font-size: 14px;
    font-weight: 500;
    color: #6b7280;
    margin-left: 4px;
}

.percentile-block {
    margin-bottom: 12px;
}

.percentile-bar {
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
    position: relative;
    margin-bottom: 4px;
}

.percentile-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.25s ease;
}

.percentile-marker {
    position: absolute;
    top: -2px;
    width: 2px;
    height: 12px;
    background: #374151;
    border-radius: 1px;
    transform: translateX(-50%);
}

.percentile-labels {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #9ca3af;
    margin-bottom: 2px;
}

.percentile-value {
    font-size: 12px;
    color: #6b7280;
    margin: 0;
}

.factor-description {
    font-size: 13px;
    line-height: 1.55;
    color: #374151;
    margin: 0;
    display: flex;
    gap: 8px;
    align-items: flex-start;
}

.factor-bullet {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 6px;
}

.factor-description strong {
    color: #111827;
    font-weight: 600;
}

.info-content {
    margin-bottom: 8px;
}

.info-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.info-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: #f9fafb;
    border-radius: 6px;
}

.info-label {
    font-size: 14px;
    color: #6b7280;
}

.info-value {
    font-size: 14px;
    font-weight: 600;
    color: #111827;
}
</style>
