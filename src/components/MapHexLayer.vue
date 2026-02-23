<template>
  <div ref="mapEl" class="map-container" style="width:100%;height:100%"></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import maplibregl from 'maplibre-gl'
import { NavigationControl } from 'maplibre-gl'

const emit = defineEmits(['hex-click'])

const props = defineProps({
  data: { type: [String, Object], required: true },
  mapStyle: { type: [String, Object], required: true },

  valueField: { type: String, default: 'E_PM' },
  breaks: { type: Array, default: () => [5, 7, 9, 11] },
  colors: { type: Array, default: () => ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#d7191c'] },
  center: { type: Array, default: () => [-98.5795, 39.8283] },
  zoom: { type: Number, default: 3.4 },
  sourceId: { type: String, default: 'src' },
  layerId: { type: String, default: 'fill' },
  hoverHighlight: { type: Boolean, default: true },
  zoomOnClick: { type: Boolean, default: true },
  zoomOnClickTarget: { type: Number, default: 7.5 },
  tooltipFields: { type: Array, default: () => [] },
  tooltipLegendConfig: { type: Object, default: null }, // { min, max, minLabel, maxLabel, palette, valueField } for mini legend
  tooltipFormatter: { type: Function, default: null },
  popupOptions: { type: Object, default: () => ({}) },
  selectedHexIds: { type: Array, default: () => [] },
  selectedHexColor: { type: String, default: '#111827' },
  selectedHexWidth: { type: Number, default: 3 },

  statesUrl: { type: [String, Object], default: null },
  showStateBorders: { type: Boolean, default: false },

  // optional filter expression from parent
  filter: { type: [Array, Boolean, null], default: null },

  // search pin location [lng, lat]
  searchPinLocation: { type: Array, default: null }
})

const mapEl = ref(null)
let map
let popup
let hoveredId = null
let lastClickCameFromLayer = false
let canvasMouseLeaveHandlerRegistered = false
const selectionLayerId = `${props.layerId}-selection`
let searchMarker = null

const defaultPopupOptions = {
  closeButton: false,
  closeOnClick: false,
  offset: 12
}

const normalizeToStrings = (ids = []) => {
  if (!Array.isArray(ids)) return []
  return ids
    .map(value => {
      const num = Number(value)
      if (Number.isFinite(num)) return String(num)
      const str = String(value ?? '').trim()
      return str || null
    })
    .filter(Boolean)
}

const colorExpr = (field, breaks, colors) => {
  // If no field selected, return a single neutral gray color
  if (!field || !breaks || breaks.length === 0) {
    return colors[0] || '#e5e7eb'
  }
  const expr = ['step', ['get', field], colors[0]]
  breaks.forEach((brk, idx) => expr.push(brk, colors[idx + 1] ?? colors.at(-1)))
  return expr
}

function findFirstLabelLayerId() {
  const style = map.getStyle()
  if (!style?.layers) return undefined
  const symbolLayer = style.layers.find(layer =>
    layer.type === 'symbol' &&
    layer.layout &&
    Boolean(layer.layout['text-field'])
  )
  return symbolLayer?.id
}

function hoverOpacityExpr() {
  return props.hoverHighlight
    ? ['case', ['boolean', ['feature-state', 'hover'], false], 0.9, 0.75]
    : 0.75
}

function applyFilter() {
  if (!map?.getLayer(props.layerId)) return
  map.setFilter(props.layerId, props.filter ?? true)
}

function updatePaint() {
  if (!map?.getLayer(props.layerId)) return
  map.setPaintProperty(props.layerId, 'fill-color',
    colorExpr(props.valueField, props.breaks, props.colors)
  )
  map.setPaintProperty(props.layerId, 'fill-opacity', hoverOpacityExpr())
  applyFilter()
}

function clearHoverState() {
  if (!map || hoveredId == null) return
  map.setFeatureState({ source: props.sourceId, id: hoveredId }, { hover: false })
  hoveredId = null
}

function ensurePopup() {
  if (!popup) {
    popup = new maplibregl.Popup({ ...defaultPopupOptions, ...(props.popupOptions || {}) })
  }
  return popup
}

function closePopup() {
  if (!popup) return
  popup.remove()
  lastClickCameFromLayer = false
}

function getTooltipHtml(feature) {
  if (!feature) return null
  if (typeof props.tooltipFormatter === 'function') {
    return props.tooltipFormatter(feature)
  }
  if (props.tooltipFields?.length) {
    const fields = props.tooltipFields
      .map(({ label, property, formatter }) => {
        const raw = feature.properties?.[property]
        const value = formatter ? formatter(raw, feature) : raw
        if (value === undefined || value === null) return null
        return { label, value }
      })
      .filter(Boolean)

    if (!fields.length) return null

    // First field is usually Location - show as header
    const locationField = fields.find(f => f.label === 'Location')
    const dataFields = fields.filter(f => f.label !== 'Location')

    const cfg = props.tooltipLegendConfig
    const rawVal = cfg?.valueField != null ? Number(feature.properties?.[cfg.valueField]) : null
    const hasLegend = cfg && cfg.min != null && cfg.max != null && cfg.palette?.length &&
      rawVal != null && !Number.isNaN(rawVal) && cfg.max !== cfg.min

    let pct = 0
    if (hasLegend) {
      pct = Math.min(100, Math.max(0, ((rawVal - cfg.min) / (cfg.max - cfg.min)) * 100))
    }

    let html = `<style>
      .map-tooltip { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; min-width: 200px; max-width: 90vw; }
      .map-tooltip-header { font-weight: 600; font-size: 14px; color: #1f2937; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
      .map-tooltip-data { display: flex; flex-direction: column; gap: 6px; }
      .map-tooltip-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 13px; }
      .map-tooltip-label { color: #64748b; font-weight: 900; }
      .map-tooltip-value { color: #1f2937; font-weight: 600; }
      .map-tooltip-legend { margin-top: 10px; padding-top: 8px; border-top: 1px solid #e5e7eb; }
      .map-tooltip-legend-bar { position: relative; height: 8px; border-radius: 4px; margin-bottom: 6px; }
      .map-tooltip-legend-marker { position: absolute; top: 50%; transform: translate(-50%, -50%); width: 10px; height: 10px; border-radius: 50%; background: #1e293b; border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.2); pointer-events: none; }
      .map-tooltip-legend-labels { display: flex; justify-content: space-between; font-size: 11px; color: #64748b; font-variant-numeric: tabular-nums; }
      @media (max-width: 480px) {
        .map-tooltip { min-width: 180px; max-width: 85vw; font-size: 12px; }
        .map-tooltip-header { font-size: 13px; }
        .map-tooltip-row { font-size: 12px; gap: 8px; }
      }
    </style>`
    html += '<div class="map-tooltip">'

    // Location header
    if (locationField) {
      html += `<div class="map-tooltip-header">${locationField.value}</div>`
    }

    // Data fields
    if (dataFields.length) {
      html += '<div class="map-tooltip-data">'
      dataFields.forEach(({ label, value }) => {
        html += `<div class="map-tooltip-row"><span class="map-tooltip-label">${label}:</span> <span class="map-tooltip-value">${value}</span></div>`
      })
      html += '</div>'
    }

    // Mini legend: full range with marker showing where value falls
    if (hasLegend && cfg) {
      const grad = cfg.palette.map(c => c).join(', ')
      html += `<div class="map-tooltip-legend">
        <div class="map-tooltip-legend-bar" style="background: linear-gradient(to right, ${grad});">
          <div class="map-tooltip-legend-marker" style="left: ${pct}%;"></div>
        </div>
        <div class="map-tooltip-legend-labels">
          <span>${cfg.minLabel}${cfg.unit ? ' ' + cfg.unit : ''}</span>
          <span>${cfg.maxLabel}${cfg.unit ? ' ' + cfg.unit : ''}</span>
        </div>
      </div>`
    }

    html += '</div>'
    return html
  }
  const value = feature.properties?.[props.valueField]
  if (value == null) return null
  return `<div class="map-tooltip"><strong>${props.valueField}</strong>: ${value}</div>`
}

function handleMouseMove(e) {
  if (!map) return
  const feature = e.features?.[0]
  if (!feature || feature.id == null) return

  // Update hover state for visual highlighting
  if (props.hoverHighlight && hoveredId !== feature.id) {
    clearHoverState()
    hoveredId = feature.id
    map.setFeatureState({ source: props.sourceId, id: hoveredId }, { hover: true })
  } else if (!props.hoverHighlight && hoveredId !== feature.id) {
    hoveredId = feature.id
  }

  // Show tooltip on hover - always show when moving over features
  if (props.tooltipFields?.length || typeof props.tooltipFormatter === 'function') {
    const html = getTooltipHtml(feature)
    if (html) {
      ensurePopup()
      popup.setLngLat(e.lngLat).setHTML(html).addTo(map)
    }
  }
}

function handleMouseLeave() {
  if (!map) return
  map.getCanvas().style.cursor = ''
  clearHoverState()
  closePopup()
}

function handleCursorEnter() {
  if (!map) return
  map.getCanvas().style.cursor = 'pointer'
}

function handleFeatureClick(e) {
  if (!map) return
  const feature = e.features?.[0]
  if (!feature) return

  // Emit hex-click event with feature data for sidebar
  emit('hex-click', feature)

  if (props.zoomOnClick) {
    const targetZoom = Math.max(props.zoomOnClickTarget, map.getZoom())
    map.easeTo({ center: e.lngLat, zoom: targetZoom, duration: 650 })
  }

  const html = getTooltipHtml(feature)
  if (html) {
    ensurePopup()
    popup.setLngLat(e.lngLat).setHTML(html).addTo(map)
    lastClickCameFromLayer = true
  } else if (popup) {
    popup.remove()
    lastClickCameFromLayer = false
  }

  // Prevent hover tooltip from interfering with click popup
  hoveredId = feature.id || null
}

function handleMapClick(e) {
  if (!map || !popup) return
  if (lastClickCameFromLayer) {
    lastClickCameFromLayer = false
    return
  }
  const features = map.queryRenderedFeatures(e.point, { layers: [props.layerId] })
  if (!features.length) {
    closePopup()
  }
}

function handleMapMouseDown(e) {
  if (!map || !popup) return
  if (lastClickCameFromLayer) return
  const features = map.queryRenderedFeatures(e.point, { layers: [props.layerId] })
  if (features.length) return
  closePopup()
}

function handleCanvasMouseLeave() {
  closePopup()
}

function updateSelectionLayer() {
  if (!map || !map.isStyleLoaded() || !map.getLayer(selectionLayerId)) return
  const normalized = normalizeToStrings(props.selectedHexIds)
  if (!normalized.length) {
    map.setFilter(selectionLayerId, ['==', ['to-string', ['get', 'hex_id']], '__none__'])
    return
  }
  map.setFilter(selectionLayerId,
    ['in', ['to-string', ['get', 'hex_id']], ['literal', normalized]]
  )
  map.setPaintProperty(selectionLayerId, 'line-color', props.selectedHexColor)
  map.setPaintProperty(selectionLayerId, 'line-width',
    Number.isFinite(props.selectedHexWidth) ? props.selectedHexWidth : 3
  )
  map.setPaintProperty(selectionLayerId, 'line-dasharray', [0.5, 3])
}

function updateSearchPin() {
  if (!map) return

  // Remove existing marker
  if (searchMarker) {
    searchMarker.remove()
    searchMarker = null
  }

  // Add new marker if location is provided
  if (props.searchPinLocation && Array.isArray(props.searchPinLocation) && props.searchPinLocation.length === 2) {
    const [lng, lat] = props.searchPinLocation
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      // Create a custom pin element
      const el = document.createElement('div')
      el.className = 'search-pin-marker'
      el.style.width = '24px'
      el.style.height = '32px'
      el.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'32\' viewBox=\'0 0 24 32\'%3E%3Cpath fill=\'%231e4f86\' d=\'M12 0C7.58 0 4 3.58 4 8c0 6.5 8 16 8 16s8-9.5 8-16c0-4.42-3.58-8-8-8zm0 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z\'/%3E%3C/svg%3E")'
      el.style.backgroundSize = 'contain'
      el.style.backgroundRepeat = 'no-repeat'
      el.style.backgroundPosition = 'center'
      el.style.cursor = 'pointer'

      searchMarker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom'
      })
        .setLngLat([lng, lat])
        .addTo(map)
    }
  }
}

