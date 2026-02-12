<template>
    <div class="environmental-map-shell">
        <header class="app-header">
            <div class="app-header__logo">
                <span class="logo-wordmark">
                    <span class="logo-wordmark-primary">All</span>
                    <span class="logo-wordmark-of">of</span>
                    <span class="logo-wordmark-primary">Us</span>
                </span>
                <span class="logo-tagline">Research Program</span>
            </div>
            <nav class="app-header__nav">
                <span class="nav-link">Home</span>
                <span class="nav-link">To Do</span>
                <span class="nav-link">My Data</span>
                <span class="nav-link">Partner Studies</span>
                <span class="nav-link">Support</span>
                <span class="nav-link nav-link--highlight">Environmental Map</span>
            </nav>
            <div class="app-header__user">
                <div class="user-avatar">DV</div>
                <span class="user-name">Divya Varun</span>
            </div>
        </header>
        <div class="environmental-map-container">
            <button v-if="!sidebarOpen" class="mobile-menu-toggle" @click="sidebarOpen = true" aria-label="Open menu">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 12H21M3 6H21M3 18H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
            </button>
            <div v-if="sidebarOpen" class="sidebar-overlay" @click="sidebarOpen = false"></div>
            <MapControls :class="{ 'sidebar-open': sidebarOpen }" :factors="factors" :selected-factor="selectedFactor"
                :legend-bins="legendBins" :palette="active.colors" :unit="active.unit" :active-factor-name="active.name" :selected-range="currentRange"
                :pin-error-message="pinErrorMessage" :pin-loading="pinLoading" @factor-change="onFactorChange"
                @range-change="onRangeChange" @toggle-overlay="overlayOn = $event" @pin-search="handlePinSearch"
                @close-sidebar="sidebarOpen = false" />
            <div class="map-wrapper">

                <MapHexLayer v-if="dataObj" :data="dataObj" :style="style" :mapStyle="mapStyle"
                    :valueField="active.valueField" :breaks="active.breaks" :colors="active.colors" :center="mapCenter"
                    :zoom="mapZoom" :filter="layerFilter" :hoverHighlight="true" :zoomOnClick="true"
                    :zoomOnClickTarget="8" :statesUrl="statesGeoUrl" :showStateBorders="true"
                    :selectedHexIds="selectedHexIds" :selectedHexColor="'#1e4f86'" :selectedHexWidth="3"
                    :tooltipFields="tooltipFields" :searchPinLocation="searchPinLocation" @hex-click="handleHexClick" />

                <!-- Right Sidebar for Hex Data -->
                <HexDataSidebar v-if="selectedHexFeature" :feature="selectedHexFeature" :factors="factors"
                    :stats="stats.value" @close="selectedHexFeature = null" />

            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import MapControls from './MapControls.vue'
import MapHexLayer from './MapHexLayer.vue'
import HexDataSidebar from './HexDataSidebar.vue'
import { MAP_STYLE } from '../config/mapStyle'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import booleanIntersects from '@turf/boolean-intersects'
import buffer from '@turf/buffer'
import { point as turfPoint } from '@turf/helpers'

const props = defineProps({
    data: { type: [String, Object], required: true },
    style: [String, Object],
    mapStyle: { type: [String, Object], default: MAP_STYLE },
    center: { type: Array, default: () => [-98.6, 39.8] },
    zoom: { type: Number, default: 3.4 },
    initialFactorId: { type: String, default: '' }
})

const STATES_GEO_URL = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json'
const dataObj = ref(null)
const selectedFactor = ref(props.initialFactorId || '')
const numericKeys = ref([])
const stats = ref({})  // { key: {min, max, q20,q40,q60,q80} }
const mapCenter = ref(Array.isArray(props.center) ? [...props.center] : [-98.6, 39.8])
const mapZoom = ref(typeof props.zoom === 'number' ? props.zoom : 3.4)
const selectedHexIds = ref([])
const pinLoading = ref(false)
const pinErrorMessage = ref('')
const zipCache = new Map() // cache zip/address lookups
const searchPinLocation = ref(null) // [lng, lat] for the searched location pin
const selectedHexFeature = ref(null) // Feature data for the clicked hex
const sidebarOpen = ref(false) // Mobile sidebar state

function isNumeric(v) { return typeof v === 'number' && Number.isFinite(v) }

