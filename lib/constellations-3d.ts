import * as THREE from 'three';

export interface ConstellationLine3D {
  name: string;           // 3-letter IAU abbreviation e.g. "Ori"
  segments: THREE.Vector3[][];  // each segment is an array of Vector3 points
}

export interface ConstellationGeoJSON {
  features: Array<{
    id: string;
    geometry: {
      coordinates: number[][][];
    };
  }>;
}

export function buildConstellationLines3D(
  geojson: ConstellationGeoJSON,
  radius: number = 880
): ConstellationLine3D[] {
  const result: ConstellationLine3D[] = [];

  for (const feature of geojson.features) {
    const name = feature.id as string;
    const multiLine = feature.geometry.coordinates as number[][][];
    const segments: THREE.Vector3[][] = [];

    for (const lineString of multiLine) {
      const pts: THREE.Vector3[] = [];
      for (const [raDeg, decDeg] of lineString) {
        // Convert RA degrees → RA hours for our eqToVec function
        // RA in degrees: 0-360 maps to 0-24 hours
        const raHours = raDeg / 15.0;
        pts.push(eqToVec(raHours, decDeg, radius));
      }
      if (pts.length >= 2) segments.push(pts);
    }

    if (segments.length > 0) {
      result.push({ name, segments });
    }
  }

  return result;
}

// The same eqToVec used in the main page — equatorial coords → Three.js space
// +Y = North Celestial Pole, RA=0h/Dec=0 → +X at LST=0
export function eqToVec(raHours: number, decDeg: number, r: number): THREE.Vector3 {
  const ra  = raHours * 15 * (Math.PI / 180);  // convert hours → degrees → radians
  const dec = decDeg * (Math.PI / 180);
  return new THREE.Vector3(
    r * Math.cos(dec) * Math.cos(ra),
    r * Math.sin(dec),
   -r * Math.cos(dec) * Math.sin(ra)
  );
}
