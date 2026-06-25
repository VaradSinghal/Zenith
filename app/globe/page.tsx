'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Space_Mono, Space_Grotesk } from 'next/font/google';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getPlanetPositions } from '@/lib/planets';
import { propagateAll, parseTLEBlock, SatelliteRecord, computeSkyPath, OverheadObject } from '@/lib/propagate';
import { buildConstellationLines3D, ConstellationLine3D } from '@/lib/constellations-3d';

const spaceMono = Space_Mono({ weight: ['400', '700'], subsets: ['latin'] });
const spaceGrotesk = Space_Grotesk({ weight: ['300', '400', '600', '700'], subsets: ['latin'] });

// ─── Earth shaders ────────────────────────────────────────────────────────────
const EARTH_VERT = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;
  void main() {
    vNormal   = normalize(normalMatrix * normal);
    vPosition = position;
    vUv       = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const EARTH_FRAG = `
  uniform sampler2D dayTex;
  uniform sampler2D nightTex;
  uniform sampler2D cloudTex;
  uniform sampler2D specTex;
  uniform vec3  sunDirection;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;

  void main() {
    vec3 n = normalize(vNormal);
    float NdotL = dot(n, sunDirection);

    float terminator = smoothstep(-0.18, 0.18, NdotL);

    vec4 day   = texture2D(dayTex,   vUv);
    vec4 night = texture2D(nightTex, vUv);
    vec4 cloud = texture2D(cloudTex, vUv);
    float spec = texture2D(specTex,  vUv).r;

    vec3 nightColor = night.rgb * 1.8;
    float diffuse = max(NdotL, 0.0);
    vec3 dayColor = day.rgb * (0.15 + 0.85 * diffuse);

    vec3 viewDir = normalize(-vPosition);
    vec3 halfVec = normalize(sunDirection + viewDir);
    float specular = pow(max(dot(n, halfVec), 0.0), 64.0) * spec * 0.6;

    vec3 surface = mix(nightColor, dayColor + vec3(specular), terminator);
    float cloudAlpha = cloud.r * (0.5 + 0.5 * terminator);
    vec3 final = mix(surface, vec3(0.95, 0.97, 1.0) * max(diffuse, 0.1), cloudAlpha * 0.7);

    gl_FragColor = vec4(final, 1.0);
  }
`;

const ATMOS_VERT = `
  varying vec3 vNormal;
  varying vec3 vPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPos    = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMOS_FRAG = `
  uniform vec3 sunDirection;
  varying vec3 vNormal;
  varying vec3 vPos;
  void main() {
    vec3 n = normalize(vNormal);
    float rim = 1.0 - abs(dot(n, vec3(0.0, 0.0, 1.0)));
    rim = pow(rim, 3.5);
    float NdotL = dot(n, sunDirection);
    float lit = smoothstep(-0.3, 0.5, NdotL);
    vec3 dayAtmos  = mix(vec3(0.1, 0.4, 0.9), vec3(0.4, 0.6, 1.0), rim) * lit;
    vec3 duskAtmos = mix(vec3(0.6, 0.2, 0.05), vec3(0.9, 0.5, 0.1), rim) * (1.0 - lit) * smoothstep(0.0, 0.4, lit + 0.5);
    gl_FragColor   = vec4(dayAtmos + duskAtmos, rim * 0.7);
  }
`;

interface PinnedLocation { lat: number; lon: number; name: string; }
interface NominatimResult { display_name: string; lat: string; lon: string }
interface ObserverLoc { name: string; lat: number; lon: number }

const D2R = Math.PI / 180;
const d2r = (d: number) => d * D2R;

function getGAST(date: Date): number {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525.0;
  const g = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000.0;
  return ((g % 360) + 360) % 360;
}

function eqToVec(raHours: number, decDeg: number, r: number): THREE.Vector3 {
  const ra = d2r(raHours * 15);
  const dec = d2r(decDeg);
  return new THREE.Vector3(r * Math.cos(dec) * Math.cos(ra), r * Math.sin(dec), -r * Math.cos(dec) * Math.sin(ra));
}

function horVec(azDeg: number, elDeg: number, r: number): THREE.Vector3 {
  const az = d2r(azDeg);
  const el = d2r(elDeg);
  return new THREE.Vector3(r * Math.cos(el) * Math.sin(az), r * Math.sin(el), -r * Math.cos(el) * Math.cos(az));
}

const CONST_NAMES: Record<string, string> = {
  'And': 'Andromeda', 'Ant': 'Antlia', 'Aps': 'Apus', 'Aqr': 'Aquarius', 'Aql': 'Aquila', 'Ara': 'Ara', 'Ari': 'Aries', 'Aur': 'Auriga',
  'Boo': 'Boötes', 'Cae': 'Caelum', 'Cam': 'Camelopardalis', 'Cnc': 'Cancer', 'CVn': 'Canes Venatici', 'CMa': 'Canis Major', 'CMi': 'Canis Minor',
  'Cap': 'Capricornus', 'Car': 'Carina', 'Cas': 'Cassiopeia', 'Cen': 'Centaurus', 'Cep': 'Cepheus', 'Cet': 'Cetus', 'Cha': 'Chamaeleon', 'Cir': 'Circinus',
  'Col': 'Columba', 'Com': 'Coma Berenices', 'CrA': 'Corona Australis', 'CrB': 'Corona Borealis', 'Crv': 'Corvus', 'Crt': 'Crater', 'Cru': 'Crux',
  'Cyg': 'Cygnus', 'Del': 'Delphinus', 'Dor': 'Dorado', 'Dra': 'Draco', 'Equ': 'Equuleus', 'Eri': 'Eridanus', 'For': 'Fornax', 'Gem': 'Gemini',
  'Gru': 'Grus', 'Her': 'Hercules', 'Hor': 'Horologium', 'Hya': 'Hydra', 'Hyi': 'Hydrus', 'Ind': 'Indus', 'Lac': 'Lacerta', 'Leo': 'Leo',
  'LMi': 'Leo Minor', 'Lep': 'Lepus', 'Lib': 'Libra', 'Lup': 'Lupus', 'Lyn': 'Lynx', 'Lyr': 'Lyra', 'Men': 'Mensa', 'Mic': 'Microscopium',
  'Mon': 'Monoceros', 'Mus': 'Musca', 'Nor': 'Norma', 'Oct': 'Octans', 'Oph': 'Ophiuchus', 'Ori': 'Orion', 'Pav': 'Pavo', 'Peg': 'Pegasus',
  'Per': 'Perseus', 'Phe': 'Phoenix', 'Pic': 'Pictor', 'Psc': 'Pisces', 'PsA': 'Piscis Austrinus', 'Pup': 'Puppis', 'Pyx': 'Pyxis', 'Ret': 'Reticulum',
  'Sge': 'Sagitta', 'Sgr': 'Sagittarius', 'Sco': 'Scorpius', 'Scl': 'Sculptor', 'Sct': 'Scutum', 'Ser': 'Serpens', 'Sex': 'Sextans', 'Tau': 'Taurus',
  'Tel': 'Telescopium', 'Tri': 'Triangulum', 'TrA': 'Triangulum Australe', 'Tuc': 'Tucana', 'UMa': 'Ursa Major', 'UMi': 'Ursa Minor', 'Vel': 'Vela',
  'Vir': 'Virgo', 'Vol': 'Volans', 'Vul': 'Vulpecula',
};

const CARDINALS = [
  { l: 'N', az: 0 }, { l: 'NE', az: 45 }, { l: 'E', az: 90 }, { l: 'SE', az: 135 }, { l: 'S', az: 180 }, { l: 'SW', az: 225 }, { l: 'W', az: 270 }, { l: 'NW', az: 315 },
];

function makeISS(): THREE.Group {
  const g = new THREE.Group();
  const silver = new THREE.MeshPhongMaterial({ color: 0xc8c8c8, specular: 0x666666, shininess: 80 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.012), silver));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 32, 32), new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(glow);
  return g;
}

function makeStarlink(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.004, 0.008), new THREE.MeshPhongMaterial({ color: 0xaaaacc, specular: 0x666666, shininess: 80 })));
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.002, 0.007), new THREE.MeshPhongMaterial({ color: 0x0d1560, specular: 0x4455cc, shininess: 120 }));
  panel.position.y = -0.004; g.add(panel);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 12), new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(glow);
  return g;
}

export default function GlobePage() {
  const router = useRouter();

  const [viewMode, setViewMode] = useState<'globe' | 'sky'>('globe');
  const [pinnedLocation, setPinnedLocation] = useState<PinnedLocation | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [selLoc, setSelLoc] = useState<ObserverLoc | null>(null);
  const [observer, setObserver] = useState({ lat: 28.61, lon: 77.21 });

  const [showSat, setShowSat] = useState(true);
  const [showPlanet, setShowPlanet] = useState(true);
  const [showConst, setShowConst] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [showGround, setShowGround] = useState(true);
  const [showAtm, setShowAtm] = useState(true);

  const [playing, setPlaying] = useState(true);
  const [timeOffset, setTimeOffset] = useState(0);
  const simTimeRef = useRef(Date.now());
  const [dispTime, setDispTime] = useState('');

  const [tles, setTles] = useState<SatelliteRecord[]>([]);
  const [selectedSat, setSelectedSat] = useState<OverheadObject | null>(null);

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
  const selectedSatRef = useRef<OverheadObject | null>(selectedSat);
  const drawnSatsRef = useRef<{ s: OverheadObject, x: number, y: number }[]>([]);
  const orbitPathRef = useRef<THREE.Vector3[]>([]);
  const pointerDownPosRef = useRef<{ x: number, y: number } | null>(null);

  const mountRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rafRef = useRef<number>(0);

  const earthGroupRef = useRef<THREE.Group | null>(null);
  const cloudsRef = useRef<THREE.Mesh | null>(null);
  const earthMeshRef = useRef<THREE.Mesh | null>(null);
  const markerGroupRef = useRef<THREE.Group | null>(null);
  const skyDomeRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const celestialGroupRef = useRef<THREE.Group | null>(null);
  const orbitalPathsRef = useRef<THREE.Line[]>([]);

  const starSphereRef = useRef<THREE.Group | null>(null);
  const constGroupRef = useRef<THREE.Group | null>(null);
  const constLinesDataRef = useRef<ConstellationLine3D[]>([]);
  const constCentroidsRef = useRef<Map<string, THREE.Vector3>>(new Map());
  const constFetchedRef = useRef(false);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const atmRef = useRef<THREE.Mesh | null>(null);
  const gridGroupRef = useRef<THREE.Group | null>(null);

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
  selectedSatRef.current = selectedSat;

  const dayTexture = useMemo(() => typeof window !== 'undefined' ? new THREE.TextureLoader().load('/textures/earth_day.jpg') : null, []);
  const nightTexture = useMemo(() => typeof window !== 'undefined' ? new THREE.TextureLoader().load('/textures/earth_night.jpg') : null, []);
  const cloudTexture = useMemo(() => typeof window !== 'undefined' ? new THREE.TextureLoader().load('/textures/earth_topology.png') : null, []);
  const specularTexture = useMemo(() => typeof window !== 'undefined' ? new THREE.TextureLoader().load('/textures/earth_water.png') : null, []);

  useEffect(() => {
    if (!selectedSat) { orbitPathRef.current = []; return; }
    const start = new Date(Date.now() - 50 * 60000);
    const path = computeSkyPath(selectedSat.satrec, observer, start, 60, 100);
    orbitPathRef.current = path.map(p => horVec(p.az, p.el, 750));
  }, [selectedSat, observer]);

  useEffect(() => {
    const groups = ['stations', 'visual', 'starlink', 'gps-ops', 'weather'];
    Promise.all(groups.map(g => fetch(`/api/tle?group=${g}`).then(r => r.text()).catch(() => '')))
      .then(texts => {
        const combined = texts.join('\n');
        setTles(parseTLEBlock(combined));
      });
  }, []);

  useEffect(() => {
    if (!query || selLoc) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`, { headers: { 'Accept-Language': 'en' } });
        setResults(await r.json());
      } catch { }
    }, 450);
    return () => clearTimeout(t);
  }, [query, selLoc]);

  useEffect(() => {
    const id = setInterval(() => {
      if (playing) simTimeRef.current = Date.now() + timeOffset * 60000;
      const d = new Date(simTimeRef.current);
      setDispTime(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + '  ' + d.toLocaleTimeString('en-GB', { hour12: false }) + ' UTC');
    }, 1000);
    return () => clearInterval(id);
  }, [playing, timeOffset]);

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount || !labelsRef.current) return;

    const W = window.innerWidth, H = window.innerHeight;
    const DPR = Math.min(window.devicePixelRatio, 2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, logarithmicDepthBuffer: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x000005, 1);
    renderer.sortObjects = true;
    currentMount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(55, W / H, 0.01, 10000);
    camera.position.set(0, 0, 4);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.35;
    controls.minDistance = 1.3;
    controls.maxDistance = 9;
    controlsRef.current = controls;

    const sunLight = new THREE.DirectionalLight(0xfff8e8, 2.8);
    sunLight.position.set(5, 2, 4).normalize().multiplyScalar(50);
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0x111122, 0.6);
    scene.add(ambientLight);

    const lc = labelsRef.current;
    lc.width = W * DPR; lc.height = H * DPR;
    lc.style.width = `${W}px`; lc.style.height = `${H}px`;
    const ctx = lc.getContext('2d')!;
    ctx.scale(DPR, DPR);

    /* ── Earth Group ── */
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);
    earthGroupRef.current = earthGroup;

    const sunDir = sunLight.position.clone().normalize();
    const earthMat = new THREE.ShaderMaterial({
      uniforms: {
        dayTex: { value: dayTexture },
        nightTex: { value: nightTexture },
        cloudTex: { value: cloudTexture },
        specTex: { value: specularTexture },
        sunDirection: { value: sunDir },
      },
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
    });
    const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), earthMat);
    earthGroup.add(earthMesh);
    earthMeshRef.current = earthMesh;

    const cloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.007, 128, 128),
      new THREE.MeshPhongMaterial({ map: cloudTexture, transparent: true, opacity: 0.55, blending: THREE.NormalBlending, depthWrite: false })
    );
    earthGroup.add(cloudMesh);
    cloudsRef.current = cloudMesh;

    const atmosMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 64, 64),
      new THREE.ShaderMaterial({
        uniforms: { sunDirection: { value: sunDir } },
        vertexShader: ATMOS_VERT, fragmentShader: ATMOS_FRAG,
        blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true, depthWrite: false,
      })
    );
    earthGroup.add(atmosMesh);

    const markerGroup = new THREE.Group();
    earthGroup.add(markerGroup);
    markerGroupRef.current = markerGroup;

    const celestialGroup = new THREE.Group();
    scene.add(celestialGroup);
    celestialGroupRef.current = celestialGroup;
    const addOrbitPath = (radius: number, incl: number, color: number, opacity: number) => {
      const pts = [];
      for (let i = 0; i <= 200; i++) {
        const a = (i / 200) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * Math.sin(incl) * radius, Math.sin(a) * radius));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
      celestialGroup.add(line);
      orbitalPathsRef.current.push(line);
    };
    addOrbitPath(1.20, 0.45, 0x00ff88, 0.18);
    addOrbitPath(1.50, 0.09, 0x00d4ff, 0.14);
    addOrbitPath(1.65, -0.15, 0x4488ff, 0.10);

    const iss = makeISS();
    iss.userData = { type: 'iss', name: 'ISS', angle: 0, radius: 1.20, incl: 0.45 };
    celestialGroup.add(iss);
    for (let i = 0; i < 30; i++) {
      const sl = makeStarlink();
      sl.userData = { type: 'starlink', name: `STARLINK-${i + 1}`, angle: (i / 30) * Math.PI * 2, radius: 1.50 + (i % 3) * 0.04, incl: 0.09 };
      celestialGroup.add(sl);
    }

    /* ── SkyDome Group ── */
    const skyDome = new THREE.Group();
    skyDome.visible = false;
    scene.add(skyDome);
    skyDomeRef.current = skyDome;

    const starSphere = new THREE.Group();
    skyDome.add(starSphere);
    starSphereRef.current = starSphere;

    const R_STAR = 900;
    fetch('/stars.json').then(r => r.json()).then((stars) => {
      const pos = [], col = [], size = [];
      for (let i = 0; i < stars.length; i += 4) {
        const ra = stars[i], dec = stars[i + 1], mag = stars[i + 2], bv = stars[i + 3];
        const v = eqToVec(ra, dec, R_STAR);
        pos.push(v.x, v.y, v.z);
        size.push(Math.max(1, (6 - mag) * 0.9));
        let r = 1, g = 1, b = 1;
        if (bv < 0) { r = 0.7; g = 0.8; b = 1.0; }
        else if (bv < 0.5) { r = 0.9; g = 0.95; b = 1.0; }
        else if (bv < 1.0) { r = 1.0; g = 0.9; b = 0.7; }
        else { r = 1.0; g = 0.7; b = 0.5; }
        col.push(r, g, b);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 } },
        vertexShader: `
          attribute float size; attribute vec3 color; varying vec3 vColor; uniform float time;
          void main() { vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * (400.0 / -mv.z); gl_Position = projectionMatrix * mv; }
        `,
        fragmentShader: `
          varying vec3 vColor;
          void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vColor, 1.0 - smoothstep(0.2, 0.5, d)); }
        `,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true
      });
      starSphere.add(new THREE.Points(geo, mat));

      if (!constFetchedRef.current) {
        constFetchedRef.current = true;
        fetch('/constellations.lines.json').then(r => r.json()).then(data => {
          constLinesDataRef.current = buildConstellationLines3D(data, R_STAR);
        });
      }
    });

    const mwPos = [];
    for (let i = 0; i < 8000; i++) {
      const angle = (i / 8000) * Math.PI * 2;
      const spread = (Math.random() - 0.5) * 0.6;
      mwPos.push(R_STAR * Math.cos(angle) * Math.cos(spread), R_STAR * Math.sin(spread) * 0.25, R_STAR * Math.sin(angle) * Math.cos(spread));
    }
    const mwGeo = new THREE.BufferGeometry();
    mwGeo.setAttribute('position', new THREE.Float32BufferAttribute(mwPos, 3));
    const mwMat = new THREE.PointsMaterial({ color: 0x6677cc, size: 1.5, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const milkyWay = new THREE.Points(mwGeo, mwMat);
    milkyWay.rotation.x = d2r(62.9);
    milkyWay.rotation.y = d2r(282.85);
    starSphere.add(milkyWay);

    const constGroup = new THREE.Group();
    starSphere.add(constGroup);
    constGroupRef.current = constGroup;

    const groundDisc = new THREE.Mesh(
      new THREE.CircleGeometry(880, 64),
      new THREE.ShaderMaterial({
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec2 vUv; void main() { float d = length(vUv - 0.5); vec3 horizon = mix(vec3(0.02, 0.08, 0.15), vec3(0.005, 0.02, 0.05), smoothstep(0.0, 0.5, d)); vec3 col = mix(vec3(0.01, 0.03, 0.02), horizon, smoothstep(0.35, 0.5, d)); gl_FragColor = vec4(col, 1.0); }`,
        side: THREE.DoubleSide,
      })
    );
    groundDisc.rotation.x = -Math.PI / 2;
    groundDisc.position.y = -1;
    skyDome.add(groundDisc);
    groundRef.current = groundDisc;

    const horizonLine = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(Array.from({ length: 128 }, (_, i) => new THREE.Vector3(880 * Math.cos((i / 128) * Math.PI * 2), -0.8, 880 * Math.sin((i / 128) * Math.PI * 2)))),
      new THREE.LineBasicMaterial({ color: 0x44aa88, transparent: true, opacity: 0.4 })
    );
    skyDome.add(horizonLine);

    const atmGeo = new THREE.CylinderGeometry(890, 890, 100, 64, 1, true);
    const atmMat = new THREE.ShaderMaterial({
      vertexShader: `varying float vY; void main() { vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying float vY; void main() { float t = (vY + 50.0) / 100.0; vec3 col = mix(vec3(0.05, 0.2, 0.4), vec3(0.0, 0.0, 0.0), t); gl_FragColor = vec4(col, (1.0-t)*0.8); }`,
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    });
    const atm = new THREE.Mesh(atmGeo, atmMat);
    skyDome.add(atm);
    atmRef.current = atm;

    const gridGroup = new THREE.Group();
    const gridMat = new THREE.LineBasicMaterial({ color: 0x224466, transparent: true, opacity: 0.3 });
    for (let el = 0; el <= 90; el += 15) {
      const pts = [];
      const r = 880 * Math.cos(d2r(el));
      const h = 880 * Math.sin(d2r(el));
      for (let az = 0; az <= 360; az += 2) pts.push(new THREE.Vector3(r * Math.sin(d2r(az)), h, -r * Math.cos(d2r(az))));
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    for (let az = 0; az < 360; az += 15) {
      const pts = [];
      for (let el = 0; el <= 90; el += 2) pts.push(new THREE.Vector3(880 * Math.cos(d2r(el)) * Math.sin(d2r(az)), 880 * Math.sin(d2r(el)), -880 * Math.cos(d2r(el)) * Math.cos(d2r(az))));
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    skyDome.add(gridGroup);
    gridGroupRef.current = gridGroup;

    const handleClick = (e: MouseEvent) => {
      // If we are in sky mode, don't pin location
      // But we check current state by using refs or just check skyDome visibility
      if (skyDome.visible) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const hits = raycasterRef.current.intersectObject(earthMesh);
      if (!hits.length) return;

      const localPoint = earthGroup.worldToLocal(hits[0].point.clone());
      const lat = Math.asin(localPoint.y) * (180 / Math.PI);
      const lon = Math.atan2(localPoint.z, localPoint.x) * (180 / Math.PI);

      setPinnedLocation({ lat, lon, name: `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}` });
      setObserver({ lat, lon });

      markerGroup.clear();
      const pinG = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.018, 0.022, 32), new THREE.MeshBasicMaterial({ color: 0xff3344, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; pinG.add(ring);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 8), new THREE.MeshBasicMaterial({ color: 0xff3344 }));
      cone.rotation.x = Math.PI; cone.position.y = 0.02; pinG.add(cone);
      pinG.position.copy(localPoint.normalize().multiplyScalar(1.005));
      pinG.lookAt(0, 0, 0);
      markerGroup.add(pinG);
    };

    renderer.domElement.addEventListener('click', handleClick);

    const onWheel = (e: WheelEvent) => {
      if (skyDome.visible) {
        e.preventDefault();
        camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * 0.04, 12, 80);
        camera.updateProjectionMatrix();
      }
    };
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const handleResize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      lc.width = w * DPR; lc.height = h * DPR;
      lc.style.width = `${w}px`; lc.style.height = `${h}px`;
      ctx.resetTransform(); ctx.scale(DPR, DPR);
    };
    window.addEventListener('resize', handleResize);

    const worldToScreen = (v: THREE.Vector3) => {
      v.project(camera);
      if (v.z > 1) return null;
      return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
    };

    let lastSatCalc = 0;
    let cachedOverhead: OverheadObject[] = [];
    const SAT_UPDATE_MS = 2000;

    const animate = (time: number) => {
      rafRef.current = requestAnimationFrame(animate);
      const t = time * 0.001;

      const starSphereNode = starSphere.children[0] as THREE.Points | undefined;

      if (
        starSphereNode &&
        starSphereNode.material instanceof THREE.ShaderMaterial &&
        starSphereNode.material.uniforms?.time
      ) {
        starSphereNode.material.uniforms.time.value = t;
      }

      if (!skyDome.visible) {
        earthGroup.rotation.y = t * 0.018;
        if (cloudsRef.current) cloudsRef.current.rotation.y = t * 0.023;

        celestialGroup.children.forEach((child: THREE.Object3D) => {
          if (!child.userData?.type) return;
          const { angle, radius, incl = 0 } = child.userData;
          let speed = 0.25;
          if (child.userData.type === 'iss') speed = 0.42;
          if (child.userData.type === 'starlink') speed = 0.30;
          const a = t * speed + angle;
          child.position.set(Math.cos(a) * radius, Math.sin(a) * Math.sin(incl) * radius, Math.sin(a) * radius);
          child.lookAt(0, 0, 0);
          child.rotation.z += 0.005;
        });

        orbitalPathsRef.current.forEach((p, i) => {
          (p.material as THREE.LineBasicMaterial).opacity = 0.08 + Math.sin(t * 0.5 + i) * 0.06;
        });

        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        controls.update();

      } else {
        const obs = observerRef.current;
        const now = new Date(simTimeRef.current);
        const gast = getGAST(now);
        const lst = (gast + obs.lon) % 360;

        starSphere.rotation.set(0, 0, 0);
        starSphere.rotateY(-d2r(lst));
        starSphere.rotateX(d2r(90 - obs.lat));

        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        if (showConstRef.current && constGroup.children.length === 0 && constLinesDataRef.current.length > 0) {
          const mat = new THREE.LineBasicMaterial({ color: 0x4466aa, transparent: true, opacity: 0.35 });
          constLinesDataRef.current.forEach(cl => {
            let totalPts = 0;
            const v = new THREE.Vector3();
            cl.segments.forEach(seg => {
              const geo = new THREE.BufferGeometry().setFromPoints(seg);
              const line = new THREE.Line(geo, mat);
              constGroup.add(line);
              seg.forEach(p => { v.add(p); totalPts++; });
            });
            if (totalPts > 0) {
              v.divideScalar(totalPts);
              constCentroidsRef.current.set(cl.name, v.normalize().multiplyScalar(R_STAR - 10));
            }
          });
        }
        constGroup.visible = showConstRef.current;

        if (groundRef.current) groundRef.current.visible = showGroundRef.current;
        if (atmRef.current) atmRef.current.visible = showAtmRef.current;
        if (gridGroupRef.current) gridGroupRef.current.visible = showGridRef.current;

        ctx.fillStyle = 'rgba(200, 220, 255, 0.4)';
        ctx.font = `600 12px "${spaceGrotesk.style.fontFamily}"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const c of CARDINALS) {
          const sp = worldToScreen(horVec(c.az, 0, 800));
          if (sp) ctx.fillText(c.l, sp.x, sp.y - 15);
        }

        if (showConstRef.current && constGroup.children.length > 0) {
          ctx.fillStyle = 'rgba(100, 150, 255, 0.45)';
          ctx.font = `400 10px "${spaceMono.style.fontFamily}"`;
          Array.from(constCentroidsRef.current.entries()).forEach(([id, vec]) => {
            const worldVec = vec.clone().applyMatrix4(starSphere.matrixWorld);
            const sp = worldToScreen(worldVec);
            if (sp) ctx.fillText(CONST_NAMES[id] || id, sp.x, sp.y);
          });
        }

        if (showPlanetRef.current) {
          const planets = getPlanetPositions(obs, now);
          ctx.font = `500 12px "${spaceGrotesk.style.fontFamily}"`;
          for (const p of planets) {
            if (p.el < 0) continue;
            const sp = worldToScreen(horVec(p.az, p.el, 850));
            if (sp) {
              ctx.fillStyle = p.name === 'Sun' ? '#fff9e6' : p.name === 'Moon' ? '#eeeeee' : p.name === 'Mars' ? '#ff9977' : '#ffd166';
              ctx.beginPath(); ctx.arc(sp.x, sp.y, 4, 0, 2 * Math.PI); ctx.fill();
              ctx.fillStyle = 'rgba(255,255,255,0.7)';
              ctx.fillText(p.name, sp.x, sp.y + 12);
            }
          }
        }

        if (showSatRef.current && tlesRef.current.length > 0) {
          if (t - lastSatCalc > SAT_UPDATE_MS) {
            cachedOverhead = propagateAll(tlesRef.current, obs, now);
            lastSatCalc = t;
          }

          drawnSatsRef.current = [];

          if (selectedSatRef.current && orbitPathRef.current.length > 0) {
            ctx.beginPath();
            let first = true;
            for (const pos of orbitPathRef.current) {
              const sp = worldToScreen(pos);
              if (!sp) continue;
              if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
              else { ctx.lineTo(sp.x, sp.y); }
            }
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }

          const pulseMag = 0.5 + 0.5 * Math.sin(t * 0.004);
          for (const s of cachedOverhead) {
            const isSelected = selectedSatRef.current && selectedSatRef.current.noradId === s.noradId;
            if (selectedSatRef.current && !isSelected) continue;

            const pos = horVec(s.az, s.el, 750);
            const sp = worldToScreen(pos);
            if (!sp) continue;

            drawnSatsRef.current.push({ s, x: sp.x, y: sp.y });

            const isISS = s.type === 'iss';
            const isStarlink = s.type === 'starlink';

            ctx.fillStyle = isISS ? '#00ff88' : isStarlink ? '#00d4ff' : '#ffffff';
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, isISS ? 3 : 1.5, 0, 2 * Math.PI);
            ctx.fill();

            if (isISS) {
              ctx.strokeStyle = `rgba(0, 255, 136, ${0.2 + 0.8 * pulseMag})`;
              ctx.beginPath();
              ctx.moveTo(sp.x - 8, sp.y); ctx.lineTo(sp.x + 8, sp.y);
              ctx.moveTo(sp.x, sp.y - 8); ctx.lineTo(sp.x, sp.y + 8);
              ctx.stroke();
            }

            if (isSelected) {
              ctx.strokeStyle = '#fff';
              ctx.beginPath(); ctx.arc(sp.x, sp.y, 8, 0, 2 * Math.PI); ctx.stroke();
            } else if (isStarlink || s.type === 'other') {
              ctx.fillStyle = `rgba(255, 255, 255, ${isStarlink ? 0.4 : 0.6})`;
              ctx.font = `400 8px "${spaceMono.style.fontFamily}"`;
              const label = isStarlink ? `SL-${s.noradId % 10000}` : s.name.substring(0, 6);
              ctx.fillText(label, sp.x, sp.y + 8);
            }
          }
        }
        controls.update();
      }

      renderer.render(scene, camera);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.domElement.removeEventListener('click', handleClick);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', handleResize);
      currentMount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [dayTexture, nightTexture, cloudTexture, specularTexture]);

  /* ── Transition ── */
  const handleTransitionToSky = useCallback(() => {
    if (!pinnedLocation || isTransitioning) return;
    setIsTransitioning(true);

    const camera = cameraRef.current!;
    const controls = controlsRef.current!;
    const earthGroup = earthGroupRef.current!;

    const { lat, lon } = pinnedLocation;
    const latR = lat * D2R, lonR = lon * D2R;
    const earthY = earthGroup.rotation.y;
    const targetDir = new THREE.Vector3(Math.cos(latR) * Math.cos(lonR + earthY), Math.sin(latR), Math.cos(latR) * Math.sin(lonR + earthY)).normalize();

    const duration = 2200;
    const startTime = Date.now();

    const animateTransition = () => {
      const elapsed = Date.now() - startTime;
      const raw = Math.min(elapsed / duration, 1);
      const eased = raw < 0.7 ? (raw / 0.7) * (raw / 0.7) : 1.0;

      const mid = targetDir.clone().multiplyScalar(1.1 - eased * 1.12);
      camera.position.lerp(mid, 0.06);

      if (raw < 1) {
        requestAnimationFrame(animateTransition);
      } else {
        setViewMode('sky');
        setIsTransitioning(false);

        camera.position.set(0, 0.5, 0);
        camera.fov = 80;
        camera.up.set(0, 1, 0);
        camera.updateProjectionMatrix();

        const LOOK_RADIUS = 0.05;
        controls.minDistance = LOOK_RADIUS;
        controls.maxDistance = LOOK_RADIUS;
        controls.enableZoom = false;
        controls.enablePan = false;
        controls.rotateSpeed = -0.4;
        const initialLookDir = new THREE.Vector3(0, 0.2, -1).sub(camera.position).normalize();
        controls.target.copy(camera.position).addScaledVector(initialLookDir, LOOK_RADIUS);
        controls.update();

        if (earthGroupRef.current) earthGroupRef.current.visible = false;
        if (celestialGroupRef.current) celestialGroupRef.current.visible = false;
        if (skyDomeRef.current) skyDomeRef.current.visible = true;
      }
    };
    animateTransition();
  }, [pinnedLocation, isTransitioning]);

  const handleBackToGlobe = useCallback(() => {
    setIsTransitioning(true);
    const camera = cameraRef.current!;
    const controls = controlsRef.current!;

    setViewMode('globe');
    setIsTransitioning(false);

    camera.position.set(0, 0, 4);
    camera.fov = 55;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.minDistance = 1.3;
    controls.maxDistance = 9;
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.rotateSpeed = 0.35;
    controls.update();

    if (earthGroupRef.current) earthGroupRef.current.visible = true;
    if (celestialGroupRef.current) celestialGroupRef.current.visible = true;
    if (skyDomeRef.current) skyDomeRef.current.visible = false;
  }, []);

  const handleReset = useCallback(() => {
    setPinnedLocation(null);
    if (markerGroupRef.current) markerGroupRef.current.clear();
  }, []);

  // UI Button Helper
  const ToolBtn = ({ active, onClick, icon, label, accent }: { active: boolean; onClick: () => void; icon: string; label: string; accent: string }) => (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
      background: active ? `rgba(${hexToRgb(accent)}, 0.15)` : 'rgba(255,255,255,0.03)',
      border: `0.5px solid ${active ? accent : 'rgba(255,255,255,0.1)'}`,
      borderRadius: 14, color: active ? '#fff' : 'rgba(255,255,255,0.4)',
      fontSize: 11, cursor: 'pointer', transition: 'all 0.2s',
      boxShadow: active ? `0 0 12px rgba(${hexToRgb(accent)}, 0.2)` : 'none'
    }}>
      <span style={{ fontSize: 13, filter: active ? `drop-shadow(0 0 4px ${accent})` : 'none' }}>{icon}</span>
      <span className={spaceGrotesk.className} style={{ fontWeight: active ? 600 : 400, letterSpacing: '0.04em' }}>{label}</span>
    </button>
  );

  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  };

  const tinyBtnStyle: React.CSSProperties = {
    padding: '4px 8px', background: 'transparent', border: '0.5px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: 'rgba(255,255,255,0.5)', fontSize: 10, cursor: 'pointer',
    fontFamily: spaceMono.style.fontFamily
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: '#000008', overflow: 'hidden', touchAction: 'none' }}
      className={spaceMono.className}
      onPointerDown={(e) => {
        if (viewMode !== 'sky') return;
        pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (viewMode !== 'sky' || !pointerDownPosRef.current) return;
        const dx = e.clientX - pointerDownPosRef.current.x;
        const dy = e.clientY - pointerDownPosRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) < 5) {
          let closest = null;
          let minDist = 15;
          for (const item of drawnSatsRef.current) {
            const dist = Math.sqrt(Math.pow(item.x - e.clientX, 2) + Math.pow(item.y - e.clientY, 2));
            if (dist < minDist) { minDist = dist; closest = item.s; }
          }
          setSelectedSat(closest);
        }
        pointerDownPosRef.current = null;
      }}
    >
      <div ref={mountRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
      <canvas ref={labelsRef} style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }} />

      {/* ── Header ── */}
      <div className="absolute top-0 left-0 right-0 p-5 flex justify-between items-start z-10 pointer-events-none">
        <div className="pointer-events-auto">
          <h1 className={spaceGrotesk.className} style={{ fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.03em', background: 'linear-gradient(135deg, #fff 30%, #88bbff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0, lineHeight: 1 }}>Zenith</h1>
          <p style={{ color: 'rgba(180,200,255,0.6)', fontSize: '0.8rem', margin: '4px 0 0', letterSpacing: '0.04em' }}>
            {viewMode === 'globe' ? 'CLICK EARTH TO PIN LOCATION' : `SKY VIEW · ${pinnedLocation?.name ?? ''}`}
          </p>
        </div>
        <button onClick={() => router.push('/')} style={{ pointerEvents: 'auto', padding: '8px 18px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, color: '#fff', fontSize: '0.85rem', cursor: 'pointer', backdropFilter: 'blur(12px)' }}>← Back</button>
      </div>

      {/* ── Search / Pin panel (Globe Mode) ── */}
      {viewMode === 'globe' && (
        <div style={{ position: 'absolute', bottom: 32, left: 32, zIndex: 10 }}>
          {!pinnedLocation && (
            <div style={{ background: 'rgba(4,12,28,0.82)', backdropFilter: 'blur(20px)', border: '1px solid rgba(100,160,255,0.2)', borderRadius: 20, padding: '20px', width: 320 }}>
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <input placeholder="Search city or location…" value={selLoc ? selLoc.name : query} onChange={e => { setQuery(e.target.value); setSelLoc(null); }} style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#fff', outline: 'none' }} />
                {results.length > 0 && !selLoc && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, background: 'rgba(4,8,24,0.98)', borderRadius: 10, overflow: 'hidden', zIndex: 20 }}>
                    {results.map((r, i) => (
                      <div key={i} onClick={() => {
                        const loc = { name: r.display_name.split(',')[0], lat: parseFloat(r.lat), lon: parseFloat(r.lon) };
                        setSelLoc(loc); setResults([]); setPinnedLocation(loc); setObserver({ lat: loc.lat, lon: loc.lon });
                      }} style={{ padding: '10px 14px', fontSize: 12, color: '#ddd', cursor: 'pointer', borderBottom: '1px solid #223' }}>{r.display_name}</div>
                    ))}
                  </div>
                )}
              </div>
              <p style={{ color: 'rgba(180,200,255,0.5)', fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>Or drag globe & click to pin</p>
            </div>
          )}

          {pinnedLocation && (
            <div style={{ background: 'rgba(4,12,28,0.82)', backdropFilter: 'blur(20px)', border: '1px solid rgba(100,160,255,0.2)', borderRadius: 20, padding: '20px 24px', minWidth: 280 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #ff3344, #ff6655)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📍</div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>Pinned Location</div>
                  <div style={{ color: 'rgba(150,180,255,0.7)', fontSize: '0.75rem', marginTop: 2 }}>{pinnedLocation.name}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleTransitionToSky} style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #1a4aff, #8844ff)', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>🔭 View Sky</button>
                <button onClick={handleReset} style={{ padding: '10px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#aac', fontSize: '0.85rem', cursor: 'pointer' }}>Reset</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Sky HUD ── */}
      {viewMode === 'sky' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: 16, right: 20, pointerEvents: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ fontSize: 11, color: '#00ff88', letterSpacing: '0.08em' }}>● {tles.length > 0 ? `${tles.length} satellites loaded` : 'Loading TLEs…'}</div>
            <div style={{ fontSize: 10, color: 'rgba(150,180,220,0.55)', letterSpacing: '0.06em' }}>{dispTime}</div>
          </div>

          {selectedSat && (
            <div style={{ position: 'absolute', top: 80, right: 20, width: 280, pointerEvents: 'auto', background: 'rgba(4,8,24,0.85)', backdropFilter: 'blur(24px)', border: '0.5px solid rgba(0,212,255,0.2)', borderRadius: 16, padding: '20px', boxShadow: '0 12px 40px rgba(0,0,0,0.6)', color: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <h2 className={spaceGrotesk.className} style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px 0', letterSpacing: '0.05em' }}>{selectedSat.name}</h2>
                  <div style={{ fontSize: 10, color: 'rgba(0,212,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{selectedSat.type === 'iss' ? 'Manned Station' : selectedSat.type} · NORAD {selectedSat.noradId}</div>
                </div>
                <button onClick={() => setSelectedSat(null)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 20, padding: '0 4px', lineHeight: 1 }}>×</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'rgba(255,255,255,0.4)' }}>Altitude</span><span style={{ fontFamily: 'monospace' }}>{selectedSat.altKm.toFixed(1)} km</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'rgba(255,255,255,0.4)' }}>Velocity</span><span style={{ fontFamily: 'monospace' }}>{selectedSat.velKmS.toFixed(2)} km/s</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'rgba(255,255,255,0.4)' }}>Period</span><span style={{ fontFamily: 'monospace' }}>{selectedSat.periodMin.toFixed(1)} min</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'rgba(255,255,255,0.4)' }}>Azimuth</span><span style={{ fontFamily: 'monospace' }}>{selectedSat.az.toFixed(1)}°</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'rgba(255,255,255,0.4)' }}>Elevation</span><span style={{ fontFamily: 'monospace', color: selectedSat.el > 0 ? '#00ff88' : '#ff4444' }}>{selectedSat.el.toFixed(1)}°</span></div>
              </div>
            </div>
          )}

          <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(4,8,24,0.85)', backdropFilter: 'blur(24px)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '7px 10px' }}>
            <ToolBtn active={showSat} onClick={() => setShowSat(!showSat)} icon="🛰" label="Satellites" accent="#00d4ff" />
            <ToolBtn active={showPlanet} onClick={() => setShowPlanet(!showPlanet)} icon="🪐" label="Planets" accent="#ffd166" />
            <ToolBtn active={showConst} onClick={() => setShowConst(!showConst)} icon="⭐" label="Constellations" accent="#9b7cff" />
            <ToolBtn active={showGround} onClick={() => setShowGround(!showGround)} icon="⛰" label="Ground" accent="#44bb88" />
            <ToolBtn active={showAtm} onClick={() => setShowAtm(!showAtm)} icon="🌫" label="Atmosphere" accent="#4488ff" />
            <ToolBtn active={showGrid} onClick={() => setShowGrid(!showGrid)} icon="⊞" label="Grid" accent="#888888" />
            <div style={{ width: 0.5, height: 32, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
            <button onClick={() => setTimeOffset(to => to - 60)} style={tinyBtnStyle}>-1h</button>
            <button onClick={() => setTimeOffset(to => to - 10)} style={tinyBtnStyle}>-10m</button>
            <button onClick={() => setPlaying(!playing)} style={{ ...tinyBtnStyle, background: playing ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.08)', borderColor: playing ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.12)', color: playing ? '#00d4ff' : 'rgba(255,255,255,0.5)' }}>{playing ? '⏸ LIVE' : '▶ PLAY'}</button>
            <button onClick={() => { setTimeOffset(0); setPlaying(true); }} style={tinyBtnStyle}>NOW</button>
            <button onClick={() => setTimeOffset(to => to + 10)} style={tinyBtnStyle}>+10m</button>
            <button onClick={() => setTimeOffset(to => to + 60)} style={tinyBtnStyle}>+1h</button>
          </div>

          <div style={{ position: 'absolute', bottom: 24, left: 20, pointerEvents: 'auto' }}>
            <button onClick={handleBackToGlobe} style={{ background: 'rgba(4,8,24,0.8)', backdropFilter: 'blur(16px)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 14, color: '#fff', fontSize: 13, padding: '12px 20px', cursor: 'pointer' }}>← Back to Globe</button>
          </div>
        </div>
      )}

      {isTransitioning && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,2,8,0.8)', zIndex: 20, backdropFilter: 'blur(8px)' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid rgba(100,160,255,0.2)', borderTopColor: '#4488ff', animation: 'spin 0.8s linear infinite', margin: '0 0 16px 0' }} />
          <p style={{ color: 'rgba(180,210,255,0.8)', fontSize: '0.9rem', fontWeight: 500 }}>Descending to surface…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
}