// Theme toggle
(function () {
  if (localStorage.getItem("theme") === "dark") document.body.classList.add("dark");
})();
document.getElementById("theme-toggle").addEventListener("click", function () {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
});

// Map styles
const STREET_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SATELLITE_STYLE = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Tiles &copy; Esri &mdash; Source: Esri, NASA, USGS",
    },
  },
  layers: [{ id: "satellite", type: "raster", source: "satellite" }],
};

// Initialize map
const map = new maplibregl.Map({
  container: "map",
  style: STREET_STYLE,
  center: [-100, 39],
  zoom: 4,
});

// Navigation (zoom) control
map.addControl(new maplibregl.NavigationControl(), "top-left");

// Show user location automatically (no button)
var userLocMarker = null;
if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    function (pos) {
      var lngLat = [pos.coords.longitude, pos.coords.latitude];
      if (userLocMarker) {
        userLocMarker.setLngLat(lngLat);
      } else {
        var dot = document.createElement("div");
        dot.className = "user-location-dot";
        userLocMarker = new maplibregl.Marker({ element: dot })
          .setLngLat(lngLat)
          .addTo(map);
      }
    },
    function () {},
    { enableHighAccuracy: true }
  );
}

// Layer switcher control
class LayerSwitcher {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl layer-switcher";

    const streetBtn = document.createElement("button");
    streetBtn.textContent = "Street";
    streetBtn.className = "layer-btn active";

    const satBtn = document.createElement("button");
    satBtn.textContent = "Satellite";
    satBtn.className = "layer-btn";

    streetBtn.addEventListener("click", () => {
      map.setStyle(STREET_STYLE);
      streetBtn.classList.add("active");
      satBtn.classList.remove("active");
    });

    satBtn.addEventListener("click", () => {
      map.setStyle(SATELLITE_STYLE);
      satBtn.classList.add("active");
      streetBtn.classList.remove("active");
    });

    this._container.appendChild(streetBtn);
    this._container.appendChild(satBtn);
    return this._container;
  }

  onRemove() {
    this._container.remove();
  }
}
map.addControl(new LayerSwitcher(), "top-right");

// State
let allFeatures = [];
let geojsonData = null;
let currentFilter = null;
let currentPopup = null;

// Popup builder
const labelMap = {
  SC: "State",
  TF: "Temperature (\u00b0F)",
  TC: "Temperature (\u00b0C)",
};
const excludeKeys = ["P.P. 492", "Circ. 790", "NOAA  ", "AMS", "USGS Quadrangle"];
const stateNames = {
  AK: "Alaska", AR: "Arkansas", AZ: "Arizona", CA: "California",
  CO: "Colorado", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  ID: "Idaho", MA: "Massachusetts", MT: "Montana", NC: "North Carolina",
  NM: "New Mexico", NV: "Nevada", NY: "New York", OR: "Oregon",
  SD: "South Dakota", TX: "Texas", UT: "Utah", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WY: "Wyoming",
};

function springName(props) {
  var n = props["Spring Name"];
  return n && n !== "null" && n.trim() !== "" ? n : "Hot Spring";
}

function buildPopupHTML(props) {
  let html = "<strong>" + springName(props) + "</strong>";
  Object.entries(props).forEach(function ([key, raw]) {
    if (key === "Spring Name" || excludeKeys.includes(key)) return;
    var val = raw && raw !== "null" ? raw : "Information not available";
    var label = labelMap[key] || key;
    if (key === "SC" && val !== "Information not available") {
      val = stateNames[val] || val;
    }
    html += "<br><b>" + label + ":</b> " + val;
  });
  return html;
}

// Overlay and data state
var overlayData = null;

