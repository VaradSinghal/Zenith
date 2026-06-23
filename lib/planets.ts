import { Body, Equator, Horizon, Illumination, Observer } from "astronomy-engine";

export type PlanetObject = {
  name: string;
  az: number;
  el: number;
  mag: number;
  tier: "naked" | "bino" | "track";
  type: "planet" | "moon" | "sun";
};

export function getPlanetPositions(
  observer: { lat: number; lon: number },
  date: Date
): PlanetObject[] {
  const bodies: Body[] = [
    Body.Sun,
    Body.Moon,
    Body.Mercury,
    Body.Venus,
    Body.Mars,
    Body.Jupiter,
    Body.Saturn,
    Body.Uranus,
    Body.Neptune,
  ];
  
  const obs = new Observer(observer.lat, observer.lon, 0);
  const results: PlanetObject[] = [];

  for (const body of bodies) {
    // Calculate equatorial coordinates first, then horizon
    const equ = Equator(body, date, obs, true, true);
    const horizon = Horizon(date, obs, equ.ra, equ.dec, "normal");
    
    // Include bodies with altitude > -18 (twilight)
    if (horizon.altitude > -18) {
      let mag = 0;
      try {
        const illum = Illumination(body, date);
        mag = illum.mag;
      } catch {
        // Fallback for bodies that Illumination() doesn't support well natively
        if (body === Body.Sun) mag = -26.7;
        else if (body === Body.Moon) mag = -12.6;
      }

      let tier: "naked" | "bino" | "track" = "track";
      if (mag < 3) tier = "naked";
      else if (mag < 6) tier = "bino";

      let type: "planet" | "moon" | "sun" = "planet";
      if (body === Body.Sun) type = "sun";
      else if (body === Body.Moon) type = "moon";

      results.push({
        name: body,
        az: horizon.azimuth,
        el: horizon.altitude,
        mag,
        tier,
        type,
      });
    }
  }

  return results;
}
