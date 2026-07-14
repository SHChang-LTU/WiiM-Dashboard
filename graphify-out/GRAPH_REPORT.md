# Graph Report - .  (2026-07-13)

## Corpus Check
- 159 files · ~68,505 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 925 nodes · 2554 edges · 53 communities (39 shown, 14 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.83)
- Token cost: 0 input · 282,613 output

## Community Hubs (Navigation)
- Device Capabilities & Discovery
- Album Art Proxy & Fallback
- Login, TOTP & CSRF
- NAS Art Proxy
- Architecture & Docs Concepts
- Settings & App Pages
- EQ API Routes
- Account Setup & Sessions
- Now Playing, Kiosk & Lyrics
- Last.fm Connect Routes
- Playback & Output Control
- Dashboard Shell & Cards
- TypeScript Config Refs
- Last.fm Client & Scrobbler
- Auth Forms & Device Manager
- Device CRUD Routes
- Stats & Library Cards
- Dev Dependencies
- Runtime Dependencies
- NAS Browse & Play Routes
- Device Info & Sub-Out Cards
- Screenshot: Now Playing
- EQ Card UI
- App Layout & Sleep Button
- Screenshot: EQ & Stats
- Sleep Timer
- Library Browse Dialog
- Screenshot: Control Cards
- Package Metadata
- NPM Scripts
- Middleware & CSP
- Proxmox Installer
- App Icon Design
- Vinyl Record Asset
- Turnstile Widget
- WiiM API Doc Commands
- Next.js Config
- Docker Entrypoint
- Framer Motion
- Lucide Icons
- Next.js
- OTP Library
- Radix Dialog
- Radix Switch
- Radix Tabs
- React
- React DOM
- SWR
- Release Script
- Tailwind Config

## God Nodes (most connected - your core abstractions)
1. `guard()` - 77 edges
2. `json()` - 65 edges
3. `cn()` - 47 edges
4. `apiError()` - 45 edges
5. `parseBody()` - 38 edges
6. `resolveDevice()` - 33 edges
7. `getDb()` - 32 edges
8. `useToast()` - 28 edges
9. `getDeviceSnapshot()` - 21 edges
10. `safeJson()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Wiim Dashboard (project overview)` --references--> `GitHub Sponsors Funding Config`  [INFERRED]
  README.md → .github/FUNDING.yml
- `Unraid Community Applications Template` --references--> `Docker Standalone Deployment (non-root via gosu)`  [INFERRED]
  unraid/README.md → ARCHITECTURE.md
- `robots.txt Disallow All` --conceptually_related_to--> `Threat Model: Unauthenticated Device API`  [INFERRED]
  public/robots.txt → SECURITY.md
- `totpQrDataUrl()` --references--> `qrcode`  [EXTRACTED]
  src/lib/auth/totp.ts → package.json
- `CI Workflow (Typecheck & Build)` --implements--> `Typecheck + Build PR Gate`  [INFERRED]
  .github/workflows/ci.yml → CONTRIBUTING.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **In-Process Background Jobs (survive a closed browser)** — architecture_lastfm_scrobbler, architecture_sleep_timer, architecture_nas_queue_advancer [EXTRACTED 1.00]
- **Defense-in-Depth Security Layers** — architecture_ssrf_guard, security_session_hmac, security_csrf_double_submit, security_rate_limiting, security_csp_headers, security_destructive_commands_excluded [EXTRACTED 1.00]
- **Deployment & Distribution Channels** — docker_compose_wiim_dashboard_service, unraid_readme_unraid_template, proxmox_readme_proxmox_helper_script, docs_easy_install_easy_install_guide, _github_workflows_release_docker_image [INFERRED 0.85]

## Communities (53 total, 14 thin omitted)

### Community 0 - "Device Capabilities & Discovery"
Cohesion: 0.05
Nodes (83): POST(), Device, getNasQueueArt(), clamp(), deriveSources(), detectCapabilities(), parsePlmSupport(), assertAccepted() (+75 more)

### Community 1 - "Album Art Proxy & Fallback"
Cohesion: 0.06
Nodes (54): RFC-1918, fallback(), GET(), Params, TRANSPARENT, artCache, fallback(), GET() (+46 more)

### Community 2 - "Login, TOTP & CSRF"
Cohesion: 0.10
Nodes (44): getDummyHash(), POST(), Schema, POST(), appOriginHost(), assertCsrf(), assertSameOrigin(), safeUrl() (+36 more)

### Community 3 - "NAS Art Proxy"
Cohesion: 0.10
Nodes (50): artCache, fallback(), GET(), serveImage(), sniffImageType(), TRANSPARENT, absolute(), Album (+42 more)

