"use client";

import { useEffect, useState } from "react";
import ObserverMap from "@/components/ObserverMap";
import SkyDome from "@/components/SkyDome";
import InfoPanel from "@/components/InfoPanel";
import { parseTLEBlock, propagateAll } from "@/lib/propagate";
import type { SatelliteRecord, OverheadObject } from "@/lib/propagate";
import { getPlanetPositions } from "@/lib/planets";
import type { PlanetObject } from "@/lib/planets";
import { getConstellationLines } from "@/lib/constellations";
import type { Filters, ConstellationLine } from "@/components/SkyDome";

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
    minTier: "track",
  });

  const [timeOffsetMin, setTimeOffsetMin] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("sky");
  const [utcTime, setUtcTime] = useState<Date>(new Date());

  useEffect(() => {
    setMounted(true);
  }, []);

  /* ── 1. Fetch TLEs ────────────────────────────────────────────────────────── */
  useEffect(() => {
    async function fetchAll() {
      const groups = ["stations", "visual", "starlink", "gps-ops", "weather"];
      try {
        const fetches = groups.map((g) =>
          fetch(`/api/tle?group=${g}`).then((r) => r.text())
        );
        const texts = await Promise.all(fetches);
        const combined = texts.join("\n");
        const parsed = parseTLEBlock(combined);
        setSatellites(parsed);
        setIsLoaded(true);
      } catch (e) {
        console.error("Failed to load TLEs:", e);
      }
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

  /* ── Render Helpers ─────────────────────────────────────────────────────── */
  const combinedList = [...planets, ...overhead];

  return (
    <main className="flex flex-col h-[100dvh] w-full overflow-hidden bg-[#060818] text-[#ededed]">
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

      {/* ── Mobile Tab Switcher ── */}
      <div className="md:hidden flex flex-shrink-0 h-12 bg-[#0c1225] border-b border-[#1a2744]">
        {(["map", "sky", "info"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 text-xs font-bold uppercase tracking-wider transition-colors ${
              activeTab === tab
                ? "text-[#00d4ff] border-b-2 border-[#00d4ff] bg-[#1a2744]/40"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Main Layout ── */}
      <div className="flex-1 relative md:grid md:grid-cols-[340px_1fr_280px] overflow-hidden">
        {/* Left: Map */}
        <div
          className={`${
            activeTab === "map" ? "block" : "hidden"
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
            activeTab === "sky" ? "block" : "hidden"
          } md:block relative h-full z-0 flex flex-col`}
        >
          <div className="flex-1 relative min-h-0">
            <SkyDome
              overhead={overhead}
              planets={planets}
              constLines={constLines}
              filters={filters}
              selectedObj={selectedObj || undefined}
              onObjectSelect={(obj) => {
                setSelectedObj(obj);
                if (window.innerWidth < 768) setActiveTab("info");
              }}
            />
          </div>

          {/* Time & Filter Controls */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] max-w-lg bg-[#0c1225]/90 border border-[#1a2744] backdrop-blur-md rounded-xl p-3 shadow-xl z-50">
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
          className={`${
            activeTab === "info" ? "block" : "hidden"
          } md:block relative h-full z-20`}
        >
          <InfoPanel
            selectedObj={selectedObj}
            overheadList={combinedList}
            onObjectSelect={(obj) => {
              setSelectedObj(obj);
              if (window.innerWidth < 768) setActiveTab("sky");
            }}
            lat={observer.lat}
            lon={observer.lon}
          />
        </div>
      </div>
    </main>
  );
}