function registerInteraction() {
  if (!map) return
  map.on('mouseenter', props.layerId, handleCursorEnter)
  map.on('mouseleave', props.layerId, handleMouseLeave)
  map.on('click', handleMapClick)
  map.on('mousedown', handleMapMouseDown)
  // Register mousemove for hover highlights or tooltips
  if (props.hoverHighlight || props.tooltipFields?.length || typeof props.tooltipFormatter === 'function') {
    map.on('mousemove', props.layerId, handleMouseMove)
  }
  if (props.zoomOnClick || props.tooltipFields?.length || typeof props.tooltipFormatter === 'function') {
    map.on('click', props.layerId, handleFeatureClick)
  }
}

function unregisterInteraction() {
  if (!map) return
  map.off('mouseenter', props.layerId, handleCursorEnter)
  map.off('mouseleave', props.layerId, handleMouseLeave)
  map.off('click', handleMapClick)
  map.off('mousedown', handleMapMouseDown)
  map.off('mousemove', props.layerId, handleMouseMove)
  map.off('click', props.layerId, handleFeatureClick)
}

onMounted(() => {
  map = new maplibregl.Map({
    container: mapEl.value,
    style: props.mapStyle,
    center: props.center,
    zoom: props.zoom,
    // Performance optimizations
    antialias: false, // Disable antialiasing for better performance
    renderWorldCopies: false, // Don't render multiple world copies
    maxPitch: 0, // Disable 3D tilt for better performance
    preserveDrawingBuffer: false // Better performance
  })

  map.on('error', err => console.error('MapLibre error:', err?.error || err))

  map.on('load', async () => {
    const beforeId = findFirstLabelLayerId()

    map.addSource(props.sourceId, {
      type: 'geojson',
      data: props.data,
      generateId: true,
      // Performance optimization: use cluster for very large datasets
      // cluster: props.data?.features?.length > 10000,
      // clusterRadius: 50
    })

    map.addLayer({
      id: props.layerId,
      type: 'fill',
      source: props.sourceId,
      paint: {
        'fill-color': colorExpr(props.valueField, props.breaks, props.colors),
        'fill-opacity': hoverOpacityExpr()
      }
    }, beforeId)

    map.addLayer({
      id: `${props.layerId}-outline`,
      type: 'line',
      source: props.sourceId,
      paint: {
        'line-color': '#000',
        'line-width': 0.6,
        'line-opacity': 0.1
      }
    }, beforeId)

    if (props.showStateBorders && props.statesUrl) {
      try {
        const statesData = typeof props.statesUrl === 'string'
          ? await (await fetch(props.statesUrl, { cache: 'no-store' })).json()
          : props.statesUrl

        map.addSource('states-outline', { type: 'geojson', data: statesData })

        map.addLayer({
          id: 'states-casing',
          type: 'line',
          source: 'states-outline',
          paint: {
            'line-color': '#ffffff',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              3, 3.5,
              6, 4.5,
              8, 6,
              10, 8
            ],
            'line-opacity': 0.9
          },
          layout: { 'line-join': 'round', 'line-cap': 'round' }
        }, beforeId)

        map.addLayer({
          id: 'states-line',
          type: 'line',
          source: 'states-outline',
          paint: {
            'line-color': '#170202',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              3, 2,
              6, 2.5,
              8, 3.5,
              10, 4.5
            ],
            'line-opacity': 0.85
          },
          layout: { 'line-join': 'round', 'line-cap': 'round' }
        }, beforeId)
      } catch (err) {
        console.warn('Failed loading states overlay:', err)
      }
    }

    map.addLayer({
      id: selectionLayerId,
      type: 'line',
      source: props.sourceId,
      filter: ['==', ['to-string', ['get', 'hex_id']], '__none__'],
      paint: {
        'line-color': props.selectedHexColor,
        'line-width': props.selectedHexWidth,
        'line-opacity': 0.95,
        'line-dasharray': [0.5, 3]
      },
      layout: { 'line-join': 'round', 'line-cap': 'round' }
    }, beforeId)

    updateSelectionLayer()

    applyFilter()
    registerInteraction()
    if (!canvasMouseLeaveHandlerRegistered && mapEl.value) {
      mapEl.value.addEventListener('mouseleave', handleCanvasMouseLeave)
      canvasMouseLeaveHandlerRegistered = true
    }

    const boldLayers = ['State labels']
    const placeLayers = ['City labels', 'Capital city labels']

    boldLayers.forEach(layerId => {
      if (!map.getLayer(layerId)) return
      try {
        map.setLayoutProperty(layerId, 'text-transform', 'uppercase')
        map.setLayoutProperty(layerId, 'text-letter-spacing', 0.25)
        map.setLayoutProperty(layerId, 'text-font', ['Open Sans Bold'])
        map.setLayoutProperty(layerId, 'text-size', [
          'interpolate', ['linear'], ['zoom'],
          4, 9,
          6, 12,
          8, 16
        ])
        map.setPaintProperty(layerId, 'text-halo-color', '#ffffff')
        map.setPaintProperty(layerId, 'text-halo-width', 2.5)
        map.setPaintProperty(layerId, 'text-halo-blur', 0.5)
        map.setPaintProperty(layerId, 'text-color', '#1a1a1a')
      } catch (err) {
        console.warn(`Unable to adjust styling for ${layerId}`, err)
      }
    })

    placeLayers.forEach(layerId => {
      if (!map.getLayer(layerId)) return
      try {
        map.setPaintProperty(layerId, 'text-halo-color', '#ffffff')
        map.setPaintProperty(layerId, 'text-halo-width', 2)
        map.setPaintProperty(layerId, 'text-color', '#111111')
      } catch (err) {
        console.warn(`Unable to adjust styling for ${layerId}`, err)
      }
    })

    setTimeout(() => map.resize(), 0)
    updateSearchPin() // Initialize pin if location is already set

    // Add zoom controls (zoom in/out buttons only, no compass)
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
  })
})

