'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Space_Mono, Space_Grotesk } from 'next/font/google';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getPlanetPositions } from '@/lib/planets';
import { propagateAll, parseTLEBlock, SatelliteRecord } from '@/lib/propagate';
import { buildConstellationLines3D, ConstellationLine3D } from '@/lib/constellations-3d';

const spaceMono = Space_Mono({ weight: ['400', '700'], subsets: ['latin'] });
const spaceGrotesk = Space_Grotesk({ weight: ['300', '400', '600', '700'], subsets: ['latin'] });

/* ─── Math helpers ───────────────────────────────────────────────── */
const D2R = Math.PI / 180;
const d2r = (d: number) => d * D2R;

/** Greenwich Apparent Sidereal Time → degrees */
function getGAST(date: Date): number {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525.0;
  const g = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
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
  const ra = d2r(raHours * 15);
  const dec = d2r(decDeg);
  return new THREE.Vector3(
    r * Math.cos(dec) * Math.cos(ra),
    r * Math.sin(dec),
    -r * Math.cos(dec) * Math.sin(ra)
  );
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
interface ObserverLoc { name: string; lat: number; lon: number }

/* ─── Constants hoisted out of the render loop ──────────────────────
   These used to be declared *inside* `animate`, which meant a fresh
   88-key object (CONST_NAMES) and a fresh 8-item array (CARDINALS) were
   allocated 60 times a second for no reason. ──────────────────────── */
const CONST_NAMES: Record<string, string> = {
  'And': 'Andromeda', 'Ant': 'Antlia', 'Aps': 'Apus', 'Aqr': 'Aquarius',
  'Aql': 'Aquila', 'Ara': 'Ara', 'Ari': 'Aries', 'Aur': 'Auriga',
  'Boo': 'Boötes', 'Cae': 'Caelum', 'Cam': 'Camelopardalis', 'Cnc': 'Cancer',
  'CVn': 'Canes Venatici', 'CMa': 'Canis Major', 'CMi': 'Canis Minor',
  'Cap': 'Capricornus', 'Car': 'Carina', 'Cas': 'Cassiopeia', 'Cen': 'Centaurus',
  'Cep': 'Cepheus', 'Cet': 'Cetus', 'Cha': 'Chamaeleon', 'Cir': 'Circinus',
  'Col': 'Columba', 'Com': 'Coma Berenices', 'CrA': 'Corona Australis',
  'CrB': 'Corona Borealis', 'Crv': 'Corvus', 'Crt': 'Crater', 'Cru': 'Crux',
  'Cyg': 'Cygnus', 'Del': 'Delphinus', 'Dor': 'Dorado', 'Dra': 'Draco',
  'Equ': 'Equuleus', 'Eri': 'Eridanus', 'For': 'Fornax', 'Gem': 'Gemini',
  'Gru': 'Grus', 'Her': 'Hercules', 'Hor': 'Horologium', 'Hya': 'Hydra',
  'Hyi': 'Hydrus', 'Ind': 'Indus', 'Lac': 'Lacerta', 'Leo': 'Leo',
  'LMi': 'Leo Minor', 'Lep': 'Lepus', 'Lib': 'Libra', 'Lup': 'Lupus',
  'Lyn': 'Lynx', 'Lyr': 'Lyra', 'Men': 'Mensa', 'Mic': 'Microscopium',
  'Mon': 'Monoceros', 'Mus': 'Musca', 'Nor': 'Norma', 'Oct': 'Octans',
  'Oph': 'Ophiuchus', 'Ori': 'Orion', 'Pav': 'Pavo', 'Peg': 'Pegasus',
  'Per': 'Perseus', 'Phe': 'Phoenix', 'Pic': 'Pictor', 'Psc': 'Pisces',
  'PsA': 'Piscis Austrinus', 'Pup': 'Puppis', 'Pyx': 'Pyxis', 'Ret': 'Reticulum',
  'Sge': 'Sagitta', 'Sgr': 'Sagittarius', 'Sco': 'Scorpius', 'Scl': 'Sculptor',
  'Sct': 'Scutum', 'Ser': 'Serpens', 'Sex': 'Sextans', 'Tau': 'Taurus',
  'Tel': 'Telescopium', 'Tri': 'Triangulum', 'TrA': 'Triangulum Australe',
  'Tuc': 'Tucana', 'UMa': 'Ursa Major', 'UMi': 'Ursa Minor', 'Vel': 'Vela',
  'Vir': 'Virgo', 'Vol': 'Volans', 'Vul': 'Vulpecula',
};

const CARDINALS = [
  { l: 'N', az: 0 }, { l: 'NE', az: 45 }, { l: 'E', az: 90 },
  { l: 'SE', az: 135 }, { l: 'S', az: 180 }, { l: 'SW', az: 225 },
  { l: 'W', az: 270 }, { l: 'NW', az: 315 },
];

/* ═══════════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════════ */
export default function ObservatoryPage() {
  const router = useRouter();

  /* ── UI state ── */
  const [phase, setPhase] = useState<'setup' | 'sky'>('setup');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [selLoc, setSelLoc] = useState<ObserverLoc | null>(null);
  const [observer, setObserver] = useState({ lat: 28.61, lon: 77.21 }); // New Delhi default

  /* ── Sky layer toggles ── */
  const [showSat, setShowSat] = useState(true);
  const [showPlanet, setShowPlanet] = useState(true);
  const [showConst, setShowConst] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [showGround, setShowGround] = useState(true);
  const [showAtm, setShowAtm] = useState(true);

  /* ── Sim time ── */
  const [playing, setPlaying] = useState(true);
  const [timeOffset, setTimeOffset] = useState(0); // minutes
  const simTimeRef = useRef(Date.now());
  const [dispTime, setDispTime] = useState('');

  /* ── Data ── */
  const [tles, setTles] = useState<SatelliteRecord[]>([]);
  const [constReady, setConstReady] = useState(false);

  /* ── Refs that mirror the latest state for use inside the render loop.
        The loop is created once per `phase` change and keeps running via
        requestAnimationFrame; reading state directly inside it would
        freeze those values at whatever they were the moment the loop was
        created (this was the actual reason toolbar toggles / time
        controls had no visible effect). Refs always hold the live value
        because we re-assign them on every render, below. ── */
  const showSatRef = useRef(showSat);
  const showPlanetRef = useRef(showPlanet);
  const showConstRef = useRef(showConst);
  const showGridRef = useRef(showGrid);
  const showGroundRef = useRef(showGround);
  const showAtmRef = useRef(showAtm);
  const playingRef = useRef(playing);
  const timeOffsetRef = useRef(timeOffset);
  const observerRef = useRef(observer);
  const tlesRef = useRef<SatelliteRecord[]>(tles);

  showSatRef.current = showSat;
  showPlanetRef.current = showPlanet;
  showConstRef.current = showConst;
  showGridRef.current = showGrid;
  showGroundRef.current = showGround;
  showAtmRef.current = showAtm;
  playingRef.current = playing;
  timeOffsetRef.current = timeOffset;
  observerRef.current = observer;
  tlesRef.current = tles;

  /* ── Three.js refs ── */
  const mountRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rafRef = useRef<number>(0);

  // Layer groups
  const starSphereRef = useRef<THREE.Group | null>(null); // rotates with sidereal time
  const constGroupRef = useRef<THREE.Group | null>(null); // same rotation
  const constLinesDataRef = useRef<ConstellationLine3D[]>([]);
  const constCentroidsRef = useRef<Map<string, THREE.Vector3>>(new Map());
  const constFetchedRef = useRef(false);
  const satGroupRef = useRef<THREE.Group | null>(null); // AzEl, rebuilt each frame
  const planetGroupRef = useRef<THREE.Group | null>(null); // AzEl, rebuilt each frame
  const groundRef = useRef<THREE.Mesh | null>(null);
  const atmRef = useRef<THREE.Mesh | null>(null);
  const gridGroupRef = useRef<THREE.Group | null>(null);
  const milkyWayRef = useRef<THREE.Points | null>(null);

  /* ─────────────────────────────────────────────────────────────────
     Fetch TLEs + stars once
     ───────────────────────────────────────────────────────────────── */
  useEffect(() => {
    console.log('[TLE] Starting TLE fetch...');
    const groups = ['stations', 'visual', 'starlink', 'gps-ops', 'weather'];
    Promise.all(
      groups.map(g =>
        fetch(`/api/tle?group=${g}`)
          .then(r => {
            console.log(`[TLE] ${g}: status=${r.status}`);
            return r.text();
          })
          .catch(err => { console.warn(`[TLE] ${g} failed:`, err); return ''; })
      )
    ).then(texts => {
      const combined = texts.join('\n');
      const parsed = parseTLEBlock(combined);
      console.log(`[TLE] Parsed ${parsed.length} satellites from ${combined.length} chars`);
      setTles(parsed);
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
        d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
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
    const currentMount = mountRef.current;
    if (phase !== 'sky' || !currentMount || !labelsRef.current) return;

    const W = window.innerWidth;
    const H = window.innerHeight;
    const DPR = Math.min(window.devicePixelRatio, 2);

    /* ── Renderer ── */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x000005, 1);
    renderer.sortObjects = true;
    currentMount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    /* ── Scene ── */
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    /* ── Camera — fixed near the origin, slightly above ground ── */
    const camera = new THREE.PerspectiveCamera(65, W / H, 0.01, 2000);
    camera.position.set(0, 0.5, 0);
    cameraRef.current = camera;

    /* ── OrbitControls, configured as a "look around from a fixed point"
       control rather than a true orbit-camera. The camera's *position*
       must never meaningfully change: the ground plane sits right at
       y≈0, and if the camera is allowed to drift to a different height
       (which is exactly what variable-radius orbiting does) it can end
       up below the ground, which then disappears (you're seeing its
       unrendered backside). Locking the orbit radius to a tiny constant
       keeps the camera in a sub-centimeter bubble around its start
       point — visually identical to a fixed eye position — while still
       allowing free look-around rotation. ── */
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = false; // see wheel handler below — FOV zoom instead of dollying
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.rotateSpeed = -0.4;  // negative → drag sky naturally

    const LOOK_RADIUS = 0.05;
    controls.minDistance = LOOK_RADIUS;
    controls.maxDistance = LOOK_RADIUS;
    const initialLookDir = new THREE.Vector3(0, 0.2, -1)
      .sub(camera.position)
      .normalize();
    controls.target.copy(camera.position).addScaledVector(initialLookDir, LOOK_RADIUS);
    controls.update();
    controlsRef.current = controls;

    // Scroll-to-zoom as an actual telescope-style field-of-view change.
    // (Dollying the camera toward a target ~1 unit away does essentially
    // nothing to a sky at radius ~900, and was what broke the ground.)
    const MIN_FOV = 12, MAX_FOV = 80;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * 0.04, MIN_FOV, MAX_FOV);
      camera.updateProjectionMatrix();
    };
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    /* ── Labels canvas ── */
    const lc = labelsRef.current;
    lc.width = W * DPR;
    lc.height = H * DPR;
    lc.style.width = `${W}px`;
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
      .then((data: { features: Array<{ geometry: { coordinates: [number, number] }, properties: { mag: number, bv: string } }> }) => {
        const pos: number[] = [], col: number[] = [], sz: number[] = [];
        for (const f of data.features) {
          const [ra, dec] = f.geometry.coordinates;
          const mag = f.properties.mag;
          const bv = parseFloat(f.properties.bv) || 0;
          if (mag > 6.5) continue; // skip very faint

          const v = eqToVec(ra, dec, R_STAR);
          pos.push(v.x, v.y, v.z);

          // Spectral colour from B-V index
          let r = 1, g = 1, b = 1;
          if (bv < -0.3) { r = 0.67; g = 0.77; b = 1.00 }
          else if (bv < 0.0) { r = 0.80; g = 0.90; b = 1.00 }
          else if (bv < 0.3) { r = 0.95; g = 0.97; b = 1.00 }
          else if (bv < 0.6) { r = 1.00; g = 0.99; b = 0.90 }
          else if (bv < 1.0) { r = 1.00; g = 0.90; b = 0.70 }
          else if (bv < 1.5) { r = 1.00; g = 0.75; b = 0.50 }
          else { r = 1.00; g = 0.60; b = 0.40 }
          col.push(r, g, b);

          const brightness = Math.max(0.5, (7 - mag) * 0.9);
          sz.push(brightness);
        }

        const g3 = new THREE.BufferGeometry();
        g3.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g3.setAttribute('starCol', new THREE.Float32BufferAttribute(col, 3));
        g3.setAttribute('size', new THREE.Float32BufferAttribute(sz, 1));

        const starMat = new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0.0 } },
          vertexShader: `
            attribute float size;
            attribute vec3  starCol;
            varying   vec3  vCol;
            uniform   float uTime;
            void main() {
              vCol = starCol;
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
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          vertexColors: true,
        });

        starSphere.add(new THREE.Points(g3, starMat));
      })
      .catch(() => {
        // Procedural fallback if stars.json missing
        const pos: number[] = [], col: number[] = [], sz: number[] = [];
        for (let i = 0; i < 4000; i++) {
          const ra = Math.random() * 24;
          const dec = (Math.asin(Math.random() * 2 - 1)) / D2R;
          const v = eqToVec(ra, dec, R_STAR);
          pos.push(v.x, v.y, v.z);
          const t = Math.random();
          col.push(0.7 + t * 0.3, 0.7 + t * 0.3, 0.85 + t * 0.15);
          sz.push(0.4 + Math.random() * 1.8);
        }
        const g3 = new THREE.BufferGeometry();
        g3.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g3.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g3.setAttribute('size', new THREE.Float32BufferAttribute(sz, 1));
        const mat = new THREE.PointsMaterial({
          size: 0.8, vertexColors: true, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false,
        });
        starSphere.add(new THREE.Points(g3, mat));
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
        // Convert galactic → equatorial (J2000)
        // Galactic north pole: RA=192.85948°, Dec=27.12825°, l_NCP=122.93192°
        const lR = d2r(l), bR = d2r(b);
        const poleDec = d2r(27.12825);
        const lCP = d2r(122.93192);
        const sinDec = Math.sin(bR) * Math.sin(poleDec) + Math.cos(bR) * Math.cos(poleDec) * Math.cos(lCP - lR);
        const dec = Math.asin(sinDec);
        // cos(δ)·sin(α−α_NGP) and cos(δ)·cos(α−α_NGP) — atan2 cancels the
        // shared cos(δ) factor, so we don't even need to divide it out.
        const yComp = Math.cos(bR) * Math.sin(lCP - lR);
        const xComp = Math.cos(poleDec) * Math.sin(bR) - Math.sin(poleDec) * Math.cos(bR) * Math.cos(lCP - lR);
        const ra = Math.atan2(yComp, xComp) / D2R + 192.85948;
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
      mwGeo.setAttribute('color', new THREE.Float32BufferAttribute(mwCol, 3));
      mwGeo.setAttribute('size', new THREE.Float32BufferAttribute(mwSz, 1));
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
    satGroup.frustumCulled = false;
    scene.add(satGroup);
    satGroupRef.current = satGroup;

    // Satellites: one Points object, buffers mutated in place every frame.
    // (The old code built a brand-new Mesh+Geometry+Material per satellite
    // per frame and never disposed the previous ones — that GPU memory
    // leak is what was crashing the tab.)
    const MAX_SATS = 8000;
    const satPosArr = new Float32Array(MAX_SATS * 3);
    const satColArr = new Float32Array(MAX_SATS * 3);
    const satSizeArr = new Float32Array(MAX_SATS);
    const satPosAttr = new THREE.BufferAttribute(satPosArr, 3);
    const satColAttr = new THREE.BufferAttribute(satColArr, 3);
    const satSizeAttr = new THREE.BufferAttribute(satSizeArr, 1);
    satPosAttr.usage = THREE.DynamicDrawUsage;
    satColAttr.usage = THREE.DynamicDrawUsage;
    satSizeAttr.usage = THREE.DynamicDrawUsage;
    const satGeo = new THREE.BufferGeometry();
    satGeo.setAttribute('position', satPosAttr);
    satGeo.setAttribute('satCol', satColAttr);
    satGeo.setAttribute('size', satSizeAttr);
    satGeo.setDrawRange(0, 0);
    const satMat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float size;
        attribute vec3  satCol;
        varying   vec3  vSatCol;
        void main() {
          vSatCol = satCol;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (643.0/ -mv.z);
          gl_Position  = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vSatCol;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.1, d);
          gl_FragColor = vec4(vSatCol, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const satPoints = new THREE.Points(satGeo, satMat);
    satPoints.frustumCulled = false;
    satGroup.add(satPoints);

    const planetGroup = new THREE.Group();
    scene.add(planetGroup);
    planetGroupRef.current = planetGroup;

    // Planets: a small fixed pool of meshes, repositioned/recolored each
    // frame instead of recreated.
    const MAX_PLANETS = 10;
    const unitCircleGeo = new THREE.CircleGeometry(1, 32);
    const planetMeshes: THREE.Mesh[] = [];
    const planetGlowMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < MAX_PLANETS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      const m = new THREE.Mesh(unitCircleGeo, mat);
      m.visible = false;
      planetGroup.add(m);
      planetMeshes.push(m);

      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.08,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      });
      const gm = new THREE.Mesh(unitCircleGeo, glowMat);
      gm.visible = false;
      planetGroup.add(gm);
      planetGlowMeshes.push(gm);
    }

    /* ════════════════════════════════════════
       5. GROUND — single clean disc (no fog pass — see note below)
       ════════════════════════════════════════ */
    const groundDisc = new THREE.Mesh(
      new THREE.CircleGeometry(900, 128),
      new THREE.MeshBasicMaterial({
        color: 0x050a14,
        side: THREE.DoubleSide, // safety margin: stays visible even at/under y=0
        depthWrite: true,
      })
    );
    groundDisc.rotation.x = -Math.PI / 2;  // lay flat
    groundDisc.position.y = -0.05;          // just below horizon
    groundDisc.renderOrder = 2;             // render after sky objects
    scene.add(groundDisc);
    groundRef.current = groundDisc;

    // ── HORIZON LINE: ring at Y=0 ──────────────────────────────────────
    const horizonPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const angle = (i / 128) * Math.PI * 2;
      horizonPts.push(new THREE.Vector3(
        850 * Math.cos(angle),
        0,
        850 * Math.sin(angle)
      ));
    }
    const horizonLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(horizonPts),
      new THREE.LineBasicMaterial({ color: 0x1a3a5a, transparent: true, opacity: 0.4 })
    );
    scene.add(horizonLine);

    // NOTE: the original ground-fog cylinder is removed. Working through its
    // gradient math, the fade only became non-zero far below where the
    // camera or the ground disc could ever let you see — it was an extra
    // shader pass every frame that never actually rendered anything visible.
    // The atmosphere glow dome below plus the horizon line give the same
    // "ground presence" cue for free.

    /* ════════════════════════════════════════
       6. ATMOSPHERE GLOW (above horizon only)
       ════════════════════════════════════════ */
    const atmGeo = new THREE.SphereGeometry(850, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const atmMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
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

    // Satellite orbital propagation is throttled — az/el barely changes
    // over a quarter second, so recomputing SGP4 for the whole catalog on
    // every single frame (the old behaviour) was pure wasted CPU and, with
    // a large catalog (e.g. the full 'starlink' group), enough to make the
    // tab hang.
    const SAT_UPDATE_MS = 250;
    let lastSatCalc = -Infinity;
    let cachedOverhead: ReturnType<typeof propagateAll> = [];

    const animate = (t: number) => {
      rafRef.current = requestAnimationFrame(animate);

      if (playingRef.current) simTimeRef.current = Date.now() + timeOffsetRef.current * 60000;
      const now = new Date(simTimeRef.current);
      const obs = { lat: observerRef.current.lat, lon: observerRef.current.lon };

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

      /* ── Clear labels canvas ── */
      const lw = window.innerWidth, lh = window.innerHeight;
      ctx.clearRect(0, 0, lw, lh);

      /* ── Satellites (AzEl, throttled propagation, pooled buffer) ── */
      if (showSatRef.current && tlesRef.current.length > 0) {
        if (t - lastSatCalc > SAT_UPDATE_MS) {
          cachedOverhead = propagateAll(tlesRef.current, obs, now).filter(s => s.el > 0);
          lastSatCalc = t;
          console.log(`[SAT] overhead: ${cachedOverhead.length}, tles loaded: ${tlesRef.current.length}`);
        }
        const count = Math.min(cachedOverhead.length, MAX_SATS);
        for (let i = 0; i < count; i++) {
          const s = cachedOverhead[i];
          const pos = horVec(s.az, s.el, 750);
          satPosArr[i * 3] = pos.x;
          satPosArr[i * 3 + 1] = pos.y;
          satPosArr[i * 3 + 2] = pos.z;

          const isISS = s.type === 'iss';
          let r = 0.53, g = 0.80, b = 1.00;            // default 0x88ccff
          if (isISS) { r = 0.00; g = 1.00; b = 0.53; } // 0x00ff88
          else if (s.type === 'starlink') { r = 0.27; g = 0.53; b = 1.00; } // 0x4488ff
          satColArr[i * 3] = r; satColArr[i * 3 + 1] = g; satColArr[i * 3 + 2] = b;
          satSizeArr[i] = isISS ? 9 : s.tier === 'naked' ? 6 : 3;

          // Only label the ISS and naked-eye-visible satellites — labeling
          // every Starlink dot was both unreadable and the main per-frame
          // canvas cost in this loop.
          if (isISS || s.tier === 'naked') {
            const sp = worldToScreen(pos, camera, lw, lh);
            if (sp) {
              if (isISS) {
                // Draw ISS as a visible crosshair + pulsing ring on the canvas
                const t2 = performance.now() * 0.003;
                const pulse = 8 + Math.sin(t2 * 3) * 4;

                // Outer pulsing ring
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, pulse, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(0,255,136,0.5)';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Inner dot
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#00ff88';
                ctx.fill();

                // Cross lines
                ctx.strokeStyle = 'rgba(0,255,136,0.7)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(sp.x - 14, sp.y); ctx.lineTo(sp.x - 6, sp.y);
                ctx.moveTo(sp.x + 6, sp.y); ctx.lineTo(sp.x + 14, sp.y);
                ctx.moveTo(sp.x, sp.y - 14); ctx.lineTo(sp.x, sp.y - 6);
                ctx.moveTo(sp.x, sp.y + 6); ctx.lineTo(sp.x, sp.y + 14);
                ctx.stroke();

                // Label
                ctx.font = 'bold 11px Space Mono, monospace';
                ctx.fillStyle = '#00ff88';
                ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
                ctx.fillText('ISS', sp.x + 16, sp.y - 6);
                ctx.shadowBlur = 0;
              } else {
                // Naked-eye satellite: small circle + name
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, 2.5, 0, Math.PI * 2);
                ctx.fillStyle = '#66aaff';
                ctx.fill();

                ctx.font = '9px Space Mono, monospace';
                ctx.fillStyle = '#66aaff';
                ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 3;
                ctx.fillText(s.name.split(' ')[0], sp.x + 7, sp.y - 3);
                ctx.shadowBlur = 0;
              }
            }
          }
        }
        satPosAttr.needsUpdate = true;
        satColAttr.needsUpdate = true;
        satSizeAttr.needsUpdate = true;
        satGeo.setDrawRange(0, count);
      } else {
        satGeo.setDrawRange(0, 0);
      }

      /* ── Planets (AzEl, pooled meshes) ── */
      if (showPlanetRef.current) {
        const planets = getPlanetPositions(obs, now);
        let idx = 0;
        for (const p of planets) {
          if (p.el < -5 || idx >= MAX_PLANETS) continue;
          const pos = horVec(p.az, p.el, 760);
          let col = 0xffffff, sz = 2.5;
          if (p.type === 'sun') { col = 0xffee33; sz = 16; }
          else if (p.type === 'moon') { col = 0xddeeff; sz = 12; }
          else if (p.name === 'Venus') { col = 0xffffcc; sz = 5; }
          else if (p.name === 'Jupiter') { col = 0xffcc88; sz = 4.5; }
          else if (p.name === 'Mars') { col = 0xff6644; sz = 4; }
          else if (p.name === 'Saturn') { col = 0xeecc88; sz = 3.5; }

          const m = planetMeshes[idx];
          m.position.copy(pos);
          m.lookAt(0, 0, 0);
          m.scale.setScalar(sz);
          (m.material as THREE.MeshBasicMaterial).color.setHex(col);
          m.visible = true;

          const glow = planetGlowMeshes[idx];
          if (p.type === 'sun' || p.type === 'moon') {
            glow.position.copy(pos);
            glow.lookAt(0, 0, 0);
            glow.scale.setScalar(sz * 2.5);
            (glow.material as THREE.MeshBasicMaterial).color.setHex(col);
            glow.visible = true;
          } else {
            glow.visible = false;
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
          idx++;
        }
        for (; idx < MAX_PLANETS; idx++) {
          planetMeshes[idx].visible = false;
          planetGlowMeshes[idx].visible = false;
        }
      } else {
        for (let i = 0; i < MAX_PLANETS; i++) {
          planetMeshes[i].visible = false;
          planetGlowMeshes[i].visible = false;
        }
      }

      /* ── Cardinal direction labels on horizon ── */
      for (const c of CARDINALS) {
        const pos = horVec(c.az, 2, 600);
        const sp = worldToScreen(pos, camera, lw, lh);
        if (!sp) continue;
        ctx.font = `bold 12px Space Mono, monospace`;
        const isMain = c.l.length === 1;
        ctx.fillStyle = isMain ? '#ff5555' : 'rgba(255,100,100,0.6)';
        ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 5;
        ctx.fillText(c.l, sp.x, sp.y);
        ctx.shadowBlur = 0;
      }

      // Constellation name labels
      if (showConstRef.current && constLinesDataRef.current.length > 0) {
        for (const c of constLinesDataRef.current) {
          // Find the centroid of this constellation's first segment.
          // Cached per name so we don't recompute it from scratch every
          // single frame — only the rotation applied to it changes.
          if (c.segments.length === 0 || c.segments[0].length === 0) continue;

          let centroid = constCentroidsRef.current.get(c.name);
          if (!centroid) {
            const seg = c.segments[0];
            centroid = new THREE.Vector3();
            for (const pt of seg) centroid.add(pt);
            centroid.divideScalar(seg.length);
            constCentroidsRef.current.set(c.name, centroid);
          }

          // The centroid is in equatorial space — apply the star sphere rotation
          const worldCentroid = centroid.clone().applyEuler(starSphereRef.current!.rotation);

          const sp = worldToScreen(worldCentroid, camera, lw, lh);
          if (!sp) continue;

          ctx.font = '10px Space Mono, monospace';
          ctx.fillStyle = 'rgba(100,140,220,0.6)';
          ctx.shadowColor = 'rgba(0,0,0,0.9)';
          ctx.shadowBlur = 3;
          ctx.textAlign = 'center';
          ctx.fillText(CONST_NAMES[c.name] || c.name, sp.x, sp.y);
          ctx.textAlign = 'left';
          ctx.shadowBlur = 0;
        }
      }

      /* ── Layer visibility ── */
      if (groundRef.current) groundRef.current.visible = showGroundRef.current;
      if (atmRef.current) atmRef.current.visible = showAtmRef.current;
      if (gridGroupRef.current) gridGroupRef.current.visible = showGridRef.current;
      if (constGroupRef.current) constGroupRef.current.visible = showConstRef.current;

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
      renderer.domElement.removeEventListener('wheel', onWheel);
      controls.dispose();
      satGeo.dispose();
      satMat.dispose();
      unitCircleGeo.dispose();
      planetMeshes.forEach(m => (m.material as THREE.Material).dispose());
      planetGlowMeshes.forEach(m => (m.material as THREE.Material).dispose());
      renderer.dispose();
      if (currentMount?.contains(renderer.domElement))
        currentMount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Intentionally only [phase]: everything reactive the loop needs is read
    // from the *Ref mirrors above, not from these closed-over values.
  }, [phase]);

  /* ─────────────────────────────────────────────────────────────────
     Fetch constellation JSON and build 3D lines
     ───────────────────────────────────────────────────────────────── */
  const renderConstellationLines = useCallback(() => {
    const cg = constGroupRef.current;
    if (!cg) return;

    // Clear existing lines
    while (cg.children.length > 0) cg.remove(cg.children[0]);

    if (!showConst || constLinesDataRef.current.length === 0) return;

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x2244aa,
      transparent: true,
      opacity: 0.45,
    });

    for (const constellation of constLinesDataRef.current) {
      for (const segment of constellation.segments) {
        if (segment.length < 2) continue;
        const geo = new THREE.BufferGeometry().setFromPoints(segment);
        const line = new THREE.Line(geo, lineMat.clone());
        // Store the constellation name for hover detection later
        line.userData.constellation = constellation.name;
        cg.add(line);
      }
    }
  }, [showConst]);

  // Fetch the constellation data once.
  useEffect(() => {
    if (constFetchedRef.current) return;
    constFetchedRef.current = true;

    fetch('/constellations.lines.json')
      .then(r => r.json())
      .then(geojson => {
        constLinesDataRef.current = buildConstellationLines3D(geojson, 880);
        setConstReady(true);
      })
      .catch(err => console.warn('Constellation data failed to load:', err));
  }, []);

  // Render (or clear) the lines whenever the data finishes loading, the 3D
  // scene becomes available, or the toggle changes. Previously this only
  // ran from inside the fetch's `.then()`, which in practice almost always
  // fired *before* the user had even left the setup screen — i.e. before
  // constGroupRef existed — so the lines were parsed but never actually
  // added to the scene, and nothing else ever retried.
  useEffect(() => {
    if (!constReady || !constGroupRef.current) return;
    renderConstellationLines();
  }, [constReady, showConst, phase, renderConstellationLines]);

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
            {Array.from({ length: 80 }).map((_, i) => {
              const seed1 = (i * 2654435761) >>> 0;
              const seed2 = (seed1 * 2654435761) >>> 0;
              const seed3 = (seed2 * 2654435761) >>> 0;
              const seed4 = (seed3 * 2654435761) >>> 0;
              const seed5 = (seed4 * 2654435761) >>> 0;
              const seed6 = (seed5 * 2654435761) >>> 0;

              const left = (seed1 % 1000) / 10;
              const top = (seed2 % 1000) / 10;
              const size = 1 + (seed3 % 20) / 10;
              const opacity = 0.1 + (seed4 % 50) / 100;
              const duration = 2 + (seed5 % 40) / 10;
              const delay = (seed6 % 40) / 10;

              return (
                <div key={i} style={{
                  position: 'absolute',
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${size}px`,
                  height: `${size}px`,
                  borderRadius: '50%',
                  background: 'white',
                  opacity: opacity,
                  animation: `twinkle ${duration}s ease-in-out infinite`,
                  animationDelay: `${delay}s`,
                }} />
              );
            })}
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
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
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
                          lat: parseFloat(r.lat),
                          lon: parseFloat(r.lon),
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
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
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
              onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
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
              onMouseOut={e => selLoc && (e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,150,255,0.35)')}
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
            <ToolBtn active={showSat} onClick={() => setShowSat(!showSat)} icon="🛰" label="Satellites" accent="#00d4ff" />
            <ToolBtn active={showPlanet} onClick={() => setShowPlanet(!showPlanet)} icon="🪐" label="Planets" accent="#ffd166" />
            <ToolBtn
              active={showConst}
              onClick={() => {
                setShowConst(prev => {
                  const next = !prev;
                  // Clear or rebuild immediately
                  if (!next && constGroupRef.current) {
                    while (constGroupRef.current.children.length > 0)
                      constGroupRef.current.remove(constGroupRef.current.children[0]);
                  }
                  return next;
                });
              }}
              icon="⭐" label="Constellations" accent="#9b7cff"
            />
            <ToolBtn active={showGround} onClick={() => setShowGround(!showGround)} icon="⛰" label="Ground" accent="#44bb88" />
            <ToolBtn active={showAtm} onClick={() => setShowAtm(!showAtm)} icon="🌫" label="Atmosphere" accent="#4488ff" />
            <ToolBtn active={showGrid} onClick={() => setShowGrid(!showGrid)} icon="⊞" label="Grid" accent="#888888" />

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
              onMouseOut={e => { e.currentTarget.style.color = 'rgba(200,215,255,0.5)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
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
              onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)'; e.currentTarget.style.color = 'rgba(0,212,255,0.7)'; }}
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