// Add overlay + hot springs layers
function addMapLayers() {
  if (overlayData && !map.getSource("non-us-overlay")) {
    map.addSource("non-us-overlay", { type: "geojson", data: overlayData });
    map.addLayer({
      id: "non-us-overlay",
      type: "fill",
      source: "non-us-overlay",
      paint: {
        "fill-color": "#ddd",
        "fill-opacity": 0.45,
      },
    });
  }

  if (!geojsonData) return;
  if (map.getSource("hot-springs")) return;

  map.addSource("hot-springs", { type: "geojson", data: geojsonData, generateId: true });
  map.addLayer({
    id: "hot-springs",
    type: "circle",
    source: "hot-springs",
    paint: {
      "circle-radius": [
        "case", ["boolean", ["feature-state", "hover"], false], 8, 5
      ],
      "circle-color": [
        "case",
        ["any", ["!", ["has", "TF"]], ["==", ["get", "TF"], null], ["==", ["get", "TF"], "null"], ["==", ["get", "TF"], ""]], "#4caf50",
        ["==", ["get", "TF"], "W"], "#67a9cf",
        ["==", ["get", "TF"], "H"], "#ef8a62",
        ["==", ["get", "TF"], "B"], "#b2182b",
        [
          "interpolate", ["linear"],
          ["to-number", ["get", "TF"], 100],
          50, "#2166ac",
          90, "#67a9cf",
          120, "#f7f7f7",
          150, "#ef8a62",
          200, "#b2182b"
        ]
      ],
      "circle-stroke-color": [
        "case", ["boolean", ["feature-state", "hover"], false], "#fff", "rgba(0,0,0,0.25)"
      ],
      "circle-stroke-width": [
        "case", ["boolean", ["feature-state", "hover"], false], 2, 1
      ],
      "circle-opacity": 0.9,
    },
  });

  if (currentFilter) {
    map.setFilter("hot-springs", currentFilter);
  }
}

// Initial load: fetch overlay + hot springs data, then add layers
map.on("load", function () {
  Promise.all([
    fetch("us_overlay.geojson").then(function (r) { return r.json(); }),
    fetch("hot_springs.geojson").then(function (r) { return r.json(); }),
  ]).then(function (results) {
    overlayData = results[0];
    geojsonData = results[1];
    allFeatures = results[1].features;
    addMapLayers();
  });
});

// Re-add layers after style switch (Street <-> Satellite)
map.on("styledata", function () {
  if (!map.getSource("non-us-overlay") || (geojsonData && !map.getSource("hot-springs"))) {
    try { addMapLayers(); } catch (e) { /* style not fully ready yet */ }
  }
});

// Clear hover helper
function clearHover() {
  if (hoveredId !== null) {
    map.setFeatureState({ source: "hot-springs", id: hoveredId }, { hover: false });
    hoveredId = null;
  }
  hoverLocked = true;
  map.getCanvas().style.cursor = "";
}

// Clear hover on any map click
map.on("click", function () {
  clearHover();
});

// Click on spring -> popup
map.on("click", "hot-springs", function (e) {
  if (!e.features || !e.features.length) return;
  var props = e.features[0].properties;

  if (currentPopup) currentPopup.remove();
  currentPopup = new maplibregl.Popup()
    .setLngLat(e.lngLat)
    .setHTML(buildPopupHTML(props))
    .addTo(map);

  // Clear hover when popup closes
  currentPopup.on("close", function () {
    clearHover();
    hoverLocked = false;
  });

  // Show info in sidebar
  var resultsDiv = document.getElementById("search-results");
  var html = "<ul style='list-style:none;padding:0;margin:0;'>" +
    '<li style="margin-bottom:16px;">' +
    '<span style="font-weight:600;font-size:1.05em;color:var(--link-color);">' +
    (springName(props)) +
    "</span>" +
    '<div style="font-size:0.9em;color:var(--text-muted);margin-top:4px;">';
  Object.entries(props).forEach(function ([key, val]) {
    if (key === "Spring Name" || excludeKeys.includes(key)) return;
    var display = val && val !== "null" ? val : "No data";
    var label = labelMap[key] || key;
    if (key === "SC" && display !== "No data") {
      display = stateNames[display] || display;
    }
    html += "<div><b>" + label + ":</b> " + display + "</div>";
  });
  html += "</div></li></ul>";
  resultsDiv.innerHTML = html;
});

