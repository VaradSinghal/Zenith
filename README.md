<div align="center">

# 🛰️ Project Zenith

### Real-Time Satellite Tracker & Sky Observatory

*A full-stack web application that transforms any browser into a live satellite tracking station, sky dome visualizer, and astronomical observatory — powered by real orbital mechanics.*

[![Next.js](https://img.shields.io/badge/Next.js-14.2-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**[🚀 Live Demo](https://project-zenith.vercel.app)** · **[📖 Documentation](#architecture)** · **[🏆 AARUUSH '26](#competition-context)**

</div>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [API Sources](#-api-sources)
- [How the Math Works](#-how-the-math-works)
- [Known Limitations](#-known-limitations)
- [Competition Context](#-competition-context)

---

## Overview

**Project Zenith** is a browser-based satellite tracking and sky visualization platform. It fetches live Two-Line Element sets (TLEs) from CelesTrak, propagates satellite orbits using SGP4/SDP4, and renders them on an interactive sky dome — all in real time, right in your browser.

Users can observe 4,000+ active satellites, track the ISS with live crew data, visualize planet positions, identify constellations, monitor aurora conditions, and receive AI-generated sky briefings — all from a single dashboard.

---

## ✨ Features

| Category | Feature | Details |
|----------|---------|---------|
| 🛰️ **Satellite Tracking** | Real-time SGP4 propagation | 4,000+ satellites from 5 TLE groups (stations, visual, Starlink, GPS, weather) |
| 🌐 **Interactive Sky Dome** | Canvas-based hemispherical projection | Azimuth/elevation dome with cardinal labels and elevation rings |
| 🗺️ **Observer Map** | Leaflet interactive map | Click to set observer, ISS ground track marker, city search with geocoding |
| 🪐 **Planet Positions** | Solar system body tracking | Sun, Moon, Mercury through Neptune with real AzEl via `astronomy-engine` |
| ⭐ **Constellations** | Stick-figure constellation lines | 88 IAU constellations with RA/Dec→AzEl conversion |
| 🌌 **Background Stars** | Procedural star field | Seeded PRNG for reproducible background stars with twinkling |
| 🟢 **ISS Live Crew** | Astronaut roster | Real-time crew from Open Notify, flag emojis, days-in-space counters |
| 🔮 **Pass Predictions** | Next-pass countdown | AOS/LOS detection, max elevation, live HH:MM:SS countdown timer |
| 📡 **Sky Path Arcs** | Orbital trajectory visualization | Dashed future path (10 min), solid past trail (30 sec), ISS-specific tick marks |
| 🌈 **Aurora Monitoring** | Kp-index tracking | NOAA Kp data, aurora band overlay when Kp ≥ 5 at high latitudes |
| 🤖 **AI Sky Briefing** | Natural language summaries | Gemini 2.5 Flash generates 3-sentence sky-watching briefings from live data |
| 🔍 **City Search** | Location geocoding | Nominatim integration, lat/lon parsing, special ISS keyword, keyboard nav |
| ⏱️ **Time Travel** | Time offset slider | ±120 minute slider to explore past/future sky states |
| 📱 **Responsive Design** | Mobile-first layout | Bottom tab bar, swipeable panels, bottom-sheet info panel |
| 🛡️ **Fallback System** | Offline resilience | 12 hardcoded TLEs (ISS, Hubble, Tiangong, Starlinks, GPS, NOAA) for graceful degradation |

---

## 🔧 Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Framework** | Next.js 14 (App Router) | Server-side rendering, API routes, file-based routing |
| **Language** | TypeScript 5 | End-to-end type safety |
| **UI** | React 18 | Component architecture, hooks-based state management |
| **Styling** | Tailwind CSS 3.4 | Utility-first responsive design |
| **Sky Dome** | HTML5 Canvas 2D | Custom azimuthal projection rendering at ~10 fps |
| **Map** | Leaflet 1.9 | Interactive observer map with dark tile layer |
| **Orbital Mechanics** | satellite.js 4.1 | SGP4/SDP4 TLE propagation (NORAD standard) |
| **Astronomy** | astronomy-engine 2.1 | Planet/Sun/Moon positions via VSOP87 theory |
| **Icons** | Lucide React | Lightweight SVG icon set |
| **AI** | Gemini 2.5 Flash | Natural language sky briefings |
| **Deployment** | Vercel | Edge-optimized hosting with serverless API routes |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER CLIENT                          │
│                                                                │
│  ┌──────────┐   ┌──────────────┐   ┌────────────┐             │
│  │ Observer  │   │   Sky Dome   │   │   Info     │             │
│  │   Map     │   │   (Canvas)   │   │  Panel     │             │
│  │ (Leaflet) │   │  Az/El Proj  │   │ Crew/Pass  │             │
│  └────┬─────┘   └──────┬───────┘   └─────┬──────┘             │
│       │                │                  │                    │
│       └────────┬───────┴──────────┬───────┘                    │
│                │                  │                             │
│         ┌──────┴──────┐   ┌──────┴───────┐                     │
│         │  propagate  │   │   planets    │                     │
│         │   .ts       │   │    .ts       │                     │
│         │ SGP4 Engine │   │ VSOP87 Calc  │                     │
│         └──────┬──────┘   └──────────────┘                     │
│                │                                               │
│         ┌──────┴──────┐                                        │
│         │constellations│                                       │
│         │    .ts       │                                       │
│         │RA/Dec→AzEl  │                                        │
│         └─────────────┘                                        │
└────────────────────────────┬────────────────────────────────────┘
                             │  HTTP (fetch)
┌────────────────────────────┴────────────────────────────────────┐
│                     NEXT.JS API ROUTES                          │
│                                                                 │
│  /api/tle ──────────── CelesTrak NORAD TLEs                    │
│  /api/iss ──────────── Open Notify ISS Position                │
│  /api/iss-crew ─────── Open Notify Astros (ISS filter)         │
│  /api/astros ───────── Open Notify Astros (all craft)          │
│  /api/aurora ───────── NOAA SWPC Kp Index                      │
│  /api/geocode ──────── Nominatim Reverse Geocoding             │
│  /api/briefing ─────── Google Gemini 2.5 Flash                 │
└─────────────────────────────────────────────────────────────────┘
                             │  Upstream APIs
┌────────────────────────────┴────────────────────────────────────┐
│                    EXTERNAL DATA SOURCES                        │
│                                                                 │
│  • CelesTrak (celestrak.org)        — NORAD TLE catalogs       │
│  • Open Notify (open-notify.org)    — ISS position & crew      │
│  • NOAA SWPC (swpc.noaa.gov)        — Geomagnetic Kp index     │
│  • Nominatim (nominatim.org)        — OpenStreetMap geocoding   │
│  • Google AI (generativelanguage)   — Gemini LLM               │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
TLE Text ──→ parseTLEBlock() ──→ SatelliteRecord[]
                                       │
                                  propagateAll()
                                       │
                              OverheadObject[] (az, el, alt, vel)
                                       │
                              ┌────────┴────────┐
                              │                 │
                         SkyDome.tsx        InfoPanel.tsx
                        (Canvas render)    (Detail cards)
```

### Component Tree

```
app/page.tsx (Shell)
 ├── ObserverMap
 │    └── ObserverMapInner (Leaflet + City Search)
 ├── SkyDome (Canvas 2D)
 │    ├── Background stars (seeded PRNG)
 │    ├── Constellation lines (RA/Dec → AzEl)
 │    ├── Aurora band (Kp ≥ 5)
 │    ├── Sky path arcs (future dashed / past solid)
 │    ├── Satellite dots (color-coded by type)
 │    ├── Planet markers (scaled by magnitude)
 │    └── Tooltip overlay
 └── InfoPanel
      ├── Object detail card (AzEl, altitude, velocity)
      ├── Next-pass countdown (live HH:MM:SS)
      ├── ISS crew roster (flags, days in space)
      ├── Pass prediction timeline
      └── AI briefing panel (Gemini)
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18.x
- **npm** ≥ 9.x (or yarn/pnpm)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/VaradSinghal/Zenith.git
cd Zenith

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

The app will be available at **http://localhost:3000**.

### Production Build

```bash
npm run build
npm start
```

---

## 🔑 Environment Variables

Create a `.env.local` file in the project root:

```env
# Optional — enables the AI sky briefing feature
GEMINI_API_KEY=your_google_ai_api_key_here
```

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | **No** | Google AI API key for Gemini 2.5 Flash briefings. Without it, the "Tonight's Briefing" button shows a helpful setup message. All other features work without any API key. |

> **No API keys are required for basic use.** All satellite tracking, sky dome visualization, planet positions, constellation overlays, ISS crew data, aurora monitoring, and pass predictions work out of the box using free public APIs.

---

## 🌐 API Sources

| API | Endpoint | Data | Rate |
|-----|----------|------|------|
| [CelesTrak](https://celestrak.org/) | `celestrak.org/NORAD/elements/gp.php` | Two-Line Element sets for 5 satellite groups | On page load |
| [Open Notify – ISS](http://open-notify.org/) | `api.open-notify.org/iss-now.json` | Real-time ISS lat/lon | Every 5 sec |
| [Open Notify – Astros](http://open-notify.org/) | `api.open-notify.org/astros.json` | Humans in space by craft | On ISS select |
| [NOAA SWPC](https://www.swpc.noaa.gov/) | `services.swpc.noaa.gov/json/planetary_k_index_1m.json` | Planetary Kp geomagnetic index | Every 15 min |
| [Nominatim](https://nominatim.openstreetmap.org/) | `nominatim.openstreetmap.org/search` | Geocoding (city → lat/lon) | On user search |
| [Google AI](https://ai.google.dev/) | `generativelanguage.googleapis.com/v1beta` | Gemini 2.5 Flash LLM | On user request |

All upstream API calls are proxied through Next.js API routes (`/api/*`) to avoid CORS issues and inject required headers (e.g., `User-Agent` for Nominatim).

---

## 🧮 How the Math Works

### SGP4 Orbital Propagation

Satellites are tracked using the **SGP4/SDP4** algorithm (the same model used by NORAD):

1. **TLE Parsing** — Two-Line Element sets encode orbital parameters (inclination, eccentricity, mean anomaly, etc.)
2. **Propagation** — `satellite.js` computes the satellite's ECI (Earth-Centered Inertial) position at any given time
3. **Coordinate Transform** — ECI → ECF (Earth-Centered Fixed) → Topocentric SEZ → Azimuth/Elevation

### Observer-to-Sky Dome Projection

The sky dome uses an **azimuthal equidistant projection** — a standard in astronomy:

```
                    N (0°)
                     │
            NW ──────┼────── NE
           /         │         \
         W ──────── Zenith ────── E
           \         │         /
            SW ──────┼────── SE
                     │
                    S (180°)

  project(az, el) → canvas (x, y):
    r = R × (1 - el/90)        // el=90° → center, el=0° → edge
    x = cx + r × sin(az)       // azimuth maps to angle from north
    y = cy - r × cos(az)       // north is up
```

The `el=0°` horizon maps to the circle edge, `el=90°` (zenith) maps to the center. This preserves angular distances from zenith, making it intuitive for stargazing: point your phone straight up and you're looking at the center of the dome.

### Planet Positions

Planet AzEl coordinates are computed using the **VSOP87** analytical theory via `astronomy-engine`, which calculates heliocentric positions for all major bodies and transforms them to the observer's local horizontal coordinate frame.

### Constellation Rendering

Constellation stick figures use a pre-computed dataset of RA/Dec line segments. At render time, each point is converted from equatorial coordinates (RA, Dec) to horizontal coordinates (Az, El) using:

1. Compute **Local Sidereal Time** (LST) from UTC and observer longitude
2. Derive **Hour Angle** (HA = LST − RA)
3. Apply the standard **equatorial → horizontal** spherical trigonometry transform

---

## ⚠️ Known Limitations

| Limitation | Impact | Mitigation |
|-----------|--------|------------|
| TLE epoch decay | Positions drift ~1-5 km/day after TLE epoch | TLEs refresh on every page load from CelesTrak |
| Starlink cache size | CelesTrak Starlink TLE file exceeds 2 MB, too large for Next.js fetch cache | Data is still served correctly; only server-side caching is skipped |
| Planet accuracy | `astronomy-engine` VSOP87 has ~1 arcminute precision | More than sufficient for visual sky mapping |
| ISS crew data staleness | Open Notify crew roster may lag behind actual crew rotations | Hardcoded launch dates for known Expedition 71/72 crew |
| No satellite visibility prediction | No shadow/eclipse calculation for optical visibility | Visual magnitude is estimated from satellite type, not computed from sun angle |
| Canvas performance | 4,000+ satellites on a 2D canvas can impact low-end devices | Tier filtering limits rendered objects; 10 fps animation loop |
| Gemini API dependency | AI briefings require a Google AI API key | Feature degrades gracefully with a setup instruction message |

---

## 🏆 Competition Context

<div align="center">

### AARUUSH '26 — AstralWeb Innovate · Round 2

</div>

**Project Zenith** was built for **Round 2** of the **AstralWeb Innovate** challenge at **AARUUSH '26**, the annual national-level techno-management fest organized by **SRM Institute of Science and Technology**, Chennai.

The challenge requires building an innovative web application that leverages real-world astronomical data, orbital mechanics, and interactive visualization to create a tool useful for amateur astronomers, satellite enthusiasts, and space educators.

### What Sets Zenith Apart

- **Real Orbital Mechanics** — Not a static map. Every satellite position is computed via SGP4 propagation from live NORAD TLEs, the same algorithm used by mission control.
- **Full Sky Observatory** — Combines satellites, planets, constellations, stars, and aurora conditions into a single unified sky dome view.
- **Zero-Config Operation** — Works out of the box with no API keys. All core features use free public APIs with server-side proxying.
- **AI Integration** — Gemini-powered natural language briefings turn raw telemetry data into accessible, human-friendly sky-watching guides.
- **Mobile-First** — Responsive design with bottom tab navigation, swipeable panels, and touch-optimized interactions.

---

<div align="center">

**Built with 🛰️ by Varad Singhal**

*"The sky is not the limit — it's just the beginning."*

</div>
