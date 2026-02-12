# Data Verification Guide

## How Colors Are Currently Calculated

Your map uses **relative classification** based on percentiles, not absolute EPA standards:

- **Very Low** = Bottom 20% of all values (≤ 20th percentile)
- **Low** = 20th-40th percentile
- **Moderate** = 40th-60th percentile
- **High** = 60th-80th percentile
- **Very High** = Top 20% of all values (> 80th percentile)

## What This Means for North Carolina

If North Carolina shows as "high" or "very high," it means:
- NC is in the top 40% of all hexagons in your dataset
- This is **relative to your data**, not EPA health standards
- The actual PM2.5 values might still be "Good" or "Moderate" by EPA standards

## How to Verify the Data

### 1. Check Actual Values (Using Tooltips)
- Hover over hexagons in North Carolina on your map
- Look at the actual PM2.5 value (in μg/m³)
- Compare to EPA standards:
  - **Good (Green)**: 0-12 μg/m³
  - **Moderate (Yellow)**: 12-35.4 μg/m³
  - **Unhealthy for Sensitive (Orange)**: 35.5-55.4 μg/m³
  - **Unhealthy (Red)**: 55.5-150.4 μg/m³

### 2. Check the Legend
- Look at the legend on the left sidebar
- See what the actual break values are (e.g., "≤ 7.5", "7.5-9.2", etc.)
- These are calculated from your dataset's percentiles

### 3. Check the Data Source
- You're using: **CHEL 2022** (Climate and Health Equity Index) data—**2022 is the data reference year**
- This is real research data from environmental health studies
- File: `chel2022_wgs84.geojson`

### 4. Verify North Carolina Values

To check if NC values are realistic, you can:

**Option A: Use Browser Console**
1. Open browser DevTools (F12)
2. In Console, check the data values
3. Or hover over NC hexagons to see actual PM2.5 values

**Option B: Check EPA AirNow**
- Visit: https://www.airnow.gov/
- Look up North Carolina's actual air quality data
- Compare to your hex values

## Is North Carolina's Air Pollution Actually High?

**Realistic Considerations:**
- **Some areas of NC do have elevated PM2.5**, especially:
  - Eastern/coastal regions with industrial activity
  - Areas near major highways (I-95, I-85)
  - Urban centers (Charlotte, Raleigh-Durham, Greensboro)
- **However**, much of NC (especially western mountains) typically has good air quality
- **Overall**, NC is usually in the "moderate" range by EPA standards

## Potential Issues

1. **Relative vs Absolute Classification**
   - Your map shows relative rankings (percentiles)
   - EPA uses absolute thresholds (fixed μg/m³ values)
   - If most of the US has "good" air quality, the top 20% might still be "good" by EPA standards

2. **Data Completeness**
   - CHEL 2022 data might be aggregated or modeled
   - Check if the data source documentation explains the methodology

3. **Year of Data**
   - 2022 data - check if there were specific events (fires, etc.) that year

## Recommendations

1. **Verify Actual Values**: Hover over NC hexagons and check the PM2.5 values
2. **Compare to EPA Standards**: See if values match EPA AirNow data
3. **Consider Using EPA Thresholds**: Instead of percentiles, use absolute EPA AQI breakpoints
4. **Add Context**: Show actual EPA AQI category in tooltips alongside percentile ranking

