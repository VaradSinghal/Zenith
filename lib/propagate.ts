import * as satellite from 'satellite.js';

export const FALLBACK_TLES = `
HST
1 20580U 90037B   26173.68477009  .00005473  00000+0  17108-3 0  9992
2 20580  28.4724  43.0006 0001525 203.6425 156.4101 15.30802244789418
NAVSTAR 43 (USA 132)
1 24876U 97035A   26173.18742406 -.00000025  00000+0  00000+0 0  9998
2 24876  55.9973  98.3798 0102724  57.0269 303.9469  2.00563879212050
ISS (ZARYA)
1 25544U 98067A   26173.73662978  .00008151  00000+0  15395-3 0  9997
2 25544  51.6325 272.6245 0004455 218.9710 141.0958 15.49373286572615
NAVSTAR 46 (USA 145)
1 25933U 99055A   26173.83288721 -.00000099  00000+0  00000+0 0  9995
2 25933  51.4579 295.2217 0106597 175.9284 222.6463  2.00562000195697
TERRA
1 25994U 99068A   26173.84897880  .00000252  00000+0  60347-4 0  9994
2 25994  97.9453 223.1708 0002020 172.1555 303.9588 14.61106688410430
AQUA
1 27424U 02022A   26173.81237367  .00000533  00000+0  11582-3 0  9991
2 27424  98.4279 143.2076 0000900  57.4018  55.8007 14.62164875284099
IRIDIUM 106
1 41917U 17003A   26173.46766422 -.00000010  00000+0 -10788-4 0  9999
2 41917  86.3960  86.3489 0001807  89.2044 270.9359 14.34217489493966
NOAA 20 (JPSS-1)
1 43013U 17073A   26173.64024289  .00000037  00000+0  38289-4 0  9996
2 43013  98.7771 113.0544 0000451 125.7011 234.4207 14.19512605445242
STARLINK-1008
1 44714U 19074B   26173.33906004  .00053469  00000+0  91659-3 0  9994
2 44714  53.1516  44.0507 0002095 161.6172 198.4914 15.50703988365010
STARLINK-1012
1 44718U 19074F   26173.84981259  .00055222  00000+0  93388-3 0  9999
2 44718  53.1560  41.8631 0001992 177.4061 182.6960 15.51072670365084
STARLINK-1017
1 44723U 19074L   26172.37955253  .00029942  00000+0  95018-3 0  9999
2 44723  53.0481  49.8614 0004356  81.8832 278.2662 15.32445178364829
CSS (TIANHE)
1 48274U 21035A   24173.35515287  .00010998  00000-0  16246-3 0  9997
2 48274  41.4729 203.9531 0004071 189.6542 320.7303 15.60228303178052
`.trim();

export type ObserverLocation = { lat: number; lon: number; altKm?: number };
export type SatType = 'iss' | 'starlink' | 'gps' | 'noaa' | 'hubble' | 'tiangong' | 'other';
export type SatelliteRecord = { name: string; satrec: satellite.SatRec; noradId: number; type: SatType };
export type OverheadObject = {
  name: string;
  az: number;
  el: number;
  rangeKm: number;
  altKm: number;
  velKmS: number;
  periodMin: number;
  mag: number;
  tier: 'naked' | 'bino' | 'track';
  type: SatType;
  noradId: number;
  satrec: satellite.SatRec;
  latDeg: number;
  lonDeg: number;
};

export interface PassDetails {
  riseTime: Date;
  setTime: Date;
  maxEl: number;
  durationMin: number;
}

export interface SkyPathPoint {
  az: number;
  el: number;
  t: Date;
}

export function parseTLEBlock(tleText: string): SatelliteRecord[] {
  const lines = tleText.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const records: SatelliteRecord[] = [];

  for (let i = 0; i < lines.length - 2; i++) {
    const line0 = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    if (line1.startsWith('1 ') && line2.startsWith('2 ')) {
      const name = line0.replace(/^0\s+/, '').trim();
      let type: SatType = 'other';
      const nameUpper = name.toUpperCase();
      
      if (nameUpper.includes('ISS') || nameUpper.includes('ZARYA')) type = 'iss';
      else if (nameUpper.includes('STARLINK')) type = 'starlink';
      else if (nameUpper.includes('GPS') || nameUpper.includes('NAVSTAR')) type = 'gps';
      else if (nameUpper.includes('NOAA')) type = 'noaa';
      else if (nameUpper.includes('HUBBLE') || nameUpper.includes('HST')) type = 'hubble';
      else if (nameUpper.includes('TIANHE') || nameUpper.includes('TIANGONG')) type = 'tiangong';

      try {
        const satrec = satellite.twoline2satrec(line1, line2);
        if (isNaN(satrec.no) || satrec.no <= 0) {
          i += 2;
          continue;
        }

        const noradId = parseInt(line1.substring(2, 7).trim(), 10) || 0;
        records.push({ name, satrec, noradId, type });
      } catch {
        // Skip parse errors
      }
      i += 2;
    }
  }

  return records;
}

