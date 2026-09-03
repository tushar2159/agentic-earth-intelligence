import React, {useEffect, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import "./interactive.css";

const ENDPOINTS = {
  stac: "https://earth-search.aws.element84.com/v1/search",
  geocode: "https://geocoding-api.open-meteo.com/v1/search",
  weather: "https://api.open-meteo.com/v1/forecast",
  air: "https://air-quality-api.open-meteo.com/v1/air-quality",
  quakes: "https://earthquake.usgs.gov/fdsnws/event/1/query",
};
const DEFAULT_PLACE = {name: "Pune, India", latitude: 18.5204, longitude: 73.8567};
const EXAMPLES = ["Analyze urban expansion around Pune from 2020 to 2026", "What is the weather in Mumbai today?", "Show air quality in Delhi", "Map earthquakes near Japan this month"];

const point = (place, properties = {}) => ({type: "Feature", geometry: {type: "Point", coordinates: [place.longitude, place.latitude]}, properties});
const getJson = async (url, options) => { const response = await fetch(url, options); if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`); return response.json(); };
const domainOf = prompt => /earthquake|seismic|tremor/i.test(prompt) ? "earthquakes" : /air quality|pollution|pm2\.5|pm10|aqi/i.test(prompt) ? "air-quality" : /weather|temperature|rain|wind|forecast/i.test(prompt) ? "weather" : "earth-observation";

function placeName(prompt) {
  return prompt.match(/(?:\bin\b|\baround\b|\bnear\b|\bfor\b)\s+([\p{L} .'-]+?)(?=\s+(?:from|between|during|today|tomorrow|this|last|past|with)\b|[?.,]|$)/iu)?.[1]?.trim() || "Pune";
}

async function geocode(prompt) {
  const name = placeName(prompt);
  const data = await getJson(`${ENDPOINTS.geocode}?name=${encodeURIComponent(name)}&count=1&language=en&format=json`);
  const place = data.results?.[0];
  if (!place) throw new Error(`Location “${name}” was not found`);
  return {name: [place.name, place.admin1, place.country].filter(Boolean).join(", "), latitude: place.latitude, longitude: place.longitude};
}

async function weather(place) {
  const query = new URLSearchParams({latitude: place.latitude, longitude: place.longitude, current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m", daily: "precipitation_probability_max", timezone: "auto", forecast_days: "5"});
  const data = await getJson(`${ENDPOINTS.weather}?${query}`); const now = data.current;
  return {domain: "weather", title: `Live weather · ${place.name}`, summary: `${now.temperature_2m}°C, feels like ${now.apparent_temperature}°C, humidity ${now.relative_humidity_2m}%, wind ${now.wind_speed_10m} km/h.`, metrics: [["Temperature", `${now.temperature_2m}°C`], ["Humidity", `${now.relative_humidity_2m}%`], ["Precipitation", `${now.precipitation} mm`], ["5-day rain chance", `${Math.max(...data.daily.precipitation_probability_max)}%`]], features: [point(place, {title: place.name, detail: `${now.temperature_2m}°C · humidity ${now.relative_humidity_2m}% · wind ${now.wind_speed_10m} km/h`})], center: [place.longitude, place.latitude], zoom: 9, trace: ["Interpret weather question", "Geocode location", "Query Open-Meteo forecast", "Visualize current conditions"], provider: "Open-Meteo Weather API"};
}

async function airQuality(place) {
  const query = new URLSearchParams({latitude: place.latitude, longitude: place.longitude, current: "european_aqi,us_aqi,pm10,pm2_5,nitrogen_dioxide,ozone", timezone: "auto"});
  const data = await getJson(`${ENDPOINTS.air}?${query}`); const now = data.current;
  return {domain: "air-quality", title: `Air quality · ${place.name}`, summary: `European AQI ${now.european_aqi}; PM2.5 ${now.pm2_5} μg/m³ and PM10 ${now.pm10} μg/m³.`, metrics: [["European AQI", now.european_aqi], ["US AQI", now.us_aqi], ["PM2.5", `${now.pm2_5} μg/m³`], ["NO₂", `${now.nitrogen_dioxide} μg/m³`]], features: [point(place, {title: place.name, detail: `AQI ${now.european_aqi} · PM2.5 ${now.pm2_5} μg/m³`})], center: [place.longitude, place.latitude], zoom: 9, trace: ["Interpret air-quality question", "Geocode location", "Query Open-Meteo air quality", "Map observation"], provider: "Open-Meteo Air Quality API"};
}

async function earthquakes(place) {
  const end = new Date(); const start = new Date(end.getTime() - 30 * 86400000);
  const query = new URLSearchParams({format: "geojson", latitude: place.latitude, longitude: place.longitude, maxradiuskm: "750", minmagnitude: "2.5", starttime: start.toISOString(), endtime: end.toISOString(), orderby: "magnitude", limit: "200"});
  const data = await getJson(`${ENDPOINTS.quakes}?${query}`); const strongest = data.features?.[0]?.properties;
  const count = data.features?.length || 0;
  return {domain: "earthquakes", title: `Earthquakes near ${place.name}`, summary: `${count} magnitude 2.5+ events within 750 km over 30 days${strongest ? `; strongest: M${strongest.mag}, ${strongest.place}` : ""}.`, metrics: [["Events", count], ["Radius", "750 km"], ["Minimum", "M2.5"], ["Strongest", strongest ? `M${strongest.mag}` : "None"]], features: data.features || [], center: [place.longitude, place.latitude], zoom: 4, trace: ["Interpret seismic question", "Geocode search center", "Query USGS event service", "Scale events by magnitude"], provider: "USGS Earthquake Hazards Program"};
}

async function earthObservation(place) {
  const d = 0.16; const bbox = [place.longitude - d, place.latitude - d, place.longitude + d, place.latitude + d]; const end = new Date();
  const search = async datetime => getJson(ENDPOINTS.stac, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({bbox, datetime, collections: ["sentinel-2-l2a"], query: {"eo:cloud_cover": {lte: 15}}, sortby: [{field: "properties.datetime", direction: "desc"}], limit: 10})});
  const [beforeData, afterData] = await Promise.all([search("2020-01-01T00:00:00Z/2020-12-31T23:59:59Z"), search(`${end.getFullYear()}-01-01T00:00:00Z/${end.toISOString()}`)]);
  const before = beforeData.features?.find(item => item.assets?.visual?.href); const after = afterData.features?.find(item => item.assets?.visual?.href);
  const tile = scene => scene ? `https://titiler.xyz/cog/tiles/WebMercatorQuad/{z}/{x}/{y}?url=${encodeURIComponent(scene.assets.visual.href)}` : null;
  const features = [before, after].filter(Boolean).map(item => ({type: "Feature", geometry: item.geometry, properties: {title: item.id, detail: `${item.properties.datetime.slice(0, 10)} · cloud ${Number(item.properties["eo:cloud_cover"]).toFixed(1)}%`}}));
  return {domain: "urban-change", title: `Urban change explorer · ${place.name}`, summary: `Swipe between independently selected low-cloud Sentinel-2 observations from ${before?.properties.datetime.slice(0, 10) || "2020"} and ${after?.properties.datetime.slice(0, 10) || "current"}. This is visual evidence, not a fabricated change-area estimate.`, metrics: [["Baseline", before?.properties.datetime.slice(0, 10) || "Unavailable"], ["Current", after?.properties.datetime.slice(0, 10) || "Unavailable"], ["Baseline cloud", before ? `${Number(before.properties["eo:cloud_cover"]).toFixed(1)}%` : "—"], ["Current cloud", after ? `${Number(after.properties["eo:cloud_cover"]).toFixed(1)}%` : "—"]], features, beforeRasterUrl: tile(before), afterRasterUrl: tile(after), bbox, center: [place.longitude, place.latitude], zoom: 9, trace: ["Resolve urban AOI", "Search 2020 baseline", `Search ${end.getFullYear()} observation`, "Select low-cloud visual COGs", "Render synchronized XYZ comparison"], provider: "Element 84 Earth Search + TiTiler", comparison: true};
}

async function route(prompt) {
  const domain = domainOf(prompt); const place = await geocode(prompt).catch(() => DEFAULT_PLACE);
  return domain === "weather" ? weather(place) : domain === "air-quality" ? airQuality(place) : domain === "earthquakes" ? earthquakes(place) : earthObservation(place);
}

function App() {
  const beforeNode = useRef(null); const afterNode = useRef(null); const maps = useRef([]); const pending = useRef(null);
  const [prompt, setPrompt] = useState(EXAMPLES[0]); const [running, setRunning] = useState(false); const [result, setResult] = useState(null); const [error, setError] = useState(""); const [swipe, setSwipe] = useState(50);

  function draw(next) {
    pending.current = next; if (maps.current.some(item => !item.isStyleLoaded())) return;
    maps.current.forEach((item, index) => {
      for (const id of ["result-points", "result-lines", "analysis-raster"]) if (item.getLayer(id)) item.removeLayer(id);
      for (const id of ["results", "analysis-raster"]) if (item.getSource(id)) item.removeSource(id);
      const rasterUrl = index === 0 ? next.beforeRasterUrl : next.afterRasterUrl;
      if (rasterUrl) { item.addSource("analysis-raster", {type: "raster", tiles: [rasterUrl], tileSize: 256, attribution: "Sentinel-2 · Element 84 · TiTiler"}); item.addLayer({id: "analysis-raster", type: "raster", source: "analysis-raster", paint: {"raster-opacity": 0.9}}); }
      item.addSource("results", {type: "geojson", data: {type: "FeatureCollection", features: next.features}});
      item.addLayer({id: "result-lines", type: "line", source: "results", filter: ["==", ["geometry-type"], "Polygon"], paint: {"line-color": "#ffcc66", "line-width": 2}});
      item.addLayer({id: "result-points", type: "circle", source: "results", filter: ["==", ["geometry-type"], "Point"], paint: {"circle-color": ["case", ["has", "mag"], "#ff624d", "#62ead8"], "circle-radius": ["case", ["has", "mag"], ["interpolate", ["linear"], ["get", "mag"], 2.5, 5, 7, 22], 11], "circle-stroke-color": "white", "circle-stroke-width": 1.5, "circle-opacity": 0.9}});
    });
    const primary = maps.current[0]; next.bbox ? primary.fitBounds([[next.bbox[0], next.bbox[1]], [next.bbox[2], next.bbox[3]]], {padding: 45, duration: 900}) : primary.flyTo({center: next.center, zoom: next.zoom, duration: 900});
  }

  useEffect(() => {
    const style = () => ({version: 8, sources: {satellite: {type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "Tiles © Esri"}}, layers: [{id: "satellite", type: "raster", source: "satellite"}]});
    const beforeMap = new maplibregl.Map({container: beforeNode.current, center: [73.8567, 18.5204], zoom: 8, attributionControl: true, style: style()});
    const afterMap = new maplibregl.Map({container: afterNode.current, center: [73.8567, 18.5204], zoom: 8, attributionControl: false, style: style()});
    maps.current = [beforeMap, afterMap]; beforeMap.addControl(new maplibregl.NavigationControl(), "top-right");
    let syncing = false;
    const synchronize = (source, target) => { if (syncing) return; syncing = true; target.jumpTo({center: source.getCenter(), zoom: source.getZoom(), bearing: source.getBearing(), pitch: source.getPitch()}); syncing = false; };
    beforeMap.on("move", () => synchronize(beforeMap, afterMap)); afterMap.on("move", () => synchronize(afterMap, beforeMap));
    const popup = new maplibregl.Popup({closeButton: false, closeOnClick: false});
    maps.current.forEach(item => {
      item.on("load", () => pending.current && draw(pending.current));
      item.on("mousemove", "result-points", event => { const feature = event.features?.[0]; if (!feature) return; item.getCanvas().style.cursor = "pointer"; const p = feature.properties; popup.setLngLat(event.lngLat).setHTML(`<strong>${p.title || p.place || "Live observation"}</strong><br>${p.detail || (p.mag ? `Magnitude ${p.mag}` : "Interactive map evidence")}`).addTo(item); });
      item.on("mouseleave", "result-points", () => { item.getCanvas().style.cursor = ""; popup.remove(); });
      item.on("mousemove", "result-lines", event => { const feature = event.features?.[0]; if (!feature) return; item.getCanvas().style.cursor = "pointer"; popup.setLngLat(event.lngLat).setHTML(`<strong>${feature.properties.title || "Sentinel-2 scene"}</strong><br>${feature.properties.detail || "Scene footprint"}`).addTo(item); });
      item.on("mouseleave", "result-lines", () => { item.getCanvas().style.cursor = ""; popup.remove(); });
    });
    return () => { beforeMap.remove(); afterMap.remove(); };
  }, []);
  useEffect(() => { run(EXAMPLES[0]); }, []);
  async function run(value) { setRunning(true); setError(""); try { const next = await route(value); setResult(next); draw(next); } catch (caught) { setError(caught.message); } finally { setRunning(false); } }

  return <main><header><div className="mark">AE</div><div><strong>Agentic Earth Intelligence</strong><span>Live public-data intelligence</span></div><a href="https://github.com/tushar2159/agentic-earth-intelligence">GitHub ↗</a></header><section className="hero"><div className="copy"><p className="eyebrow">ASK ACROSS DOMAINS</p><h1>Ask Earth.<br/><span>See the answer.</span></h1><p>Route natural-language questions to live Earth observation, weather, air-quality and earthquake services, then visualize the evidence.</p><form onSubmit={event => {event.preventDefault(); run(prompt);}}><label htmlFor="prompt">Question</label><textarea id="prompt" value={prompt} onChange={event => setPrompt(event.target.value)}/><div className="examples">{EXAMPLES.map(item => <button type="button" key={item} onClick={() => {setPrompt(item); run(item);}}>{item.split(" ").slice(0, 3).join(" ")}…</button>)}</div><button className="analyze" disabled={running}>{running ? "Querying live providers…" : "Analyze live data"}</button></form>{error && <p className="error">{error}</p>}</div><div className="map-shell"><div className="comparison"><div ref={beforeNode} className="map compare-map"/><div ref={afterNode} className="map compare-map after-map" style={{clipPath: `inset(0 0 0 ${swipe}%)`}}/></div>{result?.comparison && <><div className="map-dates"><span>2020 BASELINE</span><span>CURRENT</span></div><input className="compare-range" type="range" min="0" max="100" value={swipe} onChange={event => setSwipe(Number(event.target.value))} aria-label="Compare baseline and current imagery"/><div className="compare-line" style={{left: `${swipe}%`}}><i>↔</i></div></>}<div className="legend"><strong>MAP EVIDENCE</strong>{result?.comparison && <><span><i className="swatch raster"/>Sentinel-2 COG</span><span><i className="swatch scene"/>Scene footprint</span></>}{result?.domain === "earthquakes" ? <span><i className="swatch quake"/>Earthquake magnitude</span> : !result?.comparison && <span><i className="swatch point"/>Live observation</span>}<small>Hover features for details{result?.comparison ? " · drag the center slider" : ""}</small></div><span className="map-label">XYZ SATELLITE · INTERACTIVE LIVE LAYERS</span></div></section><section className="results"><article><span>EXECUTION TRACE</span><h2>{result?.title || (running ? "Running analysis" : "Ready")}</h2><div className="timeline">{(result?.trace || ["Interpret question", "Select provider", "Fetch live data", "Visualize evidence"]).map((item, index) => <div key={item}><b>{String(index + 1).padStart(2, "0")}</b><p>{item}</p></div>)}</div></article><article><span>LIVE ANSWER</span><h2>{result?.domain?.replace("-", " ") || "Awaiting data"}</h2><p>{result?.summary || "The urban-change comparison starts automatically."}</p>{result?.metrics && <div className="metrics">{result.metrics.map(([label, value]) => <div key={label}><b>{value}</b><span>{label}</span></div>)}</div>}<small>{result ? `SOURCE · ${result.provider}` : "PUBLIC, NO-KEY PROVIDERS"}</small></article></section></main>;
}

createRoot(document.getElementById("root")).render(<App/>);