watch(
  () => [props.valueField, JSON.stringify(props.breaks), JSON.stringify(props.colors), JSON.stringify(props.filter)],
  () => updatePaint()
)

watch(
  () => props.searchPinLocation,
  () => {
    if (!map) return
    nextTick(() => {
      const updateAfterReady = () => {
        if (map && map.isStyleLoaded()) {
          updateSearchPin()
        }
      }
      // Wait for map to finish any animations before adding marker
      if (map.isStyleLoaded()) {
        // Wait for moveend to ensure animation is complete
        map.once('moveend', updateAfterReady)
        // Also update immediately in case map is already stationary
        updateAfterReady()
      } else {
        map.once('idle', updateAfterReady)
      }
    })
  },
  { deep: true }
)

watch(
  () => props.selectedHexIds.slice(),
  () => updateSelectionLayer()
)

watch(
  () => props.selectedHexColor,
  color => {
    if (!map || !map.getLayer(selectionLayerId) || !color) return
    map.setPaintProperty(selectionLayerId, 'line-color', color)
  }
)

watch(
  () => props.selectedHexWidth,
  width => {
    if (!map || !map.getLayer(selectionLayerId) || !Number.isFinite(width)) return
    map.setPaintProperty(selectionLayerId, 'line-width', width)
  }
)

