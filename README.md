<div align="center">

# 🛰️ Project Zenith

### Real-Time Satellite Tracker & Sky Observatory

*A full-stack web application that transforms any browser into a live satellite tracking station, sky dome visualizer, and astronomical observatory — powered by real orbital mechanics.*

[![Next.js](https://img.shields.io/badge/Next.js-14.2-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**[🚀 Live Demo](https://zenith-celestial-eye.vercel.app/landing)** · **[📖 Documentation](#technical-documentation)** · **[🏆 AARUUSH '26](#competition-context)**

</div>

---

## 📋 Table of Contents

- [Technical Documentation](#technical-documentation)
  - [System Requirements](#system-requirements)
  - [Installation and Setup](#installation-and-setup)
  - [Development Workflow](#development-workflow)
  - [Production Deployment](#production-deployment)
  - [Troubleshooting](#troubleshooting)
- [Website Functionality and Unique Features](#website-functionality-and-unique-features)
- [Dependencies](#dependencies)
- [Architecture](#-architecture)
- [Environment Variables](#-environment-variables)
- [API Sources](#-api-sources)
- [How the Math Works](#-how-the-math-works)
- [Known Limitations](#-known-limitations)
- [Competition Context](#-competition-context)

---

## Technical Documentation

### System Requirements

Before installing Project Zenith, ensure your system meets the following minimum requirements:

**Hardware:**
- **RAM:** 4GB minimum (8GB recommended for optimal performance)
- **Storage:** 500MB free disk space for dependencies and build artifacts
- **Processor:** Any modern CPU with JavaScript execution support

**Software:**
- **Node.js:** Version 18.x or higher (LTS version recommended)
- **npm:** Version 9.x or higher (comes bundled with Node.js)
- **Operating System:** Windows 10+, macOS 10.15+, or Linux (Ubuntu 20.04+)
- **Browser:** Chrome 90+, Firefox 88+, Safari 14+, or Edge 90+ (for development)

**Optional Tools:**
- **Git:** For cloning the repository (if not downloading as ZIP)
- **VS Code or similar IDE:** Recommended for development with TypeScript support

### Installation and Setup

Follow these step-by-step instructions to set up Project Zenith on your local machine:

#### Step 1: Clone the Repository

```bash
# Using Git (recommended)
git clone https://github.com/VaradSinghal/Zenith.git
cd Zenith

# Alternatively, download as ZIP from GitHub and extract
```

#### Step 2: Install Dependencies

```bash
# Install all required packages
npm install

# This will install:
# - Next.js framework and React
# - TypeScript and type definitions
# - Tailwind CSS and PostCSS
# - astronomy-engine for planet calculations
# - satellite.js for orbital mechanics
# - Leaflet for interactive maps
# - Lucide React for icons
# - Three.js for 3D rendering
```

The installation process typically takes 2-5 minutes depending on your internet connection.

#### Step 3: Configure Environment Variables

Create a `.env.local` file in the project root directory:

```bash
# Create the environment file
touch .env.local  # On macOS/Linux
# or
echo. > .env.local  # On Windows
```

Add the following content to `.env.local`:

```env
# Optional — enables the AI sky briefing feature
GEMINI_API_KEY=your_google_ai_api_key_here
```

**Note:** The `GEMINI_API_KEY` is optional. All core features work without it. To obtain a Google AI API key:
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Add it to your `.env.local` file

#### Step 4: Start Development Server

```bash
# Start the development server with hot-reload
npm run dev
```

The application will be available at **http://localhost:3000**

You should see output similar to:
```
  ▲ Next.js 14.2.35
  - Local:        http://localhost:3000
  - Environments: .env.local
  Ready in 2.3s
```

#### Step 5: Verify Installation

Open your browser and navigate to `http://localhost:3000`. You should see:
- The Project Zenith landing page
- Interactive sky dome with satellite positions
- Observer map with default location
- All UI components rendering correctly

### Development Workflow

#### Available Scripts

```bash
# Development
npm run dev          # Start development server with hot-reload
npm run build        # Create production build
npm run start        # Start production server
npm run lint         # Run ESLint for code quality checks
```

#### Project Structure

```
project-zenith/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes for external data fetching
│   ├── landing/           # Landing page
│   ├── observatory/       # Main observatory interface
│   ├── globe/             # 3D globe visualization
│   └── layout.tsx         # Root layout
├── components/            # Reusable React components
│   ├── ObserverMap/       # Leaflet map component
│   ├── SkyDome/           # Canvas sky dome renderer
│   └── InfoPanel/         # Information display panel
├── lib/                   # Utility functions and helpers
│   ├── propagate.ts       # SGP4 orbital propagation logic
│   ├── planets.ts         # Planet position calculations
│   └── constellations.ts  # Constellation data and rendering
├── public/                # Static assets
├── package.json           # Project dependencies
├── tsconfig.json          # TypeScript configuration
├── tailwind.config.ts     # Tailwind CSS configuration
└── next.config.mjs        # Next.js configuration
```

#### Code Quality

The project uses ESLint for code quality enforcement:

```bash
# Run linter
npm run lint

# Fix auto-fixable issues
npm run lint -- --fix
```

TypeScript is configured with strict mode for type safety.

### Production Deployment

#### Building for Production

```bash
# Create optimized production build
npm run build

# The build process:
# 1. Compiles TypeScript to JavaScript
# 2. Optimizes React components
# 3. Generates static pages where possible
# 4. Creates serverless function bundles
# 5. Minifies CSS and JavaScript
```

#### Running Production Server

```bash
# Start production server
npm start

# The app will run on port 3000 by default
# To use a different port:
PORT=8080 npm start
```

#### Deployment Platforms

**Vercel (Recommended):**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

**Other Platforms:**
- **Netlify:** Connect Git repository and use Next.js build settings
- **Docker:** Use the included Dockerfile (if available)
- **VPS:** Build locally and serve with Node.js process manager (PM2)

#### Environment Variables in Production

Set environment variables in your deployment platform's dashboard:

- **Vercel:** Project Settings → Environment Variables
- **Netlify:** Site Settings → Environment Variables
- **Docker:** Pass as `-e GEMINI_API_KEY=your_key` during container run

### Troubleshooting

#### Common Issues and Solutions

**Issue: "Module not found" errors after installation**
```bash
# Solution: Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Issue: Port 3000 already in use**
```bash
# Solution: Use a different port
npm run dev -- -p 3001
```

**Issue: TypeScript compilation errors**
```bash
# Solution: Clear TypeScript build cache
rm -rf .next
npm run dev
```

**Issue: Satellite data not loading**
- Check your internet connection
- Verify CelesTrak API is accessible (https://celestrak.org)
- Check browser console for CORS errors
- The fallback system will use hardcoded TLEs if APIs fail

**Issue: AI briefing not working**
- Verify `GEMINI_API_KEY` is set in `.env.local`
- Restart development server after adding API key
- Check Google AI API quota and billing status

**Issue: Map not displaying correctly**
- Ensure Leaflet CSS is loaded
- Check browser console for tile loading errors
- Verify internet connection for map tiles

#### Performance Optimization

If experiencing slow performance:
1. Reduce the number of satellites displayed (modify TLE fetch groups)
2. Lower canvas rendering resolution
3. Disable constellation overlays
4. Use a modern browser with hardware acceleration

#### Getting Help

- **GitHub Issues:** Report bugs at https://github.com/VaradSinghal/Zenith/issues
- **Documentation:** Check inline code comments for detailed explanations
- **API Documentation:** Refer to upstream API documentation for data sources

---

## Website Functionality and Unique Features

Project Zenith is a comprehensive astronomical observatory that transforms any web browser into a powerful satellite tracking and sky visualization platform. Below are the key functionalities and unique features that distinguish it from other astronomical tools.

### Core Functionality

#### Real-Time Satellite Tracking
- **Live Orbital Propagation:** Uses SGP4/SDP4 algorithms (the same as NORAD) to calculate satellite positions from Two-Line Element (TLE) data
- **4,000+ Satellites:** Tracks active satellites across 5 categories: Space Stations, Visual Satellites, Starlink constellation, GPS satellites, and Weather satellites
- **Automatic Updates:** Fetches fresh TLE data from CelesTrak on every page load for maximum accuracy
- **Fallback System:** Includes 12 hardcoded TLEs (ISS, Hubble, Tiangong, Starlinks, GPS, NOAA) for offline resilience

#### Interactive Sky Dome Visualization
- **Azimuthal Equidistant Projection:** Standard astronomical projection that maps the sky onto a hemispherical dome
- **Real-Time Rendering:** Canvas-based rendering at ~10 fps for smooth animation
- **Observer-Centric View:** Sky dome adjusts based on your geographic location and time
- **Time Travel:** Slider allows exploring sky states ±120 minutes from current time

#### Geographic Positioning
- **Interactive Observer Map:** Leaflet-based map to set your observation location
- **City Search:** Search for any city worldwide with geocoding via Nominatim
- **ISS Quick-Select:** Special keyword "ISS" to instantly set observer to ISS position
- **Click-to-Set:** Click anywhere on the map to set observer coordinates
- **ISS Ground Track:** Real-time marker showing ISS current position over Earth

### Unique Features

#### 1. Unified Sky Observatory
Unlike most tools that focus on either satellites OR planets OR stars, Zenith combines all astronomical objects into a single interface:
- Satellites with orbital paths
- Planets (Sun, Moon, Mercury through Neptune)
- 88 IAU constellations with stick-figure overlays
- Procedurally generated background stars with twinkling
- Aurora visibility bands when geomagnetic activity is high

#### 2. AI-Powered Sky Briefings
- **Natural Language Summaries:** Gemini 2.5 Flash generates human-readable sky-watching guides
- **Context-Aware:** Briefings are based on your location, time, and current sky conditions
- **Real-Time Data:** Incorporates live satellite passes, planet positions, and aurora forecasts
- **Educational Value:** Transforms raw telemetry into accessible astronomy content

#### 3. Advanced Pass Predictions
- **Next-Pass Detection:** Automatically calculates when satellites will rise above your horizon
- **AOS/LOS Timing:** Precise Acquisition of Signal and Loss of Signal times
- **Maximum Elevation:** Shows the highest point in the satellite's path
- **Live Countdown:** Real-time HH:MM:SS countdown to next pass
- **Visual Path Arcs:** Dashed lines show future trajectory, solid lines show past trail

#### 4. ISS-Specific Features
- **Live Crew Data:** Real-time astronaut roster from Open Notify
- **Flag Emojis:** International representation with country flags
- **Days in Space:** Tracks how long each crew member has been aboard
- **Expedition Context:** Hardcoded launch dates for Expedition 71/72 crew
- **Special Visualization:** ISS marked with distinctive icon and ground track

#### 5. Aurora Monitoring
- **Kp-Index Tracking:** Real-time geomagnetic activity from NOAA SWPC
- **Aurora Band Overlay:** Visual indication when aurora may be visible (Kp ≥ 5)
- **High-Latitude Focus:** Optimized for observers at northern latitudes
- **Automatic Updates:** Refreshes every 15 minutes

#### 6. Mobile-First Design
- **Responsive Layout:** Adapts seamlessly from desktop to mobile
- **Bottom Tab Navigation:** Touch-optimized navigation bar
- **Swipeable Panels:** Intuitive gesture controls
- **Bottom-Sheet Info Panel:** Modern mobile UI pattern for details
- **Touch-Friendly Interactions:** Optimized tap targets and gestures

#### 7. Zero-Configuration Operation
- **No API Keys Required:** Core features work out of the box using free public APIs
- **Server-Side Proxying:** Next.js API routes handle CORS and headers automatically
- **Graceful Degradation:** Fallback systems ensure functionality even when APIs are down
- **Instant Setup:** Clone, install, run — no complex configuration needed

#### 8. Educational Value
- **Orbital Mechanics Visualization:** See how satellites actually move in real-time
- **Coordinate Systems:** Learn about azimuth, elevation, RA, Dec coordinate systems
- **Constellation Identification:** Interactive constellation overlays help learn the night sky
- **Planet Tracking:** Understand solar system body positions relative to Earth
- **Real-World Data:** Uses actual NORAD TLE data, not simulations

### Technical Distinctions

#### Performance Optimization
- **Canvas Rendering:** Uses HTML5 Canvas 2D for efficient rendering of thousands of objects
- **Tier Filtering:** Limits rendered objects based on visibility and importance
- **Seeded PRNG:** Reproducible star field generation without storing thousands of coordinates
- **Efficient Math:** Optimized coordinate transformations for real-time performance

#### Accuracy and Precision
- **SGP4/SDP4 Standard:** Uses the same propagation algorithms as NORAD
- **VSOP87 Theory:** Planet positions calculated with ~1 arcminute precision
- **Real-Time Data:** Fresh TLEs on every load for maximum positional accuracy
- **Proper Coordinate Transforms:** Accurate equatorial-to-horizontal conversions

#### Resilience
- **Multiple Data Sources:** Redundant APIs for critical data
- **Fallback Systems:** Hardcoded data ensures basic functionality during outages
- **Error Handling:** Graceful degradation when external services fail
- **Offline Capability:** Core features work without internet connection using cached data

---

## Dependencies

Project Zenith requires several external libraries, frameworks, and tools to function. Below is a comprehensive list organized by category.

### Core Framework Dependencies

#### Next.js 14.2.35
- **Purpose:** React framework for server-side rendering and API routes
- **Features Used:** App Router, API routes, server-side rendering, static optimization
- **License:** MIT
- **Documentation:** https://nextjs.org/docs

#### React 18
- **Purpose:** UI library for building interactive components
- **Features Used:** Hooks, component lifecycle, state management
- **License:** MIT
- **Documentation:** https://react.dev

#### React DOM 18
- **Purpose:** React renderer for web browsers
- **Features Used:** DOM manipulation, event handling
- **License:** MIT
- **Documentation:** https://react.dev/reference/react-dom

### Language and Type Safety

#### TypeScript 5
- **Purpose:** Static type checking for JavaScript
- **Features Used:** Strict mode, type inference, interface definitions
- **License:** Apache 2.0
- **Documentation:** https://www.typescriptlang.org/docs

#### Type Definitions
- **@types/node:** TypeScript definitions for Node.js runtime
- **@types/react:** TypeScript definitions for React
- **@types/react-dom:** TypeScript definitions for React DOM
- **@types/leaflet:** TypeScript definitions for Leaflet map library
- **@types/three:** TypeScript definitions for Three.js 3D library

### Styling and UI

#### Tailwind CSS 3.4.1
- **Purpose:** Utility-first CSS framework for rapid UI development
- **Features Used:** Responsive design, dark mode, utility classes
- **License:** MIT
- **Documentation:** https://tailwindcss.com/docs

#### PostCSS 8
- **Purpose:** CSS transformation tool
- **Features Used:** CSS processing, plugin system
- **License:** MIT
- **Documentation:** https://postcss.org

#### Lucide React 1.21.0
- **Purpose:** Lightweight icon library
- **Features Used:** SVG icons for UI elements (satellite, map, info, etc.)
- **License:** ISC
- **Documentation:** https://lucide.dev

### Orbital Mechanics and Astronomy

#### satellite.js 4.1.4
- **Purpose:** SGP4/SDP4 orbital propagation algorithms
- **Features Used:** TLE parsing, satellite position calculation, coordinate transforms
- **License:** MIT
- **Documentation:** https://github.com/shashwatak/satellite.js

#### astronomy-engine 2.1.19
- **Purpose:** Astronomical calculations and planet positions
- **Features Used:** VSOP87 theory, planet positions, Sun/Moon calculations
- **License:** MIT
- **Documentation:** https://github.com/cosinekitty/astronomy-engine

### Mapping and Visualization

#### Leaflet 1.9.4
- **Purpose:** Interactive map library
- **Features Used:** Observer map, tile layers, markers, geocoding integration
- **License:** BSD-2-Clause
- **Documentation:** https://leafletjs.com/reference.html

#### Three.js 0.184.0
- **Purpose:** 3D graphics library
- **Features Used:** 3D globe visualization (optional feature)
- **License:** MIT
- **Documentation:** https://threejs.org/docs

### Development Tools

#### ESLint 8
- **Purpose:** JavaScript/TypeScript linting and code quality
- **Features Used:** Code style enforcement, error detection
- **License:** MIT
- **Documentation:** https://eslint.org/docs/latest

#### ESLint Config Next.js 14.2.35
- **Purpose:** Next.js-specific ESLint configuration
- **Features Used:** React hooks rules, Next.js best practices
- **License:** MIT
- **Documentation:** Included in Next.js

### External API Services (Runtime Dependencies)

#### CelesTrak (celestrak.org)
- **Purpose:** NORAD Two-Line Element (TLE) data source
- **Data:** Satellite orbital elements for 4,000+ satellites
- **Access:** Free public API, no authentication required
- **Rate Limit:** On page load (cached)
- **Documentation:** https://celestrak.org/NORAD/elements/

#### Open Notify (open-notify.org)
- **Purpose:** ISS position and crew data
- **Data:** Real-time ISS coordinates, astronaut roster
- **Access:** Free public API, no authentication required
- **Rate Limit:** Every 5 seconds for position, on demand for crew
- **Documentation:** http://open-notify.org/Open-Notify-API/

#### NOAA SWPC (swpc.noaa.gov)
- **Purpose:** Geomagnetic activity and aurora data
- **Data:** Planetary Kp-index for aurora visibility
- **Access:** Free public API, no authentication required
- **Rate Limit:** Every 15 minutes
- **Documentation:** https://www.swpc.noaa.gov/products/planetary-k-index

#### Nominatim (nominatim.openstreetmap.org)
- **Purpose:** OpenStreetMap geocoding service
- **Data:** City name to latitude/longitude conversion
- **Access:** Free public API, requires User-Agent header
- **Rate Limit:** On user search (proxied through Next.js)
- **Documentation:** https://nominatim.openstreetmap.org/

#### Google AI (generativelanguage.googleapis.com)
- **Purpose:** AI-powered sky briefings (optional)
- **Data:** Natural language generation via Gemini 2.5 Flash
- **Access:** Requires API key (optional feature)
- **Rate Limit:** On user request
- **Documentation:** https://ai.google.dev/docs

### System Requirements (Runtime)

#### Node.js Runtime
- **Version:** 18.x or higher (LTS recommended)
- **Purpose:** JavaScript runtime for server-side execution
- **Download:** https://nodejs.org/

#### Package Manager
- **npm:** 9.x or higher (bundled with Node.js)
- **Alternatives:** yarn 1.22+, pnpm 8.x+
- **Purpose:** Dependency management and script execution

### Browser Requirements (Client-Side)

#### Modern Web Browser
- **Chrome:** 90+ (recommended)
- **Firefox:** 88+
- **Safari:** 14+
- **Edge:** 90+
- **Required Features:** ES6+, Canvas 2D, Fetch API, Web Workers

### Optional Dependencies

#### Git
- **Purpose:** Version control for cloning repository
- **Version:** Any recent version
- **Required:** Only for cloning from GitHub

#### IDE/Code Editor
- **Recommended:** VS Code with TypeScript extension
- **Alternatives:** WebStorm, Sublime Text, Atom
- **Purpose:** Development environment with syntax highlighting

### Dependency Tree Summary

```
project-zenith
├── next (14.2.35)
│   ├── react (18)
│   ├── react-dom (18)
│   └── @types/* (various)
├── typescript (5)
├── tailwindcss (3.4.1)
│   └── postcss (8)
├── lucide-react (1.21.0)
├── satellite.js (4.1.4)
├── astronomy-engine (2.1.19)
├── leaflet (1.9.4)
│   └── @types/leaflet
├── three (0.184.0)
│   └── @types/three
└── eslint (8)
    └── eslint-config-next (14.2.35)
```

### Security Considerations

All dependencies are sourced from npm registry and are regularly updated. The project uses:
- **No known vulnerabilities** in current dependency versions
- **MIT or permissive licenses** for all dependencies
- **Minimal external API calls** (all proxied through Next.js)
- **No sensitive data storage** (API keys in environment variables only)

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



*"The sky is not the limit — it's just the beginning."*

</div>
