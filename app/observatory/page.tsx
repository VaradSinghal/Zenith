'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Space_Mono, Space_Grotesk } from 'next/font/google';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getPlanetPositions } from '@/lib/planets';
import { propagateAll, parseTLEBlock, SatelliteRecord } from '@/lib/propagate';
import { getConstellationLines } from '@/lib/constellations';

const spaceMono = Space_Mono({ weight: ['400', '700'], subsets: ['latin'] });
const spaceGrotesk = Space_Grotesk({ weight: ['300', '400', '600', '700'], subsets: ['latin'] });

/* ─── Math helpers ───────────────────────────────────────────────── */
const D2R = Math.PI / 180;
const d2r = (d: number) => d * D2R;

/** Greenwich Apparent Sidereal Time → degrees */
function getGAST(date: Date): number {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T  = (jd - 2451545.0) / 36525.0;
  let   g  = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
            + 0.000387933 * T * T - (T * T * T) / 38710000.0;
  return ((g % 360) + 360) % 360;
}

/**
 * Equatorial (RA h, Dec °) → Three.js Vector3 on sphere of given radius.
 * The celestial sphere is set up so:
 *   +Y = North Celestial Pole
 *   RA=0h, Dec=0 points along +X at LST=0
 */
function eqToVec(raHours: number, decDeg: number, r: number): THREE.Vector3 {
  const ra  = d2r(raHours * 15);
  const dec = d2r(decDeg);
  return new THREE.Vector3(
    r * Math.cos(dec) * Math.cos(ra),
    r * Math.sin(dec),
   -r * Math.cos(dec) * Math.sin(ra)
  );
}

/**
 * Horizon (Az °, El °) → Three.js Vector3.
 * Az=0→N, 90→E, 180→S, 270→W.
 * We use a right-handed Y-up local frame:
 *   +Z = North,  +X = East,  +Y = Up (zenith)
 */
function azElToVec(azDeg: number, elDeg: number, r: number): THREE.Vector3 {
  const az = d2r(azDeg);
  const el = d2r(elDeg);
  return new THREE.Vector3(
     r * Math.cos(el) * Math.sin(az),   // East component → X
     r * Math.sin(el),                   // Up component  → Y
     r * Math.cos(el) * Math.cos(az)    // North component → Z (we'll negate below)
  ).multiplyScalar(1).setZ(-r * Math.cos(el) * Math.cos(az));
  // Actually just write cleanly:
}

// Clean version used everywhere:
function horVec(azDeg: number, elDeg: number, r: number): THREE.Vector3 {
  const az = d2r(azDeg);
  const el = d2r(elDeg);
  return new THREE.Vector3(
    r * Math.cos(el) * Math.sin(az),   // +X = East
    r * Math.sin(el),                   // +Y = Up
   -r * Math.cos(el) * Math.cos(az)   // -Z = South → camera looks -Z by default
  );
}

/* ─── Types ──────────────────────────────────────────────────────── */
interface NominatimResult { display_name: string; lat: string; lon: string }
interface ObserverLoc     { name: string; lat: number; lon: number }

