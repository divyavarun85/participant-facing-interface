<template>
  <div class="map-controls">
    <!-- Header -->
    <div class="panel-header">
      <h2>Environmental Explorer</h2>
      <button class="help-toggle" @click="showHelp = !showHelp" :aria-label="showHelp ? 'Close help' : 'Show help'">
        {{ showHelp ? '✕' : '?' }}
      </button>
    </div>

    <!-- Help -->
    <div v-if="showHelp" class="help-panel">
      <h3>How to Use This Map</h3>
      <p>Each hexagon is colored by the current factor. The legend below shows what each color means.</p>
      <ul>
        <li><b>Pan</b>: drag • <b>Zoom</b>: scroll or buttons • <b>Details</b>: hover a hex</li>
      </ul>
    </div>

    <!-- Factor -->
    <div class="factor-selector">
      <label for="factor-select">Select Environmental Factor:</label>
      <select id="factor-select" :value="selectedFactor"
        @change="$emit('factor-change', ($event.target && $event.target.value) || selectedFactor)">
        <option v-for="f in factors" :key="f.id" :value="f.id">{{ f.name }}</option>
      </select>
    </div>

    <!-- Legend -->
    <div class="legend">
      <div class="legend-title-row">
        <h3 class="legend-title">{{ selectedFactorData.name }} Legend</h3>
        <small v-if="unit" class="legend-unit">Unit: {{ unit }}</small>
      </div>

      <!-- Color ribbon (nice overview) -->
      <div class="legend-ribbon" :style="{ background: ribbonGradient }" aria-hidden="true"></div>

      <!-- Clickable bins -->
      <div class="legend-scale" role="list">
        <button v-for="(bin, i) in legendBins" :key="i" class="legend-item" type="button"
          :aria-label="`Filter to ${bin.range} (${bin.label || 'bin'})`" @click="onLegendClick(i)">
          <span class="legend-swatch" :style="{ backgroundColor: bin.color }" />
          <span class="legend-text">
            <span class="legend-range">{{ bin.range }}</span>
            <span class="legend-sub">{{ bin.label }}</span>
          </span>
          <span v-if="intersectsSelected(i)" class="legend-active-dot" title="Included in current filter" />
        </button>



      </div>

      <!-- Current filter chip -->
      <div v-if="selectedRange" class="filter-chip">
        Filter: {{ fmt(selectedRange[0]) }} – {{ fmt(selectedRange[1]) }}
        <button class="chip-x" @click="$emit('range-change', null)" aria-label="Clear filter">✕</button>
      </div>
    </div>

    <!-- Optional overlay toggle -->
    <label class="overlay-toggle">
      <input type="checkbox" :checked="overlay"
        @change="$emit('toggle-overlay', $event.target && $event.target.checked)" />
      Show no-data overlay
    </label>

    <!-- Numeric range controls -->
    <div class="legend" style="margin-top:12px">
      <label class="range-label">Filter range</label>

      <div class="range-row">
        <input type="number" class="range-num" :value="min" @input="updateMin($event.target && $event.target.value)" />
        <input type="range" :min="domain.min" :max="domain.max" step="any" :value="min"
          @input="updateMin($event.target && $event.target.value)" />
      </div>

      <div class="range-row">
        <input type="number" class="range-num" :value="max" @input="updateMax($event.target && $event.target.value)" />
        <input type="range" :min="domain.min" :max="domain.max" step="any" :value="max"
          @input="updateMax($event.target && $event.target.value)" />
        <div class="range-actions">
          <button class="btn-clear" @click="$emit('range-change', null)">Clear filter</button>
          <span class="domain-help">Domain: {{ fmt(domain.min) }} – {{ fmt(domain.max) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  factors: { type: Array, required: true },
  selectedFactor: { type: String, required: true },
  legendBins: { type: Array, required: true },   // [{color, range, label}]
  palette: { type: Array, default: () => [] },   // same colors used on the map
  unit: { type: String, default: '' },
  overlay: { type: Boolean, default: false },
  noDataColor: { type: String, default: '#b8b8b8' },
  selectedRange: { type: [Array, null], default: null } // [min,max] or null
})
const emit = defineEmits(['factor-change', 'range-change', 'legend-bin-click', 'toggle-overlay'])

const showHelp = ref(false)

const selectedFactorData = computed(() =>
  props.factors.find(f => f.id === props.selectedFactor) || props.factors[0]
)

const ribbonGradient = computed(() =>
  props.palette?.length ? `linear-gradient(to right, ${props.palette.join(',')})` : 'transparent'
)

const showNoData = computed(() => !!props.noDataColor)