function summarize(key, features) {
    const vals = features.map(f => f.properties?.[key]).filter(isNumeric).sort((a, b) => a - b)
    if (!vals.length) return null
    const q = p => vals[Math.floor((vals.length - 1) * p)]
    return {
        min: vals[0], max: vals.at(-1),
        q20: q(0.2), q40: q(0.4), q60: q(0.6), q80: q(0.8)
    }
}

async function prepareFeatureCollection(dataSource) {
    if (!dataSource) return null
    const rawData = typeof dataSource === 'string'
        ? await fetch(dataSource, {
            // Enable caching for better performance
            cache: 'default',
            // Add headers for better caching
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'public, max-age=3600'
            }
        }).then(res => {
            if (!res.ok) throw new Error(`Failed to load dataset (${res.status})`)
            return res.json()
        })
        : dataSource

    if (!rawData) return null
    return rawData
}

async function initializeFromData(dataSource) {
    const preparedData = await prepareFeatureCollection(dataSource)
    if (!preparedData) throw new Error('Environmental map data is unavailable.')

    dataObj.value = preparedData
    zipCache.clear()
    selectedHexIds.value = []
    pinErrorMessage.value = ''

    const feats = preparedData.features || []
    const sample = feats.slice(0, 2000)
    const keys = new Set()
    sample.forEach(f => Object.entries(f.properties || {}).forEach(([k, v]) => { if (isNumeric(v)) keys.add(k) }))
    numericKeys.value = Array.from(keys)

    // Optimize stats calculation - use requestIdleCallback if available
    const calculateStats = () => {
        stats.value = {}
        numericKeys.value.forEach(k => {
            const s = summarize(k, feats)
            if (s) stats.value[k] = s
        })
    }

    // Use requestIdleCallback for non-blocking stats calculation
    if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(calculateStats, { timeout: 2000 })
    } else {
        // Fallback: use setTimeout to defer calculation
        setTimeout(calculateStats, 0)
    }

    const availableFactorIds = new Set(
        catalog.filter(c => stats.value[c.key]).map(c => c.id)
    )
    // Only set a selection if explicitly provided via props, otherwise start with none selected
    // This ensures no auto-selection happens
    if (props.initialFactorId && props.initialFactorId.trim() !== '' && availableFactorIds.has(props.initialFactorId)) {
        selectedFactor.value = props.initialFactorId
    } else {
        // Always reset to empty on data load to ensure clean state
        selectedFactor.value = ''
    }
}

onMounted(async () => {
    try {
        await initializeFromData(props.data)
    } catch (error) {
        console.error('Failed to prepare environmental map data:', error)
        dataObj.value = typeof props.data === 'object' ? props.data : null
    }
})

watch(
    () => props.data,
    async newSource => {
        if (!newSource) return
        try {
            await initializeFromData(newSource)
        } catch (error) {
            console.error('Failed to refresh environmental map data:', error)
        }
    }
)

/** factor catalog (labels + mapping to real CHEL GeoJSON property names) */
const catalog = [
    { id: 'pm25', name: 'Air Pollution (PM2.5)', unit: 'μg/m³', key: 'E_PM',
        palette: ['#f5f5f5', '#cccccc', '#969696', '#636363', '#252525'] },
    { id: 'asthma', name: 'Asthma Rates', unit: '%', key: 'EP_ASTHMA',
        palette: ['#f5f5f5', '#cccccc', '#969696', '#636363', '#252525'] },
    { id: 'pm25pct', name: 'Air Pollution Percentile', unit: '', key: 'EPL_PM',
        palette: ['#f5f5f5', '#cccccc', '#969696', '#636363', '#252525'] },
    { id: 'ozone', name: 'Ozone', unit: 'ppm', key: 'E_OZONE',
        palette: ['#f5f5f5', '#cccccc', '#969696', '#636363', '#252525'] },
    { id: 'ozonepct', name: 'Ozone Percentile', unit: '', key: 'EPL_OZONE',
        palette: ['#f5f5f5', '#cccccc', '#969696', '#636363', '#252525'] },
    { id: 'svm', name: 'Social Vulnerability', unit: 'index', key: 'SPL_SVM',
        palette: ['#f5f5f5', '#cccccc', '#969696', '#636363', '#252525'] },
    { id: 'pop', name: 'Population', unit: '', key: 'E_TOTPOP',
        palette: ['#f5f5f5', '#cccccc', '#969696', '#636363', '#252525'] },
]
// factors shown = only those whose key exists & has stats
const factors = computed(() =>
    catalog.filter(c => stats.value[c.key]).map(c => {
        const s = stats.value[c.key]
        const breaks = [s.q20, s.q40, s.q60, s.q80].map(v => +v.toFixed(1))
        return { id: c.id, name: c.name, unit: c.unit, valueField: c.key, breaks, colorScale: c.palette }
    })
)