/* ═══════════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════════ */
export default function ObservatoryPage() {
  const router = useRouter();

  /* ── UI state ── */
  const [phase,     setPhase]     = useState<'setup' | 'sky'>('setup');
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState<NominatimResult[]>([]);
  const [selLoc,    setSelLoc]    = useState<ObserverLoc | null>(null);
  const [observer,  setObserver]  = useState({ lat: 28.61, lon: 77.21 }); // New Delhi default

  /* ── Sky layer toggles ── */
  const [showSat,   setShowSat]   = useState(true);
  const [showPlanet,setShowPlanet]= useState(true);
  const [showConst, setShowConst] = useState(true);
  const [showGrid,  setShowGrid]  = useState(false);
  const [showGround,setShowGround]= useState(true);
  const [showAtm,   setShowAtm]   = useState(true);

  /* ── Sim time ── */
  const [playing,   setPlaying]   = useState(true);
  const [timeOffset,setTimeOffset]= useState(0); // minutes
  const simTimeRef  = useRef(Date.now());
  const [dispTime,  setDispTime]  = useState('');

  /* ── Data ── */
  const [tles, setTles]           = useState<SatelliteRecord[]>([]);
  const [starsLoaded, setStarsLoaded] = useState(false);

  /* ── Three.js refs ── */
  const mountRef        = useRef<HTMLDivElement>(null);
  const labelsRef       = useRef<HTMLCanvasElement>(null);
  const rendererRef     = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef        = useRef<THREE.Scene | null>(null);
  const cameraRef       = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef     = useRef<OrbitControls | null>(null);
  const rafRef          = useRef<number>(0);

  // Layer groups
  const starSphereRef   = useRef<THREE.Group | null>(null); // rotates with sidereal time
  const constGroupRef   = useRef<THREE.Group | null>(null); // same rotation
  const satGroupRef     = useRef<THREE.Group | null>(null); // AzEl, rebuilt each frame
  const planetGroupRef  = useRef<THREE.Group | null>(null); // AzEl, rebuilt each frame
  const groundRef       = useRef<THREE.Mesh | null>(null);
  const atmRef          = useRef<THREE.Mesh | null>(null);
  const gridGroupRef    = useRef<THREE.Group | null>(null);
  const milkyWayRef     = useRef<THREE.Points | null>(null);

  /* ── Selected object ── */
  const [selectedObj, setSelectedObj] = useState<{
    name: string; type: string; az: number; el: number;
    alt?: number; vel?: number; period?: number; mag?: number;
  } | null>(null);

  /* ─────────────────────────────────────────────────────────────────
     Fetch TLEs + stars once
     ───────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const groups = ['stations', 'visual', 'starlink', 'gps-ops', 'weather'];
    Promise.all(
      groups.map(g =>
        fetch(`/api/tle?group=${g}`)
          .then(r => r.text())
          .catch(() => '')
      )
    ).then(texts => {
      const combined = texts.join('\n');
      setTles(parseTLEBlock(combined));
    });
  }, []);

  /* ─────────────────────────────────────────────────────────────────
     Nominatim search
     ───────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!query || selLoc) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`,
          { headers: { 'Accept-Language': 'en' } }
        );
        setResults(await r.json());
      } catch { /* ignore */ }
    }, 450);
    return () => clearTimeout(t);
  }, [query, selLoc]);

  /* ─────────────────────────────────────────────────────────────────
     Clock
     ───────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const id = setInterval(() => {
      if (playing) simTimeRef.current = Date.now() + timeOffset * 60000;
      const d = new Date(simTimeRef.current);
      setDispTime(
        d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) +
        '  ' +
        d.toLocaleTimeString('en-GB', { hour12: false }) +
        ' UTC'
      );
    }, 1000);
    return () => clearInterval(id);
  }, [playing, timeOffset]);

  /* ─────────────────────────────────────────────────────────────────
     Three.js setup — runs once when phase becomes 'sky'
     ───────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (phase !== 'sky' || !mountRef.current || !labelsRef.current) return;

    const W = window.innerWidth;
    const H = window.innerHeight;
    const DPR = Math.min(window.devicePixelRatio, 2);

    /* ── Renderer ── */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x000005, 1);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    /* ── Scene ── */
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    /* ── Camera — inside the celestial sphere, at origin ── */
    const camera = new THREE.PerspectiveCamera(65, W / H, 0.01, 2000);
    camera.position.set(0, 0.5, 0); // slightly above ground
    cameraRef.current = camera;

    /* ── OrbitControls ── */
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan     = false;
    controls.enableZoom    = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.rotateSpeed   = -0.4;  // negative → drag sky naturally
    controls.zoomSpeed     = 0.7;
    controls.minDistance   = 0.01;
    controls.maxDistance   = 0.5;
    controls.target.set(0, 0.2, -1); // look toward south horizon initially
    controls.update();
    controlsRef.current = controls;

    /* ── Labels canvas ── */
    const lc  = labelsRef.current;
    lc.width  = W * DPR;
    lc.height = H * DPR;
    lc.style.width  = `${W}px`;
    lc.style.height = `${H}px`;
    const ctx = lc.getContext('2d')!;
    ctx.scale(DPR, DPR);

    /* ════════════════════════════════════════
       1. STAR SPHERE (RA/Dec space, radius 900)
       rotated every frame to match LST + latitude
       ════════════════════════════════════════ */
    const starSphere = new THREE.Group();
    scene.add(starSphere);
    starSphereRef.current = starSphere;

    // Load star catalog JSON from /public/stars.json
    const R_STAR = 900;
    fetch('/stars.json')
      .then(r => r.json())
      .then((data: { features: Array<{ geometry: { coordinates: [number,number] }, properties: { mag: number, bv: string } }> }) => {
        const pos: number[] = [], col: number[] = [], sz: number[] = [];
        for (const f of data.features) {
          const [ra, dec] = f.geometry.coordinates;
          const mag = f.properties.mag;
          const bv  = parseFloat(f.properties.bv) || 0;
          if (mag > 6.5) continue; // skip very faint

          const v = eqToVec(ra, dec, R_STAR);
          pos.push(v.x, v.y, v.z);

          // Spectral colour from B-V index
          let r = 1, g = 1, b = 1;
          if      (bv < -0.3) { r=0.67; g=0.77; b=1.00 }
          else if (bv <  0.0) { r=0.80; g=0.90; b=1.00 }
          else if (bv <  0.3) { r=0.95; g=0.97; b=1.00 }
          else if (bv <  0.6) { r=1.00; g=0.99; b=0.90 }
          else if (bv <  1.0) { r=1.00; g=0.90; b=0.70 }
          else if (bv <  1.5) { r=1.00; g=0.75; b=0.50 }
          else                { r=1.00; g=0.60; b=0.40 }
          col.push(r, g, b);

          const brightness = Math.max(0.5, (7 - mag) * 0.9);
          sz.push(brightness);
        }

        const g3 = new THREE.BufferGeometry();
        g3.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g3.setAttribute('color',    new THREE.Float32BufferAttribute(col, 3));
        g3.setAttribute('size',     new THREE.Float32BufferAttribute(sz,  1));

        const starMat = new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0.0 } },
          vertexShader: `
            attribute float size;
            attribute vec3  color;
            varying   vec3  vCol;
            uniform   float uTime;
            void main() {
              vCol = color;
              float tw = sin(uTime * 2.0 + position.x * 13.7 + position.z * 9.3) * 0.18;
              vec4 mv = modelViewMatrix * vec4(position, 1.0);
              gl_PointSize = max(0.8, size * (1.0 + tw)) * (300.0 / -mv.z);
              gl_Position  = projectionMatrix * mv;
            }
          `,
          fragmentShader: `
            varying vec3 vCol;
            void main() {
              float d = length(gl_PointCoord - 0.5);
              if (d > 0.5) discard;
              float a = smoothstep(0.5, 0.0, d);
              gl_FragColor = vec4(vCol, a);
            }
          `,
          transparent: true,
          blending:    THREE.AdditiveBlending,
          depthWrite:  false,
          vertexColors: true,
        });

        starSphere.add(new THREE.Points(g3, starMat));
        setStarsLoaded(true);
      })
      .catch(() => {
        // Procedural fallback if stars.json missing
        const pos: number[] = [], col: number[] = [], sz: number[] = [];
        for (let i = 0; i < 4000; i++) {
          const ra  = Math.random() * 24;
          const dec = (Math.asin(Math.random() * 2 - 1)) / D2R;
          const v   = eqToVec(ra, dec, R_STAR);
          pos.push(v.x, v.y, v.z);
          const t = Math.random();
          col.push(0.7 + t * 0.3, 0.7 + t * 0.3, 0.85 + t * 0.15);
          sz.push(0.4 + Math.random() * 1.8);
        }
        const g3 = new THREE.BufferGeometry();
        g3.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g3.setAttribute('color',    new THREE.Float32BufferAttribute(col, 3));
        g3.setAttribute('size',     new THREE.Float32BufferAttribute(sz,  1));
        const mat = new THREE.PointsMaterial({
          size: 0.8, vertexColors: true, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false,
        });
        starSphere.add(new THREE.Points(g3, mat));
        setStarsLoaded(true);
      });

    /* ════════════════════════════════════════
       2. MILKY WAY (equatorial coords, same sphere)
       ════════════════════════════════════════ */
    {
      const mwPos: number[] = [], mwCol: number[] = [], mwSz: number[] = [];
      // Distribute 6000 points along the galactic plane (l=0..360, b=gaussian around 0)
      for (let i = 0; i < 6000; i++) {
        // Galactic longitude
        const l = Math.random() * 360;
        // Galactic latitude – gaussian, σ≈8° for the dense band
        const b = (Math.random() + Math.random() + Math.random() - 1.5) * 8;
        // Convert galactic → equatorial (J2000 approx)
        // Galactic north pole: RA=192.85948°, Dec=27.12825°, l_NCP=122.93192°
        const lR = d2r(l), bR = d2r(b);
        const poleRA = d2r(192.85948), poleDec = d2r(27.12825);
        const sinDec = Math.sin(bR)*Math.sin(poleDec) + Math.cos(bR)*Math.cos(poleDec)*Math.cos(d2r(122.93192)-lR);
        const dec = Math.asin(sinDec);
        const cosRA = (Math.cos(bR)*Math.sin(d2r(122.93192)-lR)) / Math.cos(dec);
        const sinRA = (Math.cos(bR)*Math.cos(poleDec)*Math.sin(bR) - Math.sin(bR)*Math.sin(poleDec)*Math.cos(dec)) / Math.cos(dec);
        const ra = Math.atan2(sinRA, cosRA) / D2R + 192.85948;
        const raH = ((ra % 360) + 360) % 360 / 15;
        const decD = dec / D2R;

        const v = eqToVec(raH, decD, R_STAR - 5);
        mwPos.push(v.x, v.y, v.z);

        // Core region brighter (l near 0° = galactic centre)
        const distFromCore = Math.min(Math.abs(l), 360 - Math.abs(l));
        const brightness = 0.04 + (1 - distFromCore / 180) * 0.12;
        const warmth = 0.85 + Math.random() * 0.15;
        mwCol.push(warmth * brightness * 5, warmth * brightness * 4.5, brightness * 5);
        mwSz.push(0.8 + Math.random() * 1.2);
      }
      const mwGeo = new THREE.BufferGeometry();
      mwGeo.setAttribute('position', new THREE.Float32BufferAttribute(mwPos, 3));
      mwGeo.setAttribute('color',    new THREE.Float32BufferAttribute(mwCol, 3));
      mwGeo.setAttribute('size',     new THREE.Float32BufferAttribute(mwSz,  1));
      const mwMat = new THREE.PointsMaterial({
        size: 1.5, vertexColors: true, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false,
      });
      const mw = new THREE.Points(mwGeo, mwMat);
      starSphere.add(mw); // part of the rotating star sphere
      milkyWayRef.current = mw;
    }

    /* ════════════════════════════════════════
       3. CONSTELLATION LINES (equatorial, on star sphere)
       ════════════════════════════════════════ */
    const constGroup = new THREE.Group();
    starSphere.add(constGroup); // child of starSphere → rotates automatically!
    constGroupRef.current = constGroup;

    /* ════════════════════════════════════════
       4. SATELLITES & PLANETS (AzEl, rebuilt each frame)
       ════════════════════════════════════════ */
    const satGroup = new THREE.Group();
    scene.add(satGroup);
    satGroupRef.current = satGroup;

    const planetGroup = new THREE.Group();
    scene.add(planetGroup);
    planetGroupRef.current = planetGroup;

    /* ════════════════════════════════════════
       5. GROUND — flat disc + silhouette hills
       ════════════════════════════════════════ */
    // Main ground disc
    const groundGeo = new THREE.CylinderGeometry(700, 700, 1, 128, 1);
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x050a0f });
    const ground    = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.5;
    scene.add(ground);
    groundRef.current = ground;

    // Horizon silhouette ring (jagged city/mountain outline)
    {
      const hPoints: THREE.Vector3[] = [];
      const SEGS = 256;
      for (let i = 0; i <= SEGS; i++) {
        const az = (i / SEGS) * Math.PI * 2;
        // Slight random elevation for a city skyline feel
        const noise = Math.sin(az * 7.3) * 0.012 + Math.sin(az * 13.1) * 0.007
                    + Math.sin(az * 23.7) * 0.004 + Math.random() * 0.003;
        const el = -0.01 + noise; // just below/above horizon
        const r  = 600;
        hPoints.push(new THREE.Vector3(r * Math.sin(az), r * el, -r * Math.cos(az)));
      }
      // Close it
      hPoints.push(hPoints[0].clone());
      const hGeo = new THREE.BufferGeometry().setFromPoints(hPoints);
      const hMat = new THREE.LineBasicMaterial({ color: 0x0a1520, linewidth: 2 });
      scene.add(new THREE.Line(hGeo, hMat));

      // Fill below horizon with solid dark disc visible from inside
      const fillGeo = new THREE.CircleGeometry(700, 128);
      const fillMat = new THREE.MeshBasicMaterial({ color: 0x020508, side: THREE.DoubleSide });
      const fill    = new THREE.Mesh(fillGeo, fillMat);
      fill.rotation.x = -Math.PI / 2;
      fill.position.y = -0.02;
      scene.add(fill);
    }

    /* ════════════════════════════════════════
       6. ATMOSPHERE GLOW (above horizon only)
       ════════════════════════════════════════ */
    const atmGeo = new THREE.SphereGeometry(850, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const atmMat = new THREE.ShaderMaterial({
      side:         THREE.BackSide,
      transparent:  true,
      depthWrite:   false,
      vertexShader: `
        varying float vY;
        void main() {
          vY = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vY;
        void main() {
          // Bright horizon glow, fades to transparent overhead
          float h    = clamp(vY, 0.0, 1.0);
          float glow = pow(1.0 - h, 4.0);
          // Horizon colour: mix of deep blue and teal
          vec3 horizCol = mix(vec3(0.05, 0.15, 0.35), vec3(0.01, 0.05, 0.12), h);
          gl_FragColor  = vec4(horizCol, glow * 0.65);
        }
      `,
    });
    const atm = new THREE.Mesh(atmGeo, atmMat);
    scene.add(atm);
    atmRef.current = atm;

    /* ════════════════════════════════════════
       7. AZIMUTH / ALTITUDE GRID
       ════════════════════════════════════════ */
    const gridGroup = new THREE.Group();
    scene.add(gridGroup);
    gridGroupRef.current = gridGroup;

    const gridMat = new THREE.LineBasicMaterial({
      color: 0x1a4060, transparent: true, opacity: 0.25,
    });
    // Altitude circles every 15°
    for (let el = 15; el <= 75; el += 15) {
      const pts: THREE.Vector3[] = [];
      for (let az = 0; az <= 360; az += 3) pts.push(horVec(az, el, 800));
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    // Azimuth spokes every 15°
    for (let az = 0; az < 360; az += 15) {
      const pts = [horVec(az, 0, 800), horVec(az, 90, 800)];
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }

    /* ════════════════════════════════════════
       RENDER LOOP
       ════════════════════════════════════════ */
    let lastT = performance.now();

    const animate = (t: number) => {
      rafRef.current = requestAnimationFrame(animate);
      const dt = t - lastT; lastT = t;

      if (playing) simTimeRef.current = Date.now() + timeOffset * 60000;
      const now  = new Date(simTimeRef.current);
      const obs  = { lat: observer.lat, lon: observer.lon };

      controls.update();

      /* ── Rotate star sphere to match sidereal time + latitude ──
         The star sphere is built in equatorial coords (RA/Dec).
         To make the right stars appear overhead:
         1. Tilt the pole: rotate X by (90° - lat)  → NCP at correct altitude
         2. Rotate Y by -LST                          → correct hour angle
      */
      if (starSphereRef.current) {
        const lst = getGAST(now) + obs.lon; // Local Sidereal Time in degrees
        const latR = d2r(obs.lat);
        starSphereRef.current.rotation.order = 'YXZ';
        starSphereRef.current.rotation.x = -(Math.PI / 2 - latR); // tilt for latitude
        starSphereRef.current.rotation.y = -d2r(lst);             // spin for LST
      }

      /* ── Update star twinkle time ── */
      if (starSphereRef.current?.children[0]) {
        const pts = starSphereRef.current.children[0] as THREE.Points;
        if ('uniforms' in (pts.material as THREE.ShaderMaterial)) {
          (pts.material as THREE.ShaderMaterial).uniforms.uTime.value = t * 0.001;
        }
      }

      /* ── Constellation lines (rebuilt every 5s is fine, but
             they auto-rotate with the star sphere, so we only
             need to build them once per observer change) ── */
      if (constGroupRef.current && constGroupRef.current.children.length === 0 && showConst) {
        buildConstellations(obs.lat, obs.lon, now);
      }

      /* ── Clear labels canvas ── */
      const lw = window.innerWidth, lh = window.innerHeight;
      ctx.clearRect(0, 0, lw, lh);

      /* ── Satellites (AzEl, rebuild each frame) ── */
      if (satGroupRef.current) {
        satGroupRef.current.clear();
        if (showSat && tles.length > 0) {
          const overhead = propagateAll(tles, obs, now).filter(s => s.el > 0);
          for (const s of overhead) {
            const pos   = horVec(s.az, s.el, 750);
            const isISS = s.type === 'iss';
            const col   = isISS ? 0x00ff88 : s.type === 'starlink' ? 0x4488ff : 0x88ccff;
            const sz    = isISS ? 5 : s.tier === 'naked' ? 3 : 1.5;

            // Sprite-like dot
            const geo = new THREE.CircleGeometry(sz, 8);
            const mat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
            const m   = new THREE.Mesh(geo, mat);
            m.position.copy(pos);
            m.lookAt(0, 0, 0);
            satGroupRef.current.add(m);

            // Label on canvas
            const sp = worldToScreen(pos, camera, lw, lh);
            if (sp) {
              ctx.font = isISS ? `bold 11px Space Mono, monospace` : `9px Space Mono, monospace`;
              ctx.fillStyle = isISS ? '#00ff88' : '#66aaff';
              ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 3;
              ctx.fillText(isISS ? '🛸 ISS' : s.name.split(' ')[0], sp.x + 8, sp.y - 4);
              ctx.shadowBlur = 0;
            }
          }
        }
      }

      /* ── Planets (AzEl, rebuild each frame) ── */
      if (planetGroupRef.current) {
        planetGroupRef.current.clear();
        if (showPlanet) {
          const planets = getPlanetPositions(obs, now);
          for (const p of planets) {
            if (p.el < -5) continue;
            const pos = horVec(p.az, p.el, 760);
            let col = 0xffffff, sz = 2.5;
            if (p.type === 'sun')       { col = 0xffee33; sz = 16 }
            else if (p.type === 'moon') { col = 0xddeeff; sz = 12 }
            else if (p.name === 'Venus')  { col = 0xffffcc; sz = 5 }
            else if (p.name === 'Jupiter')  { col = 0xffcc88; sz = 4.5 }
            else if (p.name === 'Mars')    { col = 0xff6644; sz = 4 }
            else if (p.name === 'Saturn')  { col = 0xeecc88; sz = 3.5 }

            const geo = new THREE.CircleGeometry(sz, p.type === 'sun' ? 32 : 16);
            const mat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
            const m   = new THREE.Mesh(geo, mat);
            m.position.copy(pos);
            m.lookAt(0, 0, 0);
            planetGroupRef.current.add(m);

            // Glow for Sun/Moon
            if (p.type === 'sun' || p.type === 'moon') {
              const glowGeo = new THREE.CircleGeometry(sz * 2.5, 32);
              const glowMat = new THREE.MeshBasicMaterial({
                color: col, transparent: true, opacity: 0.08,
                side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
              });
              const glow = new THREE.Mesh(glowGeo, glowMat);
              glow.position.copy(pos); glow.lookAt(0,0,0);
              planetGroupRef.current.add(glow);
            }

            // Label
            const sp = worldToScreen(pos, camera, lw, lh);
            if (sp && p.el > -2) {
              ctx.font = `bold 11px Space Mono, monospace`;
              ctx.fillStyle = p.type === 'sun' ? '#ffee44' : p.type === 'moon' ? '#aaccff' : '#ffffff';
              ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
              ctx.fillText(p.name, sp.x + (sz / 2) + 6, sp.y - 4);
              ctx.shadowBlur = 0;
            }
          }
        }
      }

      /* ── Cardinal direction labels on horizon ── */
      const cardinals = [
        { l: 'N', az: 0 }, { l: 'NE', az: 45 }, { l: 'E', az: 90 },
        { l: 'SE', az: 135 }, { l: 'S', az: 180 }, { l: 'SW', az: 225 },
        { l: 'W', az: 270 }, { l: 'NW', az: 315 },
      ];
      for (const c of cardinals) {
        const pos = horVec(c.az, 2, 600);
        const sp  = worldToScreen(pos, camera, lw, lh);
        if (!sp) continue;
        ctx.font = `bold 12px Space Mono, monospace`;
        const isMain = c.l.length === 1;
        ctx.fillStyle = isMain ? '#ff5555' : 'rgba(255,100,100,0.6)';
        ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 5;
        ctx.fillText(c.l, sp.x, sp.y);
        ctx.shadowBlur = 0;
      }

      /* ── Layer visibility ── */
      if (groundRef.current)    groundRef.current.visible = showGround;
      if (atmRef.current)       atmRef.current.visible    = showAtm;
      if (gridGroupRef.current) gridGroupRef.current.visible = showGrid;
      if (constGroupRef.current) constGroupRef.current.visible = showConst;

      renderer.render(scene, camera);
    };

    rafRef.current = requestAnimationFrame(animate);

    /* ── Resize ── */
    const onResize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      const lc2 = labelsRef.current;
      if (!lc2) return;
      lc2.width = w * DPR; lc2.height = h * DPR;
      lc2.style.width = `${w}px`; lc2.style.height = `${h}px`;
      ctx.scale(DPR, DPR);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      if (mountRef.current?.contains(renderer.domElement))
        mountRef.current.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* ─────────────────────────────────────────────────────────────────
     Build constellation lines in equatorial coords
     (called once; they rotate with the star sphere automatically)
     ───────────────────────────────────────────────────────────────── */
  const buildConstellations = useCallback((lat: number, lon: number, date: Date) => {
    const cg = constGroupRef.current;
    if (!cg) return;
    while (cg.children.length > 0) cg.remove(cg.children[0]);

    const lines = getConstellationLines(lat, lon, date);
    const mat   = new THREE.LineBasicMaterial({
      color: 0x3355aa, transparent: true, opacity: 0.35,
    });

    for (const c of lines) {
      // Convert AzEl back to world coords (they're already computed for the observer)
      // We keep them in AzEl space and DON'T add to the rotating starSphere
      // Instead we use the local horizon frame (not rotating)
      const pts: THREE.Vector3[] = [];
      for (const pt of c.points) {
        if (pt.el > -5) pts.push(horVec(pt.az, pt.el, 880));
      }
      if (pts.length >= 2) {
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        cg.add(new THREE.Line(geo, mat));
      }
    }
  }, []);

  // Rebuild constellations when observer changes
  useEffect(() => {
    if (phase === 'sky' && constGroupRef.current) {
      constGroupRef.current.clear();
      buildConstellations(observer.lat, observer.lon, new Date(simTimeRef.current));
    }
  }, [observer, phase, buildConstellations]);

  // Rebuild constellations toggle
  useEffect(() => {
    if (phase === 'sky' && showConst && constGroupRef.current?.children.length === 0) {
      buildConstellations(observer.lat, observer.lon, new Date(simTimeRef.current));
    }
  }, [showConst, phase, observer, buildConstellations]);

  /* ─────────────────────────────────────────────────────────────────
     Helpers
     ───────────────────────────────────────────────────────────────── */
  function worldToScreen(
    pos: THREE.Vector3,
    cam: THREE.PerspectiveCamera,
    w: number,
    h: number
  ): { x: number; y: number } | null {
    const v = pos.clone().project(cam);
    if (v.z > 1) return null; // behind camera
    return {
      x: (v.x * 0.5 + 0.5) * w,
      y: (-(v.y * 0.5) + 0.5) * h,
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     JSX
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: '#000008', overflow: 'hidden', touchAction: 'none' }}
      className={spaceMono.className}
    >
      {/* ── Three.js mount ── */}
      <div ref={mountRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />

      {/* ── Labels canvas ── */}
      <canvas
        ref={labelsRef}
        style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}
      />

      {/* ════════════════════════════════════════
          SETUP SCREEN
          ════════════════════════════════════════ */}
      {phase === 'setup' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 30,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'radial-gradient(ellipse at 50% 60%, rgba(4,8,28,0.92) 0%, rgba(0,0,4,0.98) 100%)',
        }}>
          {/* Animated star dots behind the card */}
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0 }}>
            {Array.from({ length: 80 }).map((_, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: `${Math.random() * 100}%`,
                top:  `${Math.random() * 100}%`,
                width:  `${1 + Math.random() * 2}px`,
                height: `${1 + Math.random() * 2}px`,
                borderRadius: '50%',
                background: 'white',
                opacity: 0.1 + Math.random() * 0.5,
                animation: `twinkle ${2 + Math.random() * 4}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 4}s`,
              }} />
            ))}
          </div>

          <style>{`
            @keyframes twinkle {
              0%,100% { opacity: 0.1; }
              50%      { opacity: 0.8; }
            }
            @keyframes fadeUp {
              from { opacity:0; transform:translateY(16px); }
              to   { opacity:1; transform:translateY(0); }
            }
          `}</style>

          {/* Card */}
          <div style={{
            position: 'relative', zIndex: 1,
            width: 440, maxWidth: '92vw',
            background: 'rgba(6,10,24,0.9)',
            border: '0.5px solid rgba(0,212,255,0.2)',
            borderRadius: 24,
            padding: '48px 40px 40px',
            boxShadow: '0 0 80px rgba(0,212,255,0.06), 0 40px 80px rgba(0,0,0,0.7)',
            animation: 'fadeUp 0.8s ease forwards',
          }}>
            {/* Brand */}
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              {/* Observatory icon */}
              <div style={{
                width: 64, height: 64, margin: '0 auto 20px',
                borderRadius: '50%',
                border: '1.5px solid rgba(0,212,255,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28,
                boxShadow: '0 0 24px rgba(0,212,255,0.15)',
              }}>🔭</div>

              <h1 className={spaceGrotesk.className} style={{
                fontSize: 28, fontWeight: 700, color: '#fff',
                letterSpacing: '0.25em', marginBottom: 6,
              }}>ZENITH</h1>
              <div style={{ fontSize: 10, color: 'rgba(0,212,255,0.55)', letterSpacing: '0.2em' }}>
                CELESTIAL OBSERVATORY ENGINE
              </div>
            </div>

            {/* Description */}
            <p style={{
              fontSize: 12, color: 'rgba(200,215,255,0.45)',
              textAlign: 'center', lineHeight: 1.7, marginBottom: 32,
              letterSpacing: '0.04em',
            }}>
              Real-time first-person sky view. Drag to look around.<br />
              Scroll to zoom. Stars, satellites, planets — all live.
            </p>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, opacity: 0.4 }}>
                📍
              </div>
              <input
                placeholder="Search city or location…"
                value={selLoc ? selLoc.name : query}
                onChange={e => { setQuery(e.target.value); setSelLoc(null); }}
                style={{
                  width: '100%', padding: '14px 14px 14px 42px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '0.5px solid rgba(255,255,255,0.12)',
                  borderRadius: 12, color: '#fff', fontSize: 13,
                  outline: 'none', letterSpacing: '0.04em',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(0,212,255,0.5)'}
                onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
              />

              {/* Dropdown */}
              {results.length > 0 && !selLoc && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  marginTop: 6, zIndex: 10,
                  background: 'rgba(4,8,24,0.98)',
                  border: '0.5px solid rgba(0,212,255,0.15)',
                  borderRadius: 10, overflow: 'hidden',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
                }}>
                  {results.map((r, i) => (
                    <div key={i}
                      onClick={() => {
                        const loc = {
                          name: r.display_name.split(',')[0],
                          lat:  parseFloat(r.lat),
                          lon:  parseFloat(r.lon),
                        };
                        setSelLoc(loc);
                        setObserver({ lat: loc.lat, lon: loc.lon });
                        setResults([]);
                      }}
                      style={{
                        padding: '11px 16px', fontSize: 11,
                        color: 'rgba(255,255,255,0.8)',
                        borderBottom: '0.5px solid rgba(255,255,255,0.05)',
                        cursor: 'pointer', transition: 'background 0.15s',
                        letterSpacing: '0.03em',
                      }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(0,212,255,0.08)'}
                      onMouseOut={e  => e.currentTarget.style.background = 'transparent'}
                    >
                      {r.display_name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected location display */}
            {selLoc && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, marginBottom: 12,
                background: 'rgba(0,212,255,0.06)',
                border: '0.5px solid rgba(0,212,255,0.2)',
                fontSize: 11, color: 'rgba(0,212,255,0.8)',
                letterSpacing: '0.06em',
              }}>
                ✓ &nbsp;{selLoc.lat.toFixed(4)}°{selLoc.lat >= 0 ? 'N' : 'S'} &nbsp;
                         {Math.abs(selLoc.lon).toFixed(4)}°{selLoc.lon >= 0 ? 'E' : 'W'}
                &nbsp;· &nbsp;{selLoc.name}
              </div>
            )}

            {/* Or use my location */}
            <button
              onClick={() => navigator.geolocation?.getCurrentPosition(pos => {
                const loc = {
                  name: `${pos.coords.latitude.toFixed(2)}°, ${pos.coords.longitude.toFixed(2)}°`,
                  lat: pos.coords.latitude, lon: pos.coords.longitude,
                };
                setSelLoc(loc);
                setObserver({ lat: loc.lat, lon: loc.lon });
              })}
              style={{
                width: '100%', padding: '11px', marginBottom: 12,
                background: 'transparent',
                border: '0.5px solid rgba(255,255,255,0.1)',
                borderRadius: 10, color: 'rgba(255,255,255,0.4)',
                fontSize: 11, letterSpacing: '0.12em', cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
              onMouseOut={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';  e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
            >
              ⊕ &nbsp;USE MY LOCATION
            </button>

            {/* Launch button */}
            <button
              disabled={!selLoc}
              onClick={() => setPhase('sky')}
              className={spaceGrotesk.className}
              style={{
                width: '100%', padding: '15px',
                background: selLoc
                  ? 'linear-gradient(135deg, rgba(0,180,255,0.85), rgba(0,100,255,0.85))'
                  : 'rgba(255,255,255,0.04)',
                border: 'none', borderRadius: 12,
                color: selLoc ? '#fff' : 'rgba(255,255,255,0.2)',
                fontSize: 13, fontWeight: 700, letterSpacing: '0.18em',
                cursor: selLoc ? 'pointer' : 'not-allowed',
                transition: 'all 0.3s',
                boxShadow: selLoc ? '0 8px 28px rgba(0,150,255,0.35)' : 'none',
              }}
              onMouseOver={e => selLoc && (e.currentTarget.style.boxShadow = '0 12px 36px rgba(0,150,255,0.5)')}
              onMouseOut={e  => selLoc && (e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,150,255,0.35)')}
            >
              OPEN OBSERVATORY
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          SKY HUD
          ════════════════════════════════════════ */}
      {phase === 'sky' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>

          {/* TOP gradient */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 80,
            background: 'linear-gradient(to bottom, rgba(0,0,8,0.7), transparent)',
            pointerEvents: 'none',
          }} />

          {/* BOTTOM gradient */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 120,
            background: 'linear-gradient(to top, rgba(0,0,8,0.8), transparent)',
            pointerEvents: 'none',
          }} />

          {/* ── TOP-LEFT: Brand + location ── */}
          <div style={{
            position: 'absolute', top: 16, left: 20, pointerEvents: 'auto',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div
              onClick={() => router.push('/landing')}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span className={spaceGrotesk.className} style={{
                fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '0.2em',
              }}>ZENITH</span>
              <span style={{ fontSize: 9, color: 'rgba(0,212,255,0.5)', letterSpacing: '0.15em' }}>
                OBSERVATORY
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'rgba(180,200,230,0.5)', letterSpacing: '0.06em' }}>
              📍 {selLoc?.name || `${observer.lat.toFixed(2)}°, ${observer.lon.toFixed(2)}°`}
            </div>
          </div>

          {/* ── TOP-RIGHT: Stats ── */}
          <div style={{
            position: 'absolute', top: 16, right: 20, pointerEvents: 'auto',
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
          }}>
            <div style={{ fontSize: 11, color: '#00ff88', letterSpacing: '0.08em' }}>
              ● {tles.length > 0 ? `${tles.length} satellites loaded` : 'Loading TLEs…'}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(150,180,220,0.55)', letterSpacing: '0.06em' }}>
              {dispTime}
            </div>
          </div>

          {/* ── BOTTOM-CENTER: Main toolbar ── */}
          <div style={{
            position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            pointerEvents: 'auto',
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'rgba(4,8,24,0.85)',
            backdropFilter: 'blur(24px)',
            border: '0.5px solid rgba(255,255,255,0.08)',
            borderRadius: 18, padding: '7px 10px',
            boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
          }}>
            {/* Layer toggles */}
            <ToolBtn active={showSat}    onClick={() => setShowSat(!showSat)}       icon="🛰"  label="Satellites"     accent="#00d4ff" />
            <ToolBtn active={showPlanet} onClick={() => setShowPlanet(!showPlanet)} icon="🪐"  label="Planets"        accent="#ffd166" />
            <ToolBtn active={showConst}  onClick={() => { setShowConst(!showConst); if (constGroupRef.current) constGroupRef.current.clear(); }} icon="⭐" label="Constellations" accent="#9b7cff" />
            <ToolBtn active={showGround} onClick={() => setShowGround(!showGround)} icon="⛰"  label="Ground"         accent="#44bb88" />
            <ToolBtn active={showAtm}    onClick={() => setShowAtm(!showAtm)}       icon="🌫"  label="Atmosphere"     accent="#4488ff" />
            <ToolBtn active={showGrid}   onClick={() => setShowGrid(!showGrid)}     icon="⊞"  label="Grid"           accent="#888888" />

            {/* Divider */}
            <div style={{ width: 0.5, height: 32, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

            {/* Time controls */}
            <button onClick={() => setTimeOffset(to => to - 60)} style={tinyBtnStyle}>-1h</button>
            <button onClick={() => setTimeOffset(to => to - 10)} style={tinyBtnStyle}>-10m</button>
            <button
              onClick={() => { setPlaying(!playing); }}
              style={{
                ...tinyBtnStyle,
                background: playing ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.08)',
                borderColor: playing ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.12)',
                color: playing ? '#00d4ff' : 'rgba(255,255,255,0.5)',
                minWidth: 52,
              }}
            >
              {playing ? '⏸ LIVE' : '▶ PLAY'}
            </button>
            <button onClick={() => { setTimeOffset(0); setPlaying(true); }} style={tinyBtnStyle}>NOW</button>
            <button onClick={() => setTimeOffset(to => to + 10)} style={tinyBtnStyle}>+10m</button>
            <button onClick={() => setTimeOffset(to => to + 60)} style={tinyBtnStyle}>+1h</button>
          </div>

          {/* ── BOTTOM-LEFT: Change location ── */}
          <div style={{ position: 'absolute', bottom: 24, left: 20, pointerEvents: 'auto' }}>
            <button
              onClick={() => setPhase('setup')}
              style={{
                background: 'rgba(4,8,24,0.8)', backdropFilter: 'blur(16px)',
                border: '0.5px solid rgba(255,255,255,0.1)',
                borderRadius: 10, padding: '8px 14px',
                color: 'rgba(200,215,255,0.5)', fontSize: 10,
                cursor: 'pointer', letterSpacing: '0.1em',
                transition: 'all 0.2s',
              }}
              onMouseOver={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(0,212,255,0.4)'; }}
              onMouseOut={e  => { e.currentTarget.style.color = 'rgba(200,215,255,0.5)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
            >
              ⟳ &nbsp;CHANGE LOCATION
            </button>
          </div>

          {/* ── BOTTOM-RIGHT: Globe nav ── */}
          <div style={{ position: 'absolute', bottom: 24, right: 20, pointerEvents: 'auto' }}>
            <button
              onClick={() => router.push('/globe')}
              style={{
                background: 'rgba(4,8,24,0.8)', backdropFilter: 'blur(16px)',
                border: '0.5px solid rgba(0,212,255,0.2)',
                borderRadius: 10, padding: '8px 14px',
                color: 'rgba(0,212,255,0.7)', fontSize: 10,
                cursor: 'pointer', letterSpacing: '0.1em',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.2s',
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(0,212,255,0.6)'; e.currentTarget.style.color = '#00d4ff'; }}
              onMouseOut={e  => { e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)'; e.currentTarget.style.color = 'rgba(0,212,255,0.7)'; }}
            >
              🌍 &nbsp;GLOBE TRACKER
            </button>
          </div>

          {/* ── Time offset indicator ── */}
          {timeOffset !== 0 && (
            <div style={{
              position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(255,150,0,0.12)',
              border: '0.5px solid rgba(255,150,0,0.4)',
              borderRadius: 8, padding: '5px 14px',
              fontSize: 10, color: '#ffaa44', letterSpacing: '0.12em',
            }}>
              ⏱ T{timeOffset > 0 ? '+' : ''}{timeOffset}m &nbsp;|&nbsp; {dispTime}
            </div>
          )}

          {/* ── Hint overlay (disappears after 5s) ── */}
          <HintOverlay />

        </div>
      )}
    </div>
  );
}

/* ─── Toolbar button ─────────────────────────────────────────────── */
function ToolBtn({ active, onClick, icon, label, accent }: {
  active: boolean; onClick: () => void;
  icon: string; label: string; accent: string;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      style={{
        width: 46, height: 46, borderRadius: 11,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 2,
        cursor: 'pointer', transition: 'all 0.2s',
        background: active ? `${accent}18` : 'transparent',
        border: `0.5px solid ${active ? accent + '55' : 'rgba(255,255,255,0.06)'}`,
        boxShadow: active ? `0 0 12px ${accent}22` : 'none',
      }}
    >
      <span style={{ fontSize: 16, opacity: active ? 1 : 0.35 }}>{icon}</span>
      <span style={{
        fontSize: 7, letterSpacing: '0.06em',
        color: active ? accent : 'rgba(255,255,255,0.3)',
        fontFamily: 'Space Mono, monospace',
      }}>
        {label.toUpperCase().slice(0, 4)}
      </span>
    </button>
  );
}

/* ─── Tiny time button style ─────────────────────────────────────── */
const tinyBtnStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 8,
  background: 'rgba(255,255,255,0.05)',
  border: '0.5px solid rgba(255,255,255,0.1)',
  color: 'rgba(255,255,255,0.55)', fontSize: 9,
  letterSpacing: '0.08em', cursor: 'pointer',
  fontFamily: 'Space Mono, monospace',
  transition: 'all 0.15s',
  minWidth: 36,
};

/* ─── Hint overlay ───────────────────────────────────────────────── */
function HintOverlay() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none', textAlign: 'center',
      animation: 'fadeUp 0.5s ease forwards',
      opacity: 0.6,
    }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity:0; transform:translate(-50%,-44%); }
          to   { opacity:0.6; transform:translate(-50%,-50%); }
        }
      `}</style>
      <div style={{ fontSize: 11, color: 'rgba(200,220,255,0.7)', letterSpacing: '0.12em', lineHeight: 2 }}>
        🖱 DRAG to look around &nbsp;·&nbsp; SCROLL to zoom<br />
        CLICK an object to inspect it
      </div>
    </div>
  );
}