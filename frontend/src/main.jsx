import React, {useEffect, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

const ENDPOINTS = {
  stac: "https://earth-search.aws.element84.com/v1/search",
  geocode: "https://geocoding-api.open-meteo.com/v1/search",
  weather: "https://api.open-meteo.com/v1/forecast",
  air: "https://air-quality-api.open-meteo.com/v1/air-quality",
  quakes: "https://earthquake.usgs.gov/fdsnws/event/1/query",
};
const DEFAULT_PLACE = {name: "Pune, India", latitude: 18.5204, longitude: 73.8567};
const EXAMPLES = ["Show recent satellite imagery around Pune", "What is the weather in Mumbai today?", "Show air quality in Delhi", "Map earthquakes near Japan this month"];

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
  return {domain: "weather", title: `Live weather · ${place.name}`, summary: `${now.temperature_2m}°C, feels like ${now.apparent_temperature}°C, humidity ${now.relative_humidity_2m}%, wind ${now.wind_speed_10m} km/h.`, metrics: [["Temperature", `${now.temperature_2m}°C`], ["Humidity", `${now.relative_humidity_2m}%`], ["Precipitation", `${now.precipitation} mm`], ["5-day rain chance", `${Math.max(...data.daily.precipitation_probability_max)}%`]], features: [point(place)], center: [place.longitude, place.latitude], zoom: 9, trace: ["Interpret weather question", "Geocode location", "Query Open-Meteo forecast", "Visualize current conditions"], provider: "Open-Meteo Weather API"};
}

async function airQuality(place) {
  const query = new URLSearchParams({latitude: place.latitude, longitude: place.longitude, current: "european_aqi,us_aqi,pm10,pm2_5,nitrogen_dioxide,ozone", timezone: "auto"});
  const data = await getJson(`${ENDPOINTS.air}?${query}`); const now = data.current;
  return {domain: "air-quality", title: `Air quality · ${place.name}`, summary: `European AQI ${now.european_aqi}; PM2.5 ${now.pm2_5} μg/m³ and PM10 ${now.pm10} μg/m³.`, metrics: [["European AQI", now.european_aqi], ["US AQI", now.us_aqi], ["PM2.5", `${now.pm2_5} μg/m³`], ["NO₂", `${now.nitrogen_dioxide} μg/m³`]], features: [point(place)], center: [place.longitude, place.latitude], zoom: 9, trace: ["Interpret air-quality question", "Geocode location", "Query Open-Meteo air quality", "Map observation"], provider: "Open-Meteo Air Quality API"};
}

async function earthquakes(place) {
  const end = new Date(); const start = new Date(end.getTime() - 30 * 86400000);
  const query = new URLSearchParams({format: "geojson", latitude: place.latitude, longitude: place.longitude, maxradiuskm: "750", minmagnitude: "2.5", starttime: start.toISOString(), endtime: end.toISOString(), orderby: "magnitude", limit: "200"});
  const data = await getJson(`${ENDPOINTS.quakes}?${query}`); const strongest = data.features?.[0]?.properties;
  const count = data.features?.length || 0;
  return {domain: "earthquakes", title: `Earthquakes near ${place.name}`, summary: `${count} magnitude 2.5+ events within 750 km over 30 days${strongest ? `; strongest: M${strongest.mag}, ${strongest.place}` : ""}.`, metrics: [["Events", count], ["Radius", "750 km"], ["Minimum", "M2.5"], ["Strongest", strongest ? `M${strongest.mag}` : "None"]], features: data.features || [], center: [place.longitude, place.latitude], zoom: 4, trace: ["Interpret seismic question", "Geocode search center", "Query USGS event service", "Scale events by magnitude"], provider: "USGS Earthquake Hazards Program"};
}

async function earthObservation(place) {
  const d = 0.16; const bbox = [place.longitude - d, place.latitude - d, place.longitude + d, place.latitude + d]; const end = new Date(); const start = new Date(end); start.setFullYear(end.getFullYear() - 1);
  const data = await getJson(ENDPOINTS.stac, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({bbox, datetime: `${start.toISOString()}/${end.toISOString()}`, collections: ["sentinel-2-l2a"], query: {"eo:cloud_cover": {lte: 15}}, sortby: [{field: "properties.datetime", direction: "desc"}], limit: 20})});
  const scenes = data.features || []; const scene = scenes.find(item => item.assets?.visual?.href); const rasterUrl = scene ? `https://titiler.xyz/cog/tiles/WebMercatorQuad/{z}/{x}/{y}?url=${encodeURIComponent(scene.assets.visual.href)}` : null;
  return {domain: "earth-observation", title: `Sentinel-2 · ${place.name}`, summary: `${scenes.length} low-cloud scenes found. ${scene ? `Displaying ${scene.id} from ${scene.properties.datetime.slice(0, 10)}.` : "No visual COG was available."}`, metrics: [["Scenes", scenes.length], ["Cloud filter", "≤15%"], ["Collection", "Sentinel-2 L2A"], ["Rendered", scene?.properties?.datetime?.slice(0, 10) || "None"]], features: scenes.map(item => ({type: "Feature", geometry: item.geometry, properties: {id: item.id}})), rasterUrl, bbox, center: [place.longitude, place.latitude], zoom: 9, trace: ["Interpret EO question", "Geocode AOI", "Search Element 84 STAC", "Select visual COG", "Render through TiTiler XYZ"], provider: "Element 84 Earth Search + TiTiler"};
}

