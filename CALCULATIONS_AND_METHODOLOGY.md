# Environmental Map: Calculations and Methodology

This document describes how all values, scales, filters, and ratings are calculated in the application. Data is from the **CHEL 2022** (Climate and Health Equity Index) dataset.

---

## 0. Units: not in the dataset, not added in the app

The GeoJSON and the CHEL2022.gpkg file only store numbers (e.g. `"EP_ASTHMA": 10.5`). **No units are stored or documented in the data.** This project does not include or link to an official CHEL data dictionary.

We **do not display units** (such as %, μg/m³, ppm, “people”, or “index”) in the app, because we cannot cite them from the dataset. The factor catalog uses empty `unit` values; the legend and cards show only the numeric scale and factor name. If you obtain CHEL documentation that defines units for each field, you can add those units to the catalog and display them.

---

## 1. Data source and variables

The map uses one GeoJSON dataset (e.g. `chel2022.geojson`) with one value per hex for each variable. Only variables that have numeric values and can be summarized are shown.

| Display name              | Dataset field | Description (from factor names only; no units in data) |
|---------------------------|---------------|--------------------------------------------------------|
| Air Pollution (PM2.5)     | E_PM          | Fine particulate matter (PM2.5)                       |
| Asthma Rates              | EP_ASTHMA     | Asthma-related measure                                |
| Air Pollution Percentile  | EPL_PM        | Air pollution percentile (0–1 in data; shown as 0–100)|
| Ozone                     | E_OZONE       | Ozone measure                                         |
| Ozone Percentile          | EPL_OZONE     | Ozone percentile (0–1 in data; shown as 0–100)         |
| Social Vulnerability      | SPL_SVM       | Social vulnerability index                             |
| Population                | E_TOTPOP      | Total population count                                 |

---

## 2. How the scale breakpoints are computed (all variables)

Breakpoints are **not fixed**. They are computed from the **distribution of the selected variable across all hexes** in the loaded dataset.

### Step 1: Collect and sort values

For the selected variable (e.g. `EP_ASTHMA`):

1. Take that variable’s value from **every** hex in the dataset.
2. Keep only valid numeric values.
3. Sort them from smallest to largest.

### Step 2: Compute four percentiles

Using the sorted list, the app computes four percentile values:

- **q20** = value at the 20th percentile (20% of hexes have a value below this)
- **q40** = value at the 40th percentile  
- **q60** = value at the 60th percentile  
- **q80** = value at the 80th percentile  

Formula used: for probability `p` in {0.2, 0.4, 0.6, 0.8}, the value at percentile `p` is  
`values[ floor((N - 1) × p) ]`  
where `N` is the number of hexes and the array is 0‑indexed.

The same logic also produces **min** (smallest value) and **max** (largest value) for that variable.

### Step 3: Define the five bands

These four numbers become the breakpoints for the legend and map colors:

| Band        | Rule (value = hex’s value for that variable) |
|------------|-----------------------------------------------|
| Very Low   | value ≤ q20                                   |
| Low        | q20 &lt; value ≤ q40                          |
| Moderate   | q40 &lt; value ≤ q60                          |
| High       | q60 &lt; value ≤ q80                          |
| Very High  | value &gt; q80                                |

So the scale is **relative to the dataset**: e.g. “Low” means in the 20th–40th percentile of all hexes for that variable, not “low” against an external health standard.

---

## 3. How the legend numbers are displayed

The **same** breakpoints (q20, q40, q60, q80) are shown in the legend; only the number formatting changes by variable type:

- **Population (E_TOTPOP):** Breakpoints are rounded to **integers** and formatted with commas (e.g. 20,667).
- **Ozone Percentile / Air Pollution Percentile (EPL_OZONE, EPL_PM):** Values are on a 0–1 scale in the data. They are shown as **0–100** (e.g. 20, 40, 60, 80).
- **All others:** Breakpoints shown with one decimal place when needed.

No units are shown in the legend (dataset does not provide units). The note under the scale can show the factor name only.

---

## 4. Map filtering (clicking a legend band)

When a user clicks a legend band, the map is **filtered** so that only hexes in that band are shown (others are hidden or styled as “no data”).

Filter logic:

