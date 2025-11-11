<template>
  <div ref="mapEl" style="width:100%;height:100%"></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import maplibregl from 'maplibre-gl'

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
  tooltipFormatter: { type: Function, default: null },
  popupOptions: { type: Object, default: () => ({}) },
  selectedHexIds: { type: Array, default: () => [] },
  selectedHexColor: { type: String, default: '#111827' },
  selectedHexWidth: { type: Number, default: 3 },

  statesUrl: { type: [String, Object], default: null },
  showStateBorders: { type: Boolean, default: false },

  // optional filter expression from parent
  filter: { type: [Array, Boolean, null], default: null }
})

const mapEl = ref(null)
let map
let popup
let hoveredId = null
let lastClickCameFromLayer = false
let canvasMouseLeaveHandlerRegistered = false
const selectionLayerId = `${props.layerId}-selection`

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
    const segments = props.tooltipFields
      .map(({ label, property, formatter }) => {
        const raw = feature.properties?.[property]
        const value = formatter ? formatter(raw, feature) : raw
        if (value === undefined || value === null) return null
        return `<div><strong>${label}:</strong> ${value}</div>`
      })
      .filter(Boolean)
    return segments.length ? `<div class="map-tooltip">${segments.join('')}</div>` : null
  }
  const value = feature.properties?.[props.valueField]
  if (value == null) return null
  return `<div class="map-tooltip"><strong>${props.valueField}</strong>: ${value}</div>`
}

function handleMouseMove(e) {
  if (!props.hoverHighlight || !map) return
  const feature = e.features?.[0]
  if (!feature || feature.id == null) return
  if (hoveredId !== feature.id) {
    clearHoverState()
    hoveredId = feature.id
    map.setFeatureState({ source: props.sourceId, id: hoveredId }, { hover: true })
  }
}

function handleMouseLeave() {
  if (!map) return
  map.getCanvas().style.cursor = ''
  clearHoverState()
}

function handleCursorEnter() {
  if (!map) return
  map.getCanvas().style.cursor = 'pointer'
}

function handleFeatureClick(e) {
  if (!map) return
  const feature = e.features?.[0]
  if (!feature) return

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
}

function registerInteraction() {
  if (!map) return
  map.on('mouseenter', props.layerId, handleCursorEnter)
  map.on('mouseleave', props.layerId, handleMouseLeave)
  map.on('click', handleMapClick)
  map.on('mousedown', handleMapMouseDown)
  if (props.hoverHighlight) {
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
    zoom: props.zoom
  })

  map.on('error', err => console.error('MapLibre error:', err?.error || err))

  map.on('load', async () => {
    const beforeId = findFirstLabelLayerId()

    map.addSource(props.sourceId, {
      type: 'geojson',
      data: props.data,
      generateId: true
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
              3, 1.2,
              6, 1.6,
              8, 2.4,
              10, 3
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
              3, 0.35,
              6, 0.55,
              8, 0.8,
              10, 1.1
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
        'line-opacity': 0.95
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
  })
})

watch(
  () => [props.valueField, JSON.stringify(props.breaks), JSON.stringify(props.colors), JSON.stringify(props.filter)],
  () => updatePaint()
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
  unregisterInteraction()
  if (canvasMouseLeaveHandlerRegistered && mapEl.value) {
    mapEl.value.removeEventListener('mouseleave', handleCanvasMouseLeave)
    canvasMouseLeaveHandlerRegistered = false
  }
  closePopup()
  map?.remove()
})
</script>
