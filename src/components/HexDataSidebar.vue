<template>
    <div class="hex-data-sidebar">
        <div class="sidebar-header">
            <button class="close-button" @click="$emit('close')" aria-label="Close sidebar">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
            </button>
        </div>

        <div class="sidebar-content">
            <div class="location-info">
                <h2 class="location-title">Hexagon {{ hexId }}</h2>
                <p class="location-description">
                    This hexagon represents a geographic area with environmental and demographic data
                    collected as part of the CHEL 2022 dataset. The following information provides
                    insights into the environmental conditions and characteristics of this region.
                </p>
            </div>

            <div class="data-section">
                <h3 class="section-title">Overview</h3>
                <div class="text-content">
                    <p class="description-text">
                        The ranking is <strong>{{ getOverallRank() }}</strong> for Hexagon {{ hexId }}
                        when compared to other US communities. This area shows
                        {{ getRankDescription() }} environmental characteristics relative to national averages.
                    </p>
                </div>
            </div>

            <div class="data-section">
                <h3 class="section-title">Environmental Factors</h3>
                <div class="factors-list">
                    <div v-for="factor in factors" :key="factor.id" class="factor-item">
                        <h4 class="factor-name">{{ factor.name }}</h4>
                        <p class="factor-description">
                            {{ getFactorDescription(factor) }} The value for this hexagon is
                            <strong>{{ formatValue(factor) }}</strong>, which indicates a
                            <strong>{{ getRankLabel(factor) }}</strong> level compared to other areas in the dataset.
                            {{ getFactorContext(factor) }}
                        </p>
                    </div>
                </div>
            </div>

            <div v-if="stats" class="data-section">
                <h3 class="section-title">Demographic Information</h3>
                <div class="info-content">
                    <p class="description-text" v-if="properties.E_TOTPOP != null">
                        The population in this area is approximately
                        <strong>{{ formatNumber(properties.E_TOTPOP, 0) }} people</strong>.
                        This population size places it
                        {{ getPopulationContext() }} when compared to other hexagons in the dataset.
                    </p>
                    <p class="description-text" v-else>
                        Population data for this hexagon is not available in the current dataset.
                    </p>
                </div>
            </div>

            <div class="data-section">
                <h3 class="section-title">Data Sources</h3>
                <p class="description-text">
                    All data presented here is derived from the CHEL 2022 (Climate and Health Equity Index)
                    dataset. Values are calculated based on standardized methodologies and may represent
                    estimates or interpolations from source data. For more detailed information about
                    data collection methods, please refer to the CHEL documentation.
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
    const value = properties.value[factor.key]
    if (value === null || value === undefined || Number.isNaN(value)) return 'N/A'

    // Use appropriate digits based on factor type
    let digits = 2
    if (factor.id === 'pop') digits = 0
    else if (factor.id === 'asthma') digits = 1

    return formatNumber(value, digits)
}

function getRankLabel(factor) {
    const value = properties.value[factor.key]
    if (value === null || value === undefined || Number.isNaN(value)) return 'N/A'

    // Get stats for this factor
    if (!props.stats || !props.stats[factor.key]) return ''

    const factorStats = props.stats[factor.key]
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
            return 0
        })
        .filter(r => r > 0)

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
        'pm25': 'Air Quality measures the concentration of fine particulate matter (PM2.5) in the air, which is a key indicator of air pollution levels.',
        'asthma': 'Asthma Rates represent the prevalence of asthma in the population, which can be influenced by both environmental and demographic factors.',
        'pm25pct': 'Air Pollution Ranking provides a percentile ranking of air quality relative to all areas in the dataset, where higher values indicate worse air quality.',
        'svm': 'Social Vulnerability Index measures the susceptibility of communities to external stresses, combining socioeconomic status, household composition, and other factors.',
        'pop': 'Population indicates the number of residents in this geographic area, which helps contextualize the scale of environmental impacts.'
    }
    return descriptions[factor.id] || `${factor.name} is an environmental indicator that measures specific characteristics of this geographic area.`
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

.sidebar-header {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
}

.sidebar-title {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: #111827;
}

.close-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    transition: color 0.2s;
}

.close-button:hover {
    color: #111827;
}

.sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
}

.location-info {
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 1px solid #e5e7eb;
}

.data-section {
    margin-bottom: 32px;
}

.section-title {
    font-size: 14px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 16px 0;
}

.location-title {
    font-size: 20px;
    font-weight: 600;
    color: #111827;
    margin: 0 0 12px 0;
}

.location-description {
    font-size: 14px;
    line-height: 1.6;
    color: #6b7280;
    margin: 0;
}

.text-content {
    margin-bottom: 8px;
}

.description-text {
    font-size: 14px;
    line-height: 1.7;
    color: #374151;
    margin: 0 0 16px 0;
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
    gap: 24px;
}

.factor-item {
    padding-bottom: 24px;
    border-bottom: 1px solid #e5e7eb;
}

.factor-item:last-child {
    border-bottom: none;
    padding-bottom: 0;
}

.factor-name {
    font-size: 16px;
    font-weight: 600;
    color: #111827;
    margin: 0 0 8px 0;
}

.factor-description {
    font-size: 14px;
    line-height: 1.7;
    color: #374151;
    margin: 0;
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
