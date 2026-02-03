<template>
  <aside class="map-controls">
    <header class="panel-header">
      <div>
        <h2>Participant Facing Interface</h2>
      </div>
      <button class="help-toggle" @click="showHelp = !showHelp" :aria-label="showHelp ? 'Close help' : 'Show help'">
        {{ showHelp ? '✕' : '?' }}
      </button>
    </header>

    <transition name="collapse">
      <section v-if="showHelp" class="panel card card-muted">
        <h3>Quick Tips</h3>
        <ul>
          <li>Use the dropdown to swap between indicators.</li>
          <li>Click legend bands to focus specific ranges.</li>
          <li>Enter a ZIP code or address to zoom directly to that area.</li>
        </ul>
      </section>
    </transition>
    <section class="panel card">
      <label class="field-label" for="pin-input">Locate by ZIP Code or Address</label>
      <div class="pin-input-row">
        <div class="field-control ">
          <input id="pin-input" v-model="pinQuery" type="text" placeholder="Search by zip code"
            @keyup.enter="submitPin" />
        </div>
        <button class="btn-primary" @click="submitPin" :disabled="pinLoading || !pinQuery.trim()">
          <span v-if="pinLoading" class="spinner" aria-hidden="true"></span>
          <span>{{ pinLoading ? 'Searching…' : 'Locate' }}</span>
        </button>
      </div>
      <transition name="fade">
        <p v-if="pinErrorToDisplay" class="feedback feedback-error">{{ pinErrorToDisplay }}</p>
      </transition>
    </section>
    <section class="panel card">
      <label class="field-label">Environmental Factor</label>
      <div class="variable-list" role="list">
        <button v-for="factor in factors" :key="factor.id" type="button" class="variable-item"
          :class="{ 'variable-item--selected': factor.id === selectedFactor }"
          @click="$emit('factor-change', factor.id)" :aria-label="`Select ${factor.name}`"
          :aria-pressed="factor.id === selectedFactor">
          <div class="variable-preview">
            <span v-for="(color, idx) in factor.colorScale" :key="idx" class="variable-preview-swatch"
              :style="{ backgroundColor: color }"></span>
          </div>
          <div class="variable-details">
            <span class="variable-name">{{ factor.name }}</span>
            <span class="variable-unit" v-if="factor.unit">{{ factor.unit }}</span>
          </div>
          <span v-if="factor.id === selectedFactor" class="variable-checkmark">✓</span>
        </button>
      </div>

      <div v-if="legendBins.length > 0" class="legend-ribbon" :style="{ background: ribbonGradient }"
        aria-hidden="true"></div>
      <div v-if="legendBins.length > 0" class="legend-scale" role="list">
        <button v-for="(bin, i) in legendBins" :key="`${bin.range}-${i}`" class="legend-item" type="button"
          :aria-label="`Filter to ${bin.label || 'this level'}`" @click="onLegendClick(i)">
          <span class="legend-swatch" :style="{ backgroundColor: bin.color }" />
          <span class="legend-text">
            <span class="legend-range">{{ bin.label }}</span>
          </span>

        </button>
      </div>

      <transition name="fade">
        <div v-if="selectedFilterLabel" class="filter-chip">
          <span>Filter: {{ selectedFilterLabel }}</span>
          <button class="chip-x" @click="clearFilter" aria-label="Clear filter">✕</button>
        </div>
      </transition>
    </section>
  </aside>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  factors: { type: Array, required: true },
  selectedFactor: { type: String, default: '' },
  legendBins: { type: Array, required: true },   // [{color, range, label}]
  palette: { type: Array, default: () => [] },   // same colors used on the map
  unit: { type: String, default: '' },
  overlay: { type: Boolean, default: false },
  noDataColor: { type: String, default: '#b8b8b8' },
  selectedRange: { type: [Array, null], default: null }, // [min,max] or null
  pinErrorMessage: { type: String, default: '' },
  pinLoading: { type: Boolean, default: false }
})
const emit = defineEmits(['factor-change', 'range-change', 'legend-bin-click', 'toggle-overlay', 'pin-search'])

const showHelp = ref(false)
const pinQuery = ref('')
const pinErrorLocal = ref('')
const pinErrorToDisplay = computed(() => props.pinErrorMessage || pinErrorLocal.value)
const selectedFilterLabel = ref('')

const selectedFactorData = computed(() =>
  props.factors.find(f => f.id === props.selectedFactor) || props.factors[0]
)

const ribbonGradient = computed(() =>
  props.palette?.length ? `linear-gradient(to right, ${props.palette.join(',')})` : 'transparent'
)

const showNoData = computed(() => !!props.noDataColor)

watch(() => props.selectedRange, value => {
  if (!value) selectedFilterLabel.value = ''
})

function onLegendClick(i) {
  const bin = props.legendBins[i]
  selectedFilterLabel.value = bin?.label || ''
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

  selectedFilterLabel.value = ''
  emit('range-change', null)
}

function submitPin() {
  const query = pinQuery.value.trim()
  if (!query) {
    pinErrorLocal.value = 'Please enter a ZIP code or address.'
    return
  }
  pinErrorLocal.value = ''
  emit('pin-search', query)
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

function clearFilter() {
  selectedFilterLabel.value = ''
  emit('range-change', null)
}
</script>

<style scoped>
.map-controls {
  width: 340px;
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  overflow-y: auto;
  padding: 28px 24px;
  box-shadow: inset -1px 0 0 rgba(17, 24, 39, 0.05);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 4px;
}

.panel-eyebrow {
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: #94a3b8;
  margin: 0 0 6px;
}

.panel-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
}