### Community 4 - "Architecture & Docs Concepts"
Cohesion: 0.06
Nodes (50): GitHub Sponsors Funding Config, CI Workflow (Typecheck & Build), Multi-arch Docker Image (GHCR + optional Docker Hub), Release Workflow (tag-triggered), Auth & Hardening Stack (src/lib/auth), AVTransport-driven NAS Playback, Capability Detection & Caching, Docker Standalone Deployment (non-root via gosu) (+42 more)

### Community 5 - "Settings & App Pages"
Cohesion: 0.07
Nodes (37): DEFAULT_APP, GET(), PATCH(), PatchSchema, LoginPage(), Home(), SettingsPage(), SetupPage() (+29 more)

### Community 6 - "EQ API Routes"
Cohesion: 0.13
Nodes (36): Body, eqSources(), gain, GET(), Letter, ParamName, Params, POST() (+28 more)

### Community 7 - "Account Setup & Sessions"
Cohesion: 0.13
Nodes (23): POST(), Schema, GET(), POST(), Schema, POST(), Schema, POST() (+15 more)

### Community 8 - "Now Playing, Kiosk & Lyrics"
Cohesion: 0.12
Nodes (24): KioskView(), LyricsView(), QualityPill(), VinylDisc(), BRAND, ServiceLogo(), extractColor(), hslToRgb() (+16 more)

### Community 9 - "Last.fm Connect Routes"
Cohesion: 0.17
Nodes (22): POST(), GET(), POST(), PATCH(), Schema, POST(), GET(), POST() (+14 more)

### Community 10 - "Playback & Output Control"
Cohesion: 0.15
Nodes (23): Params, POST(), Schema, Params, POST(), Schema, VALID_MODES, Params (+15 more)

### Community 11 - "Dashboard Shell & Cards"
Cohesion: 0.16
Nodes (27): AppHeader(), Dashboard(), EqCard(), LastfmStatsCard(), NowPlayingCard(), PresetCard(), SourceCard(), DeviceManager() (+19 more)

### Community 12 - "TypeScript Config Refs"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, ES2022, next-env.d.ts, .next/types/**/*.ts, node_modules, ./src/*, **/*.ts (+20 more)

### Community 13 - "Last.fm Client & Scrobbler"
Cohesion: 0.11
Nodes (23): register(), asArray(), call(), getSession(), getStats(), getToken(), LastfmCreds, LastfmStatItem (+15 more)

### Community 14 - "Auth Forms & Device Manager"
Cohesion: 0.17
Nodes (15): EmptyState(), Found, Button, ButtonProps, Size, SIZES, Variant, VARIANTS (+7 more)

### Community 15 - "Device CRUD Routes"
Cohesion: 0.16
Nodes (19): Params, POST(), DELETE(), Params, PATCH(), PatchSchema, AddSchema, GET() (+11 more)

### Community 16 - "Stats & Library Cards"
Cohesion: 0.15
Nodes (14): PERIODS, StatItem, Stats, LibraryCard(), GridOption, OptionGrid(), OutputCard(), Gauge() (+6 more)

### Community 17 - "Dev Dependencies"
Cohesion: 0.11
Nodes (19): autoprefixer, devDependencies, autoprefixer, postcss, tailwindcss, @types/better-sqlite3, @types/node, @types/qrcode (+11 more)

### Community 18 - "Runtime Dependencies"
Cohesion: 0.11
Nodes (19): better-sqlite3, clsx, @node-rs/argon2, dependencies, better-sqlite3, clsx, @node-rs/argon2, qrcode (+11 more)

### Community 19 - "NAS Browse & Play Routes"
Cohesion: 0.23
Nodes (13): Params, POST(), Schema, GET(), artProxy(), GET(), artProxy(), GET() (+5 more)

### Community 20 - "Device Info & Sub-Out Cards"
Cohesion: 0.21
Nodes (11): DeviceInfoCard(), SignalBars(), SubCard(), Props, Slider(), StepperSlider(), Props, Switch() (+3 more)

### Community 21 - "Screenshot: Now Playing"
Cohesion: 0.14
Nodes (15): Stream Quality Badge (5762 kbps, 24-bit/192 kHz), Dark-Only Card-Based Visual Design, WiiM Dashboard UI Screenshot, Device Selector 'Office room' with Online Status Dot, Source/Format Badges (Network, FLAC, HI-RES LOSSLESS), Header Bar (Device Switcher, Add, Settings, Logout), Love/Favorite Heart Button, Now Playing Card (+7 more)

