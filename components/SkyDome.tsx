"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { OverheadObject, SatType } from "@/lib/propagate";
import type { PlanetObject } from "@/lib/planets";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface ConstellationLine {
  name: string;
  points: { az: number; el: number }[];
}

export interface Filters {
  showSatellites: boolean;
  showPlanets: boolean;
  showConstellations: boolean;
  showStars: boolean;
  showAurora: boolean;
  minTier: "naked" | "bino" | "track";
}

export interface SkyDomeProps {
  overhead: OverheadObject[];
  planets: PlanetObject[];
  constLines: ConstellationLine[];
  filters: Filters;
  selectedObj?: OverheadObject | PlanetObject;
  auroraPole?: "N" | "S" | null;
  onObjectSelect: (obj: OverheadObject | PlanetObject) => void;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const DEG2RAD = Math.PI / 180;

const SAT_COLORS: Record<SatType, string> = {
  iss: "#00ff88",
  starlink: "#00d4ff",
  gps: "#ffa500",
  noaa: "#ff6b6b",
  hubble: "#e066ff",
  tiangong: "#ffdd44",
  other: "#8899aa",
};

const TIER_SIZE: Record<string, number> = {
  iss: 6,
  naked: 4,
  bino: 2.5,
  track: 2,
};

const FONT = '"Courier New", monospace';

/* ── Seeded PRNG for reproducible background stars ─────────────────── */

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/* ── Projection: Az/El → Canvas XY ─────────────────────────────────── */

function project(
  az: number,
  el: number,
  cx: number,
  cy: number,
  R: number
): { x: number; y: number } {
  const r = ((90 - el) / 90) * R;
  const azR = (az - 180) * DEG2RAD;
  return {
    x: cx + r * Math.sin(azR),
    y: cy - r * Math.cos(azR),
  };
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function SkyDome({
  overhead,
  planets,
  constLines,
  filters,
  selectedObj,
  auroraPole,
  onObjectSelect,
}: SkyDomeProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const sizeRef = useRef({ w: 0, h: 0 });

  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  /* ── Generate background stars once ─────────────────────────────── */
  const bgStarsRef = useRef<{ az: number; el: number; brightness: number }[]>(
    []
  );
  if (bgStarsRef.current.length === 0) {
    const rng = seededRandom(42);
    for (let i = 0; i < 400; i++) {
      bgStarsRef.current.push({
        az: rng() * 360,
        el: rng() * 85 + 2, // 2..87°
        brightness: 0.15 + rng() * 0.65,
      });
    }
  }

  /* ── Collect all hittable objects for click/hover ─────────────────── */
  const hittableRef = useRef<
    {
      x: number;
      y: number;
      obj: OverheadObject | PlanetObject;
      label: string;
    }[]
  >([]);

  /* ── Draw everything ────────────────────────────────────────────── */
  const draw = useCallback(
    (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(cx, cy) - 20;

      ctx.clearRect(0, 0, w, h);
      const hittable: typeof hittableRef.current = [];

      /* 1. Radial gradient background */
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      bg.addColorStop(0, "#0d1a40");
      bg.addColorStop(1, "#020510");
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = bg;
      ctx.fill();

      /* 2. Dome border — cyan glow ring */
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = "#00d4ff";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#00d4ff";
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      /* 3. Altitude rings at 30° and 60° */
      for (const elDeg of [30, 60]) {
        const r = ((90 - elDeg) / 90) * R;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(100, 140, 180, 0.15)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        ctx.fillStyle = "rgba(100, 140, 180, 0.35)";
        ctx.font = `9px ${FONT}`;
        ctx.textAlign = "left";
        ctx.fillText(`${elDeg}°`, cx + r + 4, cy + 3);
      }

      /* 4. Cardinal direction spokes (N/S/E/W) */
      const cardinals: [string, number][] = [
        ["N", 0],
        ["E", 90],
        ["S", 180],
        ["W", 270],
      ];
      for (const [label, az] of cardinals) {
        const outerPt = project(az, 0, cx, cy, R);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(outerPt.x, outerPt.y);
        ctx.strokeStyle = "rgba(100, 140, 180, 0.12)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label outside the ring
        const labelPt = project(az, -4, cx, cy, R);
        ctx.fillStyle = "rgba(150, 190, 220, 0.6)";
        ctx.font = `bold 11px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, labelPt.x, labelPt.y);
      }

      /* 4.5 Aurora Band */
      if (auroraPole && filters.showAurora) {
        const centerAzR = auroraPole === "N" ? -Math.PI : 0;
        const innerR = R * (1 - 20 / 90);
        
        ctx.save();
        const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, R);
        grad.addColorStop(0, "rgba(0, 255, 136, 0)");
        grad.addColorStop(0.5, "rgba(0, 255, 136, 0.15)");
        grad.addColorStop(1, "rgba(0, 255, 136, 0.4)");
        
        ctx.beginPath();
        ctx.arc(cx, cy, R, centerAzR - Math.PI / 3, centerAzR + Math.PI / 3);
        ctx.arc(cx, cy, innerR, centerAzR + Math.PI / 3, centerAzR - Math.PI / 3, true);
        ctx.closePath();
        
        ctx.fillStyle = grad;
        // Optional: composite operation for glowing blend
        ctx.globalCompositeOperation = "screen";
        ctx.fill();
        ctx.restore();
      }

      /* 5. Background stars */
      if (filters.showStars) {
        for (const star of bgStarsRef.current) {
          const pt = project(star.az, star.el, cx, cy, R);
          const sz = 0.5 + star.brightness * 1.2;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, sz, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(200,210,230,${star.brightness * 0.6})`;
          ctx.fill();
        }
      }

      /* 6. Constellation lines */
      if (filters.showConstellations && constLines.length > 0) {
        const drawnLabels = new Set<string>();
        ctx.strokeStyle = "rgba(140, 100, 200, 0.4)";
        ctx.lineWidth = 0.8;

        for (const cLine of constLines) {
          const visiblePoints = cLine.points.filter((p) => p.el > 0);
          if (visiblePoints.length < 2) continue;

          ctx.beginPath();
          let started = false;
          for (const p of cLine.points) {
            if (p.el <= 0) {
              started = false;
              continue;
            }
            const pt = project(p.az, p.el, cx, cy, R);
            if (!started) {
              ctx.moveTo(pt.x, pt.y);
              started = true;
            } else {
              ctx.lineTo(pt.x, pt.y);
            }
          }
          ctx.stroke();

          // Name label at centroid of visible points
          if (!drawnLabels.has(cLine.name) && visiblePoints.length >= 2) {
            drawnLabels.add(cLine.name);
            const avgAz =
              visiblePoints.reduce((s, p) => s + p.az, 0) /
              visiblePoints.length;
            const avgEl =
              visiblePoints.reduce((s, p) => s + p.el, 0) /
              visiblePoints.length;
            const lp = project(avgAz, avgEl, cx, cy, R);
            ctx.fillStyle = "rgba(160, 130, 220, 0.45)";
            ctx.font = `8px ${FONT}`;
            ctx.textAlign = "center";
            ctx.fillText(cLine.name, lp.x, lp.y - 6);
          }
        }
      }

      /* 7. Satellites */
      if (filters.showSatellites) {
        const tierOrder: Record<string, number> = {
          naked: 0,
          bino: 1,
          track: 2,
        };
        const minTierVal = tierOrder[filters.minTier] ?? 2;

        for (const sat of overhead) {
          if (tierOrder[sat.tier] > minTierVal) continue;

          const pt = project(sat.az, sat.el, cx, cy, R);
          const isISS = sat.type === "iss";
          const dotSize = isISS
            ? TIER_SIZE.iss
            : TIER_SIZE[sat.tier] ?? TIER_SIZE.track;
          const color = SAT_COLORS[sat.type] ?? SAT_COLORS.other;

          // ISS pulsing outer ring
          if (isISS) {
            const pulse = 0.4 + 0.6 * Math.abs(Math.sin(timestamp / 400));
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, dotSize + 5, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0, 255, 136, ${pulse * 0.5})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }

          // Main dot
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, dotSize, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = isISS ? 8 : 4;
          ctx.fill();
          ctx.shadowBlur = 0;

          hittable.push({ x: pt.x, y: pt.y, obj: sat, label: sat.name });
        }
      }

      /* 8. Planets */
      if (filters.showPlanets) {
        for (const planet of planets) {
          if (planet.el <= 0) continue;
          const pt = project(planet.az, planet.el, cx, cy, R);

          if (planet.type === "sun") {
            // Sun with ray lines
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = "#ffe066";
            ctx.shadowColor = "#ffe066";
            ctx.shadowBlur = 12;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Rays
            for (let i = 0; i < 8; i++) {
              const angle = (i * Math.PI) / 4;
              ctx.beginPath();
              ctx.moveTo(pt.x + 7 * Math.cos(angle), pt.y + 7 * Math.sin(angle));
              ctx.lineTo(
                pt.x + 11 * Math.cos(angle),
                pt.y + 11 * Math.sin(angle)
              );
              ctx.strokeStyle = "rgba(255, 224, 102, 0.6)";
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          } else if (planet.type === "moon") {
            // Moon — slightly larger, silver
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 5.5, 0, Math.PI * 2);
            ctx.fillStyle = "#d4dce8";
            ctx.shadowColor = "#d4dce8";
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Crescent hint
            ctx.beginPath();
            ctx.arc(pt.x + 2, pt.y - 1, 4, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(13, 26, 64, 0.5)";
            ctx.fill();
          } else {
            // Regular planet — gold dot
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = "#ffcc44";
            ctx.shadowColor = "#ffcc44";
            ctx.shadowBlur = 6;
            ctx.fill();
            ctx.shadowBlur = 0;
          }

          // Label
          ctx.fillStyle = "rgba(255, 220, 100, 0.7)";
          ctx.font = `9px ${FONT}`;
          ctx.textAlign = "center";
          ctx.fillText(planet.name, pt.x, pt.y - 9);

          hittable.push({
            x: pt.x,
            y: pt.y,
            obj: planet,
            label: planet.name,
          });
        }
      }

      /* 9. Selected object — white ring */
      if (selectedObj) {
        const h = hittable.find((item) => item.obj.name === selectedObj.name);
        if (h) {
          ctx.beginPath();
          ctx.arc(h.x, h.y, 10, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      /* 10. Zenith crosshair + label */
      const zLen = 8;
      ctx.strokeStyle = "rgba(100, 160, 200, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - zLen, cy);
      ctx.lineTo(cx + zLen, cy);
      ctx.moveTo(cx, cy - zLen);
      ctx.lineTo(cx, cy + zLen);
      ctx.stroke();

      ctx.fillStyle = "rgba(100, 180, 220, 0.5)";
      ctx.font = `8px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("ZENITH", cx, cy - 12);

      hittableRef.current = hittable;
    },
    [overhead, planets, constLines, filters, selectedObj, auroraPole]
  );

  /* ── Animation loop at ~10fps for ISS pulse ─────────────────────── */
  useEffect(() => {
    let running = true;
    let lastFrame = 0;

    const loop = (ts: number) => {
      if (!running) return;
      // ~10fps = 100ms interval
      if (ts - lastFrame >= 90) {
        draw(ts);
        lastFrame = ts;
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw]);

  /* ── Resize observer ────────────────────────────────────────────── */
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.scale(dpr, dpr);
        sizeRef.current = { w: width, h: height };
      }
    });

    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);

  /* ── Hit testing — click ────────────────────────────────────────── */
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let nearest: (typeof hittableRef.current)[0] | null = null;
      let nearestDist = 20;

      for (const h of hittableRef.current) {
        const d = Math.hypot(h.x - mx, h.y - my);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = h;
        }
      }

      if (nearest) {
        onObjectSelect(nearest.obj);
      }
    },
    [onObjectSelect]
  );

  /* ── Hit testing — hover tooltip ────────────────────────────────── */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let nearest: (typeof hittableRef.current)[0] | null = null;
      let nearestDist = 20;

      for (const h of hittableRef.current) {
        const d = Math.hypot(h.x - mx, h.y - my);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = h;
        }
      }

      if (nearest) {
        setTooltip({
          text: nearest.label,
          x: e.clientX - (wrapperRef.current?.getBoundingClientRect().left ?? 0),
          y: e.clientY - (wrapperRef.current?.getBoundingClientRect().top ?? 0),
        });
        canvas.style.cursor = "pointer";
      } else {
        setTooltip(null);
        canvas.style.cursor = "default";
      }
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div ref={wrapperRef} className="relative w-full h-full select-none">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="block w-full h-full"
      />

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-50 px-2 py-1 rounded text-[10px] font-mono
            bg-[#0c1225]/95 text-[#ededed] border border-[#1a2744] shadow-lg whitespace-nowrap"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 8,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