const active = computed(() => {
    // If no factor is selected, return neutral gray colors
    if (!selectedFactor.value || !factors.value.length) {
        return {
            valueField: null,
            breaks: [],
            colors: ['#e5e7eb', '#e5e7eb'], // Neutral gray
            unit: '',
            name: 'No variable selected'
        }
    }
    const f = factors.value.find(x => x.id === selectedFactor.value)
    return f ? { valueField: f.valueField, breaks: f.breaks, colors: f.colorScale, unit: f.unit, name: f.name } :
        { valueField: null, breaks: [], colors: ['#e5e7eb', '#e5e7eb'], unit: '', name: 'No variable selected' }
})

/** legend bins for the sidebar */
const legendBins = computed(() => {
    const { breaks, colors, valueField } = active.value
    // If no factor is selected, return empty legend
    if (!breaks || breaks.length === 0) {
        return []
    }
    const isPopulation = valueField === 'E_TOTPOP'
    const isPercentile01 = valueField === 'EPL_OZONE' || valueField === 'EPL_PM' // 0–1 scale, show as %
    const fmt = n => {
        if (isPopulation) return Math.round(n).toLocaleString('en-US')
        if (isPercentile01) return Math.round(n * 100) // 0.2 → 20, 0.4 → 40
        return (Math.abs(n) % 1 === 0 ? n : +n.toFixed(1))
    }
    const bins = []
    bins.push({ color: colors[0], range: `≤ ${fmt(breaks[0])}`, label: 'Very Low' })
    for (let i = 1; i < breaks.length; i++) {
        bins.push({ color: colors[i], range: `${fmt(breaks[i - 1])}–${fmt(breaks[i])}`, label: ['Low', 'Moderate', 'High'][i - 1] || '' })
    }
    bins.push({ color: colors.at(-1), range: `> ${fmt(breaks.at(-1))}`, label: 'Very High' })
    return bins
})

/** filtering */
const currentRange = ref(null) // [min,max] or null

const layerFilter = computed(() => {
    const r = currentRange.value
    const field = active.value.valueField
    if (!r) return true

    if (r[0] === 'first') {
        const max = r[1]
        return ['<', ['get', field], max]
    }

    if (r[0] === 'last') {
        const min = r[1]
        return ['>=', ['get', field], min]
    }

    const [min, max, mode] = r
    if (mode === 'exclusive') {
        return ['all',
            ['>=', ['get', field], min],
            ['<', ['get', field], max]
        ]
    }
    // fallback (inclusive upper if you ever use it)
    return ['all',
        ['>=', ['get', field], min],
        ['<=', ['get', field], max]
    ]
})

function onFactorChange(id) {
    selectedFactor.value = id;
    currentRange.value = null;
    // Close sidebar on mobile when selecting a factor so user can see the map update
    if (window.innerWidth <= 768) {
        sidebarOpen.value = false
    }
}
function onRangeChange(range) {
    currentRange.value = range;
    // Close sidebar on mobile when selecting a legend range so user can see the map update
    if (window.innerWidth <= 768) {
        sidebarOpen.value = false
    }
}
function handleHexClick(feature) { selectedHexFeature.value = feature }

const statesGeoUrl = STATES_GEO_URL

let overlayOn = ref(false) // kept if you add an overlay toggle

function formatNumber(value, opts = {}) {
    if (value === null || value === undefined || Number.isNaN(value)) return 'N/A'
    const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, ...opts })
    return formatter.format(value)
}