- **Very Low (≤ q20):** show hexes where `value ≤ q20` (strictly: value &lt; q20 for the first break; implementation may use ≤ for the first bin).
- **Low, Moderate, High:** show hexes where value is in the corresponding **closed‑open** interval, e.g. `q20 ≤ value &lt; q40` for Low.
- **Very High (&gt; q80):** show hexes where `value &gt; q80` (or `value ≥ q80` depending on implementation).

So the same breakpoints used for coloring are used for filtering; no extra calculation.

---

## 5. Hex sidebar: “Xth percentile” and the percentile bar

When you click a hex, the sidebar shows each factor and “**Xth percentile**” (and a bar) for that hex. That percentile is **not** “your value ÷ total”. It is:

- **For EPL_PM and EPL_OZONE:** The value in the data is already on a 0–1 scale, so:  
  **percentile = round(value × 100)**  
  (e.g. 0.35 → 35th percentile).

- **For all other variables:**  
  1. Use the same **min, max, q20, q40, q60, q80** for that variable (from the full dataset).  
  2. See which interval the hex’s value falls in (e.g. between q40 and q60).  
  3. **Linearly interpolate** within that interval to get a 0–100 percentile:
    - Below min → 0.
    - Above max → 100.
    - Between min and q20 → interpolate 0–20.
    - Between q20 and q40 → interpolate 20–40.
    - Between q40 and q60 → interpolate 40–60.
    - Between q60 and q80 → interpolate 60–80.
    - Between q80 and max → interpolate 80–100.

So the “Xth percentile” is “where this hex sits in the distribution,” not a share of a sum.

---

## 6. Overall environmental burden (hex sidebar)

The **overall environmental burden** for a hex is a single summary across the **environmental factors** (not population). It is **not** a weighted sum of raw values.

### Step 1: Rank each factor (1–5)

For each factor (e.g. PM2.5, Asthma, Ozone, Ozone Percentile, Air Pollution Percentile, Social Vulnerability), the hex’s value is compared to that factor’s q20, q40, q60, q80:

- Below q20 → rank **1** (Very Low)  
- q20 to q40 → **2** (Low)  
- q40 to q60 → **3** (Moderate)  
- q60 to q80 → **4** (High)  
- Above q80 → **5** (Very High)  

Population can be included in the factor list; the same quintile rules apply.

### Step 2: Average the numeric ranks

- Average = (sum of those ranks) / (number of factors with valid data).
- If a factor has no data for that hex, it is skipped (not counted in the average).

### Step 3: Convert average back to a label

- average &lt; 1.5 → **Very Low**  
- average &lt; 2.5 → **Low**  
- average &lt; 3.5 → **Moderate**  
- average &lt; 4.5 → **High**  
- otherwise → **Very High**  

So “High” or “Very High” overall burden means the hex tends to be in the higher quintiles across the included factors (worse conditions), not that a single number is above a fixed threshold.

---

## 7. Rank labels and colors (sidebar)

Each factor’s rank (Very Low … Very High) is shown with:

- **Short label:** Favorable (Very Low/Low), Moderate, Elevated (High), High (Very High).
- **Colors:** Chosen to be colorblind‑friendly (blues for favorable, amber/orange for higher burden). Exact hex values are in the sidebar component’s `RANK_STYLES`.

---

## 8. Summary

| What                    | How it’s done                                                                 |
|-------------------------|-------------------------------------------------------------------------------|
| Scale breakpoints       | 20th, 40th, 60th, 80th percentiles of the variable over all hexes            |
| Band assignment         | Compare each hex’s value to q20, q40, q60, q80 (same for map and sidebar)     |
| Legend numbers          | Same q20–q80; formatted by type (integer for population, % for 0–1, etc.)     |
| Map filter              | Show only hexes whose value falls in the selected band’s range               |
| Sidebar “Xth percentile”| For 0–1 vars: value×100; else linear interpolation between quantiles          |
| Overall burden          | Average of 1–5 ranks across factors, then map average to Very Low … Very High |

All of this uses **only** the loaded GeoJSON (e.g. CHEL 2022). There are no hardcoded breakpoints; changing the dataset or the set of hexes will change q20–q80 and thus the legend and all derived values.
