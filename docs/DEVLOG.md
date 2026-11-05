# Development log

Every step of building Bullet Storm Raiden, newest last. Dates are Pacific time.

## 2026-11-04 — Scouting and design
- The first prototype was made in shinygen.ai, an AI ROM maker. Its ROM can't be exported, so the game is being rebuilt from scratch as real GBA homebrew, using a 60-second recording of the prototype as reference (horizontal shooter, cyan jet, ring drones, red pellet bullets, SC/HI/ST/PWR/B/SH/LV HUD).
- Design decided step by step (see docs/design.md): Dream War story, Darius-style forks, 7-slot power meter, relics, shops and events, 10+ ships, 4 difficulties incl. adaptive Extreme, 16 worlds, original chiptune.

## 2026-11-04 — Toolchain
- devkitPro downloads were blocked, so the build uses the Wonderful Toolchain (GCC for ARM) with libtonc.
- Headless test runner built on libmgba: scripted input, PNG screenshots, WAV capture.

## 2026-11-04 — v0.1 vertical slice
- World 1 with forks, bosses, shop/events, meta progression, music, SFX, SRAM save. ROM: releases/v0.1.
- In-browser play page using gbajs.

## 2026-11-04 — v0.2 started
- Title credits for GitHub Game Off 2026 and Zachary Peebles.
- GAME SETTINGS menu: in-game video and audio options with live preview.
- This repository created to track everything.

## 2026-11-04 — v0.2 released
- Title credits added; full GAME SETTINGS menu with live preview (see CHANGELOG).
- Every setting verified headless in mGBA and the gbajs browser player; 25 audio captures measured (docs/settings-audio/).
- Full source, asset generators, tests and web player pushed to this repo.

## 2026-11-05 — v0.3 released
- Route-driven story with four World 1 endings, boss dialogue, 12 memory fragments, the SHIFT mechanic and 3X cartoon outlines.
- Balance tuned with a built-in autopilot (tools/balance.py, results in docs/balance_v03.txt).
- Web player v3 with the green shell, WebGPU/WebGL upscaling up to 4800p; Delta and RetroArch skins.
- Player published to GitHub Pages from docs/; Build ROM workflow added.
