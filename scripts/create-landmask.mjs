import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { bboxClip, union } from '@turf/turf'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const rootDir = path.resolve(__dirname, '..')
const sourcePath = path.join(rootDir, 'tmp', 'ne_10m_land.geojson')
const outputPath = path.join(rootDir, 'public', 'data')

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Source GeoJSON not found at ${sourcePath}. Download it before running this script.`)
}

const geojson = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
const features = Array.isArray(geojson?.features) ? geojson.features : []

if (!features.length) {
  throw new Error('The source GeoJSON has no features.')
}

const bboxes = [
  { name: 'continental', bbox: [-130, 24, -65, 52] },
  { name: 'alaska', bbox: [-170, 50, -129, 72] },
  { name: 'hawaii', bbox: [-161, 18, -154, 23] },
  { name: 'puerto_rico', bbox: [-68.5, 17.5, -64, 19] }
]

const clippedPieces = []
for (const feature of features) {
  if (!feature?.geometry) continue

  for (const region of bboxes) {
    try {
      const piece = bboxClip(feature, region.bbox)
      if (piece && piece.geometry && piece.geometry.coordinates?.length) {
        clippedPieces.push(piece)
      }
    } catch (error) {
      // Skip features that do not intersect this bounding box
    }
  }
}

if (clippedPieces.length === 0) {
  throw new Error('No landmass geometry was captured for the specified bounding boxes.')
}

// Merge all pieces
let merged = structuredClone(clippedPieces[0])
for (let i = 1; i < clippedPieces.length; i++) {
  try {
    merged = union(merged, clippedPieces[i]) || merged
  } catch (error) {
    // Fallback: append as MultiPolygon component
    if (merged.geometry.type === 'MultiPolygon') {
      const coords = Array.isArray(clippedPieces[i]?.geometry?.coordinates)
        ? clippedPieces[i].geometry.coordinates
        : []
      merged.geometry.coordinates.push(...coords)
    } else if (merged.geometry.type === 'Polygon' && clippedPieces[i]?.geometry?.coordinates) {
      merged = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            merged.geometry.coordinates,
            ...(Array.isArray(clippedPieces[i].geometry.coordinates)
              ? clippedPieces[i].geometry.coordinates
              : [])
          ]
        }
      }
    }
  }
}

if (!fs.existsSync(outputPath)) {
  fs.mkdirSync(outputPath, { recursive: true })
}

const landmask = {
  type: 'FeatureCollection',
  features: [merged]
}

const outputFile = path.join(outputPath, 'us_landmask.geojson')
fs.writeFileSync(outputFile, JSON.stringify(landmask))
console.log(`Generated ${outputFile}`)
