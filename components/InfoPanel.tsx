"use client";

import { useEffect, useState } from "react";
import type { OverheadObject, PassDetails, NextPassInfo } from "@/lib/propagate";
import type { PlanetObject } from "@/lib/planets";
import { estimateSet, predictPasses, computeNextPass } from "@/lib/propagate";

export interface InfoPanelProps {
  selectedObj: OverheadObject | PlanetObject | null;
  overheadList: (OverheadObject | PlanetObject)[];
  onObjectSelect: (obj: OverheadObject | PlanetObject) => void;
  lat: number;
  lon: number;
}

const SAT_COLORS: Record<string, string> = {
  iss: "#00ff88",
  starlink: "#00d4ff",
  gps: "#ffa500",
  noaa: "#ff6b6b",
  hubble: "#e066ff",
  tiangong: "#ffdd44",
  other: "#8899aa",
  planet: "#ffcc44",
  sun: "#ffe066",
  moon: "#d4dce8",
};

const ASTRO_INFO: Record<string, { flag: string; launch: string }> = {
  "Oleg Kononenko": { flag: "🇷🇺", launch: "2023-09-15T15:44:00Z" },
  "Nikolai Chub": { flag: "🇷🇺", launch: "2023-09-15T15:44:00Z" },
  "Tracy Caldwell-Dyson": { flag: "🇺🇸", launch: "2024-03-23T12:36:00Z" },
  "Matthew Dominick": { flag: "🇺🇸", launch: "2024-03-04T03:53:00Z" },
  "Michael Barratt": { flag: "🇺🇸", launch: "2024-03-04T03:53:00Z" },
  "Jeanette Epps": { flag: "🇺🇸", launch: "2024-03-04T03:53:00Z" },
  "Alexander Grebenkin": { flag: "🇷🇺", launch: "2024-03-04T03:53:00Z" },
  "Barry Wilmore": { flag: "🇺🇸", launch: "2024-06-05T14:52:00Z" },
  "Sunita Williams": { flag: "🇺🇸", launch: "2024-06-05T14:52:00Z" },
  "Aleksey Ovchinin": { flag: "🇷🇺", launch: "2024-09-11T16:23:00Z" },
  "Ivan Vagner": { flag: "🇷🇺", launch: "2024-09-11T16:23:00Z" },
  "Donald Pettit": { flag: "🇺🇸", launch: "2024-09-11T16:23:00Z" },
  "Oleg Novitsky": { flag: "🇷🇺", launch: "2024-03-23T12:36:00Z" },
  "Marina Vasilevskaya": { flag: "🇧🇾", launch: "2024-03-23T12:36:00Z" },
  "Loral O'Hara": { flag: "🇺🇸", launch: "2023-09-15T15:44:00Z" },
  "Satoshi Furukawa": { flag: "🇯🇵", launch: "2023-08-26T07:27:00Z" },
  "Andreas Mogensen": { flag: "🇩🇰", launch: "2023-08-26T07:27:00Z" },
  "Jasmin Moghbeli": { flag: "🇺🇸", launch: "2023-08-26T07:27:00Z" },
  "Konstantin Borisov": { flag: "🇷🇺", launch: "2023-08-26T07:27:00Z" },
};

export interface AstroMember {
  name: string;
  craft: string;
}

