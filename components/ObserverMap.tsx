"use client";

import dynamic from "next/dynamic";
import type { OverheadObject } from "@/lib/propagate";

const ObserverMapInner = dynamic(() => import("./ObserverMapInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#060818]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#00d4ff]/30 border-t-[#00d4ff] rounded-full animate-spin" />
        <span className="text-xs text-gray-500 font-mono">Loading map…</span>
      </div>
    </div>
  ),
});

interface ObserverMapProps {
  lat: number;
  lon: number;
  onLocationSelect: (lat: number, lon: number) => void;
  selectedSat?: OverheadObject;
}

export default function ObserverMap({
  lat,
  lon,
  onLocationSelect,
  selectedSat,
}: ObserverMapProps) {
  return (
    <ObserverMapInner
      lat={lat}
      lon={lon}
      onLocationSelect={onLocationSelect}
      selectedSat={selectedSat}
    />
  );
}
