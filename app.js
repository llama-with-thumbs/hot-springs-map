// 1) Define two base‐layers
const streetLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
});
const satelliteLayer = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/" + "World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { attribution: "Tiles &copy; Esri &mdash; Source: Esri, NASA, USGS" }
);

// 2) Initialize the map with the Street layer
const map = L.map("map", {
  center: [39, -100],
  zoom: 4,
  layers: [streetLayer], // default
});

// 3) Add a control to switch between Street/Satellite
const baseMaps = {
  Street: streetLayer,
  Satellite: satelliteLayer,
};
L.control.layers(baseMaps, null, { position: "topright" }).addTo(map);

let markerList = [];

function bounceMarker(marker) {
  // Only bounce if icon is present (marker is on map)
  if (marker._icon) {
    marker._icon.classList.add("highlight-marker");
    setTimeout(() => {
      if (marker._icon) marker._icon.classList.remove("highlight-marker");
    }, 600);
  }
}
function doSearch() {
  const query = document.getElementById("search").value.trim().toLowerCase();
  const resultsDiv = document.getElementById("search-results");
  let resultsHtml = "";
  let matches = [];

  // 1) Show/hide markers based on query
  markerList.forEach(({ marker, name }) => {
    const isMatch = name && name.toLowerCase().includes(query) && query;
    if (isMatch) {
      if (!map.hasLayer(marker)) marker.addTo(map);
      bounceMarker(marker);
      marker.setZIndexOffset && marker.setZIndexOffset(1000);
      matches.push(marker);
    } else {
      if (map.hasLayer(marker)) marker.remove();
      marker.setZIndexOffset && marker.setZIndexOffset(0);
    }
  });

  // 2) Build results list
  if (!query) {
    resultsHtml = "";
    resetMapView();
  } else if (matches.length === 0) {
    resultsHtml = "<div>No matches found.</div>";
  } else {
    resultsHtml = "<ul style='list-style:none;padding:0;margin:0;'>";
    matches.slice(0, 5).forEach((marker) => {
      const props = marker.feature.properties;
      // Title + link
      resultsHtml += `
        <li style="margin-bottom:16px;">
          <a href="#" style="font-weight:600;font-size:1.05em;color:#255bbd;text-decoration:none;"
             onclick="focusSpring(${marker._leaflet_id});return false;">
            ${props["Spring Name"] || "Hot Spring"}
          </a>
          <div style="font-size:0.9em;color:#444;margin-top:4px;">
      `;
      // Dynamically list every property except the name itself
      Object.entries(props).forEach(([key, val]) => {
        if (key === "Spring Name") return;
        const display = val && val !== "null" ? val : "No data";
        resultsHtml += `<div><b>${key}</b>: ${display}</div>`;
      });
      resultsHtml += `</div></li>`;
    });
    resultsHtml += "</ul>";
    if (matches.length > 5) {
      resultsHtml += `<div style="font-size:0.85em;color:#666;margin-top:8px;">
                        + ${matches.length - 5} more results
                      </div>`;
    }
  }

  resultsDiv.innerHTML = resultsHtml;

  // 3) Mobile scroll into view
  if (window.innerWidth < 900 && query) {
    resultsDiv.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // 4) focusSpring helper
  window.focusSpring = function (leafletId) {
    const found = markerList.find(({ marker }) => marker._leaflet_id === leafletId);
    if (found) {
      map.setView(found.marker.getLatLng(), 11, { animate: true });
      found.marker.openPopup();
      bounceMarker(found.marker);
    }
  };
}

function resetMapView() {
  map.setView([39, -100], 4);
  markerList.forEach(({ marker }) => {
    if (!map.hasLayer(marker)) marker.addTo(map); // Show all
    if (marker.setStyle) marker.setStyle({ opacity: 1, fillOpacity: 0.95 });
    if (marker.setOpacity) marker.setOpacity(1);
    if (marker.setZIndexOffset) marker.setZIndexOffset(0);
  });
}

// Search button click
document.getElementById("search-btn").addEventListener("click", doSearch);

// Enter key in search input
document.getElementById("search").addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    doSearch();
  }
});

// Show/hide clear button and clear on click
const searchInput = document.getElementById("search");
const clearBtn = document.getElementById("search-clear");

searchInput.addEventListener("input", function () {
  clearBtn.style.display = searchInput.value.length > 0 ? "block" : "none";
});

clearBtn.addEventListener("click", function () {
  searchInput.value = "";
  clearBtn.style.display = "none";
  doSearch(); // This will reset markers, but let’s add resetMapView for zoom too
  resetMapView();
  searchInput.focus();
});