export function propagateAll(satellites: SatelliteRecord[], observer: ObserverLocation, date: Date): OverheadObject[] {
  const gmst = satellite.gstime(date);
  
  const observerGd = {
    longitude: observer.lon * (Math.PI / 180),
    latitude: observer.lat * (Math.PI / 180),
    height: observer.altKm || 0
  };
  const obsEcf = satellite.geodeticToEcf(observerGd);

  const overhead: OverheadObject[] = [];

  const latRad = observerGd.latitude;
  const lonRad = observerGd.longitude;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);

  for (const sat of satellites) {
    const pv = satellite.propagate(sat.satrec, date);
    if (!pv || !pv.position || typeof pv.position === 'boolean' || !pv.velocity || typeof pv.velocity === 'boolean') {
      continue;
    }

    const posEci = pv.position as satellite.EciVec3<number>;
    const velEci = pv.velocity as satellite.EciVec3<number>;

    const velKmS = Math.sqrt(velEci.x * velEci.x + velEci.y * velEci.y + velEci.z * velEci.z);

    const posEcf = satellite.eciToEcf(posEci, gmst);
    
    // Inline ECF -> Topocentric SEZ -> Az/El math
    const rx = posEcf.x - obsEcf.x;
    const ry = posEcf.y - obsEcf.y;
    const rz = posEcf.z - obsEcf.z;
    const rangeKm = Math.sqrt(rx * rx + ry * ry + rz * rz);
    
    const topS = sinLat * cosLon * rx + sinLat * sinLon * ry - cosLat * rz;
    const topE = -sinLon * rx + cosLon * ry;
    const topZ = cosLat * cosLon * rx + cosLat * sinLon * ry + sinLat * rz;
    
    const elRad = Math.asin(topZ / rangeKm);
    const elDeg = elRad * (180 / Math.PI);
    
    if (elDeg <= 0) continue; // Skip objects below horizon
    
    let azRad = Math.atan2(topE, -topS);
    if (azRad < 0) azRad += 2 * Math.PI;
    const azDeg = azRad * (180 / Math.PI);
    
    const satGd = satellite.eciToGeodetic(posEci, gmst);
    const satLatDeg = satGd.latitude * (180 / Math.PI);
    const satLonDeg = satGd.longitude * (180 / Math.PI);
    const satAltKm = satGd.height;
    
    const periodMin = (2 * Math.PI) / sat.satrec.no;

    let mag = 4.5;
    if (sat.type === 'iss') mag = -2;
    else if (sat.type === 'starlink') mag = 3;
    else if (sat.type === 'gps') mag = 5.5;
    
    let tier: 'naked' | 'bino' | 'track' = 'track';
    if (mag < 3) tier = 'naked';
    else if (mag < 6) tier = 'bino';

    overhead.push({
      name: sat.name,
      az: azDeg,
      el: elDeg,
      rangeKm,
      altKm: satAltKm,
      velKmS,
      periodMin,
      mag,
      tier,
      type: sat.type,
      noradId: sat.noradId,
      satrec: sat.satrec,
      latDeg: satLatDeg,
      lonDeg: satLonDeg
    });
  }

  return overhead.sort((a, b) => b.el - a.el);
}

export function estimateSet(obj: OverheadObject, observer: ObserverLocation): string {
  const observerGd = {
    longitude: observer.lon * (Math.PI / 180),
    latitude: observer.lat * (Math.PI / 180),
    height: observer.altKm || 0
  };
  const obsEcf = satellite.geodeticToEcf(observerGd);
  
  const latRad = observerGd.latitude;
  const lonRad = observerGd.longitude;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);

  const now = new Date().getTime();
  
  for (let step = 1; step <= 20; step++) {
    const t = new Date(now + step * 30000); // +30s increments
    const gmst = satellite.gstime(t);
    const pv = satellite.propagate(obj.satrec, t);
    
    if (!pv || !pv.position || typeof pv.position === 'boolean') continue;
    
    const posEci = pv.position as satellite.EciVec3<number>;
    const posEcf = satellite.eciToEcf(posEci, gmst);
    
    const rx = posEcf.x - obsEcf.x;
    const ry = posEcf.y - obsEcf.y;
    const rz = posEcf.z - obsEcf.z;
    const rangeKm = Math.sqrt(rx * rx + ry * ry + rz * rz);
    
    const topZ = cosLat * cosLon * rx + cosLat * sinLon * ry + sinLat * rz;
    const elRad = Math.asin(topZ / rangeKm);
    const elDeg = elRad * (180 / Math.PI);
    
    if (elDeg <= 0) {
      const mins = (step * 30) / 60;
      return `~${mins} min above horizon`;
    }
  }
  
  return "Overhead > 10 min";
}