### Community 22 - "EQ Card UI"
Cohesion: 0.18
Nodes (11): Overview, PeqRow(), PresetBar(), ConfirmOpts, ModalApi, ModalCtx, PromptOpts, State (+3 more)

### Community 23 - "App Layout & Sleep Button"
Cohesion: 0.16
Nodes (10): metadata, viewport, fmt(), OPTIONS, SleepButton(), ModalProvider(), Toast, ToastCtx (+2 more)

### Community 24 - "Screenshot: EQ & Stats"
Cohesion: 0.21
Nodes (12): Dashboard Screenshot 2 (EQ + Last.fm Stats), Dark-Only Card-Based Dashboard Layout, EQ Enable Toggle, EQ Preset Selector (Acoustic) with Save Action, Equalizer Card, Graphic EQ (10-band sliders 31Hz-16kHz), Per-Input EQ Source Tabs (Network, Bluetooth, Line In, Optical, HDMI, Phono), Last.fm Stats Card (6,192 scrobbles) (+4 more)

### Community 25 - "Sleep Timer"
Cohesion: 0.31
Nodes (9): GET(), Params, POST(), Schema, cancelSleep(), Entry, getSleep(), setSleep() (+1 more)

### Community 26 - "Library Browse Dialog"
Cohesion: 0.22
Nodes (9): BrowseDialog(), Crumb, fmtDur(), Folder, Listing, ROOT, SearchListing, SearchTrack (+1 more)

### Community 27 - "Screenshot: Control Cards"
Cohesion: 0.48
Nodes (7): Dark Two-Column Card Grid Layout, Dashboard Controls Screenshot (Source/Output/Sub-Out/Device), Device Info Card (Model, Firmware, IP, Connection), Output Card (Line Out, Optical, Coaxial, Headphones), Source Card (Network, Bluetooth, CD Player, MacOS & PC, Phono), Sub-Out Card (Level -2 dB, Crossover 80 Hz, Phase 0/180, connected badge), WiiM Ultra (Linkplay.5.2.818432, 172.16.10.3, Ethernet)

### Community 28 - "Package Metadata"
Cohesion: 0.29
Nodes (6): engines, node, name, private, type, version

### Community 29 - "NPM Scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, lint, start, typecheck

### Community 30 - "Middleware & CSP"
Cohesion: 0.53
Nodes (5): applySecurity(), config, makeNonce(), middleware(), PUBLIC_PATHS

### Community 31 - "Proxmox Installer"
Cohesion: 0.83
Nodes (3): err(), msg(), install.sh script

### Community 32 - "App Icon Design"
Cohesion: 0.67
Nodes (4): WiiM Dashboard App Icon, Purple-to-Cyan Brand Gradient, Dark Rounded-Square Background, Speaker / Vinyl Disc Motif

### Community 33 - "Vinyl Record Asset"
Cohesion: 0.50
Nodes (4): Album Art Placeholder Concept, Openclipart (Vinyl Records by BenBois), Public Domain License (Creative Commons), Vinyl Record Illustration

### Community 34 - "Turnstile Widget"
Cohesion: 0.67
Nodes (3): loadScript(), TurnstileWidget(), Window

### Community 35 - "WiiM API Doc Commands"
Cohesion: 0.67
Nodes (3): getMetaInfo → metaData, getPlayerStatusEx (playback status), mode → Streaming Service Mapping

## Knowledge Gaps
- **240 isolated node(s):** `docker-entrypoint.sh script`, `pkg`, `nextConfig`, `name`, `version` (+235 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `totpQrDataUrl()` connect `Login, TOTP & CSRF` to `Runtime Dependencies`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Runtime Dependencies` to `Framer Motion`, `Lucide Icons`, `Next.js`, `OTP Library`, `Radix Dialog`, `Radix Switch`, `Radix Tabs`, `React`, `React DOM`, `SWR`, `Package Metadata`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `qrcode` connect `Runtime Dependencies` to `Login, TOTP & CSRF`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **What connects `docker-entrypoint.sh script`, `pkg`, `nextConfig` to the rest of the system?**
  _240 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Device Capabilities & Discovery` be split into smaller, more focused modules?**
  _Cohesion score 0.054945054945054944 - nodes in this community are weakly interconnected._
- **Should `Album Art Proxy & Fallback` be split into smaller, more focused modules?**
  _Cohesion score 0.06101190476190476 - nodes in this community are weakly interconnected._
- **Should `Login, TOTP & CSRF` be split into smaller, more focused modules?**
  _Cohesion score 0.09724238026124818 - nodes in this community are weakly interconnected._