async function route(prompt) {
  const domain = domainOf(prompt); const place = await geocode(prompt).catch(() => DEFAULT_PLACE);
  return domain === "weather" ? weather(place) : domain === "air-quality" ? airQuality(place) : domain === "earthquakes" ? earthquakes(place) : earthObservation(place);
}

function App() {
  const mapNode = useRef(null); const map = useRef(null); const pending = useRef(null);
  const [prompt, setPrompt] = useState(EXAMPLES[0]); const [running, setRunning] = useState(false); const [result, setResult] = useState(null); const [error, setError] = useState("");

  function draw(next) {
    pending.current = next; if (!map.current?.isStyleLoaded()) return;
    for (const id of ["result-points", "result-lines", "analysis-raster"]) if (map.current.getLayer(id)) map.current.removeLayer(id);
    for (const id of ["results", "analysis-raster"]) if (map.current.getSource(id)) map.current.removeSource(id);
    if (next.rasterUrl) { map.current.addSource("analysis-raster", {type: "raster", tiles: [next.rasterUrl], tileSize: 256, attribution: "Sentinel-2 · Element 84 · TiTiler"}); map.current.addLayer({id: "analysis-raster", type: "raster", source: "analysis-raster", paint: {"raster-opacity": 0.88}}); }
    map.current.addSource("results", {type: "geojson", data: {type: "FeatureCollection", features: next.features}});
    map.current.addLayer({id: "result-lines", type: "line", source: "results", filter: ["==", ["geometry-type"], "Polygon"], paint: {"line-color": "#ffcc66", "line-width": 2}});
    map.current.addLayer({id: "result-points", type: "circle", source: "results", filter: ["==", ["geometry-type"], "Point"], paint: {"circle-color": ["case", ["has", "mag"], "#ff624d", "#62ead8"], "circle-radius": ["case", ["has", "mag"], ["interpolate", ["linear"], ["get", "mag"], 2.5, 5, 7, 22], 11], "circle-stroke-color": "white", "circle-stroke-width": 1.5, "circle-opacity": 0.85}});
    next.bbox ? map.current.fitBounds([[next.bbox[0], next.bbox[1]], [next.bbox[2], next.bbox[3]]], {padding: 45, duration: 900}) : map.current.flyTo({center: next.center, zoom: next.zoom, duration: 900});
  }

  useEffect(() => { map.current = new maplibregl.Map({container: mapNode.current, center: [73.8567, 18.5204], zoom: 8, attributionControl: true, style: {version: 8, sources: {satellite: {type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "Tiles © Esri"}}, layers: [{id: "satellite", type: "raster", source: "satellite"}]}}); map.current.addControl(new maplibregl.NavigationControl(), "top-right"); map.current.on("load", () => pending.current && draw(pending.current)); return () => map.current?.remove(); }, []);
  useEffect(() => { run(EXAMPLES[0]); }, []);
  async function run(value) { setRunning(true); setError(""); try { const next = await route(value); setResult(next); draw(next); } catch (caught) { setError(caught.message); } finally { setRunning(false); } }

  return <main><header><div className="mark">AE</div><div><strong>Agentic Earth Intelligence</strong><span>Live public-data intelligence</span></div><a href="https://github.com/tushar2159/agentic-earth-intelligence">GitHub ↗</a></header><section className="hero"><div className="copy"><p className="eyebrow">ASK ACROSS DOMAINS</p><h1>Ask Earth.<br/><span>See the answer.</span></h1><p>Route natural-language questions to live Earth observation, weather, air-quality and earthquake services, then visualize the evidence.</p><form onSubmit={event => {event.preventDefault(); run(prompt);}}><label htmlFor="prompt">Question</label><textarea id="prompt" value={prompt} onChange={event => setPrompt(event.target.value)}/><div className="examples">{EXAMPLES.map(item => <button type="button" key={item} onClick={() => {setPrompt(item); run(item);}}>{item.split(" ").slice(0, 3).join(" ")}…</button>)}</div><button className="analyze" disabled={running}>{running ? "Querying live providers…" : "Analyze live data"}</button></form>{error && <p className="error">{error}</p>}</div><div className="map-shell"><div ref={mapNode} className="map"/><span className="map-label">XYZ SATELLITE · LIVE DATA LAYERS</span></div></section><section className="results"><article><span>EXECUTION TRACE</span><h2>{result?.title || (running ? "Running analysis" : "Ready")}</h2><div className="timeline">{(result?.trace || ["Interpret question", "Select provider", "Fetch live data", "Visualize evidence"]).map((item, index) => <div key={item}><b>{String(index + 1).padStart(2, "0")}</b><p>{item}</p></div>)}</div></article><article><span>LIVE ANSWER</span><h2>{result?.domain?.replace("-", " ") || "Awaiting data"}</h2><p>{result?.summary || "The satellite analysis starts automatically."}</p>{result?.metrics && <div className="metrics">{result.metrics.map(([label, value]) => <div key={label}><b>{value}</b><span>{label}</span></div>)}</div>}<small>{result ? `SOURCE · ${result.provider}` : "PUBLIC, NO-KEY PROVIDERS"}</small></article></section></main>;
}

createRoot(document.getElementById("root")).render(<App/>);