const domain = computed(() => {
  const nums = props.legendBins.flatMap(b => (String(b.range).match(/[+-]?\d+(\.\d+)?/g) || []).map(Number))
  if (!nums.length) return { min: 0, max: 1 }
  return { min: Math.min(...nums), max: Math.max(...nums) }
})

const min = ref(domain.value.min)
const max = ref(domain.value.max)
watch(domain, d => { min.value = d.min; max.value = d.max })

function updateMin(v) { const n = Number(v); if (Number.isFinite(n)) { min.value = n; if (min.value > max.value) max.value = min.value; emit('range-change', [min.value, max.value]) } }
function updateMax(v) { const n = Number(v); if (Number.isFinite(n)) { max.value = n; if (max.value < min.value) min.value = max.value; emit('range-change', [min.value, max.value]) } }

function onLegendClick(i) {
  const text = String(props.legendBins[i]?.range || '')
  const nums = text.match(/[+-]?\d+(\.\d+)?/g)?.map(Number) || []

  // First bin label like "≤ b0" -> filter v < b0
  if (/≤/.test(text) && nums.length === 1) {
    emit('range-change', ['first', nums[0]])
    return
  }

  // Last bin label like "> bN"   -> filter v >= bN
  if (/>/.test(text) && nums.length === 1) {
    emit('range-change', ['last', nums[0]])
    return
  }

  // Middle bin label "a–b"       -> filter a <= v < b
  if (nums.length === 2) {
    emit('range-change', [nums[0], nums[1], 'exclusive'])
    return
  }

  emit('range-change', null)
}



function intersectsSelected(i) {
  if (!props.selectedRange) return false
  const [lo, hi] = props.selectedRange
  const text = String(props.legendBins[i]?.range || '')
  const nums = text.match(/[+-]?\d+(\.\d+)?/g)?.map(Number) || []
  let a = -Infinity, b = Infinity
  if (/≤/.test(text) && nums.length === 1) { a = -Infinity; b = nums[0] }
  else if (/>/.test(text) && nums.length === 1) { a = nums[0]; b = Infinity }
  else if (nums.length === 2) { a = nums[0]; b = nums[1] }
  return Math.max(a, lo) <= Math.min(b, hi)
}

function fmt(n) { return (typeof n === 'number' && isFinite(n)) ? (Math.abs(n) % 1 ? n.toFixed(1) : String(n)) : '—' }
</script>

<style scoped>
.map-controls {
  width: 350px;
  background: #fff;
  border-right: 1px solid #e0e0e0;
  overflow: auto;
  padding: 20px;
  box-shadow: 2px 0 4px rgba(0, 0, 0, .08)
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid #eee
}

.help-toggle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid #ddd;
  background: #f8f9fa;
  cursor: pointer
}

.help-panel {
  background: #f8f9fa;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px
}

.factor-selector {
  margin-bottom: 12px
}

.factor-selector select {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px
}

.legend {
  background: #f8f9fa;
  padding: 12px;
  border-radius: 8px;
  margin-top: 8px
}

.legend-title-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline
}

.legend-title {
  margin: 0;
  font-size: 16px
}

.legend-unit {
  color: #666
}

.legend-ribbon {
  height: 10px;
  border-radius: 6px;
  margin: 8px 0;
  border: 1px solid #e6e6e6
}

.legend-scale {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border: 1px solid #e6e6e6;
  padding: 6px;
  border-radius: 6px;
  cursor: pointer;
  text-align: left
}

.legend-item:hover {
  border-color: #a8c5ff;
  box-shadow: 0 0 0 2px rgba(56, 132, 255, .12)
}

.legend-swatch {
  width: 28px;
  height: 18px;
  border: 1px solid #ddd;
  border-radius: 3px
}

.legend-text {
  display: flex;
  flex-direction: column;
  font-size: 13px
}

.legend-sub {
  color: #777;
  font-size: 12px
}


.legend-nodata {
  cursor: default
}

.filter-chip {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #eef2ff;
  border: 1px solid #cdd7ff;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px
}

.chip-x {
  border: none;
  background: transparent;
  cursor: pointer
}

.overlay-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0 8px;
  color: #333
}

.range-label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px
}

.range-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0
}

.range-num {
  width: 84px;
  padding: 6px;
  border: 1px solid #ddd;
  border-radius: 6px
}

.range-actions {
  display: flex;
  align-items: center;
  gap: 8px
}

.btn-clear {
  padding: 6px 10px;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 6px;
  cursor: pointer
}

.domain-help {
  color: #666;
  font-size: 12px
}
</style>
