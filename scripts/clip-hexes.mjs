import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { featureCollection } from '@turf/helpers'
import { booleanPointInPolygon, centroid, bboxClip } from '@turf/turf'
import { intersection } from 'martinez-polygon-clipping'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const sourcePath = path.join(rootDir, 'public', 'chel2022_wgs84.geojson')
const landmaskPath = path.join(rootDir, 'public', 'data', 'us_landmask.geojson')
const outputPath = path.join(rootDir, 'public', 'chel2022_wgs84_clipped.geojson')

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Hex source not found at ${sourcePath}`)
}

if (!fs.existsSync(landmaskPath)) {
  throw new Error(`US landmask not found at ${landmaskPath}. Please run scripts/create-landmask.mjs first.`)
}

console.log('Loading US landmask (country boundary)...')
const landmaskData = JSON.parse(fs.readFileSync(landmaskPath, 'utf8'))
const landmaskFeatures = Array.isArray(landmaskData?.features) ? landmaskData.features : []

if (!landmaskFeatures.length) {
  throw new Error('US landmask has no features')
}

// Use the first feature as the unified US boundary
const usBoundary = landmaskFeatures[0]
if (!usBoundary?.geometry) {
  throw new Error('US landmask feature has no geometry')
}

console.log(`Using US country boundary for clipping (type: ${usBoundary.geometry.type})`)

// Helper function to convert GeoJSON Polygon to martinez format (array of rings)
function geojsonToMartinez(geom) {
  if (geom.type === 'Polygon') {
    return geom.coordinates // Already in correct format: [exterior, ...holes]
  }
  if (geom.type === 'MultiPolygon') {
    // For MultiPolygon, we'll use the first polygon (largest one typically)
    return geom.coordinates[0] || null
  }
  return null
}

// Helper function to convert martinez result back to GeoJSON
function martinezToGeojson(coords) {
  if (!coords || coords.length === 0) return null
  
  // Filter out empty polygons
  const validPolygons = coords.filter(poly => poly && poly.length > 0 && poly[0] && poly[0].length >= 3)
  if (validPolygons.length === 0) return null
  
  if (validPolygons.length === 1) {
    return { type: 'Polygon', coordinates: validPolygons[0] }
  }
  return { type: 'MultiPolygon', coordinates: validPolygons }
}

console.log('Loading hex data...')
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
const features = Array.isArray(source?.features) ? source.features : []
const outputFeatures = []

// Helper to handle MultiPolygon for martinez clipping
function geojsonToMartinezMulti(geom) {
  if (geom.type === 'Polygon') {
    return [geom.coordinates] // Wrap in array for MultiPolygon format
  }
  if (geom.type === 'MultiPolygon') {
    return geom.coordinates // Already in correct format
  }
  return null
}

console.log(`Clipping ${features.length} hexes to US country boundary...`)
let clippedCount = 0
let keptCount = 0
let skippedCount = 0

const boundaryCoords = geojsonToMartinezMulti(usBoundary.geometry)
if (!boundaryCoords || boundaryCoords.length === 0) {
  throw new Error('Failed to convert US boundary to clipping format')
}

for (let i = 0; i < features.length; i++) {
  const hexFeature = features[i]
  if (!hexFeature?.geometry || !hexFeature.geometry.coordinates) {
    skippedCount++
    continue
  }

  const hexGeom = hexFeature.geometry
  
  // Convert hex to martinez format
  if (hexGeom.type !== 'Polygon') {
    skippedCount++
    continue
  }
  
  const hexCoords = geojsonToMartinez(hexGeom)
  if (!hexCoords || hexCoords.length === 0) {
    skippedCount++
    continue
  }
  
  const hexCentroid = centroid(hexFeature)
  
  // Check if hex centroid is inside the US boundary
  const isInside = booleanPointInPolygon(hexCentroid, usBoundary)
  
  let clipped = null
  
  // Try to clip hex against the US boundary
  let allClips = []
  for (const boundaryPoly of boundaryCoords) {
    try {
      const clippedCoords = intersection(hexCoords, boundaryPoly)
      if (clippedCoords && clippedCoords.length > 0) {
        const clippedGeom = martinezToGeojson(clippedCoords)
        if (clippedGeom) {
          allClips.push(clippedGeom)
        }
      }
    } catch {
      // Clipping failed for this polygon part, continue
      continue
    }
  }
  
  // If we got clips, use the first one
  if (allClips.length > 0) {
    clipped = {
      type: 'Feature',
      geometry: allClips[0],
      properties: { ...hexFeature.properties },
      id: hexFeature.id
    }
    clippedCount++
  } else if (isInside) {
    // No successful clip but centroid is inside, keep original
    clipped = hexFeature
    keptCount++
  } else {
    // Completely outside, skip
    skippedCount++
    continue
  }

  // Preserve properties and ID
  clipped.properties = { ...hexFeature.properties }
  if (hexFeature.id !== undefined) clipped.id = hexFeature.id
  outputFeatures.push(clipped)
  
  if ((i + 1) % 100 === 0) {
    console.log(`  Progress: ${i + 1}/${features.length} (clipped: ${clippedCount}, kept: ${keptCount}, skipped: ${skippedCount})`)
  }
}

const output = featureCollection(outputFeatures)
fs.writeFileSync(outputPath, JSON.stringify(output))
console.log(`\nWrote ${outputFeatures.length} features to ${outputPath}`)
console.log(`  - Clipped: ${clippedCount}`)
console.log(`  - Kept original (inside): ${keptCount}`)
console.log(`  - Skipped (outside): ${skippedCount}`)