export function predictPasses(
  satrec: satellite.SatRec,
  observer: ObserverLocation,
  startDate: Date,
  maxPasses = 5
): PassDetails[] {
  const passes: PassDetails[] = [];
  let isUp = false;
  let currentPass: Partial<PassDetails> | null = null;
  
  const stepMs = 60 * 1000; // 1 min steps
  const maxSteps = 3 * 24 * 60; // Up to 3 days to find passes
  
  const observerGd = {
    longitude: observer.lon * (Math.PI / 180),
    latitude: observer.lat * (Math.PI / 180),
    height: observer.altKm || 0
  };
  const obsEcf = satellite.geodeticToEcf(observerGd);

  const latRad = observerGd.latitude;
  const lonRad = observerGd.longitude;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);

  for (let i = 0; i < maxSteps; i++) {
    const t = new Date(startDate.getTime() + i * stepMs);
    const pv = satellite.propagate(satrec, t);
    
    if (!pv || !pv.position || typeof pv.position === 'boolean') {
      continue;
    }
    
    const posEci = pv.position as satellite.EciVec3<number>;
    const gmst = satellite.gstime(t);
    const posEcf = satellite.eciToEcf(posEci, gmst);
    
    const rx = posEcf.x - obsEcf.x;
    const ry = posEcf.y - obsEcf.y;
    const rz = posEcf.z - obsEcf.z;
    const rangeKm = Math.sqrt(rx * rx + ry * ry + rz * rz);
    
    const topZ = cosLat * cosLon * rx + cosLat * sinLon * ry + sinLat * rz;
    const elRad = Math.asin(topZ / rangeKm);
    const elDeg = elRad * (180 / Math.PI);
    
    if (elDeg > 0) {
      if (!isUp) {
        // Rise
        isUp = true;
        currentPass = { riseTime: t, maxEl: elDeg };
      } else if (currentPass) {
        // Update maxEl
        if (elDeg > currentPass.maxEl!) {
          currentPass.maxEl = elDeg;
        }
      }
    } else {
      if (isUp) {
        // Set
        isUp = false;
        if (currentPass && currentPass.riseTime) {
          currentPass.setTime = t;
          currentPass.durationMin = (t.getTime() - currentPass.riseTime.getTime()) / 60000;
          passes.push(currentPass as PassDetails);
          if (passes.length >= maxPasses) {
            break;
          }
        }
        currentPass = null;
      }
    }
  }
  
  return passes;
}

export function computeSkyPath(
  satrec: satellite.SatRec,
  observer: ObserverLocation,
  startDate: Date,
  stepSeconds: number,
  stepCount: number
): SkyPathPoint[] {
  const path: SkyPathPoint[] = [];
  const observerGd = {
    longitude: observer.lon * (Math.PI / 180),
    latitude: observer.lat * (Math.PI / 180),
    height: observer.altKm || 0
  };
  const obsEcf = satellite.geodeticToEcf(observerGd);
  
  const latRad = observerGd.latitude;
  const lonRad = observerGd.longitude;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);

  for (let i = 0; i < stepCount; i++) {
    const t = new Date(startDate.getTime() + i * stepSeconds * 1000);
    const gmst = satellite.gstime(t);
    const pv = satellite.propagate(satrec, t);
    
    if (!pv || !pv.position || typeof pv.position === 'boolean') {
      continue;
    }
    
    const posEci = pv.position as satellite.EciVec3<number>;
    const posEcf = satellite.eciToEcf(posEci, gmst);
    
    const rx = posEcf.x - obsEcf.x;
    const ry = posEcf.y - obsEcf.y;
    const rz = posEcf.z - obsEcf.z;
    const rangeKm = Math.sqrt(rx * rx + ry * ry + rz * rz);
    
    const topS = sinLat * cosLon * rx + sinLat * sinLon * ry - cosLat * rz;
    const topE = -sinLon * rx + cosLon * ry;
    const topZ = cosLat * cosLon * rx + cosLat * sinLon * ry + sinLat * rz;
    
    const elRad = Math.asin(topZ / rangeKm);
    const elDeg = elRad * (180 / Math.PI);
    
    if (elDeg <= 0) continue;
    
    let azRad = Math.atan2(topE, -topS);
    if (azRad < 0) azRad += 2 * Math.PI;
    const azDeg = azRad * (180 / Math.PI);
    
    path.push({ az: azDeg, el: elDeg, t });
  }
  
  return path;
}