fetch("hot_springs.geojson")
  .then((response) => response.json())
  .then((data) => {
    markerList = [];
    L.geoJSON(data, {
      pointToLayer: (feature, latlng) => {
        const props = feature.properties || {};

        const marker = L.circleMarker(latlng, {
          radius: 5,
          color: "#56130e", // Border color
          fillColor: "#e03426", // Fill color
          fillOpacity: 0.95,
          weight: 1,
        });
        // 1) Mapping for renamed fields
        const labelMap = {
          SC: "State",
          TF: "Temperature (°F)",
          TC: "Temperature (°C)",
        };

        // 2) Build popup
        let popupContent = `<strong>${props["Spring Name"] || "Hot Spring"}</strong>`;

        // 3) Skip unwanted keys
        const exclude = ["P.P. 492", "Circ. 790", "NOAA  "];

        Object.entries(props).forEach(([key, raw]) => {
          if (key === "Spring Name" || exclude.includes(key)) return;

          const val = raw && raw !== "null" ? raw : "Information not available";
          const label = labelMap[key] || key;

          popupContent += `<br><b>${label}:</b> ${val}`;
        });

        marker.bindPopup(popupContent);

        marker.addTo(map);
        markerList.push({ marker, name: props["Spring Name"] || "" });
        return marker;
      },
    });
  });
const legend = document.getElementById("legend");
const toggle = document.getElementById("legend-toggle");

// 2) Toggle on click
toggle.addEventListener("click", (e) => {
  e.stopPropagation();
  const isCollapsed = legend.classList.toggle("collapsed");
});

document.getElementById("temp-reset-btn").addEventListener("click", () => {
  // 1) Force °F radio back on
  document.querySelector('input[name="temp-unit"][value="TF"]').checked = true;

  // 2) Update the slider back to 32–212 °F
  sliderInstance.update({
    min: 32,
    max: 212,
    from: 32,
    to: 212,
    postfix: " °F",
    grid: true, // keep the grid if you like
  });

  // 3) Update the label
  updateDisplay(sliderInstance.result);

  // 4) Re‑check W/H/B
  document.querySelectorAll('input[name="temp-code"]').forEach((cb) => (cb.checked = true));

  // 5) Show all markers & reset map
  markerList.forEach(({ marker }) => {
    if (!map.hasLayer(marker)) marker.addTo(map);
  });
  resetMapView();
});

// grab the display span
const rangeDisplay = document.getElementById("temp-range-display");

// create the slider
const slider = $("#temp-slider").ionRangeSlider({
  type: "double",
  grid: true,
  min: 32,
  max: 212,
  from: 32,
  to: 212,
  postfix: " °F",
  onStart: updateDisplay,
  onChange: (val) => {
    updateDisplay(val);
    applyTempFilter(val);
  },
});
const sliderInstance = $("#temp-slider").data("ionRangeSlider");

// update the “Selected” text
function updateDisplay(data) {
  rangeDisplay.textContent = `${data.from}–${data.to} °C`;
}

// your apply logic, using the two values and current unit
function applyTempFilter(data) {
  const unit = document.querySelector('input[name="temp-unit"]:checked').value;
  const min = data.from,
    max = data.to;
  const codes = Array.from(document.querySelectorAll('input[name="temp-code"]:checked')).map((cb) => cb.value);

  markerList.forEach(({ marker }) => {
    const raw = marker.feature.properties[unit];
    const num = parseFloat(raw);
    const isNumMatch = !isNaN(num) && num >= min && num <= max;
    const isCodeMatch = codes.includes(raw);
    const show = isNumMatch || isCodeMatch;

    if (show) {
      map.hasLayer(marker) || marker.addTo(map);
    } else {
      map.hasLayer(marker) && marker.remove();
    }
  });
}

document.querySelectorAll('input[name="temp-unit"]').forEach((radio) =>
  radio.addEventListener("change", () => {
    const isC = radio.value === "TC" && radio.checked;
    sliderInstance.update({
      min: isC ? 0 : 32,
      max: isC ? 100 : 212,
      from: isC
        ? Math.round(((sliderInstance.result.from - 32) * 5) / 9)
        : Math.round((sliderInstance.result.from * 9) / 5 + 32),
      to: isC
        ? Math.round(((sliderInstance.result.to - 32) * 5) / 9)
        : Math.round((sliderInstance.result.to * 9) / 5 + 32),
      postfix: isC ? " °C" : " °F",
    });
  })
);

// whenever a code checkbox toggles, re-run applyTempFilter with current slider values
document.querySelectorAll('input[name="temp-code"]').forEach((cb) =>
  cb.addEventListener("change", () => {
    const val = sliderInstance.result; // { from: number, to: number, … }
    applyTempFilter({ from: parseFloat(val.from), to: parseFloat(val.to) });
  })
);

document.getElementById("temp-reset-btn").addEventListener("click", () => {
  // 1) Reset the slider to its original from/to
  sliderInstance.reset();

  // 2) Update the displayed range text
  updateDisplay(sliderInstance.result);

  // 3) Re‑check all W/H/B checkboxes
  document.querySelectorAll('input[name="temp-code"]').forEach((cb) => (cb.checked = true));

  // 4) Re‑apply the filter (this will now show all markers in the full range)
  applyTempFilter({
    from: sliderInstance.result.from,
    to: sliderInstance.result.to,
  });

  // 5) Reset the map view/zoom if you like
  resetMapView();
});