watch(
  () => props.hoverHighlight,
  () => {
    if (!map || !map.isStyleLoaded()) return
    clearHoverState()
    updatePaint()
    unregisterInteraction()
    registerInteraction()
  }
)

watch(
  () => [props.zoomOnClick, typeof props.tooltipFormatter, JSON.stringify(props.tooltipFields ?? [])],
  () => {
    if (!map || !map.isStyleLoaded()) return
    unregisterInteraction()
    registerInteraction()
  }
)

watch(
  () => {
    const center = Array.isArray(props.center) ? props.center : []
    const [lng, lat] = center
    return [Number(lng), Number(lat), Number(props.zoom)]
  },
  ([lng, lat, zoom]) => {
    if (!map || !map.isStyleLoaded()) return

    const hasCenter = Number.isFinite(lng) && Number.isFinite(lat)
    const hasZoom = Number.isFinite(zoom)

    if (!hasCenter && !hasZoom) return

    const params = { duration: 600 }

    if (hasCenter) {
      const current = map.getCenter()
      if (Math.abs(current.lng - lng) > 1e-6 || Math.abs(current.lat - lat) > 1e-6) {
        params.center = [lng, lat]
      }
    }

    if (hasZoom) {
      const currentZoom = map.getZoom()
      if (Math.abs(currentZoom - zoom) > 1e-3) {
        params.zoom = zoom
      }
    }

    if (params.center || params.zoom) {
      map.easeTo(params)
    }
  },
  { deep: true }
)

watch(
  () => props.data,
  newData => {
    if (!map || !map.isStyleLoaded()) return
    const source = map.getSource(props.sourceId)
    if (source && newData) {
      clearHoverState()
      if (typeof newData === 'string') {
        fetch(newData, { cache: 'no-store' })
          .then(res => res.json())
          .then(json => source.setData(json))
          .catch(err => console.error('Failed to load GeoJSON data', err))
      } else {
        source.setData(newData)
      }
      updateSelectionLayer()
    }
  }
)

onBeforeUnmount(() => {
  if (searchMarker) {
    searchMarker.remove()
    searchMarker = null
  }
  unregisterInteraction()
  if (canvasMouseLeaveHandlerRegistered && mapEl.value) {
    mapEl.value.removeEventListener('mouseleave', handleCanvasMouseLeave)
    canvasMouseLeaveHandlerRegistered = false
  }
  closePopup()
  map?.remove()
})
</script>
