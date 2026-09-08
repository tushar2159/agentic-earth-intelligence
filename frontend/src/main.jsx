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
const EXAMPLES = ["Analyze urban expansion around Pune from 2020 to 2026", "Compare deforestation around Manaus from 2020 to 2026", "What is the weather in Mumbai today?", "Show air quality in Delhi", "Map earthquakes near Japan this month"];
const CACHE_KEY = "aei-query-cache-v2";
const CACHE_TTL = 15 * 60 * 1000;

const point = (place, properties = {}) => ({type: "Feature", geometry: {type: "Point", coordinates: [place.longitude, place.latitude]}, properties});
const getJson = async (url, options) => { const response = await fetch(url, options); if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`); return response.json(); };
const domainOf = prompt => /earthquake|seismic|tremor/i.test(prompt) ? "earthquakes" : /air quality|pollution|pm2\.5|pm10|aqi/i.test(prompt) ? "air-quality" : /weather|temperature|rain|wind|forecast/i.test(prompt) ? "weather" : "earth-observation";

function yearsFromPrompt(prompt) {
  const current = new Date().getFullYear();
  const years = [...prompt.matchAll(/\b(?:19|20)\d{2}\b/g)].map(match => Number(match[0])).filter(year => year >= 2015 && year <= current);
  if (years.length >= 2) return [Math.min(...years), Math.max(...years)];
  if (years.length === 1) return [years[0], current];
  return [2020, current];
}

function placeName(prompt) {
  return prompt.match(/(?:\bin\b|\baround\b|\bnear\b|\bfor\b)\s+([\p{L} .'-]+?)(?=\s+(?:from|between|during|today|tomorrow|this|last|past|with|(?:19|20)\d{2})\b|[?.,]|$)/iu)?.[1]?.trim() || "Pune";
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
  return {domain: "weather", title: `Live weather · ${place.name}`, summary: `${now.temperature_2m}°C, feels like ${now.apparent_temperature}°C, humidity ${now.relative_humidity_2m}%, wind ${now.wind_speed_10m} km/h.`, metrics: [["Temperature", `${now.temperature_2m}°C`], ["Humidity", `${now.relative_humidity_2m}%`], ["Precipitation", `${now.precipitation} mm`], ["5-day rain chance", `${Math.max(...data.daily.precipitation_probability_max)}%`]], features: [point(place, {title: place.name, detail: `${now.temperature_2m}°C · humidity ${now.relative_humidity_2m}% · wind ${now.wind_speed_10m} km/h`})], center: [place.longitude, place.latitude], zoom: 9, trace: ["Interpret weather question", "Resolve geographic context", "Retrieve live forecast", "Visualize current conditions"]};
}

async function airQuality(place) {
  const query = new URLSearchParams({latitude: place.latitude, longitude: place.longitude, current: "european_aqi,us_aqi,pm10,pm2_5,nitrogen_dioxide,ozone", timezone: "auto"});
  const data = await getJson(`${ENDPOINTS.air}?${query}`); const now = data.current;
  return {domain: "air-quality", title: `Air quality · ${place.name}`, summary: `European AQI ${now.european_aqi}; PM2.5 ${now.pm2_5} μg/m³ and PM10 ${now.pm10} μg/m³.`, metrics: [["European AQI", now.european_aqi], ["US AQI", now.us_aqi], ["PM2.5", `${now.pm2_5} μg/m³`], ["NO₂", `${now.nitrogen_dioxide} μg/m³`]], features: [point(place, {title: place.name, detail: `AQI ${now.european_aqi} · PM2.5 ${now.pm2_5} μg/m³`})], center: [place.longitude, place.latitude], zoom: 9, trace: ["Interpret air-quality question", "Resolve geographic context", "Retrieve atmospheric conditions", "Map observation"]};
}

async function earthquakes(place) {
  const end = new Date(); const start = new Date(end.getTime() - 30 * 86400000);
  const query = new URLSearchParams({format: "geojson", latitude: place.latitude, longitude: place.longitude, maxradiuskm: "750", minmagnitude: "2.5", starttime: start.toISOString(), endtime: end.toISOString(), orderby: "magnitude", limit: "200"});
  const data = await getJson(`${ENDPOINTS.quakes}?${query}`); const strongest = data.features?.[0]?.properties;
  const count = data.features?.length || 0;
  return {domain: "earthquakes", title: `Earthquakes near ${place.name}`, summary: `${count} magnitude 2.5+ events within 750 km over 30 days${strongest ? `; strongest: M${strongest.mag}, ${strongest.place}` : ""}.`, metrics: [["Events", count], ["Radius", "750 km"], ["Minimum", "M2.5"], ["Strongest", strongest ? `M${strongest.mag}` : "None"]], features: data.features || [], center: [place.longitude, place.latitude], zoom: 4, trace: ["Interpret seismic question", "Resolve geographic context", "Retrieve recent event stream", "Scale events by magnitude"]};
}

async function earthObservation(place) {
  const d = 0.16; const bbox = [place.longitude - d, place.latitude - d, place.longitude + d, place.latitude + d]; const now = new Date(); const [baselineYear, currentYear] = yearsFromPrompt(place.activePrompt);
  const search = async datetime => getJson(ENDPOINTS.stac, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({bbox, datetime, collections: ["sentinel-2-l2a"], query: {"eo:cloud_cover": {lte: 15}}, sortby: [{field: "properties.datetime", direction: "desc"}], limit: 10})});
  const interval = year => `${year}-01-01T00:00:00Z/${year === now.getFullYear() ? now.toISOString() : `${year}-12-31T23:59:59Z`}`;
  const [beforeData, afterData] = await Promise.all([search(interval(baselineYear)), search(interval(currentYear))]);
  const before = beforeData.features?.find(item => item.assets?.visual?.href); const after = afterData.features?.find(item => item.assets?.visual?.href);
  const tile = scene => scene ? `https://titiler.xyz/cog/tiles/WebMercatorQuad/{z}/{x}/{y}?url=${encodeURIComponent(scene.assets.visual.href)}` : null;
  const mode = /deforestation|forest|vegetation/i.test(place.activePrompt) ? {name: "Vegetation loss", index: "NDVI", bands: ["nir", "red"]} : /flood|water|shoreline/i.test(place.activePrompt) ? {name: "Surface water", index: "NDWI", bands: ["green", "nir"]} : {name: "Urban expansion", index: "NDBI", bands: ["swir16", "nir"]};
  const mean = async href => (await getJson(`https://titiler.xyz/cog/statistics?url=${encodeURIComponent(href)}`)).b1.mean;
  const indexValue = async scene => { if (!scene) return null; try { const [a, b] = await Promise.all(mode.bands.map(band => mean(scene.assets[band].href))); return (a - b) / (a + b); } catch { return null; } };
  const [beforeIndex, afterIndex] = await Promise.all([indexValue(before), indexValue(after)]); const shift = beforeIndex == null || afterIndex == null ? null : (afterIndex - beforeIndex) * 100;
  const features = [before, after].filter(Boolean).map(item => ({type: "Feature", geometry: item.geometry, properties: {title: item.id, detail: `${item.properties.datetime.slice(0, 10)} · cloud ${Number(item.properties["eo:cloud_cover"]).toFixed(1)}%`}}));
  return {domain: "change-intelligence", title: `${mode.name} explorer · ${place.name}`, summary: `Swipe between low-cloud observations from ${before?.properties.datetime.slice(0, 10) || baselineYear} and ${after?.properties.datetime.slice(0, 10) || currentYear}. The ${mode.index} scene-mean shifted ${shift == null ? "unavailable" : `${shift >= 0 ? "+" : ""}${shift.toFixed(2)}%`}; this is a spectral proxy, not classified change area.`, metrics: [[`${mode.index} shift`, shift == null ? "—" : `${shift >= 0 ? "+" : ""}${shift.toFixed(2)}%`], ["Baseline", before?.properties.datetime.slice(0, 10) || "Unavailable"], ["Comparison", after?.properties.datetime.slice(0, 10) || "Unavailable"], ["Cloud pair", before && after ? `${Number(before.properties["eo:cloud_cover"]).toFixed(1)}% / ${Number(after.properties["eo:cloud_cover"]).toFixed(1)}%` : "—"]], features, beforeRasterUrl: tile(before), afterRasterUrl: tile(after), beforePreview: before?.assets?.thumbnail?.href, afterPreview: after?.assets?.thumbnail?.href, beforeRectangle: before?.bbox, afterRectangle: after?.bbox, bbox, center: [place.longitude, place.latitude], zoom: 9, trace: ["Resolve change type, AOI and years", `Search ${baselineYear} baseline`, `Search ${currentYear} comparison`, `Compute scene-mean ${mode.index} proxy`, "Render synchronized comparison"], comparison: true, mode, baselineLabel: String(baselineYear), comparisonLabel: String(currentYear)};
}

