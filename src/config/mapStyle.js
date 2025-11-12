export const MAP_STYLE =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MAP_STYLE)
    || window.__VITE_MAP_STYLE
    || 'https://demotiles.maplibre.org/style.json'
console.log('Map style in use:', MAP_STYLE);