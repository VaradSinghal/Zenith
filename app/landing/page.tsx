"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Inter, Space_Mono } from "next/font/google";
import { useRouter } from "next/navigation";
import { parseTLEBlock } from "@/lib/propagate";

const inter = Inter({ subsets: ["latin"], weight: ["300", "400"] });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400"] });

export default function LandingPage() {
  const router = useRouter();

  const starCanvasRef = useRef<HTMLCanvasElement>(null);
  const threeContainerRef = useRef<HTMLDivElement>(null);
  const spokesCanvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const isWarpingRef = useRef(false);

  const [tleCount, setTleCount] = useState<number | null>(null);
  const [utcTime, setUtcTime] = useState<string>('');
  const [warping, setWarping] = useState(false);

  // Stats Fetching & Clock
  useEffect(() => {
    fetch('/api/tle?group=visual')
      .then(res => res.text())
      .then(text => {
        const parsed = parseTLEBlock(text);
        setTleCount(parsed.length);
      })
      .catch(console.error);

    const interval = setInterval(() => {
      setUtcTime(new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // LAYER 1: Starfield (Canvas 2D)
  useEffect(() => {
    const canvas = starCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    interface Star {
      x: number; y: number;
      baseOpacity: number;
      twinkleSpeed: number;
      twinklePhase: number;
      radius: number;
      color: string;
      layer: 'A' | 'B' | 'C';
    }

    const stars: Star[] = [];
    const colors = [
      '255, 255, 255', // pure white
      '240, 240, 240', // slightly dim white
      '200, 200, 200', // grey
    ];

    const addStars = (count: number, rMin: number, rMax: number, oMin: number, oMax: number, layer: 'A' | 'B' | 'C') => {
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          baseOpacity: oMin + Math.random() * (oMax - oMin),
          twinkleSpeed: 0.2 + Math.random() * 0.5,
          twinklePhase: Math.random() * Math.PI * 2,
          radius: rMin + Math.random() * (rMax - rMin),
          color: colors[Math.floor(Math.random() * colors.length)],
          layer
        });
      }
    }

    addStars(500, 0.3, 0.6, 0.1, 0.4, 'A');
    addStars(150, 0.5, 0.8, 0.3, 0.6, 'B');
    addStars(40, 0.8, 1.2, 0.5, 0.9, 'C');

    let animationFrameId: number;

    const render = () => {

      mouse.current.x += (mouse.current.targetX - mouse.current.x) * 0.04;
      mouse.current.y += (mouse.current.targetY - mouse.current.y) * 0.04;

      // Only render this overlay canvas when warping
      if (!isWarpingRef.current) {
        ctx.clearRect(0, 0, width, height);
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      stars.forEach(s => {
        // If already offscreen, skip — don't respawn
        if (s.x < -50 || s.x > width + 50 || s.y < -50 || s.y > height + 50) return;

        const dx = s.x - width / 2;
        const dy = s.y - height / 2;
        s.x += dx * 0.018;
        s.y += dy * 0.018;

        const streakLen = 0.35;
        ctx.beginPath();
        ctx.moveTo(s.x - dx * streakLen, s.y - dy * streakLen);
        ctx.lineTo(s.x, s.y);
        ctx.strokeStyle = `rgba(${s.color}, 0.9)`;
        ctx.lineWidth = s.radius * 2;
        ctx.stroke();
      });

      animationFrameId = requestAnimationFrame(render);
    }

    animationFrameId = requestAnimationFrame(render);

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    }
  }, []);

  // LAYER 2: Three.js Earth
  useEffect(() => {
    if (!threeContainerRef.current) return;
    const container = threeContainerRef.current;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 7);
    camera.lookAt(0, -1.5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    const textureLoader = new THREE.TextureLoader();

    // Earth Sphere
    const earthGeo = new THREE.SphereGeometry(4.2, 128, 128);
    const earthMat = new THREE.MeshPhongMaterial({
      map: textureLoader.load('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg'),
      bumpMap: textureLoader.load('//unpkg.com/three-globe/example/img/earth-topology.png'),
      bumpScale: 0.08,
      specularMap: textureLoader.load('//unpkg.com/three-globe/example/img/earth-water.png'),
      specular: new THREE.Color(0x333333),
      shininess: 15
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthMesh.position.set(0, -3.8, 0);
    scene.add(earthMesh);

    // Atmosphere Glow
    const atmosphereGeo = new THREE.SphereGeometry(4.42, 128, 128);
    const atmosphereMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 4.0);
          gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0) * intensity * 0.8;
        }
      `
    });
    const atmosphereMesh = new THREE.Mesh(atmosphereGeo, atmosphereMat);
    atmosphereMesh.position.set(0, -3.8, 0);
    scene.add(atmosphereMesh);

    // Cloud Layer
    const cloudGeo = new THREE.SphereGeometry(4.24, 64, 64);
    const cloudMat = new THREE.MeshPhongMaterial({
      map: textureLoader.load('//unpkg.com/three-globe/example/img/earth-clouds.png'),
      transparent: true,
      opacity: 0.2,
      depthWrite: false
    });
    const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    cloudMesh.position.set(0, -3.8, 0);
    scene.add(cloudMesh);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.05));

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(-8, 4, 6);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.1);
    dirLight2.position.set(8, -4, -6);
    scene.add(dirLight2);

    let animationFrameId: number;
    let currentOpacity = 1.0;

    const render = () => {
      animationFrameId = requestAnimationFrame(render);

      if (isWarpingRef.current) {
        camera.position.z -= (camera.position.z - 0) * 0.07;
        earthMesh.rotation.y += 0.006;
        cloudMesh.rotation.y += 0.006;
        currentOpacity -= 0.03;
        renderer.domElement.style.opacity = Math.max(0, currentOpacity).toString();
      } else {
        earthMesh.rotation.y += 0.001;
        cloudMesh.rotation.y += 0.0012;
      }

      renderer.render(scene, camera);
    };
    render();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    const handleMouseMove = (e: MouseEvent) => {
      mouse.current.targetX = (e.clientX - window.innerWidth / 2) / window.innerWidth;
      mouse.current.targetY = (e.clientY - window.innerHeight / 2) / window.innerHeight;
    };
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      container.removeChild(renderer.domElement);
      renderer.dispose();
      earthGeo.dispose();
      earthMat.dispose();
      cloudGeo.dispose();
      cloudMat.dispose();
      atmosphereGeo.dispose();
      atmosphereMat.dispose();
    };
  }, []);

  // LAYER 1.5: xAI Spokes (Canvas 2D)
  useEffect(() => {
    const canvas = spokesCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    interface Spoke {
      angle: number;
      length: number;
      speed: number;
      hasNode: boolean;
      size: number;
      opacity: number;
    }

    const spokes: Spoke[] = [];
    for (let i = 0; i < 120; i++) {
      spokes.push({
        angle: Math.random() * Math.PI * 2,
        length: 50 + Math.random() * (Math.max(width, height) * 0.6),
        speed: (Math.random() - 0.5) * 0.0005,
        hasNode: Math.random() > 0.4,
        size: 1 + Math.random() * 2,
        opacity: 0.1 + Math.random() * 0.6
      });
    }

    let animationFrameId: number;
    let rotation = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      rotation += 0.0005; // very slow global rotation

      const cx = width / 2;
      const cy = height / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);

      ctx.lineWidth = 0.5;

      spokes.forEach(spoke => {
        spoke.angle += spoke.speed;
        const x = Math.cos(spoke.angle) * spoke.length;
        const y = Math.sin(spoke.angle) * spoke.length;

        // Draw line
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(x, y);
        const grad = ctx.createLinearGradient(0, 0, x, y);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.0)');
        grad.addColorStop(1, `rgba(255, 255, 255, ${spoke.opacity * 0.5})`);
        ctx.strokeStyle = grad;
        ctx.stroke();

        // Draw node
        if (spoke.hasNode) {
          ctx.fillStyle = `rgba(255, 255, 255, ${spoke.opacity})`;
          ctx.fillRect(x - spoke.size / 2, y - spoke.size / 2, spoke.size, spoke.size);
        }
      });

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };
    render();

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleEnter = () => {
    if (warping) return;
    setWarping(true);
    isWarpingRef.current = true;

    // Navigate after warp animation plays out
    setTimeout(() => router.push('/observatory'), 1800);
  };

  return (
    <div className="relative w-full min-h-[200vh] bg-[#0c0c0b] text-[#ffffff] selection:bg-white selection:text-black">
      <style dangerouslySetInnerHTML={{
        __html: `
        html, body { margin: 0; padding: 0; background: #0c0c0b; }
        
        .anim-fade-in { animation: fadeIn 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; transform: translateY(16px); }
        .anim-delay-1 { animation-delay: 0.2s; }
        .anim-delay-2 { animation-delay: 0.4s; }
        .anim-delay-3 { animation-delay: 0.6s; }
        
        .anim-btn { animation: simpleFade 1.5s ease forwards; opacity: 0; animation-delay: 1.0s; }
        .anim-stats { animation: simpleFade 1.5s ease forwards; opacity: 0; animation-delay: 1.4s; }

        @keyframes fadeIn { to { opacity: 1; transform: translateY(0); } }
        @keyframes simpleFade { to { opacity: 1; } }

        .glass-pill {
          position: relative;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          padding: 16px 40px;
          border-radius: 100px;
          cursor: pointer;
          overflow: hidden;
          transition: all 0.4s ease;
        }
        .glass-pill:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.3);
          box-shadow: 0 0 30px rgba(255, 255, 255, 0.05);
        }

        .glass-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-radius: 24px;
          transition: all 0.4s ease;
        }
        .glass-card:hover {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .earth-mask {
          -webkit-mask-image: linear-gradient(to top, transparent 0%, black 15%);
          mask-image: linear-gradient(to top, transparent 0%, black 15%);
        }

        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}} />

      {/* Warp Streak Overlay (only visible during warp) */}
      <canvas ref={starCanvasRef} className="fixed inset-0 z-[2] pointer-events-none" />

      {/* Warp Status Text (fades in during warp) */}
      <div className={`fixed bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-[100] transition-opacity duration-1000 delay-300 ${warping ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="text-[11px] font-mono tracking-[0.2em] text-white/50 uppercase animate-pulse">
          Establishing Link...
        </div>
        <div className="w-48 h-[1px] bg-white/10 overflow-hidden rounded-full">
          <div className="h-full bg-white/40 rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]"
            style={{ width: '40%' }} />
        </div>
      </div>

      {/* LAYER 3: HTML Overlay */}
      <div className={`relative z-10 w-full transition-opacity duration-500 ${warping ? 'opacity-0' : 'opacity-100'}`}>

        {/* HERO SECTION */}
        <section className="relative w-full h-screen pointer-events-none overflow-hidden">
          {/* Earth Canvas inside Hero section so it scrolls away */}
          <div ref={threeContainerRef} className="absolute inset-0 z-[1] pointer-events-none earth-mask" />

          {/* TOP LEFT */}
          <div className="absolute z-10 top-12 left-12 md:top-20 md:left-24 pointer-events-auto">

            <div className={`${inter.className} anim-fade-in anim-delay-1 text-[10px] tracking-[0.25em] text-[#7d8187] mb-8 uppercase`}>
              AARUUSH &apos;26 &nbsp;·&nbsp; ASTRALWEB INNOVATE &nbsp;·&nbsp; ROUND 2
            </div>

            <h1
              className={`${inter.className} anim-fade-in anim-delay-2 font-light text-white mb-6 leading-[0.95] tracking-tight`}
              style={{ fontSize: "clamp(48px, 8vw, 120px)" }}
            >
              Project<br />Zenith
            </h1>

            <div className={`${inter.className} anim-fade-in anim-delay-3 text-[13px] tracking-[0.3em] text-[#ffffff] opacity-80 mb-10 uppercase`}>
              The Celestial Eye
            </div>

            <p className={`${inter.className} anim-fade-in anim-delay-3 text-[16px] leading-[1.8] text-[#7d8187] max-w-md font-light mb-16`}>
              Real-time cosmic radar. Every satellite, planet, and constellation above any point on Earth — live.
            </p>

            <div className="anim-btn pointer-events-auto">
              <button className="glass-pill group flex items-center justify-center" onClick={handleEnter}>
                <span className={`${inter.className} relative z-10 text-[11px] tracking-[0.3em] uppercase text-white group-hover:text-black transition-colors duration-500`}>
                  Enter Observatory
                </span>
                <div className="absolute inset-0 bg-white scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500 ease-[cubic-bezier(0.19,1,0.22,1)]" />
              </button>
            </div>
          </div>

          {/* BOTTOM LEFT */}
          <div className="absolute bottom-12 left-12 md:bottom-16 md:left-24 anim-stats pointer-events-auto flex items-center gap-12">
            <div className="flex flex-col gap-2">
              <span className={`${inter.className} text-[18px] font-light text-white tracking-wide`}>
                {tleCount !== null ? tleCount.toLocaleString() : '---'}
              </span>
              <span className={`${inter.className} text-[10px] tracking-[0.2em] text-[#7d8187] uppercase`}>Satellites Tracked</span>
            </div>

            <div className="w-[1px] h-[32px] bg-[#1f2228]" />

            <div className="flex flex-col gap-2">
              <span className={`${inter.className} text-[18px] font-light text-white tracking-wide`}>413 KM</span>
              <span className={`${inter.className} text-[10px] tracking-[0.2em] text-[#7d8187] uppercase`}>ISS Altitude</span>
            </div>

            <div className="w-[1px] h-[32px] bg-[#1f2228]" />

            <div className="flex flex-col gap-2">
              <span className={`${inter.className} text-[18px] font-light text-white tracking-wide`}>0.0</span>
              <span className={`${inter.className} text-[10px] tracking-[0.2em] text-[#7d8187] uppercase`}>Kp Index</span>
            </div>
          </div>

          {/* BOTTOM RIGHT (SCROLL INDICATOR) */}
          <div className="absolute z-10 bottom-12 right-12 md:bottom-16 md:right-24 flex flex-col items-end">
            <div className={`${inter.className} text-right text-[10px] text-[#7d8187] tracking-[0.2em] mb-4 uppercase`}>
              {utcTime || '--:--:-- UTC'}
            </div>
            <div className="relative w-[1px] h-[64px] bg-[#1f2228] overflow-hidden opacity-60">
              <div className="absolute top-0 left-0 w-full h-[16px] bg-white sliding-dot" style={{ animationDuration: '2s' }} />
            </div>
            <div className={`${inter.className} text-[10px] text-[#7d8187] tracking-[0.2em] uppercase mt-4`}>
              Scroll to explore
            </div>
          </div>
        </section>

        {/* SCROLLABLE CONTENT SECTION */}
        <section className="relative w-full z-20 bg-gradient-to-b from-transparent via-[#0c0c0b] to-[#0c0c0b]">
          {/* Spokes Canvas - sticky so it stays in viewport while scrolling features */}
          <div className="sticky top-0 w-full h-screen z-0 pointer-events-none">
            <canvas ref={spokesCanvasRef} className="absolute inset-0 w-full h-full" />

            {/* Title fixed in the center of the spokes */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-16 md:gap-32">
                <span className={`${inter.className} text-white font-light tracking-wide text-2xl md:text-4xl`}>Understand</span>
                <span className={`${inter.className} text-white font-light tracking-wide text-2xl md:text-4xl`}>The Universe</span>
              </div>
            </div>
          </div>

          <div className="relative z-10 max-w-6xl mx-auto space-y-32 px-6 pb-32 md:px-24 md:pb-48 -mt-[50vh]">

            {/* Feature 1 */}
            <div className="glass-card p-12 md:p-24 w-full md:w-2/3 ml-auto">
              <div className={`${spaceMono.className} text-[#474747] text-[10px] tracking-[0.2em] uppercase mb-6`}>01 / SGP4 Propagation</div>
              <h2 className={`${inter.className} text-3xl md:text-5xl mb-8 font-light tracking-tight text-white leading-tight`}>
                Real-Time Orbital Mechanics
              </h2>
              <p className={`${inter.className} text-[#7d8187] leading-[1.8] text-[16px] font-light max-w-xl`}>
                Project Zenith doesn&apos;t rely on static data or artificial animations. It fetches live Two-Line Element (TLE) sets from NORAD and propagates the exact positions of over 4,000 active satellites using standard SGP4 orbital mathematical models directly in your browser.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="glass-card p-12 md:p-24 w-full md:w-2/3">
              <div className={`${spaceMono.className} text-[#474747] text-[10px] tracking-[0.2em] uppercase mb-6`}>02 / Hemispherical Dome</div>
              <h2 className={`${inter.className} text-3xl md:text-5xl mb-8 font-light tracking-tight text-white leading-tight`}>
                The Complete Celestial Sphere
              </h2>
              <p className={`${inter.className} text-[#7d8187] leading-[1.8] text-[16px] font-light max-w-xl`}>
                Transform any location on Earth into a personal observatory. The interactive sky dome projects satellites, planets, and all 88 IAU constellations onto a dynamic azimuthal grid, allowing you to track objects exactly as they appear above your head.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="glass-card p-12 md:p-24 w-full md:w-2/3 mx-auto text-center">
              <div className={`${spaceMono.className} text-[#474747] text-[10px] tracking-[0.2em] uppercase mb-6`}>03 / AI Integration</div>
              <h2 className={`${inter.className} text-3xl md:text-5xl mb-8 font-light tracking-tight text-white leading-tight`}>
                Natural Language Sky Briefings
              </h2>
              <p className={`${inter.className} text-[#7d8187] leading-[1.8] text-[16px] font-light max-w-2xl mx-auto mb-16`}>
                Raw telemetry data is complex. Zenith utilizes Google Gemini 2.5 Flash to analyze current overhead traffic, planet positions, and upcoming passes to generate highly readable, human-friendly sky-watching guides for any specific observer location.
              </p>

              <button className="glass-pill group inline-flex items-center justify-center" onClick={handleEnter}>
                <span className={`${inter.className} relative z-10 text-[11px] tracking-[0.3em] uppercase text-white group-hover:text-black transition-colors duration-500`}>
                  Initialize Link
                </span>
                <div className="absolute inset-0 bg-white scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500 ease-[cubic-bezier(0.19,1,0.22,1)]" />
              </button>
            </div>

          </div>
        </section>

      </div>
    </div>
  );
}
