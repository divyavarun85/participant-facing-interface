// stories/EnvironmentalMap.stories.js  (root-level /stories)
import EnvironmentalMap from '../src/components/EnvironmentalMap.vue';
import { MAP_STYLE } from '../src/config/mapStyle';
const OSM_RASTER_STYLE = {
  version: 8,
  sources: {
    osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256 },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const baseFactors = [
  { id: 'pm25',   name: 'Air Quality (PM2.5)', unit: 'μg/m³', colorScale: ['#2c7bb6','#abd9e9','#ffffbf','#fdae61','#d7191c'] },
  { id: 'heat',   name: 'Extreme Heat',        unit: 'days',  colorScale: ['#ffffcc','#ffeda0','#fed976','#feb24c','#fd8d3c','#fc4e2a','#e31a1c','#bd0026','#800026'] },
];

export default {
  title: 'Maps/Environmental Map',
  component: EnvironmentalMap,
  parameters: { layout: 'fullscreen' },
  decorators: [() => ({ template: '<div style="height:90vh;min-height:600px"><story/></div>' })],
  mapStyle: MAP_STYLE,  
};

export const Default = {
  args: {
     data: '/chel2022_wgs84_clipped.geojson',  // file in public/ - clipped to US boundary
    factors: baseFactors,
    initialFactorId: 'pm25',
    center: [-98.6, 39.8],
    zoom: 3.4,
    style: OSM_RASTER_STYLE,
  },
  render: (args) => ({
    components: { EnvironmentalMap },
    setup() { return { args }; },
    template: '<EnvironmentalMap v-bind="args" />',
  }),
};
