# Changelog

All notable changes to Bullet Storm Raiden. Format based on [Keep a Changelog](https://keepachangelog.com/); versions follow `0.MINOR` builds during GitHub Game Off 2026.

## [0.3.0] - 2026-11-05
### Added
- **Route-driven story (theme: SHIFT).** Every fork shifts the run toward Dream or Nightmare. Briefings, stage taglines and pre/post-boss dialogue change per route, each with its own vibe: grim (Nightmare), goofy (Dream), uneasy/surreal (mixed).
- **Four World 1 endings:** A Iron Dawn (N->N), B The Soft Landing (N->D), C Sour Milk Moon (D->N), D Pillow Fort (D->D). Results screen tracks endings seen.
- **MEMORIES:** 12 lore fragments unlocked by play plus an endings log, saved in SRAM 0x200 (v0.2 saves untouched). On the title menu and in the Dream Workshop.
- **SHIFT mechanic (R):** gauge fills from kills and boss hits (plus rare SHIFT orbs); R flips the stage for 6 s. Dream Shift: pastel palette, bullets become coins, slow star shots. Nightmare Shift: dark palette, faster bullets, x3 score, double damage taken. Works mid-boss.
- **CARTOON setting:** OFF / 1X / 2X / **3X (default)** bold black outlines baked around the original art (GBA hardware can't edge-detect live), with cel banding; combines with every shader.
- New portraits (CMDR. VOX, SGT. WADDLES, MOON SANDMAN), uneasy music variant, SHIFT SFX.
- **Web player v3:** translucent green handheld shell (default skin) with the 3:2 game screen fitted exactly; Classic and None skins; fullscreen; multi-touch shell buttons; video driver WebGPU (Metal on Apple) -> WebGL2 -> WebGL -> Canvas2D; AUTO HQ edge-directed upscaler (default), Sharp Bilinear, Nearest; output 240p to 4800p or Match display, capped to the GPU limit; settings saved when the browser allows.
- **Emulator skins:** Delta (iOS) `skins/BSR_GreenShell.deltaskin` and RetroArch overlay `skins/retroarch/`.
- **GitHub Pages player** in `docs/` and a **Build ROM** GitHub Actions workflow.
### Changed
- Rebalanced all difficulties (starting shields 4/3/3/2, slower bullets and fire). Bot-pilot median survival: Normal 118->188 s, Hard 61->175 s, Extreme 40->86 s.
- New defaults: Cartoon 3X, internal resolution 1X, scanlines off, hardware render.
- Fork text overflow fixed; game over shows time and stage.
### Known issues
- Hard is close to Normal; Easy clears World 1 on about half of bot runs.
- Memories page "END" column looks odd (cosmetic).
- MetalFX and host output resolution can't be controlled by a ROM or web page; the web player uses WebGPU and its own upscaler instead.
- Delta skin and RetroArch overlay not yet tested on device.

## [0.2.0] - 2026-11-04
### Added
- Title screen credits: "MADE FOR GITHUB GAME OFF 2026" / "A GAME DEVELOPED AND CREATED BY ZACHARY PEEBLES".
- GAME SETTINGS menu (Main, Video, Audio, Gameplay pages). Every option applies instantly and saves to SRAM; reset page / reset all.
- Live preview window on each page (animated mini scene drawn with the current video settings; Audio page plays the World 1 theme and SFX with level meters).
- Video: Render Mode (Hardware, Soft Dither, Line Double, Interlace), 12 palette Shaders (LCD Color, CRT Warm, Game Boy, Pocket, Sepia, Virtual Boy, Night Vision, Inverted, Hi Contrast, Dream Pastel, Nightmare), DMA Scanlines, Mosaic Resolution 1x-4x, Brightness, Saturation, Frame Blend ghosting, Screen Shake, Screen Flash, Frame Rate (60 / 30 / Adaptive), Aspect (3:2, 4:3, 16:9, Framed), Hi-Vis Bullets, Perf Meter.
- Audio: Driver (DS+PSG, PSG Only, DS Only with software-synth music), Sample Rate 6689-31536 Hz, Bit Depth 8/6/4/2, Latency, Audio Sync (VSync, Timer IRQ, Free Run), Stereo/Mono/Swap/Wide, Tone filter, Music and SFX volume, Music Style.
- Gameplay: Auto-Fire (hold, toggle, always), button swap, Full/Minimal HUD.
- New screen shake, flash control and separate enemy-bullet palette.
### Changed
- Title layout reworked to fit the credits; tribute lines alternate.
- Sound mixer moved to fast IWRAM. Peak CPU ~51% (defaults), ~81% (heaviest settings); 60 FPS held.
### Known issues
- Settings are in-game equivalents; a ROM can't change an emulator's own driver, GPU shaders or upscaling.
- In DS+PSG mode, sample rate/bit depth/tone affect sound effects only (use DS Only to hear them on music).
- Browser player: Timer IRQ audio sync may crackle; settings reset on reload.

## [0.1.0] - 2026-11-04
### Added
- First playable vertical slice: World 1 (1-1 Twilight Orbit, Iron Hive / Pillow Clouds, Black Foundry / Candy Moon) with Darius-style route forks.
- 4 difficulties (Easy, Normal, Hard, Extreme adaptive rank).
- Ships: NX-7 Nightjet, Paper Dream, Sgt. Waddles, Toast-R (unlockable).
- 7-slot Gradius-style power meter: slot 1 chosen, slots 2-7 rolled per run from 14 power-ups.
- Mini-bosses (Gate Warden, Iron Moth, Big Teddy) and three-phase finales (Night Engine, Moon Sandman).
- Shops and events (Pillow Market, Dream Merchant, Nightmare Gamble, Lost Toy Box), 8 relics.
- Dream coins + Dream Workshop meta progression, SRAM save.
- Original chiptune engine with dream/nightmare variants of the World 1 theme; sample SFX player.
- Browser play page using gbajs.
