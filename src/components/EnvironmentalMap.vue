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
            <MapControls :factors="factors" :selected-factor="selectedFactor" :legend-bins="legendBins"
                :palette="active.colors" :selected-range="currentRange" :pin-error-message="pinErrorMessage"
                :pin-loading="pinLoading" @factor-change="onFactorChange" @range-change="onRangeChange"
                @toggle-overlay="overlayOn = $event" @pin-search="handlePinSearch" />
            <div class="map-wrapper">

                <MapHexLayer v-if="dataObj" :data="dataObj" :style="style" :mapStyle="mapStyle"
                    :valueField="active.valueField" :breaks="active.breaks" :colors="active.colors" :center="mapCenter"
                    :zoom="mapZoom" :filter="layerFilter" :hoverHighlight="true" :zoomOnClick="true"
                    :zoomOnClickTarget="8" :statesUrl="statesGeoUrl" :showStateBorders="true"
                    :selectedHexIds="selectedHexIds" :selectedHexColor="'#111827'" :tooltipFields="tooltipFields" />

            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import MapControls from './MapControls.vue'
import MapHexLayer from './MapHexLayer.vue'
import { MAP_STYLE } from '../config/mapStyle'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point as turfPoint } from '@turf/helpers'

const props = defineProps({
    data: { type: [String, Object], required: true },
    style: [String, Object],
    mapStyle: { type: [String, Object], default: MAP_STYLE },
    center: { type: Array, default: () => [-98.6, 39.8] },
    zoom: { type: Number, default: 3.4 },
    initialFactorId: { type: String, default: 'pm25' }
})

const STATES_GEO_URL = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json'
const dataObj = ref(null)
const selectedFactor = ref(props.initialFactorId)
const numericKeys = ref([])
const stats = ref({})  // { key: {min, max, q20,q40,q60,q80} }
const mapCenter = ref(Array.isArray(props.center) ? [...props.center] : [-98.6, 39.8])
const mapZoom = ref(typeof props.zoom === 'number' ? props.zoom : 3.4)
const selectedHexIds = ref([])
const pinLoading = ref(false)
const pinErrorMessage = ref('')
const zipCache = new Map() // cache zip lookups

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
        ? await fetch(dataSource, { cache: 'no-store' }).then(res => {
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

    stats.value = {}
    numericKeys.value.forEach(k => {
        const s = summarize(k, feats)
        if (s) stats.value[k] = s
    })

    const availableFactorIds = new Set(
        catalog.filter(c => stats.value[c.key]).map(c => c.id)
    )
    const previousSelection = selectedFactor.value
    if (previousSelection && availableFactorIds.has(previousSelection)) {
        selectedFactor.value = previousSelection
    } else if (availableFactorIds.has('pm25')) {
        selectedFactor.value = 'pm25'
    } else {
        const firstAvailable = availableFactorIds.values().next().value
        if (firstAvailable) selectedFactor.value = firstAvailable
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

/** factor catalog (labels + mapping to CHEL keys) */
const catalog = [
    {
        id: 'pm25', name: 'Air Quality (PM2.5)', unit: 'μg/m³', key: 'E_PM',
        palette: ['#a93b07', '#d76622', '#f18b49', '#f9b282', '#fdd8b4']
    },
    {
        id: 'asthma', name: 'Asthma Rates', unit: '%', key: 'EP_ASTHMA',
        palette: ['#e0f2f1', '#b2dfdb', '#80cbc4', '#4db6ac', '#00897b']
    },
    {
        id: 'pm25pct', name: 'PM2.5 Percentile', unit: '0–1', key: 'EPL_PM',
        palette: ['#edf2ff', '#d6e4ff', '#adc8ff', '#7c9dec', '#4a6ed6']
    },
    {
        id: 'svm', name: 'Social Vulnerability', unit: 'index', key: 'SPL_SVM',
        palette: ['#f8d2d4', '#efa6b1', '#d4bde8', '#a9b5ef', '#7c94da']
    },
    {
        id: 'pop', name: 'Population (×1k)', unit: 'k', key: 'E_TOTPOP',
        palette: ['#f4f5f9', '#dce0ee', '#bec7e0', '#9aa7c8', '#6e7ba6']
    },
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
    const f = factors.value.find(x => x.id === selectedFactor.value) || factors.value[0]
    return f ? { valueField: f.valueField, breaks: f.breaks, colors: f.colorScale, unit: f.unit, name: f.name } :
        { valueField: 'E_PM', breaks: [5, 7, 9, 11], colors: ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#d7191c'] }
})

/** legend bins for the sidebar */
const legendBins = computed(() => {
    const { breaks, colors } = active.value
    const fmt = n => (Math.abs(n) % 1 === 0 ? n : +n.toFixed(1))
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

function onFactorChange(id) { selectedFactor.value = id; currentRange.value = null }
function onRangeChange(range) { currentRange.value = range }

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

    return [
        {
            label: 'Location',
            property: metric.valueField,
            formatter: locationFormatter
        },
        makeField(metric.name, metric.valueField, 2, metric.unit),
        makeField('Population', 'E_TOTPOP', 0),
        makeField('PM2.5 Percentile', 'EPL_PM', 2),
        makeField('Asthma Rate', 'EP_ASTHMA', 1, '%'),
        makeField('Social Vulnerability', 'SPL_SVM', 2)
    ]
})

watch(() => props.center, value => {
    if (!Array.isArray(value) || value.length < 2) return
    mapCenter.value = [...value]
})

watch(() => props.zoom, value => {
    if (!Number.isFinite(value)) return
    mapZoom.value = value
})

async function handlePinSearch(zip) {
    const query = (zip || '').trim()
    pinLoading.value = true
    pinErrorMessage.value = ''
    selectedHexIds.value = []

    try {
        if (!query) throw new Error('Please enter a valid ZIP code.')
        const features = dataObj.value?.features || []
        if (!features.length) throw new Error('Map data is still loading. Please try again in a moment.')

        let cached = zipCache.get(query)
        let lat, lng, hexIds

        if (cached) {
            ({ lat, lng, hexIds } = cached)
        } else {
            const response = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(query)}`)
            if (!response.ok) throw new Error('ZIP code not found.')
            const zipData = await response.json()
            const place = zipData.places?.[0]
            if (!place) throw new Error('ZIP code not found.')

            lat = Number(place.latitude)
            lng = Number(place.longitude)
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('ZIP returned invalid coordinates.')

            const pt = turfPoint([lng, lat])
            const matches = features.filter(feature => booleanPointInPolygon(pt, feature))

            if (!matches.length) throw new Error('ZIP code falls outside the data coverage area.')

            hexIds = matches.map(feature => {
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
        const targetZoom = mapZoom.value || props.zoom || 3.4
        mapZoom.value = targetZoom < 7.2 ? 7.2 : targetZoom
        pinErrorMessage.value = ''
    } catch (error) {
        console.error('Pin search failed', error)
        selectedHexIds.value = []
        pinErrorMessage.value = error?.message || 'Could not locate that ZIP code.'
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
}

.map-wrapper {
    flex: 1;
    position: relative;
    min-height: 0;
}
</style>
