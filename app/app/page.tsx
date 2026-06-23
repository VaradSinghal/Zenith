"use client";

import { useEffect, useState } from "react";
import ObserverMap from "@/components/ObserverMap";
import SkyDome from "@/components/SkyDome";
import InfoPanel from "@/components/InfoPanel";
import { parseTLEBlock, propagateAll, FALLBACK_TLES } from "@/lib/propagate";
import type { SatelliteRecord, OverheadObject } from "@/lib/propagate";
import { getPlanetPositions } from "@/lib/planets";
import type { PlanetObject } from "@/lib/planets";
import { getConstellationLines } from "@/lib/constellations";
import type { Filters, ConstellationLine } from "@/components/SkyDome";
import { Map as MapIcon, Telescope, Info } from "lucide-react";

type Tab = "map" | "sky" | "info";

export default function Home() {
  const [observer, setObserver] = useState({ lat: 40.7128, lon: -74.006 }); // NYC default
  const [satellites, setSatellites] = useState<SatelliteRecord[]>([]);
  const [overhead, setOverhead] = useState<OverheadObject[]>([]);
  const [planets, setPlanets] = useState<PlanetObject[]>([]);
  const [constLines, setConstLines] = useState<ConstellationLine[]>([]);
  const [selectedObj, setSelectedObj] = useState<
    OverheadObject | PlanetObject | null
  >(null);

  const [filters, setFilters] = useState<Filters>({
    showSatellites: true,
    showPlanets: true,
    showConstellations: true,
    showStars: true,
    showAurora: true,
    minTier: "track",
  });

  const [timeOffsetMin, setTimeOffsetMin] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showLoader, setShowLoader] = useState(true);
  const [loadingPhase, setLoadingPhase] = useState("Initializing...");
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("sky");
  const [mainView, setMainView] = useState<"map" | "sky">("sky");
  const [utcTime, setUtcTime] = useState<Date>(new Date());
  const [kpIndex, setKpIndex] = useState<number>(0);

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === "map" || tab === "sky") {
      setMainView(tab);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  /* ── 1. Fetch TLEs ────────────────────────────────────────────────────────── */
  useEffect(() => {
    async function fetchAll() {
      setLoadingPhase("Fetching satellites...");
      const groups = ["stations", "visual", "starlink", "gps-ops", "weather"];
      let combined = "";
      try {
        const fetches = groups.map((g) =>
          fetch(`/api/tle?group=${g}`).then((r) => r.text())
        );
        const texts = await Promise.all(fetches);
        combined = texts.join("\n");
      } catch (e) {
        console.error("Failed to load TLEs:", e);
        combined = FALLBACK_TLES;
      }

      setLoadingPhase("Computing positions...");
      await new Promise(r => setTimeout(r, 400));
      const parsed = parseTLEBlock(combined);
      setSatellites(parsed);

      setLoadingPhase("Rendering sky dome...");
      await new Promise(r => setTimeout(r, 400));
      setIsLoaded(true);

      setTimeout(() => setShowLoader(false), 500);
    }
    fetchAll();
  }, []);

  /* ── 2. Propagation Loop ────────────────────────────────────────────────── */
  useEffect(() => {
    function tick() {
      const now = new Date(Date.now() + timeOffsetMin * 60000);

      if (satellites.length > 0) {
        setOverhead(propagateAll(satellites, observer, now));
      }
      setPlanets(getPlanetPositions(observer, now));
      setConstLines(getConstellationLines(observer.lat, observer.lon, now));
    }

    tick();
    const interval = setInterval(tick, 2000);
    return () => clearInterval(interval);
  }, [satellites, observer, timeOffsetMin]);

  /* ── 3. ISS live fetch (also handled visually in ObserverMap) ───────────── */
  useEffect(() => {
    // Just hitting the endpoint to keep open-notify cache warm
    // The actual marker update is handled internally by ObserverMap
    const interval = setInterval(() => {
      fetch("/api/iss").catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  /* ── 4. UTC Clock ───────────────────────────────────────────────────────── */
  useEffect(() => {
    const clock = setInterval(() => setUtcTime(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  /* ── 5. Aurora Polling ──────────────────────────────────────────────────── */
  useEffect(() => {
    async function fetchKp() {
      try {
        const res = await fetch("/api/aurora");
        const data = await res.json();
        if (data && typeof data.kp === "number") {
          setKpIndex(data.kp);
        }
      } catch (e) {
        console.error("Failed to fetch aurora:", e);
      }
    }
    fetchKp();
    const interval = setInterval(fetchKp, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  /* ── Render Helpers ─────────────────────────────────────────────────────── */
  const combinedList = [...planets, ...overhead];
  
  const auroraPole = 
    kpIndex >= 5 && observer.lat > 50 ? "N" : 
    kpIndex >= 5 && observer.lat < -50 ? "S" : null;

  return (
    <main className="flex flex-col h-[100dvh] w-full overflow-hidden bg-[#060818] text-[#ededed]">
      {/* ── Loading Overlay ── */}
      {showLoader && (
        <div
          className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#060818] transition-opacity duration-500 ${
            isLoaded ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <div className="relative w-32 h-32 mb-8">
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full animate-[spin_4s_linear_infinite]"
            >
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#1a2744"
                strokeWidth="2"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#00d4ff"
                strokeWidth="2"
                strokeDasharray="60 222"
                strokeLinecap="round"
              />
              <circle cx="95" cy="50" r="3" fill="#e066ff" className="animate-pulse" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl opacity-80">🌍</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-[#00d4ff] to-[#e066ff] mb-4">
            PROJECT ZENITH
          </h1>
          <div className="text-sm font-mono text-[#00d4ff] animate-pulse">
            {loadingPhase}
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="flex-shrink-0 h-14 border-b border-[#1a2744] bg-[#0c1225]/95 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#00d4ff] to-[#e066ff]">
            ZENITH
          </h1>
          <div className="hidden md:flex items-center gap-2 text-xs font-mono text-gray-400 border-l border-[#1a2744] pl-4">
            <span>Lat: {observer.lat.toFixed(4)}°</span>
            <span>Lon: {observer.lon.toFixed(4)}°</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex text-xs font-mono font-bold text-[#00ff88]">
            Kp {kpIndex.toFixed(2)}
          </div>
          <div className="text-xs font-mono text-[#00d4ff] w-[150px] text-right">
            {mounted ? `${utcTime.toISOString().replace("T", " ").substring(0, 19)} UTC` : "--:--:-- UTC"}
          </div>
          <div className="hidden sm:flex text-xs font-mono text-gray-400">
            {overhead.length} overhead
          </div>
          {isLoaded ? (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0c2a1e] border border-[#166534] text-[#22c55e] text-[10px] font-bold tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse"></span>
              LIVE
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#33220c] border border-[#92400e] text-[#f59e0b] text-[10px] font-bold tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse"></span>
              CACHED
            </div>
          )}
        </div>
      </header>

      {/* ── Main Layout ── */}
      <div className="flex-1 relative md:grid md:grid-cols-[340px_1fr_280px] overflow-hidden pb-12 md:pb-0">
        {/* Left: Map */}
        <div
          className={`${
            mainView === "map" ? "block" : "hidden"
          } md:block relative h-full border-r border-[#1a2744] z-10`}
        >
          <ObserverMap
            lat={observer.lat}
            lon={observer.lon}
            onLocationSelect={(lat, lon) => setObserver({ lat, lon })}
            selectedSat={selectedObj && "satrec" in selectedObj ? (selectedObj as OverheadObject) : undefined}
          />
        </div>

        {/* Center: SkyDome + Controls */}
        <div
          className={`${
            mainView === "sky" ? "block" : "hidden"
          } md:block relative h-full z-0 flex flex-col`}
        >
          <div className="flex-1 relative min-h-0">
            <SkyDome
              overhead={overhead}
              planets={planets}
              constLines={constLines}
              filters={filters}
              selectedObj={selectedObj || undefined}
              auroraPole={auroraPole}
              observer={observer}
              onObjectSelect={(obj) => {
                setSelectedObj(obj);
                if (window.innerWidth < 768) setActiveTab("info");
              }}
            />
          </div>

          {/* Time & Filter Controls */}
          <div className="absolute bottom-2 md:bottom-4 left-1/2 -translate-x-1/2 w-[95%] md:w-[90%] max-w-lg bg-[#0c1225]/90 border border-[#1a2744] backdrop-blur-md rounded-xl p-2 md:p-3 shadow-xl z-30">
            {/* Filter Pills */}
            <div className="flex flex-wrap justify-center gap-2 mb-3">
              <button
                onClick={() =>
                  setFilters((f) => ({ ...f, showSatellites: !f.showSatellites }))
                }
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors border ${
                  filters.showSatellites
                    ? "bg-[#00d4ff]/20 text-[#00d4ff] border-[#00d4ff]/40"
                    : "bg-[#1a2744] text-gray-500 border-gray-700"
                }`}
              >
                Satellites
              </button>
              <button
                onClick={() =>
                  setFilters((f) => ({ ...f, showPlanets: !f.showPlanets }))
                }
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors border ${
                  filters.showPlanets
                    ? "bg-[#ffcc44]/20 text-[#ffcc44] border-[#ffcc44]/40"
                    : "bg-[#1a2744] text-gray-500 border-gray-700"
                }`}
              >
                Planets
              </button>
              <button
                onClick={() =>
                  setFilters((f) => ({ ...f, showConstellations: !f.showConstellations }))
                }
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors border ${
                  filters.showConstellations
                    ? "bg-[#e066ff]/20 text-[#e066ff] border-[#e066ff]/40"
                    : "bg-[#1a2744] text-gray-500 border-gray-700"
                }`}
              >
                Constellations
              </button>
              <button
                onClick={() =>
                  setFilters((f) => ({ ...f, showStars: !f.showStars }))
                }
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors border ${
                  filters.showStars
                    ? "bg-white/20 text-white border-white/40"
                    : "bg-[#1a2744] text-gray-500 border-gray-700"
                }`}
              >
                Stars
              </button>
              <button
                onClick={() =>
                  setFilters((f) => ({ ...f, showAurora: !f.showAurora }))
                }
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors border ${
                  filters.showAurora
                    ? "bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/40"
                    : "bg-[#1a2744] text-gray-500 border-gray-700"
                }`}
              >
                Aurora
              </button>
            </div>

            {/* Time Offset Slider */}
            <div className="flex items-center gap-3 px-2">
              <span className="text-[10px] font-mono text-gray-400 w-12 text-right">
                -120m
              </span>
              <input
                type="range"
                min="-120"
                max="120"
                step="1"
                value={timeOffsetMin}
                onChange={(e) => setTimeOffsetMin(parseInt(e.target.value))}
                className="flex-1 h-1.5 bg-[#1a2744] rounded-lg appearance-none cursor-pointer accent-[#00d4ff]"
              />
              <span className="text-[10px] font-mono text-[#00d4ff] w-12">
                {timeOffsetMin > 0 ? "+" : ""}
                {timeOffsetMin}m
              </span>
            </div>
          </div>
        </div>

        {/* Right: InfoPanel */}
        <div
          className={`
            fixed md:static left-0 right-0 bottom-12 md:bottom-auto top-20 md:top-auto z-40
            md:h-full transition-transform duration-300 ease-in-out
            ${activeTab === "info" ? "translate-y-0" : "translate-y-[120%] md:translate-y-0"}
            shadow-[0_-8px_32px_rgba(0,0,0,0.8)] md:shadow-none
            rounded-t-2xl md:rounded-none overflow-hidden bg-[#0c1225]
          `}
        >
          <InfoPanel
            selectedObj={selectedObj}
            overheadList={combinedList}
            onObjectSelect={(obj) => {
              setSelectedObj(obj);
              if (window.innerWidth < 768) setActiveTab("info");
            }}
            lat={observer.lat}
            lon={observer.lon}
            allSatellites={satellites}
          />
        </div>
      </div>

      {/* ── Mobile Tab Bar (Bottom) ── */}
      <div className="md:hidden absolute bottom-0 left-0 right-0 h-12 bg-[#0c1225] border-t border-[#1a2744] flex z-50">
        <button
          onClick={() => handleTabClick("map")}
          className={`flex-1 flex flex-col items-center justify-center transition-colors ${
            activeTab === "map" ? "text-[#00d4ff] bg-[#1a2744]/40" : "text-gray-500 hover:text-gray-300"
          }`}
        >
          <MapIcon size={20} />
        </button>
        <button
          onClick={() => handleTabClick("sky")}
          className={`flex-1 flex flex-col items-center justify-center transition-colors ${
            activeTab === "sky" ? "text-[#00d4ff] bg-[#1a2744]/40" : "text-gray-500 hover:text-gray-300"
          }`}
        >
          <Telescope size={20} />
        </button>
        <button
          onClick={() => handleTabClick("info")}
          className={`flex-1 flex flex-col items-center justify-center transition-colors ${
            activeTab === "info" ? "text-[#00d4ff] bg-[#1a2744]/40" : "text-gray-500 hover:text-gray-300"
          }`}
        >
          <Info size={20} />
        </button>
      </div>
    </main>
  );
}
