# Data Units Explanation

## Overview

**Yes, all the data values come from your CHEL 2022 GeoJSON file** (`chel2022_wgs84.geojson`). **The dataset and the CHEL2022.gpkg file do not specify units for any measure.** The app does not display units (%, μg/m³, ppm, etc.) because we cannot cite them from the data.

The section below describes **interpretations that are sometimes used** for these fields (e.g. in other CHEL documentation or literature). Do not treat these as coming from the dataset until you have an official CHEL data dictionary or codebook.

## Variable Units and Their Meanings

### 1. **Air Quality (E_PM)**
- **Unit**: `μg/m³` (micrograms per cubic meter)
- **Field Name**: `E_PM`
- **What it means**: 
  - Concentration of PM2.5 (particulate matter smaller than 2.5 micrometers) in the air
  - Example: `E_PM: 8.13` means 8.13 micrograms of PM2.5 per cubic meter of air
  - This is an **absolute measurement** from the CHEL dataset
- **Data Source**: Comes directly from CHEL 2022 GeoJSON file

### 2. **Asthma Rates (EP_ASTHMA)**
- **Unit**: `%` (percentage)
- **Field Name**: `EP_ASTHMA`
- **What it means**:
  - Percentage of the population with asthma in that hexagon
  - Example: `EP_ASTHMA: 10.5` means 10.5% of people in that area have asthma
  - This is a **percentage** from the CHEL dataset
- **Data Source**: Comes directly from CHEL 2022 GeoJSON file

### 3. **PM2.5 Percentile (EPL_PM)**
- **Unit**: `0–1` (normalized scale, no units)
- **Field Name**: `EPL_PM`
- **What it means**:
  - A normalized ranking (0 to 1) showing where this hexagon's PM2.5 ranks compared to all hexagons
  - Example: `EPL_PM: 0.6784` means this hexagon's PM2.5 is worse than 67.84% of all hexagons
  - 0.0 = lowest PM2.5 (best), 1.0 = highest PM2.5 (worst)
  - This is a **calculated percentile** from the CHEL dataset
- **Data Source**: Comes directly from CHEL 2022 GeoJSON file

### 4. **Social Vulnerability (SPL_SVM)**
- **Unit**: `index` (index value, unitless)
- **Field Name**: `SPL_SVM`
- **What it means**:
  - A composite index score measuring social vulnerability (typically 0-10 scale)
  - Higher values = more vulnerable communities
  - Example: `SPL_SVM: 7.477` means a social vulnerability index of 7.477
  - This is an **index score** from the CHEL dataset
- **Data Source**: Comes directly from CHEL 2022 GeoJSON file

### 5. **Population (E_TOTPOP)**
- **Unit**: `k` (thousands)
- **Field Name**: `E_TOTPOP`
- **What it means**:
  - Total population in the hexagon, stored as actual number
  - Displayed in thousands (×1k) for readability
  - Example: `E_TOTPOP: 530439.9` means 530,439.9 people (or 530.4k when displayed)
  - This is an **absolute population count** from the CHEL dataset
- **Data Source**: Comes directly from CHEL 2022 GeoJSON file

## Where Units Come From

### Data Values (from GeoJSON)
- All **values** come directly from your `chel2022_wgs84.geojson` file
- Each hexagon has properties like: `E_PM`, `EP_ASTHMA`, `EPL_PM`, `SPL_SVM`, `E_TOTPOP`
- These are stored as numbers in the GeoJSON file

### Unit Labels (defined in code)
- The **unit labels** (`μg/m³`, `%`, `0–1`, `index`, `k`) are defined in the code
- They're added in `EnvironmentalMap.vue` in the `catalog` array
- These labels tell users what the numbers mean

## Example from Your Data

From `chel2022.geojson`:
```json
{
  "fid": 1,
  "hex_id": 0,
  "E_TOTPOP": 530439.9,      // Population: 530,439.9 people
  "EP_ASTHMA": 10.5,         // Asthma rate: 10.5%
  "E_PM": 8.13,              // PM2.5: 8.13 μg/m³
  "EPL_PM": 0.6784,          // PM2.5 Percentile: 0.6784 (67.84th percentile)
  "SPL_SVM": 7.477           // Social Vulnerability Index: 7.477
}
```

## Summary

✅ **All data values** come from your CHEL 2022 GeoJSON file  
✅ **Units are defined in code** to match CHEL dataset standards  
✅ **GeoJSON file** = Your data source (not "cell data")  
✅ **Code** = Defines how to display and label the data

The CHEL (Climate and Health Equity Index) dataset is a research dataset that provides environmental and health data aggregated to hexagon grids. **CHEL 2022** uses **2022 as the data reference year** (indicators are for 2022 unless otherwise documented).

