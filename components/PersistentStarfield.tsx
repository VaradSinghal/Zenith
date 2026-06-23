"use client";

import { useEffect, useRef } from "react";

export default function PersistentStarfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    interface Star {
      x: number;
      y: number;
      r: number;
      baseO: number;
      twinkleSpeed: number;
      phase: number;
      color: string;
    }

    const stars: Star[] = [];
    const colors = ["255,255,255", "240,240,240", "210,215,230"];

    for (let i = 0; i < 500; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.3 + Math.random() * 1.0,
        baseO: 0.15 + Math.random() * 0.6,
        twinkleSpeed: 0.3 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let frameId: number;

    const render = (time: number) => {
      const t = time / 1000;
      ctx.clearRect(0, 0, w, h);

      stars.forEach((s) => {
        const opacity =
          s.baseO + Math.sin(t * s.twinkleSpeed + s.phase) * s.baseO * 0.35;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.color},${Math.max(0, opacity)})`;
        ctx.fill();
      });

      frameId = requestAnimationFrame(render);
    };
    frameId = requestAnimationFrame(render);

    const onResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      // Redistribute stars on resize
      stars.forEach((s) => {
        s.x = Math.random() * w;
        s.y = Math.random() * h;
      });
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
