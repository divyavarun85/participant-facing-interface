<template>
    <div class="environmental-map-container">
        <MapControls :factors="factors" :selected-factor="selectedFactor" :legend-bins="legendBins"
            :palette="active.colors" :selected-range="currentRange" @factor-change="onFactorChange"
            @range-change="onRangeChange" @toggle-overlay="overlayOn = $event" />
        <div class="map-wrapper">

            <MapHexLayer v-if="dataObj" :data="dataObj" :style="style" :valueField="active.valueField"
                :breaks="active.breaks" :colors="active.colors" :center="center" :zoom="zoom" :filter="layerFilter"
                outlineUrl="/us-states.geojson" :zoomOnClick="true" :hoverHighlight="true" />

        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import MapControls from './MapControls.vue'
import MapHexLayer from './MapHexLayer.vue'

const props = defineProps({
    data: { type: [String, Object], required: true },
    style: [String, Object],
    center: { type: Array, default: () => [-98.6, 39.8] },
    zoom: { type: Number, default: 3.4 },
    initialFactorId: { type: String, default: 'pm25' }
})

const dataObj = ref(null)
const selectedFactor = ref(props.initialFactorId)
const numericKeys = ref([])
const stats = ref({})  // { key: {min, max, q20,q40,q60,q80} }

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

onMounted(async () => {
    dataObj.value = typeof props.data === 'string' ? await (await fetch(props.data)).json() : props.data
    const feats = dataObj.value.features || []
    // discover numeric properties present on most features
    const sample = feats.slice(0, 2000)
    const keys = new Set()
    sample.forEach(f => Object.entries(f.properties || {}).forEach(([k, v]) => { if (isNumeric(v)) keys.add(k) }))
    numericKeys.value = Array.from(keys)

    // precompute stats
    numericKeys.value.forEach(k => { const s = summarize(k, feats); if (s) stats.value[k] = s })

    // default to E_PM if present
    if (numericKeys.value.includes('E_PM')) selectedFactor.value = 'pm25'
})

/** factor catalog (labels + mapping to CHEL keys) */
const catalog = [
    {
        id: 'pm25', name: 'Air Quality (PM2.5)', unit: 'μg/m³', key: 'E_PM',
        palette: ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#d7191c']
    },
    {
        id: 'asthma', name: 'Asthma Rates', unit: '%', key: 'EP_ASTHMA',
        palette: ['#edf8fb', '#b2e2e2', '#66c2a4', '#2ca25f', '#006d2c']
    },
    {
        id: 'pm25pct', name: 'PM2.5 Percentile', unit: '0–1', key: 'EPL_PM',
        palette: ['#ffffcc', '#a1dab4', '#41b6c4', '#2c7fb8', '#253494']
    },
    {
        id: 'svm', name: 'Social Vulnerability', unit: 'index', key: 'SPL_SVM',
        palette: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b']
    },
    {
        id: 'pop', name: 'Population (×1k)', unit: 'k', key: 'E_TOTPOP',
        palette: ['#fff7ec', '#fee8c8', '#fdbb84', '#e34a33', '#b30000']
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

let overlayOn = ref(false) // kept if you add an overlay toggle
</script>

<style scoped>
.environmental-map-container {
    display: flex;
    height: 100vh;
}

.map-wrapper {
    flex: 1;
    position: relative;
    height: 100%;
}
</style>
