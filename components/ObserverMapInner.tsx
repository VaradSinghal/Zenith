"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import * as satellite from "satellite.js";
import type { OverheadObject } from "@/lib/propagate";

/* ── Types ─────────────────────────────────────────────────────────── */

interface ISSPosition {
  latitude: string;
  longitude: string;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface ObserverMapInnerProps {
  lat: number;
  lon: number;
  onLocationSelect: (lat: number, lon: number) => void;
  selectedSat?: OverheadObject;
}

/* ── Helpers ───────────────────────────────────────────────────────── */

function computeGroundTrack(
  satrec: satellite.SatRec,
  periodMin: number
): [number, number][] {
  const now = Date.now();
  const steps = 90;
  const stepMs = (periodMin * 60 * 1000) / steps;
  const points: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    const t = new Date(now + i * stepMs);
    const gmst = satellite.gstime(t);
    const pv = satellite.propagate(satrec, t);
    if (!pv || !pv.position || typeof pv.position === "boolean") continue;

    const posEci = pv.position as satellite.EciVec3<number>;
    const gd = satellite.eciToGeodetic(posEci, gmst);
    let lonDeg = gd.longitude * (180 / Math.PI);
    const latDeg = gd.latitude * (180 / Math.PI);

    // Normalize longitude to -180..180
    while (lonDeg > 180) lonDeg -= 360;
    while (lonDeg < -180) lonDeg += 360;

    points.push([latDeg, lonDeg]);
  }

  return points;
}

