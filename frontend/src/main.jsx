import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const EARTH_SEARCH = "https://earth-search.aws.element84.com/v1/search";
const example = "Analyze urban expansion around Pune from 2020 to 2026";

function yearsFromPrompt(value) {
  const years = [...value.matchAll(/\b(?:19|20)\d{2}\b/g)].map(match => Number(match[0]));
  return years.length ? [Math.min(...years), Math.max(...years)] : [2020, 2026];
}

async function searchEarthDirectly(prompt) {
  const [start, end] = yearsFromPrompt(prompt);
  const response = await fetch(EARTH_SEARCH, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      bbox: [73.7, 18.4, 74.0, 18.7],
      datetime: `${start}-01-01T00:00:00Z/${end}-12-31T23:59:59Z`,
      collections: ["sentinel-2-l2a"],
      query: {"eo:cloud_cover": {lte: 20}},
      limit: 20,
    }),
  });
  if (!response.ok) throw new Error(`Earth Search returned ${response.status}`);
  const payload = await response.json();
  const scenes = (payload.features || []).map(feature => ({
    id: feature.id,
    collection: feature.collection,
    datetime: feature.properties?.datetime,
    cloud_cover: feature.properties?.["eo:cloud_cover"],
  }));
  return {
    plan: {intent: "catalog_change_analysis"},
    scenes,
    trace: [
      {stage: "request", status: "validated"},
      {stage: "planner", status: `${start}–${end}`},
      {stage: "earth_search", status: "live query complete"},
      {stage: "evidence", status: `${scenes.length} scenes ranked`},
    ],
    report: `Live browser demo found ${scenes.length} Sentinel-2 scenes over Pune with no more than 20% catalogued cloud cover. Run the FastAPI service for the complete typed backend workflow.`,
    mode: "public-demo",
  };
}

function App() {
  const mapNode = useRef(null);
  const map = useRef(null);
  const [prompt, setPrompt] = useState(example);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    map.current = new maplibregl.Map({
      container: mapNode.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [73.85, 18.55],
      zoom: 8,
      attributionControl: true,
    });
    map.current.addControl(new maplibregl.NavigationControl(), "top-right");
    return () => map.current?.remove();
  }, []);

  async function analyze(event) {
    event.preventDefault();
    setRunning(true);
    setError("");
    try {
      const response = await fetch(`${API}/v1/analyze`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          prompt,
          bbox: [73.7, 18.4, 74.0, 18.7],
          collections: ["sentinel-2-l2a"],
          max_cloud_cover: 20,
        }),
      });
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      setResult(await response.json());
    } catch {
      try {
        setResult(await searchEarthDirectly(prompt));
      } catch (caught) {
        setError(caught.message);
      }
    } finally {
      setRunning(false);
    }
  }

  return <main>
    <header>
      <div className="mark">AE</div>
      <div><strong>Agentic Earth Intelligence</strong><span>Element 84 Earth Search · public EO</span></div>
      <a href="https://github.com/tushar2159/agentic-earth-intelligence">GitHub ↗</a>
    </header>
    <section className="hero">
      <div className="copy">
        <p className="eyebrow">AGENTIC GEOAI</p>
        <h1>Ask Earth.<br/><span>Trace every step.</span></h1>
        <p>Natural-language planning connected to deterministic Earth-observation services, explicit evidence, and inspectable execution traces.</p>
        <form onSubmit={analyze}>
          <label htmlFor="prompt">Analysis request</label>
          <textarea id="prompt" value={prompt} onChange={e => setPrompt(e.target.value)} />
          <button disabled={running}>{running ? "Running workflow…" : "Analyze with Earth Search"}</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
      <div className="map-shell"><div ref={mapNode} className="map" /><span className="map-label">PUNE · 73.7, 18.4, 74.0, 18.7</span></div>
    </section>
    <section className="results">
      <article>
        <span>EXECUTION TRACE</span>
        <h2>{result ? result.plan.intent.replaceAll("_", " ") : "Ready for a request"}</h2>
        <div className="timeline">
          {(result?.trace || ["Validate request", "Plan analysis", "Search STAC", "Rank scenes", "Assemble report"]).map((item, index) =>
            <div key={index}><b>{String(index + 1).padStart(2, "0")}</b><p>{typeof item === "string" ? item : `${item.stage} · ${item.status}`}</p></div>
          )}
        </div>
      </article>
      <article>
        <span>EVIDENCE</span>
        <h2>{result ? `${result.scenes.length} catalog scenes` : "Awaiting analysis"}</h2>
        <p>{result?.report || "Results remain empty until a real Earth Search request completes."}</p>
        {result?.mode === "public-demo" && <small>PUBLIC DEMO MODE · LIVE ELEMENT 84 CATALOG</small>}
      </article>
    </section>
  </main>;
}

createRoot(document.getElementById("root")).render(<App />);