async function route(prompt) {
  const normalized = prompt.trim().toLowerCase();
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
    const hit = cache.find(entry => entry.query === normalized && Date.now() - entry.createdAt < CACHE_TTL);
    if (hit) return {...hit.result, cached: true};
  } catch { localStorage.removeItem(CACHE_KEY); }
  const domain = domainOf(prompt); const place = await geocode(prompt).catch(() => ({...DEFAULT_PLACE})); place.activePrompt = prompt;
  const result = await (domain === "weather" ? weather(place) : domain === "air-quality" ? airQuality(place) : domain === "earthquakes" ? earthquakes(place) : earthObservation(place));
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]").filter(entry => Date.now() - entry.createdAt < CACHE_TTL && entry.query !== normalized).slice(0, 11);
    localStorage.setItem(CACHE_KEY, JSON.stringify([{query: normalized, createdAt: Date.now(), result}, ...cache]));
  } catch { /* Private browsing or storage quota: continue without persistence. */ }
  return result;
}

function App() {
  const beforeNode = useRef(null); const afterNode = useRef(null); const globeNode = useRef(null); const maps = useRef([]); const globe = useRef(null); const globeBaseLayer = useRef(null); const globeLayers = useRef([]); const globeDrawVersion = useRef(0); const pending = useRef(null); const orbitEnabled = useRef(true); const globeBlendRef = useRef(100); const layerState = useRef({basemap: true, imagery: true, footprints: true, observations: true});
  const [prompt, setPrompt] = useState(EXAMPLES[0]); const [running, setRunning] = useState(false); const [result, setResult] = useState(null); const [error, setError] = useState(""); const [swipe, setSwipe] = useState(50); const [globeBlend, setGlobeBlend] = useState(100); const [layers, setLayers] = useState(layerState.current); const [hoverInfo, setHoverInfo] = useState(null); const [viewMode, setViewMode] = useState(window.location.hash === "#3d" ? "3d" : "2d"); const [orbiting, setOrbiting] = useState(true);

  function setOrbit(enabled) { orbitEnabled.current = enabled; setOrbiting(enabled); }
  function updateGlobeBlend(value) { const blend=Number(value); globeBlendRef.current=blend; setGlobeBlend(blend); if(globeLayers.current[0]){globeLayers.current[0].alpha=1-blend/100;globeLayers.current[0].show=layerState.current.imagery;}if(globeLayers.current[1]){globeLayers.current[1].alpha=blend/100;globeLayers.current[1].show=layerState.current.imagery;}globe.current?.scene.requestRender(); }

  function focusGlobe(regional=true) {
    const Cesium=window.Cesium; const viewer=globe.current; const next=pending.current;if(!Cesium||!viewer||!next)return;
    setOrbit(false);
    if(regional&&next.bbox)viewer.camera.flyTo({destination:Cesium.Rectangle.fromDegrees(...next.bbox),duration:1.35});
    else viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(next.center[0],next.center[1],12500000),duration:1.6,orientation:{heading:0,pitch:Cesium.Math.toRadians(-90),roll:0}});
  }

  async function drawGlobe(next) {
    const Cesium = window.Cesium; const viewer = globe.current; if (!Cesium || !viewer) return;
    const version=++globeDrawVersion.current; viewer.entities.removeAll(); globeLayers.current.forEach(layer=>viewer.imageryLayers.remove(layer,true)); globeLayers.current=[];
    const previews=[[next.beforePreview,next.beforeRectangle],[next.afterPreview,next.afterRectangle]];
    const providers=await Promise.all(previews.map(async([url,rectangle])=>{if(!url||!rectangle)return null;try{return await Cesium.SingleTileImageryProvider.fromUrl(url,{rectangle:Cesium.Rectangle.fromDegrees(...rectangle)});}catch{return null;}}));
    if(version!==globeDrawVersion.current||viewer.isDestroyed())return;globeLayers.current=providers.map(provider=>provider?viewer.imageryLayers.addImageryProvider(provider):null);updateGlobeBlend(globeBlendRef.current);
    next.features.forEach((feature, index) => {
      if (feature.geometry?.type === "Point") viewer.entities.add({id:`result-${index}`,properties:{layerGroup:"observations"},name:feature.properties?.title||feature.properties?.place||"Live result",description:feature.properties?.detail||"Mapped analytical result",position:Cesium.Cartesian3.fromDegrees(feature.geometry.coordinates[0],feature.geometry.coordinates[1],120),point:{pixelSize:13,color:Cesium.Color.fromCssColorString(feature.properties?.mag ? "#ff624d" : "#62ead8"),outlineColor:Cesium.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY},label:{text:feature.properties?.title || feature.properties?.place || "LIVE RESULT",font:"700 11px sans-serif",showBackground:true,backgroundColor:Cesium.Color.fromCssColorString("#03101b").withAlpha(.85),pixelOffset:new Cesium.Cartesian2(0,-28),disableDepthTestDistance:Number.POSITIVE_INFINITY}});
      if (["Polygon","MultiPolygon"].includes(feature.geometry?.type)) { const ring = feature.geometry.type === "Polygon" ? feature.geometry.coordinates[0] : feature.geometry.coordinates[0][0]; viewer.entities.add({id:`result-${index}`,properties:{layerGroup:"footprints"},name:feature.properties?.title||"Scene footprint",description:feature.properties?.detail||"Observation coverage",polygon:{hierarchy:Cesium.Cartesian3.fromDegreesArray(ring.flat()),material:Cesium.Color.fromCssColorString("#62ead8").withAlpha(.08),outline:true,outlineColor:Cesium.Color.fromCssColorString("#ffcc66")}}); }
    });
    viewer.entities.add({id:"analysis-aoi",name:next.title,description:next.summary,position:Cesium.Cartesian3.fromDegrees(next.center[0],next.center[1],1000),point:{pixelSize:16,color:Cesium.Color.fromCssColorString("#62ead8"),outlineColor:Cesium.Color.WHITE,outlineWidth:3,disableDepthTestDistance:Number.POSITIVE_INFINITY},label:{text:next.title.toUpperCase(),font:"700 12px sans-serif",showBackground:true,backgroundColor:Cesium.Color.fromCssColorString("#03101b").withAlpha(.88),pixelOffset:new Cesium.Cartesian2(0,-32),disableDepthTestDistance:Number.POSITIVE_INFINITY}});
    applyVisibility();
    if(next.bbox)viewer.camera.flyTo({destination:Cesium.Rectangle.fromDegrees(...next.bbox),duration:2.2,complete:()=>setOrbit(false)});
    else viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(next.center[0],next.center[1],900000),duration:2.2,orientation:{heading:0,pitch:Cesium.Math.toRadians(-90),roll:0},complete:()=>setOrbit(false)});
  }

  function applyVisibility() {
    const ids = {basemap: "satellite", imagery: "analysis-raster", footprints: "result-lines", observations: "result-points"};
    maps.current.forEach(item => Object.entries(ids).forEach(([key, id]) => { if (item.getLayer(id)) item.setLayoutProperty(id, "visibility", layerState.current[key] ? "visible" : "none"); }));
    if(globeBaseLayer.current)globeBaseLayer.current.show=layerState.current.basemap;
    globeLayers.current.forEach(layer=>{if(layer)layer.show=layerState.current.imagery;});
    globe.current?.entities.values.forEach(entity=>{const group=entity.properties?.layerGroup?.getValue?.();if(group)entity.show=layerState.current[group];});
    globe.current?.scene.requestRender();
  }

  function toggleLayer(key) {
    layerState.current = {...layerState.current, [key]: !layerState.current[key]}; setLayers(layerState.current); applyVisibility();
  }

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
    applyVisibility();
    drawGlobe(next);
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
    maps.current.forEach(item => {
      item.on("load", () => pending.current && draw(pending.current));
      item.on("mousemove", "result-points", event => { const feature = event.features?.[0]; if (!feature) return; item.getCanvas().style.cursor = "pointer"; const p = feature.properties; setHoverInfo({title: p.title || p.place || "Live observation", detail: p.detail || (p.mag ? `Magnitude ${p.mag}` : "Interactive map evidence")}); });
      item.on("mouseleave", "result-points", () => { item.getCanvas().style.cursor = ""; setHoverInfo(null); });
      item.on("mousemove", "result-lines", event => { const feature = event.features?.[0]; if (!feature) return; item.getCanvas().style.cursor = "pointer"; setHoverInfo({title: feature.properties.title || "Sentinel-2 scene", detail: feature.properties.detail || "Scene footprint"}); });
      item.on("mouseleave", "result-lines", () => { item.getCanvas().style.cursor = ""; setHoverInfo(null); });
    });
    return () => { beforeMap.remove(); afterMap.remove(); };
  }, []);
  useEffect(() => {
    const Cesium = window.Cesium; if (!Cesium) return;
    Cesium.Ion.defaultAccessToken = undefined;
    const viewer = new Cesium.Viewer(globeNode.current,{baseLayer:false,terrainProvider:new Cesium.EllipsoidTerrainProvider(),animation:false,timeline:false,baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,navigationHelpButton:false,fullscreenButton:false,selectionIndicator:false,infoBox:false});
    viewer.scene.globe.enableLighting=false; viewer.scene.globe.showGroundAtmosphere=true; viewer.scene.skyAtmosphere.show=true;
    globeBaseLayer.current=viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({url:"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",credit:new Cesium.Credit("Imagery © Esri"),maximumLevel:19}));
    viewer.camera.setView({destination:Cesium.Cartesian3.fromDegrees(55,18,17000000),orientation:{heading:0,pitch:Cesium.Math.toRadians(-90),roll:0}});
    viewer.clock.shouldAnimate=true; viewer.clock.onTick.addEventListener(()=>{if(orbitEnabled.current)viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z,-0.00018);});
    const picker=new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);const inspect=position=>{const picked=viewer.scene.pick(position);if(picked?.id)setHoverInfo({title:picked.id.name||"3D analytical feature",detail:picked.id.description?.getValue?.()||picked.id.description||"Mapped result"});else setHoverInfo(null);};picker.setInputAction(event=>inspect(event.position),Cesium.ScreenSpaceEventType.LEFT_CLICK);picker.setInputAction(event=>inspect(event.endPosition),Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    const pauseOrbit=()=>setOrbit(false); viewer.screenSpaceEventHandler.setInputAction(pauseOrbit,Cesium.ScreenSpaceEventType.LEFT_DOWN); viewer.screenSpaceEventHandler.setInputAction(pauseOrbit,Cesium.ScreenSpaceEventType.WHEEL);
    globe.current=viewer; if(pending.current)drawGlobe(pending.current);
    return ()=>{picker.destroy();viewer.destroy();globe.current=null;};
  }, []);
  useEffect(()=>{if(viewMode==="3d")setTimeout(()=>globe.current?.resize(),0);},[viewMode]);
  useEffect(() => { run(EXAMPLES[0]); }, []);
  async function run(value) { setRunning(true); setError(""); try { const next = await route(value); setResult(next); draw(next); } catch (caught) { setError(caught.message); } finally { setRunning(false); } }

  return <main>
    <header><div className="mark">AE</div><div><strong>Agentic Earth Intelligence</strong><span>Live public-data intelligence</span></div><a href="https://github.com/tushar2159/agentic-earth-intelligence">GitHub ↗</a></header>
    <section className="hero"><div className="copy"><p className="eyebrow">ASK ACROSS DOMAINS</p><h1>Ask Earth.<br/><span>See the answer.</span></h1><p>Route natural-language questions to live Earth observation, weather, air-quality and earthquake services, then visualize the evidence.</p><form onSubmit={event => {event.preventDefault(); run(prompt);}}><label htmlFor="prompt">Question</label><textarea id="prompt" value={prompt} onChange={event => setPrompt(event.target.value)}/><div className="examples">{EXAMPLES.map(item => <button type="button" key={item} title={item} onClick={() => {setPrompt(item); run(item);}}>{item}</button>)}</div><button className="analyze" disabled={running}>{running ? "Querying live providers…" : "Analyze live data"}</button></form>{error && <p className="error">{error}</p>}</div>
      <div className="map-shell"><div className="view-switch"><button className={viewMode === "2d" ? "active" : ""} onClick={()=>{setViewMode("2d");history.replaceState(null,"",location.pathname);}}>2D Analysis</button><button className={viewMode === "3d" ? "active" : ""} onClick={()=>{setViewMode("3d");history.replaceState(null,"",`${location.pathname}#3d`);}}>3D Globe</button>{viewMode === "3d" && <button className="orbit-toggle" onClick={()=>setOrbit(!orbiting)}>{orbiting ? "Pause orbit" : "Resume orbit"}</button>}</div><div className="comparison" hidden={viewMode !== "2d"}><div ref={beforeNode} className="map compare-map"/><div ref={afterNode} className="map compare-map after-map" style={{clipPath: result?.comparison ? `inset(0 0 0 ${swipe}%)` : "none"}}/></div><div ref={globeNode} className="cesium-globe" hidden={viewMode !== "3d"}/>
        {viewMode === "2d" && result?.comparison && <><div className="map-dates"><span>{result.baselineLabel} BASELINE</span><span>{result.comparisonLabel} COMPARISON</span></div><input className="compare-range" type="range" min="0" max="100" value={swipe} onChange={event => setSwipe(Number(event.target.value))} aria-label="Compare baseline and comparison imagery"/><div className="compare-line" style={{left: `${swipe}%`}}><i>↔</i></div></>}
        {viewMode === "3d" && result?.comparison && <div className="globe-time"><div><span>{result.baselineLabel} · {100-globeBlend}%</span><strong>{globeBlend===0?"Baseline":globeBlend===100?"Comparison":`${globeBlend}% comparison`}</strong><span>{result.comparisonLabel} · {globeBlend}%</span></div><input type="range" min="0" max="100" step="1" value={globeBlend} onInput={event=>updateGlobeBlend(event.currentTarget.value)} onChange={event=>updateGlobeBlend(event.currentTarget.value)} aria-label="Blend baseline and comparison imagery on the globe"/><div className="time-presets"><button onClick={()=>updateGlobeBlend(0)}>{result.baselineLabel}</button><button onClick={()=>updateGlobeBlend(50)}>50 / 50</button><button onClick={()=>updateGlobeBlend(100)}>{result.comparisonLabel}</button></div></div>}
        <div className={`layer-controls ${viewMode === "3d" ? "globe-layers" : ""}`}><strong>LAYERS</strong>{Object.entries(layers).map(([key, enabled]) => <button className={enabled ? "active" : ""} type="button" key={key} onClick={() => toggleLayer(key)}>{enabled ? "✓" : "○"} {key}</button>)}{viewMode === "3d" && <><button type="button" onClick={()=>focusGlobe(true)}>◎ AOI</button><button type="button" onClick={()=>focusGlobe(false)}>○ GLOBAL</button></>}</div>
        {hoverInfo && <div className="hover-card"><strong>{hoverInfo.title}</strong><span>{hoverInfo.detail}</span></div>}
        <div className={`legend ${viewMode === "3d" ? "globe-legend" : ""}`}><strong>{viewMode === "3d" ? "3D INTELLIGENCE" : "MAP EVIDENCE"}</strong>{viewMode === "2d" && result?.comparison && <><span><i className="swatch raster"/>Analytical raster</span><span><i className="swatch scene"/>Scene footprint</span></>}{result?.domain === "earthquakes" ? <span><i className="swatch quake"/>Earthquake magnitude</span> : (viewMode === "3d" || !result?.comparison) && <span><i className="swatch point"/>Query location</span>}<small>{viewMode === "3d" ? `${orbiting ? "Orbiting" : "Analysis locked"} · hover features · drag and zoom freely` : `Hover features for details${result?.comparison ? " · drag the center slider" : ""}`}</small></div>{viewMode === "2d" && <span className="map-label">XYZ SATELLITE · INTERACTIVE LIVE LAYERS</span>}
      </div></section>
    <section className="results"><article><span>EXECUTION TRACE</span><h2>{result?.title || (running ? "Running analysis" : "Ready")}</h2><div className="timeline">{(result?.trace || ["Interpret question", "Select capability", "Retrieve live context", "Visualize evidence"]).map((item, index) => <div key={item}><b>{String(index + 1).padStart(2, "0")}</b><p>{item}</p></div>)}</div></article><article><span>LIVE ANSWER</span><h2>{result?.domain?.replace("-", " ") || "Awaiting data"}</h2><p>{result?.summary || "The change comparison starts automatically."}</p>{result?.metrics && <div className="metrics">{result.metrics.map(([label, value]) => <div key={label}><b>{value}</b><span>{label}</span></div>)}</div>}<small>{result ? `${result.cached ? "CACHED RESULT" : "LIVE RESULT"} · 15-MINUTE TRAFFIC-AWARE CACHE` : "INTELLIGENCE WORKSPACE"}</small></article></section>
  </main>;
}

createRoot(document.getElementById("root")).render(<App/>);