const tooltipFields = computed(() => {
    const metric = active.value
    if (!metric) return []

    const formatValue = (value, digits = 2, unit = '') => {
        if (value === null || value === undefined || Number.isNaN(value)) return 'N/A'
        const formatted = typeof value === 'number'
            ? formatNumber(value, { maximumFractionDigits: digits })
            : value
        return `${formatted}${unit ? ` ${unit}` : ''}`
    }

    const locationFormatter = (_, feature) => {
        const props = feature?.properties || {}
        const name = props.CITY || props.city || props.PLACE || props.place || props.NAME || props.name
        const state = props.STATE || props.state || props.STATE_ABBR
        const location = [name, state].filter(Boolean).join(', ')
        if (location) return location
        const hex = props.hex_id ?? props.fid ?? null
        return hex !== null ? `Hex ${hex}` : 'Location unavailable'
    }

    const makeField = (label, property, digits = 2, unit = '') => ({
        label,
        property,
        formatter: value => formatValue(value, digits, unit)
    })

    // Check if a variable is selected
    const isVariableSelected = metric.valueField && metric.name !== 'No variable selected'

    // All available fields (real CHEL GeoJSON property names)
    const allFields = [
        makeField('Population', 'E_TOTPOP', 0),
        makeField('Air Pollution (PM2.5)', 'E_PM', 2, 'μg/m³'),
        makeField('Air Pollution Percentile', 'EPL_PM', 2),
        makeField('Ozone', 'E_OZONE', 2, 'ppm'),
        makeField('Ozone Percentile', 'EPL_OZONE', 2),
        makeField('Asthma Rate', 'EP_ASTHMA', 1),
        makeField('Social Vulnerability', 'SPL_SVM', 2)
    ]

    // Use a dummy property for Location when no variable is selected
    const locationProperty = isVariableSelected ? metric.valueField : 'E_TOTPOP'

    if (isVariableSelected) {
        // If variable is selected: show only Location + selected variable
        return [
            {
                label: 'Location',
                property: locationProperty,
                formatter: locationFormatter
            },
            makeField(metric.name, metric.valueField, 2, metric.unit)
        ]
    } else {
        // If no variable is selected: show Location + all fields
        return [
            {
                label: 'Location',
                property: locationProperty,
                formatter: locationFormatter
            },
            ...allFields
        ]
    }
})

watch(() => props.center, value => {
    if (!Array.isArray(value) || value.length < 2) return
    mapCenter.value = [...value]
})

watch(() => props.zoom, value => {
    if (!Number.isFinite(value)) return
    mapZoom.value = value
})

async function handlePinSearch(queryInput) {
    // Close sidebar on mobile when searching so user can see the map zoom
    if (window.innerWidth <= 768) {
        sidebarOpen.value = false
    }
    const query = (queryInput || '').trim()
    pinLoading.value = true
    pinErrorMessage.value = ''
    selectedHexIds.value = []

    try {
        if (!query) throw new Error('Please enter a ZIP code or address.')
        const features = dataObj.value?.features || []
        if (!features.length) throw new Error('Map data is still loading. Please try again in a moment.')

        let cached = zipCache.get(query)
        let lat, lng, hexIds

        if (cached) {
            ({ lat, lng, hexIds } = cached)
        } else {
            // Check if query is numeric (ZIP code) or text (address)
            const isZipCode = /^\d{5}(-\d{4})?$/.test(query)

            if (isZipCode) {
                // Use ZIP code API
                const response = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(query)}`)
                if (!response.ok) throw new Error('ZIP code not found.')
                const zipData = await response.json()
                const place = zipData.places?.[0]
                if (!place) throw new Error('ZIP code not found.')

                lat = Number(place.latitude)
                lng = Number(place.longitude)
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('ZIP returned invalid coordinates.')
            } else {
                // Use address geocoding (Nominatim - OpenStreetMap)
                // Enhanced for street addresses with better parameters
                const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=us&accept-language=en&addressdetails=1&extratags=1`
                const response = await fetch(geocodeUrl, {
                    headers: {
                        'User-Agent': 'Environmental Map Application',
                        'Referer': window.location.origin
                    }
                })

                if (!response.ok) throw new Error('Address search failed. Please try again.')
                const geoData = await response.json()

                if (!geoData || geoData.length === 0) {
                    throw new Error('Address not found. Please try: "123 Main St, City, State" or a ZIP code.')
                }

                const result = geoData[0]
                lat = Number(result.lat)
                lng = Number(result.lon)
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Address returned invalid coordinates.')
            }

            const pt = turfPoint([lng, lat])

            // First, find hexes that contain the point
            const containingMatches = features.filter(feature => booleanPointInPolygon(pt, feature))

            // Also find hexes that are nearby by creating a buffer around the point
            // Buffer radius: ~5km (0.05 degrees ≈ 5.5km at mid-latitudes)
            // This will catch hexes that overlap with the zip code/address area
            const bufferRadius = 0.05 // degrees, approximately 5-6km
            const searchBuffer = buffer(pt, bufferRadius, { units: 'degrees' })

            // Find all hexes that intersect with the buffer
            const overlappingMatches = features.filter(feature => {
                // Check if hex contains the point
                if (booleanPointInPolygon(pt, feature)) return true
                // Check if hex intersects with the buffer
                try {
                    return booleanIntersects(searchBuffer, feature)
                } catch (e) {
                    return false
                }
            })

            // Combine matches and remove duplicates
            const allMatches = [...new Set([...containingMatches, ...overlappingMatches])]

            if (!allMatches.length) throw new Error('Location falls outside the data coverage area.')

            hexIds = allMatches.map(feature => {
                const rawHexId = feature.properties?.hex_id
                if (rawHexId === undefined || rawHexId === null) return null
                const numeric = Number(rawHexId)
                return Number.isFinite(numeric) ? numeric : String(rawHexId)
            }).filter(id => id !== null)

            if (!hexIds.length) throw new Error('Matching hex is missing an identifier.')

            zipCache.set(query, { lat, lng, hexIds })
        }

        selectedHexIds.value = [...new Set(hexIds)]
        mapCenter.value = [lng, lat]
        searchPinLocation.value = [lng, lat] // Set pin location for the marker
        const targetZoom = mapZoom.value || props.zoom || 3.4
        mapZoom.value = targetZoom < 7.2 ? 7.2 : targetZoom
        pinErrorMessage.value = ''
    } catch (error) {
        console.error('Location search failed', error)
        selectedHexIds.value = []
        searchPinLocation.value = null // Clear pin on error
        pinErrorMessage.value = error?.message || 'Could not locate that address or ZIP code.'
    } finally {
        pinLoading.value = false
    }
}
</script>

