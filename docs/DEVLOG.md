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
