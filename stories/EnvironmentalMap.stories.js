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
  { id: 'pm25',   name: 'Air Quality (PM2.5)', unit: 'μg/m³', colorScale: ['#f5f5f5', '#cccccc', '#969696', '#636363', '#252525'] },
  { id: 'heat',   name: 'Extreme Heat',        unit: 'days',  colorScale: ['#f5f5f5', '#e0e0e0', '#cccccc', '#b0b0b0', '#969696', '#7a7a7a', '#636363', '#4a4a4a', '#252525'] },
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
     data: '/chel2022_wgs84.geojson',  // file in public/ - original data in WGS84 (not clipped)
    factors: baseFactors,
    initialFactorId: '',  // No default selection - user must choose a variable
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