// Hover effect
var hoveredId = null;
var hoverLocked = false;
map.on("mousemove", "hot-springs", function (e) {
  if (hoverLocked) return;
  map.getCanvas().style.cursor = "pointer";
  if (e.features.length > 0) {
    if (hoveredId !== null) {
      map.setFeatureState({ source: "hot-springs", id: hoveredId }, { hover: false });
    }
    hoveredId = e.features[0].id;
    map.setFeatureState({ source: "hot-springs", id: hoveredId }, { hover: true });
  }
});
map.on("mouseleave", "hot-springs", function () {
  map.getCanvas().style.cursor = "";
  hoverLocked = false;
  if (hoveredId !== null) {
    map.setFeatureState({ source: "hot-springs", id: hoveredId }, { hover: false });
    hoveredId = null;
  }
});

// === Filter helpers ===
function setMapFilter(filter) {
  currentFilter = filter;
  if (map.getLayer("hot-springs")) {
    map.setFilter("hot-springs", filter);
  }
}

// === Search ===
function doSearch() {
  var query = document.getElementById("search").value.trim().toLowerCase();
  var resultsDiv = document.getElementById("search-results");
  var resultsHtml = "";
  var matches = [];

  if (query) {
    matches = allFeatures.filter(function (f) {
      var name = (f.properties["Spring Name"] || "").toLowerCase();
      return name.includes(query);
    });
  }

  if (!query) {
    resultsHtml = "";
    resetMapView();
  } else if (matches.length === 0) {
    resultsHtml = "<div>No matches found.</div>";
    setMapFilter(["==", ["get", "Spring Name"], "__NO_MATCH__"]);
  } else {
    var matchNames = matches.map(function (f) {
      return f.properties["Spring Name"];
    });
    setMapFilter(["in", ["get", "Spring Name"], ["literal", matchNames]]);

    // Fit map to results
    var coords = matches.map(function (f) { return f.geometry.coordinates; });
    if (coords.length === 1) {
      map.flyTo({ center: coords[0], zoom: 11 });
    } else {
      var bounds = coords.reduce(
        function (b, c) { return b.extend(c); },
        new maplibregl.LngLatBounds(coords[0], coords[0])
      );
      map.fitBounds(bounds, { padding: 60 });
    }

    // Build sidebar results
    resultsHtml = "<ul style='list-style:none;padding:0;margin:0;'>";
    matches.forEach(function (feature) {
      var props = feature.properties;
      var coord = feature.geometry.coordinates;
      resultsHtml +=
        '<li style="margin-bottom:16px;">' +
        '<a href="#"' +
        ' style="font-weight:600;font-size:1.05em;color:var(--link-color);text-decoration:none;"' +
        ' onclick="focusSpring(' + coord[0] + "," + coord[1] + ');return false;">' +
        (springName(props)) +
        "</a>" +
        '<div style="font-size:0.9em;color:var(--text-muted);margin-top:4px;">';
      Object.entries(props).forEach(function ([key, val]) {
        if (key === "Spring Name" || excludeKeys.includes(key)) return;
        var display = val && val !== "null" ? val : "No data";
        var label = labelMap[key] || key;
        if (key === "SC" && display !== "No data") {
          display = stateNames[display] || display;
        }
        resultsHtml += "<div><b>" + label + ":</b> " + display + "</div>";
      });
      resultsHtml += "</div></li>";
    });
    resultsHtml += "</ul>";
  }

  resultsDiv.innerHTML = resultsHtml;

  if (window.innerWidth < 900 && query) {
    resultsDiv.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

window.focusSpring = function (lng, lat) {
  map.flyTo({ center: [lng, lat], zoom: 11 });
  map.once("moveend", function () {
    var feature = allFeatures.find(function (f) {
      var c = f.geometry.coordinates;
      return Math.abs(c[0] - lng) < 0.0001 && Math.abs(c[1] - lat) < 0.0001;
    });
    if (feature) {
      if (currentPopup) currentPopup.remove();
      currentPopup = new maplibregl.Popup()
        .setLngLat([lng, lat])
        .setHTML(buildPopupHTML(feature.properties))
        .addTo(map);
    }
  });
};

function resetMapView() {
  map.flyTo({ center: [-100, 39], zoom: 4 });
  setMapFilter(null);
}

// Search button click
document.getElementById("search-btn").addEventListener("click", doSearch);

// Enter key in search input
document.getElementById("search").addEventListener("keydown", function (e) {
  if (e.key === "Enter") doSearch();
});

// Show/hide clear button and clear on click
var searchInput = document.getElementById("search");
var clearBtn = document.getElementById("search-clear");

searchInput.addEventListener("input", function () {
  clearBtn.style.display = searchInput.value.length > 0 ? "block" : "none";
});

clearBtn.addEventListener("click", function () {
  searchInput.value = "";
  clearBtn.style.display = "none";
  doSearch();
  resetMapView();
  searchInput.focus();
});

// === Legend toggle ===
var legendEl = document.getElementById("legend");
var toggleEl = document.getElementById("legend-toggle");
toggleEl.addEventListener("click", function (e) {
  e.stopPropagation();
  legendEl.classList.toggle("collapsed");
});

// === Temperature filter ===
document.getElementById("temp-reset-btn").addEventListener("click", function () {
  document.querySelector('input[name="temp-unit"][value="TF"]').checked = true;
  sliderInstance.update({
    min: 32, max: 212, from: 32, to: 212,
    postfix: " \u00b0F", grid: true,
  });
  updateDisplay(sliderInstance.result);
  document.querySelectorAll('input[name="temp-code"]').forEach(function (cb) {
    cb.checked = true;
  });
  resetMapView();
});

var rangeDisplay = document.getElementById("temp-range-display");

var slider = $("#temp-slider").ionRangeSlider({
  type: "double",
  grid: true,
  min: 32, max: 212, from: 32, to: 212,
  postfix: " \u00b0F",
  onStart: updateDisplay,
  onChange: function (val) {
    updateDisplay(val);
    applyTempFilter(val);
  },
});
var sliderInstance = $("#temp-slider").data("ionRangeSlider");

function updateDisplay(data) {
  var unit = document.querySelector('input[name="temp-unit"]:checked').value;
  var symbol = unit === "TC" ? "\u00b0C" : "\u00b0F";
  rangeDisplay.textContent = data.from + "\u2013" + data.to + " " + symbol;
}

function applyTempFilter(data) {
  var unit = document.querySelector('input[name="temp-unit"]:checked').value;
  var min = data.from;
  var max = data.to;
  var codes = Array.from(
    document.querySelectorAll('input[name="temp-code"]:checked')
  ).map(function (cb) { return cb.value; });

  var filter = [
    "any",
    [
      "all",
      [">=", ["to-number", ["get", unit], -999], min],
      ["<=", ["to-number", ["get", unit], -999], max],
    ],
    ["in", ["get", unit], ["literal", codes]],
  ];

  setMapFilter(filter);
}

document.querySelectorAll('input[name="temp-unit"]').forEach(function (radio) {
  radio.addEventListener("change", function () {
    var isC = radio.value === "TC" && radio.checked;
    var curFrom = sliderInstance.result.from;
    var curTo = sliderInstance.result.to;

    var newFrom = isC
      ? Math.round(((curFrom - 32) * 5) / 9)
      : Math.round((curFrom * 9) / 5 + 32);
    var newTo = isC
      ? Math.round(((curTo - 32) * 5) / 9)
      : Math.round((curTo * 9) / 5 + 32);

    sliderInstance.update({
      min: isC ? 0 : 32,
      max: isC ? 100 : 212,
      from: newFrom,
      to: newTo,
      postfix: isC ? " \u00b0C" : " \u00b0F",
    });

    updateDisplay(sliderInstance.result);
    applyTempFilter(sliderInstance.result);
  });
});

document.querySelectorAll('input[name="temp-code"]').forEach(function (cb) {
  cb.addEventListener("change", function () {
    var val = sliderInstance.result;
    applyTempFilter({ from: parseFloat(val.from), to: parseFloat(val.to) });
  });
});