<style scoped>
.environmental-map-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: #f1f5f9;
}

.app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 32px;
    background: #ffffff;
    border-top: 1px solid #e5e7eb;
    border-bottom: 1px solid #e5e7eb;
}

.app-header__logo {
    display: flex;
    flex-direction: column;
    line-height: 1;
}

.logo-wordmark {
    display: flex;
    align-items: baseline;
    gap: 4px;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: 0.01em;
}

.logo-wordmark-primary {
    color: #1c2a7d;
    font-weight: Extrabold;
    font-family: 'Gotham Rounded';

}

.logo-wordmark-of {
    color: #5aa5d6;
    font-style: italic;
    font-size: 22px;
    font-weight: 600;
}

.logo-tagline {
    margin-top: 6px;
    font-size: 8.5px;
    text-transform: uppercase;
    color: #1c2a7d;
    font-weight: 900;
}

.app-header__nav {
    display: flex;
    gap: 24px;
}

.nav-link {
    font-size: 13px;
    color: #1e4f86;
    font-weight: 500;
    cursor: default;
}

.nav-link--highlight {
    color: #1e4f86;
    font-weight: 600;
    position: relative;
    padding-bottom: 4px;
}

.nav-link--highlight::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    background: #1e4f86;
}

.app-header__user {
    display: flex;
    align-items: center;
    gap: 10px;
}

.user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #94a3b8;
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 13px;
}

.user-name {
    font-size: 13px;
    color: #1f2937;
    font-weight: 500;
}

.environmental-map-container {
    flex: 1;
    display: flex;
    min-height: 0;
    height: calc(100vh - 80px);
}

@media (max-width: 768px) {
    .environmental-map-container {
        height: calc(100vh - 60px);
    }
}

.map-wrapper {
    position: relative;
    z-index: 1;
    flex: 1;
    min-height: 0;
    width: 100%;
}

/* Mobile Menu Toggle Button */
.mobile-menu-toggle {
    display: none;
    position: fixed;
    top: 80px;
    left: 16px;
    z-index: 1001;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 10px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    color: #1f2937;
    transition: all 0.2s ease;
}

.mobile-menu-toggle:hover {
    background: #f8fafc;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* Sidebar Overlay */
.sidebar-overlay {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 998;
    animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }

    to {
        opacity: 1;
    }
}

/* Mobile Responsive Styles */
@media (max-width: 768px) {
    .mobile-menu-toggle {
        display: block;
    }

    .sidebar-overlay {
        display: block;
    }

    .app-header {
        padding: 12px 16px;
        padding-left: 60px;
    }

    .app-header__nav {
        display: none;
    }

    .user-name {
        display: none;
    }

    .logo-wordmark {
        font-size: 20px;
    }

    .logo-wordmark-of {
        font-size: 18px;
    }

    .logo-tagline {
        font-size: 7px;
    }

    .environmental-map-container {
        height: calc(100vh - 60px);
    }
}

@media (max-width: 480px) {
    .app-header {
        padding: 10px 12px;
        padding-left: 56px;
    }

    .logo-wordmark {
        font-size: 18px;
    }

    .logo-wordmark-of {
        font-size: 16px;
    }
}
</style>
