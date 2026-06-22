---
trigger: always_on
---

Project: Project Zenith — The Celestial Eye
Stack: Next.js 14 (App Router), TypeScript, Tailwind CSS
Key libs: satellite.js (SGP4 TLE propagation), astronomy-engine (planet positions), Leaflet.js (map), Three.js (sky dome canvas)
APIs: CelesTrak (TLE feeds, no key needed), OpenNotify (ISS live position), NASA JPL Horizons REST (planet ephemeris, no key), NOAA SWPC (space weather)
Deploy target: Vercel (free tier)
Constraint: all API calls must handle CORS — use /api/ Next.js route handlers as proxy where needed
Competition: AARUUSH 26 AstralWeb Innovate — judges care about real-time data accuracy, immersive sky dome UI, and feature richness