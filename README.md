# Hot Springs Finder

**Live Demo:** https://hotspringfinder.com/

An interactive, browser‑based map of hot springs in the U.S., rebuilt from the original NCEI dataset (decommissioned May 5 2025). Search, filter, and explore thermal springs—now free and open source.

---

## Features

- 🔍 **Search by name** with autocomplete  
- 🌡️ **Temperature filter** (dual‑handle slider; °F / °C)  
- 🅱️ / 🅷 / 🆆 **Boiling / Hot / Warm** checkbox filters  
- 🗺️ **Legend** (collapsible) explaining all fields  
- 🔄 **Base‑layer toggle**: Default / Satellite  
- 📱 **Responsive design** for desktop & mobile  
- 📦 **Static site** (no backend required)  

---

## Data Source

- Original dataset from NCEI (last updated 1980s)  
- Cleaned & deduplicated GeoJSON (`hot_springs.geojson`)  
- **More datasets coming soon**: extending coverage with newer U.S. and international sources

---

## Screenshot

![alt text](image.png)

---

## Tech Stack

- **Leaflet** for map rendering  
- **Ion.RangeSlider** for dual‑handle temperature filter  
- **Vanilla JS**, **HTML**, **CSS**  
- **GitHub Pages** for hosting  

---
## Getting Started

### Clone & Serve Locally

```bash
git clone https://github.com/llama-with-thumbs/hot-springs-map.git
cd hot-springs-map
# with Python 3:
python3 -m http.server 8000
# or, with Node:
npx http-server .

