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
const excludeKeys = ["P.P. 492", "Circ. 790", "NOAA  "];

function buildPopupHTML(props) {
  let html = "<strong>" + (props["Spring Name"] || "Hot Spring") + "</strong>";
  Object.entries(props).forEach(function ([key, raw]) {
    if (key === "Spring Name" || excludeKeys.includes(key)) return;
    var val = raw && raw !== "null" ? raw : "Information not available";
    var label = labelMap[key] || key;
    html += "<br><b>" + label + ":</b> " + val;
  });
  return html;
}

// Grey overlay: world polygon with US cut out
var nonUsOverlay = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        // Outer ring (world)
        [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]],
        // Hole: Continental US (clockwise)
        [
          [-67, 47.5], [-67.8, 44.5], [-70, 43.5], [-70, 41.5],
          [-72, 41], [-74, 40.5], [-75.5, 39.5], [-75.5, 37.5],
          [-76, 35], [-79, 33], [-81, 31], [-80.2, 25.8],
          [-81.8, 24.5], [-82.5, 27.5], [-84, 29.5], [-85, 29.5],
          [-88, 30.2], [-89.5, 29], [-93, 29.5], [-97, 26],
          [-100, 28], [-104, 32], [-109, 31.5], [-111, 31.5],
          [-114.5, 32.5], [-117.5, 32.5], [-118.5, 34], [-120.5, 34.5],
          [-121, 36.5], [-122.5, 37.8], [-124, 40], [-124.5, 42],
          [-124.5, 46], [-124.7, 48.5], [-123, 49],
          [-117, 49], [-104, 49], [-97, 49], [-95.2, 49],
          [-95, 49.4], [-89, 48], [-84.5, 46.5], [-82.5, 45],
          [-82.5, 42.5], [-79, 42.5], [-79, 43.5], [-76.5, 44],
          [-75, 45], [-73, 45], [-71, 45], [-67, 47.5]
        ],
        // Hole: Alaska (clockwise)
        [
          [-179.5, 51], [-179.5, 72], [-158, 72], [-141, 70],
          [-130, 60], [-130, 55], [-135, 54], [-140, 53],
          [-150, 52.5], [-165, 51], [-179.5, 51]
        ],
        // Hole: Hawaii (clockwise)
        [
          [-162, 18], [-154, 18], [-154, 23], [-162, 23], [-162, 18]
        ]
      ]
    }
  }]
};

// Add overlay + hot springs layers
function addMapLayers() {
  if (!map.getSource("non-us-overlay")) {
    map.addSource("non-us-overlay", { type: "geojson", data: nonUsOverlay });
    map.addLayer({
      id: "non-us-overlay",
      type: "fill",
      source: "non-us-overlay",
      paint: {
        "fill-color": "#888",
        "fill-opacity": 0.4,
      },
    });
  }

  if (!geojsonData) return;
  if (map.getSource("hot-springs")) return;

  map.addSource("hot-springs", { type: "geojson", data: geojsonData });
  map.addLayer({
    id: "hot-springs",
    type: "circle",
    source: "hot-springs",
    paint: {
      "circle-radius": 5,
      "circle-color": "#e03426",
      "circle-stroke-color": "#56130e",
      "circle-stroke-width": 1,
      "circle-opacity": 0.95,
    },
  });

  if (currentFilter) {
    map.setFilter("hot-springs", currentFilter);
  }
}

// Initial load
map.on("load", function () {
  // Add grey overlay immediately
  addMapLayers();
  // Then fetch hot springs data
  fetch("hot_springs.geojson")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      geojsonData = data;
      allFeatures = data.features;
      addMapLayers();
    });
});

// Re-add layers after style switch (Street <-> Satellite)
map.on("styledata", function () {
  if (!map.getSource("non-us-overlay") || (geojsonData && !map.getSource("hot-springs"))) {
    try { addMapLayers(); } catch (e) { /* style not fully ready yet */ }
  }
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
});

// Cursor pointer on hover
map.on("mouseenter", "hot-springs", function () {
  map.getCanvas().style.cursor = "pointer";
});
map.on("mouseleave", "hot-springs", function () {
  map.getCanvas().style.cursor = "";
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
    matches.slice(0, 5).forEach(function (feature) {
      var props = feature.properties;
      var coord = feature.geometry.coordinates;
      resultsHtml +=
        '<li style="margin-bottom:16px;">' +
        '<a href="#"' +
        ' style="font-weight:600;font-size:1.05em;color:var(--link-color);text-decoration:none;"' +
        ' onclick="focusSpring(' + coord[0] + "," + coord[1] + ');return false;">' +
        (props["Spring Name"] || "Hot Spring") +
        "</a>" +
        '<div style="font-size:0.9em;color:var(--text-muted);margin-top:4px;">';
      Object.entries(props).forEach(function ([key, val]) {
        if (key === "Spring Name") return;
        var display = val && val !== "null" ? val : "No data";
        resultsHtml += "<div><b>" + key + ":</b> " + display + "</div>";
      });
      resultsHtml += "</div></li>";
    });
    resultsHtml += "</ul>";
    if (matches.length > 5) {
      resultsHtml +=
        '<div style="font-size:0.85em;color:var(--text-faint);margin-top:8px;">' +
        "+ " + (matches.length - 5) + " more results</div>";
    }
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