.help-toggle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid #cbd5f5;
  background: #f8fafc;
  cursor: pointer;
  font-size: 16px;
  color: #475569;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.help-toggle:hover {
  background: #e2e8f0;
}

.panel,
.card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 18px 18px 20px;
  box-shadow: 0 1px 2px rgba(148, 163, 184, 0.12);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.card-muted {
  background: #f8fafc;
  border-style: dashed;
}

.card-muted h3 {
  margin-bottom: 2px;
}


.panel-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-heading-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.panel-heading-meta {
  margin: 0;
  font-size: 12px;

}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  letter-spacing: 0.02em;
}

.variable-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.variable-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  background: #fff;
  border: 2px solid #e2e8f0;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.variable-item:hover {
  border-color: #cbd5f5;
  background: #f8fafc;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.variable-item--selected {
  border-color: #2563eb;
  background: #eef2ff;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.variable-preview {
  display: flex;
  gap: 2px;
  width: 64px;
  height: 20px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
  background: #f1f5f9;
}

.variable-preview-swatch {
  flex: 1;
  height: 100%;
  min-width: 0;
}

.variable-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.variable-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.variable-item--selected .variable-name {
  color: #2563eb;
}

.variable-unit {
  font-size: 12px;
  color: #64748b;
}

.variable-checkmark {
  color: #2563eb;
  font-size: 18px;
  font-weight: bold;
  flex-shrink: 0;
}

.field-control select,
.field-control input[type="text"],
.field-control input[type="number"] {
  width: 100%;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #cbd5f5;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.field-control select:focus,
.field-control input[type="text"]:focus,
.field-control input[type="number"]:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.legend-ribbon {
  height: 12px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.4);
}

.legend-scale {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 8px 10px;
  background: #f8fafc;
  border: 1px solid transparent;
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  width: 100%;
}

.legend-item:hover {
  border-color: #cbd5f5;
  background: #eef2ff;
}

.legend-swatch {
  width: 24px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  flex-shrink: 0;
}

.legend-text {
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: #1f2937;
  flex: 1;
  min-width: 0;
}

.legend-range {
  font-weight: 500;
}

.legend-sub {
  color: #64748b;
  font-size: 11px;
  margin-top: 2px;
}

.legend-active-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #2563eb;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  border-radius: 999px;
  background: #eef2ff;
  color: #1d4ed8;
  font-size: 12px;
}

.chip-x {
  border: none;
  background: transparent;
  cursor: pointer;
  color: inherit;
}

.toggle-label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #475569;
}

.toggle-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
}

.pin-input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: stretch;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  min-width: 80px;
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary:not(:disabled):hover {
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.25);
  transform: translateY(-1px);
}

.btn-primary .spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.6);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.65s linear infinite;
}

.feedback {
  font-size: 12px;
  margin: 0;
}

.feedback-error {
  color: #dc2626;
}

.range-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.range-group span {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #475569;
  margin-bottom: 4px;
}

.range-controls {
  display: flex;
  gap: 10px;
  align-items: center;
}

.range-controls input[type="number"] {
  width: 100px;
}

.range-actions {
  display: flex;
  justify-content: flex-end;
}

.btn-muted {
  padding: 8px 12px;
  border: 1px solid #cbd5f5;
  background: #f8fafc;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  color: #2563eb;
  transition: all 0.2s ease;
}

.btn-muted:hover {
  background: #e2e8f0;
}

.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.2s ease;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.pin-input-row input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.range-num {
  padding: 8px 10px;
  border: 1px solid #cbd5f5;
  border-radius: 6px;
}

.range-controls input[type="range"] {
  flex: 1;
}

.help-panel ul {
  margin: 0;
  padding-left: 18px;
  color: #475569;
  font-size: 13px;
}

.select-wrapper {
  position: relative;
  display: inline-block;
  width: 100%;
}

.select-wrapper select {
  appearance: none;
  cursor: pointer;
  padding-right: 36px;
  /* Make room for the arrow */
}

.select-arrow {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: #64748b;
  font-size: 12px;
  transition: color 0.2s ease;
}

.select-wrapper:focus-within .select-arrow {
  color: #2563eb;
}

#factor-select {
  appearance: none;
  cursor: pointer;
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

.pin-lookup {
  background: #fff;
  border: 1px solid #e4e6f1;
  border-radius: 10px;
  padding: 14px;
  margin-top: 16px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}

.pin-lookup label {
  display: block;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 6px;
  color: #1f2937;
}

.pin-input-row {
  display: flex;
  gap: 38px;
}

.pin-input-row input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #cbd5f0;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.pin-input-row input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  min-width: 64px;
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary:not(:disabled):hover {
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.25);
  transform: translateY(-1px);
}

.btn-primary .spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.6);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.65s linear infinite;
  margin-right: 6px;
}

.pin-hint {
  font-size: 12px;
  color: #6b7280;
  margin: 6px 0 0;
}

.pin-error {
  margin-top: 6px;
  font-size: 12px;
  color: #dc2626;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
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

  border: 1px solid #e6e6e6
}

.legend-scale {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  background: #f8fafc;
  border: 1px solid transparent;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: all 0.2s ease;
}

.legend-item:hover {
  border-color: #cbd5f5;
  background: #eef2ff;
}

.legend-swatch {
  width: 24px;
  height: 16px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 4px;
  flex-shrink: 0;
}

.legend-text {
  display: flex;
  flex-direction: column;
  font-size: 12px;
  flex: 1;
  min-width: 0;
}

.legend-range {
  font-weight: 500;
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

.filter {
  padding: 5px 8px 0 8px;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 15px;
  justify-content: space-between;
}
</style>
