export const MAP_STYLE =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MAP_STYLE && import.meta.env.VITE_MAP_STYLE.trim())
    || window.__VITE_MAP_STYLE
    || 'https://api.maptiler.com/maps/streets-v2/style.json?key=JeZVdibZR6j0rag3HJet'
console.log('Map style in use:', MAP_STYLE);