/** Split a polyline at antimeridian crossings so Leaflet doesn't draw lines across the map */
function splitAtAntimeridian(
  points: [number, number][]
): [number, number][][] {
  const segments: [number, number][][] = [];
  let current: [number, number][] = [];

  for (let i = 0; i < points.length; i++) {
    if (current.length > 0) {
      const prevLon = current[current.length - 1][1];
      const curLon = points[i][1];
      if (Math.abs(curLon - prevLon) > 180) {
        segments.push(current);
        current = [];
      }
    }
    current.push(points[i]);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function ObserverMapInner({
  lat,
  lon,
  onLocationSelect,
  selectedSat,
}: ObserverMapInnerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const observerMarkerRef = useRef<L.Marker | null>(null);
  const issMarkerRef = useRef<L.Marker | null>(null);
  const groundTrackRef = useRef<L.Polyline[]>([]);
  const issIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [toastMsg, setToastMsg] = useState("");

  /* ── Observer icon ──────────────────────────────────────────────── */
  const observerIcon = useRef(
    L.divIcon({
      className: "",
      html: `<div style="
        width:14px;height:14px;border-radius:50%;
        background:#00d4ff;
        box-shadow:0 0 8px 3px rgba(0,212,255,0.6),0 0 20px 6px rgba(0,212,255,0.25);
        border:2px solid rgba(255,255,255,0.8);
      "></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    })
  );

  /* ── ISS icon ───────────────────────────────────────────────────── */
  const issIcon = useRef(
    L.divIcon({
      className: "",
      html: `<div style="
        font-size:24px;line-height:1;
        filter:drop-shadow(0 0 6px #22c55e) drop-shadow(0 0 12px rgba(34,197,94,0.4));
      ">🛰️</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })
  );

  /* ── Initialize map ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [lat, lon],
      zoom: 3,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        subdomains: "abcd",
        maxZoom: 19,
      }
    ).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Observer pin
    const marker = L.marker([lat, lon], { icon: observerIcon.current }).addTo(
      map
    );
    marker.bindTooltip("Observer", {
      permanent: false,
      direction: "top",
      className: "observer-tooltip",
    });
    observerMarkerRef.current = marker;

    // Click handler
    map.on("click", (e: L.LeafletMouseEvent) => {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Update observer marker when lat/lon changes ────────────────── */
  useEffect(() => {
    if (!mapRef.current || !observerMarkerRef.current) return;
    const currentLatLng = observerMarkerRef.current.getLatLng();
    if (currentLatLng.lat === lat && currentLatLng.lng === lon) return;

    observerMarkerRef.current.setLatLng([lat, lon]);
    mapRef.current.setView([lat, lon], mapRef.current.getZoom());
  }, [lat, lon]);

  /* ── ISS live position (every 5s) ───────────────────────────────── */
  const updateISS = useCallback(async () => {
    try {
      const res = await fetch("/api/iss");
      if (!res.ok) return;
      const data = await res.json();
      const pos: ISSPosition = data.iss_position;
      if (!pos) return;

      const issLat = parseFloat(pos.latitude);
      const issLon = parseFloat(pos.longitude);
      if (isNaN(issLat) || isNaN(issLon)) return;

      if (issMarkerRef.current) {
        issMarkerRef.current.setLatLng([issLat, issLon]);
      } else if (mapRef.current) {
        const marker = L.marker([issLat, issLon], {
          icon: issIcon.current,
        }).addTo(mapRef.current);
        marker.bindTooltip("ISS", {
          permanent: false,
          direction: "top",
          className: "iss-tooltip",
        });
        issMarkerRef.current = marker;
      }
    } catch {
      // silently ignore fetch errors
    }
  }, []);

  useEffect(() => {
    updateISS();
    issIntervalRef.current = setInterval(updateISS, 5000);
    return () => {
      if (issIntervalRef.current) clearInterval(issIntervalRef.current);
    };
  }, [updateISS]);

  /* ── Ground track for selectedSat ───────────────────────────────── */
  useEffect(() => {
    // Clear old tracks
    groundTrackRef.current.forEach((pl) => pl.remove());
    groundTrackRef.current = [];

    if (!mapRef.current || !selectedSat?.satrec) return;

    const rawPoints = computeGroundTrack(
      selectedSat.satrec,
      selectedSat.periodMin
    );
    const segments = splitAtAntimeridian(rawPoints);

    for (const seg of segments) {
      const polyline = L.polyline(seg, {
        color: "#00d4ff",
        weight: 2,
        opacity: 0.7,
        dashArray: "8 6",
      }).addTo(mapRef.current);
      groundTrackRef.current.push(polyline);
    }
  }, [selectedSat]);

  /* ── City search (Nominatim) ────────────────────────────────────── */
  const handleSearch = useCallback(
    async (query: string) => {
      const q = query.trim();
      if (!q) {
        setSearchResults([]);
        setSelectedIndex(-1);
        return;
      }
      setIsSearching(true);
      
      const latLonMatch = q.match(/^(-?[\d.]+),\s*(-?[\d.]+)$/);
      if (latLonMatch) {
        const rLat = parseFloat(latLonMatch[1]);
        const rLon = parseFloat(latLonMatch[2]);
        if (!isNaN(rLat) && !isNaN(rLon)) {
          setSearchResults([{
            display_name: `${rLat.toFixed(4)}, ${rLon.toFixed(4)}`,
            lat: rLat.toString(),
            lon: rLon.toString()
          }]);
          setIsSearching(false);
          return;
        }
      }

      const uq = q.toUpperCase();
      if (uq === "ISS") {
        if (issMarkerRef.current) {
          const latlng = issMarkerRef.current.getLatLng();
          setSearchResults([{
            display_name: "Current ISS Location",
            lat: latlng.lat.toString(),
            lon: latlng.lng.toString()
          }]);
        }
        setIsSearching(false);
        return;
      } else if (uq === "SRM" || uq === "SRMIST") {
        setSearchResults([{
          display_name: "SRMIST (Chennai, India)",
          lat: "12.8230",
          lon: "80.0444"
        }]);
        setIsSearching(false);
        return;
      }

      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data: NominatimResult[] = await res.json();
        setSearchResults(data);
        setSelectedIndex(-1);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchInput = (value: string) => {
    setSearchQuery(value);
    setSelectedIndex(-1);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => handleSearch(value), 400);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
        selectResult(searchResults[selectedIndex]);
      } else if (searchResults.length > 0) {
        selectResult(searchResults[0]);
      }
    } else if (e.key === "Escape") {
      setSearchResults([]);
      setSelectedIndex(-1);
      e.currentTarget.blur();
    }
  };

  const selectResult = (result: NominatimResult) => {
    const rLat = parseFloat(result.lat);
    const rLon = parseFloat(result.lon);
    
    // Notify parent state
    onLocationSelect(rLat, rLon);
    
    // Perform internal map animations immediately for responsiveness
    if (mapRef.current) {
      mapRef.current.flyTo([rLat, rLon], 6, { duration: 1.2 });
    }
    if (observerMarkerRef.current) {
      observerMarkerRef.current.setLatLng([rLat, rLon]);
    }
    
    // Toast notification
    let shortName = result.display_name.split(",")[0];
    if (shortName.length > 30) shortName = shortName.substring(0, 30) + "…";
    setToastMsg(`📍 ${shortName}`);
    setTimeout(() => setToastMsg(""), 1500);

    setSearchQuery("");
    setSearchResults([]);
    setSelectedIndex(-1);
  };

  /* ── Geolocation ────────────────────────────────────────────────── */
  const handleGeolocate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onLocationSelect(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        console.warn("Geolocation error:", err.message);
      }
    );
  };

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="relative w-full h-full">
      {/* Map container */}
      <div ref={mapContainerRef} className="absolute inset-0 z-0" />

      {/* City search — 100% width header overlay */}
      <div className="absolute top-3 left-0 right-12 z-[1000] px-3">
        <div className="relative">
          <input
            id="city-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search city or lat, lon..."
            className="w-full px-3 py-2 rounded-lg text-sm
              bg-[#0c1225]/90 text-white border border-[#1a2744]
              backdrop-blur-md placeholder-gray-500
              focus:outline-none focus:border-[#00d4ff]/80 focus:ring-1 focus:ring-[#00d4ff]/30
              transition-all"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-[#00d4ff]/40 border-t-[#00d4ff] rounded-full animate-spin" />
            </div>
          )}
        </div>

        {searchResults.length > 0 && (
          <ul className="mt-1 rounded-lg overflow-hidden bg-[#0c1225]/95 border border-[#1a2744] backdrop-blur-md shadow-xl">
            {searchResults.map((r, i) => {
              const truncated = r.display_name.length > 50 ? r.display_name.substring(0, 47) + "..." : r.display_name;
              return (
                <li key={i}>
                  <button
                    className={`w-full text-left px-3 py-2 text-xs transition-colors truncate
                      ${i === selectedIndex ? "bg-[#1a2744] text-white" : "text-gray-300 hover:bg-[#1a2744] hover:text-white"}
                    `}
                    onClick={() => selectResult(r)}
                  >
                    {truncated}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Confirmation Toast */}
      {toastMsg && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 bg-[#00d4ff]/20 text-[#00d4ff] text-xs font-bold rounded-full border border-[#00d4ff]/40 shadow-lg backdrop-blur animate-[fade-in-down_0.2s_ease-out]">
          {toastMsg}
        </div>
      )}

      {/* Geolocation button — top-right overlay */}
      <button
        id="geolocate-button"
        onClick={handleGeolocate}
        title="Use my location"
        className="absolute top-3 right-3 z-[1000]
          w-9 h-9 rounded-lg flex items-center justify-center
          bg-[#0c1225]/90 border border-[#1a2744] backdrop-blur-md
          text-[#00d4ff] hover:bg-[#1a2744] hover:border-[#00d4ff]/40
          transition-all cursor-pointer"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
      </button>

      {/* Inline styles for Leaflet tooltip overrides */}
      <style jsx global>{`
        .observer-tooltip,
        .iss-tooltip {
          background: rgba(6, 8, 24, 0.9) !important;
          color: #ededed !important;
          border: 1px solid #1a2744 !important;
          border-radius: 6px !important;
          padding: 4px 8px !important;
          font-size: 11px !important;
          font-family: inherit !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
        }
        .observer-tooltip::before,
        .iss-tooltip::before {
          border-top-color: rgba(6, 8, 24, 0.9) !important;
        }
        .leaflet-container {
          background: #060818 !important;
        }
      `}</style>
    </div>
  );
}
