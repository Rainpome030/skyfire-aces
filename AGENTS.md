# AGENTS.md

## Scope and authority

This file applies to the whole repository.

- Active Three.js development happens on branch `chi`; never develop on `main`.
- The legacy Canvas game under `src/game/` is reference material. Do not mix Three.js imports into it or edit generated/release files for v2 work.
- The two historical planning documents at the repository root are context, not automatic implementation authority.
- Keep the current slice isolated under `v2/prototype-flight-slice/` until its experience gates pass.

## Locked product decisions

- Browser-first Three.js rebuild, developed primarily by coding agents.
- Camera A is locked: world-stable/map-up yaw, low-FOV perspective, soft positional follow, restrained forward look-ahead.
- The user has played Camera A without motion sickness and wants it preserved.
- Real world altitude, readable oblique top-down combat, restrained camera motion, and limited player input remain core constraints.
- Tactical depth must come from positioning, firing geometry, altitude, enemy roles, and timing—not more permanent buttons.
- W/S is the locked energy-maneuver pair: W extends under power, S trades speed for a tighter break, and releasing either returns toward cruise. Space remains the discrete LOW/HIGH action; do not add canned aerobatic buttons.

## Current slice objective

Polish one replayable encounter before adding campaign volume. The encounter should prove:

- steering creates understandable firing positions;
- altitude changes both attack opportunities and danger;
- a manually timed missile breaks a meaningful tactical problem;
- radar, ground AA, interceptors, and the ace have distinct readable jobs;
- warnings, projectiles, hits, grazes, heavy damage, kills, and phase changes are causally legible;
- the same rules work on desktop and representative mobile layouts;
- trails communicate recent maneuver history without dominating the aircraft or targets.

Do not migrate progression, the full campaign, achievements, or release packaging until this slice is fun on repeat play.

## v2 architecture

- TypeScript, Vite, maintained Three.js npm package, and `WebGLRenderer` are the baseline.
- Keep simulation truth independent of Three.js and DOM objects.
- Maintain clear `core`, `content`, `input`, `render-three`, `ui`, and platform boundaries.
- Prefer fixed-timestep deterministic behavior and declarative encounter data.
- Rendering projects simulation state; gameplay truth may not exist only in meshes, effects, or DOM state.
- Centralize tuning values and name them by design intent.

## Asset policy

- Vendor runtime assets locally; do not hotlink.
- Record creator, original source page, exact license, modifications, retrieval date, and SHA-256 in `public/THIRD_PARTY_ASSETS.md`.
- Prefer CC0. CC BY assets require complete attribution in the shipped build.
- Verify licenses on the creator or original distribution page before adding an asset.
- Keep models suitable for mobile WebGL and preserve clear top-down silhouettes over raw polygon count.

## Workflow and verification

Before editing, confirm the branch is not `main` and preserve unrelated changes.

For v2 changes, run:

```bash
npm run typecheck
npm test
npm run build
npm run smoke
```

Camera, rendering, HUD, input, and responsive changes also require visual inspection of generated desktop, portrait, and landscape screenshots. Clearly distinguish automated viewport checks from real-device and human playtest evidence.

## Git safety

- Do not push, merge, rebase, open a PR, or modify `main` without explicit user authorization.
- Do not commit ignored logs, screenshots, secrets, credentials, temporary downloads, or private research documents.