function formatDuration(ms: number) {
  if (ms < 0) ms = 0;
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  
  if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function InfoPanel({
  selectedObj,
  overheadList,
  onObjectSelect,
  lat,
  lon,
}: InfoPanelProps) {
  const [issCrewList, setIssCrewList] = useState<AstroMember[]>([]);
  const [isCrewExpanded, setIsCrewExpanded] = useState(true);
  const [passes, setPasses] = useState<PassDetails[]>([]);
  const [nextPass, setNextPass] = useState<NextPassInfo | null>(null);
  const [nowTime, setNowTime] = useState<number>(Date.now());

  useEffect(() => {
    const int = setInterval(() => setNowTime(Date.now()), 1000);
    return () => clearInterval(int);
  }, []);

  useEffect(() => {
    if (selectedObj?.type === "iss") {
      fetch("/api/iss-crew")
        .then((res) => res.json())
        .then((data) => {
          if (data && data.crew) {
            setIssCrewList(data.crew);
          }
        })
        .catch(() => {});
    }
  }, [selectedObj?.type]);

  // Is it a satellite?
  const isSat = selectedObj && "satrec" in selectedObj;

  useEffect(() => {
    if (selectedObj && "satrec" in selectedObj) {
      const observerLoc = { lat, lon };
      const upcoming = predictPasses(selectedObj.satrec, observerLoc, new Date(), 5);
      setPasses(upcoming);
      
      let active = true;
      const compute = () => {
        if (!active) return;
        const info = computeNextPass(selectedObj.satrec, observerLoc, new Date(nowTime));
        if (active) setNextPass(info);
      };

      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        (window as any).requestIdleCallback(compute);
      } else {
        setTimeout(compute, 0);
      }
      return () => { active = false; };
    } else {
      setPasses([]);
      setNextPass(null);
    }
  }, [selectedObj?.name, lat, lon]);

  useEffect(() => {
    if (nextPass && nowTime > nextPass.losDate.getTime()) {
      if (selectedObj && "satrec" in selectedObj) {
        const compute = () => {
          setNextPass(computeNextPass(selectedObj.satrec, { lat, lon }, new Date(nowTime)));
        };
        if (typeof window !== "undefined" && "requestIdleCallback" in window) {
          (window as any).requestIdleCallback(compute);
        } else {
          setTimeout(compute, 0);
        }
      }
    }
  }, [nowTime, nextPass, selectedObj?.name, lat, lon]);

  let setEstimate = "";
  if (isSat) {
    setEstimate = estimateSet(selectedObj as OverheadObject, { lat, lon });
  }

  // Type label string
  let typeLabel = "Unknown";
  if (selectedObj) {
    if (selectedObj.type === "iss") typeLabel = "Space Station";
    else if (selectedObj.type === "starlink") typeLabel = "Communications";
    else if (selectedObj.type === "gps") typeLabel = "Navigation";
    else if (selectedObj.type === "noaa") typeLabel = "Weather / Earth Obs";
    else if (selectedObj.type === "hubble") typeLabel = "Space Telescope";
    else if (selectedObj.type === "tiangong") typeLabel = "Space Station";
    else if (selectedObj.type === "planet") typeLabel = "Planet";
    else if (selectedObj.type === "sun") typeLabel = "Star";
    else if (selectedObj.type === "moon") typeLabel = "Moon";
    else typeLabel = "Satellite";
  }

  return (
    <div className="flex flex-col w-full h-full bg-[#0c1225]/95 border-l border-[#1a2744] text-[#ededed] shadow-[-8px_0_24px_rgba(0,0,0,0.5)] z-50">
      {/* ── TOP: Object Detail Card ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-[#1a2744] p-4 min-h-[260px]">
        {!selectedObj ? (
          <div className="flex flex-col items-center justify-center h-[220px] text-gray-500">
            <span className="text-4xl mb-3 opacity-60">🔭</span>
            <p className="text-sm">Click an object in the sky dome</p>
          </div>
        ) : (
          <div className="flex flex-col h-full animate-fade-in">
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-[#00d4ff] tracking-wide mb-1">
                  {selectedObj.name}
                </h2>
                <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
                  {typeLabel}
                </div>
              </div>
              
              {/* Tier Badge */}
              <div
                className={`flex items-center px-2 py-1 rounded text-xs font-bold border ${
                  selectedObj.tier === "naked"
                    ? "bg-[#0c2a1e] text-[#22c55e] border-[#166534]"
                    : selectedObj.tier === "bino"
                    ? "bg-[#33220c] text-[#f59e0b] border-[#92400e]"
                    : "bg-[#1a2744] text-gray-400 border-gray-600"
                }`}
              >
                {selectedObj.tier === "naked" && "👁 Naked Eye"}
                {selectedObj.tier === "bino" && "🔭 Binocular"}
                {selectedObj.tier === "track" && "📡 Tracking Only"}
              </div>
            </div>

            {/* Metrics Grid 2x3 */}
            <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm bg-[#060818] p-3 rounded-lg border border-[#1a2744]">
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">
                  Azimuth
                </div>
                <div className="font-mono text-[#00d4ff]">
                  {selectedObj.az.toFixed(1)}°
                </div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">
                  Elevation
                </div>
                <div className="font-mono text-[#00d4ff]">
                  {selectedObj.el.toFixed(1)}°
                </div>
              </div>
              
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">
                  Visual Mag
                </div>
                <div className="font-mono text-[#ffcc44]">
                  {selectedObj.mag.toFixed(1)}
                </div>
              </div>
              
              {isSat ? (
                <>
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">
                      Altitude
                    </div>
                    <div className="font-mono text-gray-300">
                      {(selectedObj as OverheadObject).altKm.toFixed(0)} km
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">
                      Velocity
                    </div>
                    <div className="font-mono text-gray-300">
                      {(selectedObj as OverheadObject).velKmS.toFixed(2)} km/s
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">
                      Period
                    </div>
                    <div className="font-mono text-gray-300">
                      {(selectedObj as OverheadObject).periodMin.toFixed(0)} min
                    </div>
                  </div>
                </>
              ) : (
                <div className="col-span-1">
                  {/* Empty grid space filler for planets */}
                </div>
              )}
            </div>

            {/* Live Countdown Centrepiece */}
            {isSat && nextPass && (
              <div className="mt-4 bg-[#0c1225] border border-[#1a2744] rounded-lg p-4 flex flex-col items-center justify-center text-center shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
                {nextPass.isOverheadNow && nowTime < nextPass.losDate.getTime() ? (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#00ff88] animate-pulse shadow-[0_0_8px_#00ff88]" />
                      <span className="text-[#00ff88] font-bold text-[11px] tracking-widest uppercase">Overhead Now</span>
                    </div>
                    <div className="text-xs text-gray-400 uppercase tracking-widest mb-1">
                      Sets in
                    </div>
                    <div className="text-[20px] font-mono font-bold text-[#00d4ff] tracking-[0.1em] drop-shadow-[0_0_8px_rgba(0,212,255,0.4)]" style={{ fontFamily: '"Courier New", monospace' }}>
                      -{formatDuration(nextPass.losDate.getTime() - nowTime)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-gray-400 font-bold text-[11px] tracking-widest uppercase mb-2">
                      Next Pass In
                    </div>
                    <div className="text-[20px] font-mono font-bold text-[#00d4ff] tracking-[0.1em] drop-shadow-[0_0_8px_rgba(0,212,255,0.4)]" style={{ fontFamily: '"Courier New", monospace' }}>
                      {formatDuration(nextPass.aosDate.getTime() - nowTime)}
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-gray-500 uppercase tracking-widest mt-2">
                      <span>Max El: {nextPass.maxEl.toFixed(0)}°</span>
                      <span>Duration: ~{nextPass.duration.toFixed(0)}m</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Additional Info row */}
            <div className="mt-4 flex flex-col gap-2">
              {setEstimate && (
                <div className="flex justify-between items-center bg-[#1a2744]/40 px-3 py-2 rounded text-xs">
                  <span className="text-gray-400">Pass Ends</span>
                  <span className="font-mono text-[#00d4ff]">{setEstimate}</span>
                </div>
              )}
            </div>

            {/* Live Crew Collapsible Section */}
            {selectedObj.type === "iss" && issCrewList.length > 0 && (
              <div className="mt-4 border-t border-[#1a2744] pt-4">
                <button 
                  onClick={() => setIsCrewExpanded(!isCrewExpanded)}
                  className="w-full flex items-center justify-between hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse shadow-[0_0_8px_#00ff88]" />
                    <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest">
                      Live Crew
                    </h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] font-mono font-bold text-[#00ff88] bg-[#00ff88]/10 px-2.5 py-0.5 rounded-full border border-[#00ff88]/30">
                      {issCrewList.length}
                    </span>
                    <span className="text-gray-500 text-xs">
                      {isCrewExpanded ? "▼" : "▶"}
                    </span>
                  </div>
                </button>
                
                {isCrewExpanded && (
                  <div className="mt-3 flex flex-col gap-2">
                    {issCrewList.map((member, i) => {
                      const info = ASTRO_INFO[member.name] || { flag: "🌐", launch: "2024-01-01T00:00:00Z" };
                      const days = Math.floor((Date.now() - new Date(info.launch).getTime()) / (1000 * 60 * 60 * 24));
                      return (
                        <div 
                          key={member.name} 
                          className="flex items-center justify-between bg-[#1a2744]/30 px-3 py-2 rounded border border-[#1a2744] animate-[fade-in_0.3s_ease-out_both]"
                          style={{ animationDelay: `${i * 50}ms` }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{info.flag}</span>
                            <span className="text-[13px] font-medium text-gray-200">
                              {member.name}
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-[#00d4ff]">
                            {Math.max(0, days)}d in space
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Pass Prediction Timeline */}
            {passes.length > 0 && (
              <div className="mt-4 border-t border-[#1a2744] pt-4">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">
                  Upcoming Passes (Next 3 Days)
                </h3>
                <div className="relative border-l border-[#1a2744] ml-2 pl-4 flex flex-col gap-3">
                  {passes.map((p, i) => (
                    <div key={i} className="relative flex items-center justify-between">
                      {/* Timeline Dot */}
                      <div className="absolute -left-[21px] top-2 w-2 h-2 rounded-full bg-[#00d4ff] shadow-[0_0_6px_#00d4ff]" />
                      
                      <div className="flex flex-col">
                        <span className="font-mono text-[#ededed] text-xs">
                          {p.riseTime.toISOString().substring(5, 16).replace("T", " ")} UTC
                        </span>
                        <span className="text-[10px] text-gray-400 mt-0.5">
                          {p.durationMin.toFixed(1)}m · Max El: {p.maxEl.toFixed(0)}°
                        </span>
                      </div>
                      
                      {/* Bar Chart */}
                      <div className="w-12 h-1.5 bg-[#1a2744] rounded-full overflow-hidden flex items-end">
                        <div 
                          className="h-full bg-gradient-to-r from-[#00d4ff] to-[#e066ff]" 
                          style={{ width: `${Math.min((p.maxEl / 90) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── BOTTOM: Scrollable Overhead List ──────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex justify-between items-center px-4 py-3 border-b border-[#1a2744] bg-[#060818]/50">
          <h3 className="text-sm font-bold text-gray-300">Overhead Now</h3>
          <span className="bg-[#1a2744] text-[#00d4ff] text-xs font-mono px-2 py-0.5 rounded-full border border-[#00d4ff]/30">
            {overheadList.length}
          </span>
        </div>
        
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#1a2744] scrollbar-track-transparent">
          <ul className="flex flex-col">
            {overheadList.slice(0, 60).map((obj, i) => {
              const isSelected = selectedObj && selectedObj.name === obj.name;
              const color = SAT_COLORS[obj.type] || SAT_COLORS.other;
              
              return (
                <li key={`${obj.name}-${i}`}>
                  <button
                    onClick={() => onObjectSelect(obj)}
                    className={`w-full flex items-center justify-between px-4 py-3 hover:bg-[#1a2744]/60 transition-colors border-l-2 text-left ${
                      isSelected
                        ? "bg-[#1a2744]/80 border-[#00d4ff]"
                        : "border-transparent"
                    } border-b border-[#1a2744]/40`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: color,
                          boxShadow: `0 0 6px ${color}`,
                        }}
                      />
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-sm text-gray-200 font-medium truncate">
                          {obj.name}
                        </span>
                        <span className="text-[10px] text-gray-500 font-mono">
                          Az {obj.az.toFixed(0)}° · El {obj.el.toFixed(0)}°
                        </span>
                      </div>
                    </div>
                    
                    <div
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 ml-2 border ${
                        obj.tier === "naked"
                          ? "bg-[#0c2a1e] text-[#22c55e] border-[#166534]"
                          : obj.tier === "bino"
                          ? "bg-[#33220c] text-[#f59e0b] border-[#92400e]"
                          : "bg-[#1a2744] text-gray-400 border-gray-600"
                      }`}
                    >
                      {obj.el.toFixed(0)}°
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
