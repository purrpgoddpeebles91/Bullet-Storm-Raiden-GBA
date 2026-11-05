/* Bullet Storm Raiden - web player app: skins, touch controls, fullscreen, video settings.
   Needs: BSRPlayer (bsr-player.js), BSRShell, BSRVideo.
   BSRApp.mount(element) builds the player inside element. */
(function (root) {
  'use strict';
  var STORE_KEY = 'bsr.web.settings.v3';
  var DEF = { skin: 'green', driver: 'auto', upscaler: 'hq', output: 'match', repeat: true, haptics: true };
  var mem = {}, persisted = false;
  function load() {
    var s = {}; for (var k in DEF) s[k] = DEF[k];
    try { var j = JSON.parse(root.localStorage.getItem(STORE_KEY) || 'null'); if (j) { for (k in j) if (k in DEF) s[k] = j[k]; } persisted = true; }
    catch (e) { persisted = false; for (k in mem) s[k] = mem[k]; }
    return s;
  }
  function save(s) { for (var k in s) mem[k] = s[k]; try { root.localStorage.setItem(STORE_KEY, JSON.stringify(s)); persisted = true; } catch (e) { persisted = false; } }

  var CSS = [
    '.bsr-app{--bsr-bg:#0d0f14;position:relative;width:100%;color:#e8ecf2;font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-user-select:none;user-select:none}',
    '.bsr-stage{position:relative;width:100%;display:flex;align-items:center;justify-content:center;flex-direction:column}',
    '.bsr-device{position:relative;touch-action:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;margin:0 auto}',
    '.bsr-device>.bsr-layer{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}',
    '.bsr-device>.bsr-layer>svg{display:block;width:100%;height:100%}',
    '.bsr-screen{position:absolute;overflow:hidden;background:#000;pointer-events:none}',
    '.bsr-game-canvas{display:block;width:100%;height:100%;image-rendering:auto}',
    '.bsr-screen.px .bsr-game-canvas{image-rendering:pixelated;image-rendering:crisp-edges}',
    '.bsr-start{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.5em;text-align:center;background:radial-gradient(ellipse at 50% 40%,#1b2a5a 0%,#070a18 70%);color:#fff;font-weight:800;letter-spacing:.08em}',
    '.bsr-start b{font-size:clamp(14px,5.2cqw,40px);background:linear-gradient(#ffe36b,#ff6a3d);-webkit-background-clip:text;background-clip:text;color:transparent}',
    '.bsr-start i{font-style:normal;font-size:clamp(9px,2.6cqw,18px);color:#9fd8ff;animation:bsrblink 1.1s steps(2) infinite}',
    '.bsr-screen{container-type:inline-size}',
    '@keyframes bsrblink{50%{opacity:.25}}',
    '.bsr-toolbar{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:10px auto 0;max-width:720px}',
    '.bsr-toolbar button,.bsr-toolbar select,.bsr-fsbar button{appearance:none;border:1px solid #2c3446;background:#161b26;color:#e8ecf2;border-radius:10px;padding:8px 12px;font:600 13px system-ui,-apple-system,Arial,sans-serif;cursor:pointer;min-height:38px}',
    '.bsr-toolbar button:hover,.bsr-fsbar button:hover{background:#1f2634}',
    '.bsr-toolbar button[aria-pressed=true]{background:#20402b;border-color:#3fae63}',
    '.bsr-fsbar{position:absolute;top:10px;right:10px;display:none;gap:6px;z-index:5;opacity:.55;transition:opacity .2s}',
    '.bsr-fsbar:hover{opacity:1}',
    '.bsr-fs .bsr-fsbar{display:flex}',
    '.bsr-fs{background:radial-gradient(ellipse at 50% 35%,#1a1f2b 0%,#07080b 75%)}',
    '.bsr-fs.bsr-skin-none{background:#000}',
    '.bsr-pseudo-fs{position:fixed!important;left:0;top:0;width:100vw!important;height:100vh!important;height:100dvh!important;z-index:2147483000}',
    '.bsr-panel{position:absolute;right:8px;top:8px;bottom:8px;width:min(380px,calc(100% - 16px));overflow:auto;background:rgba(13,16,24,.96);border:1px solid #2c3446;border-radius:14px;padding:14px 14px 18px;z-index:6;box-shadow:0 12px 40px rgba(0,0,0,.5);-webkit-user-select:text;user-select:text}',
    '.bsr-panel[hidden]{display:none}',
    '.bsr-panel h3{margin:0 0 8px;font-size:15px;letter-spacing:.04em}',
    '.bsr-panel label{display:block;margin:12px 0 4px;font-weight:700;font-size:12px;color:#9fb0c8;letter-spacing:.05em;text-transform:uppercase}',
    '.bsr-panel select{width:100%;padding:8px;border-radius:9px;background:#161b26;color:#e8ecf2;border:1px solid #2c3446;font:600 13px system-ui,Arial,sans-serif}',
    '.bsr-panel .row{display:flex;align-items:center;gap:8px;margin-top:10px;font-weight:600}',
    '.bsr-panel .note{font-size:12px;color:#93a1b5;margin-top:6px}',
    '.bsr-panel .warn{font-size:12px;color:#ffcf6b;margin-top:6px}',
    '.bsr-panel .stat{font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#bfe9c9;background:#0a0d13;border:1px solid #1d2433;border-radius:8px;padding:8px;margin-top:8px;white-space:pre-wrap}',
    '.bsr-panel .close{position:absolute;right:10px;top:10px;background:#1f2634;border:1px solid #2c3446;color:#fff;border-radius:8px;padding:4px 10px;cursor:pointer}'
  ].join('\n');

  function el(tag, attrs, html) { var e = document.createElement(tag); if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
  function opt(sel, list, val, avail) {
    sel.innerHTML = '';
    list.forEach(function (o) { var x = el('option', { value: o[0] }, o[1] + (avail && avail[o[0]] === false ? ' (unavailable)' : '')); if (avail && avail[o[0]] === false) x.disabled = true; if (o[0] === val) x.selected = true; sel.appendChild(x); });
  }

  function mount(host) {
    var S = load();
    if (!document.getElementById('bsr-ui-css')) { var st = el('style', { id: 'bsr-ui-css' }, CSS); document.head.appendChild(st); }
    var app = el('div', { 'class': 'bsr-app' }); host.appendChild(app);
    var stage = el('div', { 'class': 'bsr-stage' }); app.appendChild(stage);
    var device = el('div', { 'class': 'bsr-device' }); stage.appendChild(device);
    var screen = el('div', { 'class': 'bsr-screen' });
    var startOv = el('div', { 'class': 'bsr-start' }, '<b>BULLET STORM RAIDEN</b><i>TAP OR PRESS ANY KEY TO START</i>');
    var fsbar = el('div', { 'class': 'bsr-fsbar' }, '<button data-a="settings" title="Video settings">\u2699 Settings</button><button data-a="skin" title="Next skin">Skin</button><button data-a="fs" title="Exit fullscreen">\u2715 Exit</button>');
    stage.appendChild(fsbar);
    var bar = el('div', { 'class': 'bsr-toolbar' });
    bar.innerHTML = '<select data-a="skinsel" aria-label="Skin"><option value="green">Skin: Green GBC shell</option><option value="classic">Skin: Classic pad</option><option value="none">Skin: None (game only)</option></select>' +
      '<button data-a="fs">Fullscreen</button><button data-a="settings">\u2699 Video settings</button><button data-a="sound">Sound: on</button><button data-a="pause">Pause</button><button data-a="reset">\u21BA Reset</button>';
    app.appendChild(bar);
    var panel = el('div', { 'class': 'bsr-panel', hidden: '' });
    panel.innerHTML = '<button class="close" data-a="settings">Close</button><h3>VIDEO SETTINGS</h3>' +
      '<label>Skin</label><select data-s="skin"><option value="green">Green GBC shell (default)</option><option value="classic">Classic pad</option><option value="none">None (game only)</option></select>' +
      '<label>Video driver</label><select data-s="driver"></select><div class="note" data-i="drvnote"></div>' +
      '<label>Upscaler</label><select data-s="upscaler"></select><div class="note" data-i="upnote"></div>' +
      '<label>Render source</label><select disabled><option>Internal 240\u00D7160 (native GBA)</option></select>' +
      '<label>Output resolution</label><select data-s="output"></select><div class="note" data-i="resnote"></div><div class="warn" data-i="reswarn"></div>' +
      '<div class="row"><input type="checkbox" data-s="repeat" id="bsr-rep"><span>D-pad hold-to-repeat (menus)</span></div><div class="note">Holding a direction re-taps it every 150 ms after 0.4 s so menus scroll. Turn off for perfectly continuous movement.</div>' +
      '<div class="row"><input type="checkbox" data-s="haptics" id="bsr-hap"><span>Haptic tap (Android)</span></div>' +
      '<div class="stat" data-i="stat"></div>' +
      '<div class="note">WebGPU runs on Metal on Apple devices (Direct3D 12 or Vulkan elsewhere). Apple MetalFX itself is not reachable from a web page: AUTO HQ is this player\u2019s own edge-directed shader upscaler doing the same job. No scanlines or CRT effects are applied.</div>' +
      '<div class="note" data-i="savenote"></div>';
    stage.appendChild(panel);
    var $ = function (q) { return app.querySelector(q); };

    var video = BSRVideo.create(screen);
    video.onchange = function () { layout(); if (!panel.hidden) fillSettings(); };
    var shell = null, skinName = null, fs = false, pseudo = false;

    /* ---------- skins ---------- */
    function buildSkin(name) {
      skinName = name;
      device.innerHTML = '';
      stage.classList.remove('bsr-skin-green', 'bsr-skin-classic', 'bsr-skin-none'); stage.classList.add('bsr-skin-' + name);
      if (name === 'none') {
        shell = null;
        screen.style.left = '0'; screen.style.top = '0'; screen.style.width = '100%'; screen.style.height = '100%';
        device.appendChild(screen);
      } else {
        shell = name === 'classic' ? BSRShell.classic({}) : BSRShell.green({ led: BSRPlayer.isStarted() });
        var b = el('div', { 'class': 'bsr-layer' }, shell.body), k = el('div', { 'class': 'bsr-layer' }, shell.buttons);
        var r = shell.screen;
        screen.style.left = (r.x / shell.W * 100) + '%'; screen.style.top = (r.y / shell.H * 100) + '%';
        screen.style.width = (r.w / shell.W * 100) + '%'; screen.style.height = (r.h / shell.H * 100) + '%';
        device.appendChild(b); device.appendChild(screen); device.appendChild(k);
      }
      if (!BSRPlayer.isStarted() && !startOv.parentNode) screen.appendChild(startOv);
      $('[data-a=skinsel]').value = name; $('[data-s=skin]').value = name;
      layout();
    }
    function aspect() { return shell ? shell.W / shell.H : 1.5; }
    function layout() {
      var vw = root.innerWidth, vh = root.innerHeight, w, h, a = aspect();
      if (fs) {
        var r = stage.getBoundingClientRect(); var aw = r.width || vw, ah = r.height || vh;
        var pad = shell ? 0.98 : 1;
        w = Math.min(aw * pad, ah * pad * a); h = w / a;
        stage.style.height = '';
      } else {
        var cw = app.clientWidth || vw;
        var maxH = Math.max(300, vh - 76);
        w = Math.min(cw, maxH * a, shell ? 560 : 1440); h = w / a;
      }
      w = Math.floor(w); h = Math.floor(w / a);
      device.style.width = w + 'px'; device.style.height = h + 'px';
      var sw = shell ? w * shell.screen.w / shell.W : w, sh = shell ? h * shell.screen.h / shell.H : h;
      video.resize(sw, sh, root.devicePixelRatio || 1);
      screen.classList.toggle('px', S.upscaler === 'nearest');
      refreshInfo();
    }

    /* ---------- input ---------- */
    var keyState = {}; // name -> {n, t0, rel, rep}
    var DIRS = { UP: 1, DOWN: 1, LEFT: 1, RIGHT: 1 };
    /* Minimum press: a touch press stays down for at least MIN_MS of wall time AND at least MIN_FR emulated
       frames, so even a very quick tap (or a tap during main-thread jank) is seen by the game. A hidden tab
       stops emulation, so a pending release is forced after MAX_MS to avoid a stuck key. */
    var MIN_MS = 100, MIN_FR = 2, MAX_MS = 1000;
    function press(k) {
      var s = keyState[k] || (keyState[k] = { n: 0 });
      if (s.n++ > 0) return;
      if (s.rel) { clearTimeout(s.rel); s.rel = null; }
      else BSRPlayer.key(k, true, 'touch');
      s.t0 = performance.now(); s.f0 = BSRPlayer.frames ? BSRPlayer.frames() : 0;
      if (S.haptics && navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
      if (S.repeat && DIRS[k]) { var rep = function () { BSRPlayer.pulse(k); s.rep = setTimeout(rep, 150); }; s.rep = setTimeout(rep, 400); }
    }
    function release(k) {
      var s = keyState[k]; if (!s || s.n <= 0) return;
      if (--s.n > 0) return;
      if (s.rep) { clearTimeout(s.rep); s.rep = null; }
      var tryUp = function () {
        s.rel = null; if (s.n !== 0) return;
        var dt = performance.now() - s.t0, df = BSRPlayer.frames ? BSRPlayer.frames() - s.f0 : MIN_FR;
        if ((dt >= MIN_MS && df >= MIN_FR) || dt >= MAX_MS) BSRPlayer.key(k, false, 'touch');
        else s.rel = setTimeout(tryUp, Math.max(16, MIN_MS - dt));
      };
      tryUp();
    }
    function releaseAll() { for (var k in keyState) { var s = keyState[k]; if (s.rel) clearTimeout(s.rel); if (s.rep) clearTimeout(s.rep); keyState[k] = { n: 0 }; } ptrs = {}; active = {}; }
    function keysAt(x, y) {
      var out = [];
      if (!shell) return out;
      var zs = shell.zones, i, z;
      for (i = 0; i < zs.length; i++) { z = zs[i]; if (z.k === 'AB' && Math.hypot(x - z.c[0], y - z.c[1]) <= z.r) return ['A', 'B']; }
      for (i = 0; i < zs.length; i++) {
        z = zs[i];
        if (z.rect) { if (x >= z.rect[0] && x <= z.rect[0] + z.rect[2] && y >= z.rect[1] && y <= z.rect[1] + z.rect[3]) out.push(z.k); continue; }
        var dx = x - z.c[0], dy = y - z.c[1], d = Math.hypot(dx, dy);
        if (z.k === 'AB' || d > z.r) continue;
        if (z.k === 'DPAD') {
          if (d < z.dead) continue;
          var ax = Math.abs(dx), ay = Math.abs(dy);
          if (ay > ax * 0.5) out.push(dy < 0 ? 'UP' : 'DOWN');
          if (ax > ay * 0.5) out.push(dx < 0 ? 'LEFT' : 'RIGHT');
        } else out.push(z.k);
      }
      return out;
    }
    var ptrs = {}, active = {};
    function toLocal(e) { var r = device.getBoundingClientRect(); if (!shell) return [0, 0]; return [(e.clientX - r.left) / r.width * shell.W, (e.clientY - r.top) / r.height * shell.H]; }
    function setPtr(id, keys) {
      var old = ptrs[id] || [];
      keys.forEach(function (k) { if (old.indexOf(k) < 0) { if (k === 'MENU') togglePanel(); else press(k); } });
      old.forEach(function (k) { if (keys.indexOf(k) < 0 && k !== 'MENU') release(k); });
      if (keys.length) ptrs[id] = keys; else delete ptrs[id];
    }
    device.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (!BSRPlayer.isStarted()) { startGame(); return; }
      BSRPlayer.unlockAudio();
      try { device.setPointerCapture(e.pointerId); } catch (x) {}
      active[e.pointerId] = true; var p = toLocal(e); setPtr(e.pointerId, keysAt(p[0], p[1]));
    });
    device.addEventListener('pointermove', function (e) {
      if (!active[e.pointerId]) return;
      var p = toLocal(e), keys = keysAt(p[0], p[1]).filter(function (k) { return k !== 'MENU'; });
      if ((ptrs[e.pointerId] || []).indexOf('MENU') >= 0) keys.push('MENU');
      setPtr(e.pointerId, keys);
    });
    function up(e) { delete active[e.pointerId]; setPtr(e.pointerId, []); }
    device.addEventListener('pointerup', up); device.addEventListener('pointercancel', up); device.addEventListener('lostpointercapture', up);
    device.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('keydown', function (e) {
      var t = e.target && e.target.tagName; if (t === 'SELECT' || t === 'INPUT') return;
      if (!BSRPlayer.isStarted() && !e.metaKey && !e.ctrlKey && !e.altKey && e.key !== 'Tab') { startGame(); e.preventDefault(); }
      else if (e.key === 'f' || e.key === 'F') { toggleFs(); }
    });
    function feedback(name, down) {
      var n = device.querySelector('#bsr-k-' + name); if (n) n.classList.toggle('on', down);
    }

    /* ---------- start ---------- */
    var fpsEmu = 0, fpsDraw = 0, cEmu = 0, cDraw = 0, tFps = performance.now();
    function startGame() {
      if (BSRPlayer.isStarted()) return;
      if (startOv.parentNode) startOv.parentNode.removeChild(startOv);
      BSRPlayer.start(null, {
        onFrame: function (rgba) { cEmu++; video.frame(rgba); },
        onTick: function () { video.draw(); cDraw++; var t = performance.now(); if (t - tFps > 1000) { fpsEmu = cEmu * 1000 / (t - tFps); fpsDraw = cDraw * 1000 / (t - tFps); cEmu = cDraw = 0; tFps = t; if (!panel.hidden) refreshInfo(); } },
        onKey: feedback
      });
      BSRPlayer.unlockAudio();
      var led = shell && device.querySelector('#' + (shell.ledId || 'x')); if (led) led.classList.add('on');
    }

    /* ---------- fullscreen ---------- */
    function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement; }
    function setFs(on) {
      fs = on;
      stage.classList.toggle('bsr-fs', on);
      $('[data-a=fs]').textContent = on ? '\u2715 Exit fullscreen' : 'Fullscreen';
      setTimeout(layout, 30); layout();
    }
    function toggleFs() {
      if (fs) {
        if (pseudo) { pseudo = false; stage.classList.remove('bsr-pseudo-fs'); document.documentElement.style.overflow = ''; setFs(false); }
        else { var ex = document.exitFullscreen || document.webkitExitFullscreen; try { ex.call(document); } catch (e) { setFs(false); } }
        return;
      }
      var req = stage.requestFullscreen || stage.webkitRequestFullscreen;
      var goPseudo = function () { pseudo = true; stage.classList.add('bsr-pseudo-fs'); document.documentElement.style.overflow = 'hidden'; setFs(true); };
      if (req && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
        try {
          var p = req.call(stage, { navigationUI: 'hide' });
          if (p && p.then) p.then(function () { if (skinName === 'none') try { screen.orientation.lock('landscape').catch(function () {}); } catch (e) {} }, goPseudo);
        } catch (e) { goPseudo(); }
      } else goPseudo();
    }
    function onFsChange() { var on = !!fsElement(); if (!pseudo) setFs(on); }
    document.addEventListener('fullscreenchange', onFsChange); document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pseudo) toggleFs(); });

    /* ---------- settings ---------- */
    function togglePanel() { panel.hidden = !panel.hidden; if (!panel.hidden) { fillSettings(); refreshInfo(); } }
    function fillSettings() {
      var av = video.probe();
      opt($('[data-s=driver]'), BSRVideo.DRV, S.driver, av);
      opt($('[data-s=upscaler]'), BSRVideo.UPS, S.upscaler);
      opt($('[data-s=output]'), BSRVideo.RES, S.output);
      $('[data-s=skin]').value = S.skin; $('[data-s=repeat]').checked = !!S.repeat; $('[data-s=haptics]').checked = !!S.haptics;
    }
    function refreshInfo() {
      var i = video.info();
      var lab = { webgpu: 'WebGPU', webgl2: 'WebGL 2', webgl: 'WebGL 1', canvas: 'Canvas 2D (CPU)', none: 'starting\u2026' }[i.driver];
      var drvNote = 'Active: ' + lab + (i.driver === 'webgpu' ? ' \u2014 on Apple devices this is Metal' : '') + (i.requested !== 'auto' && i.requested !== i.driver ? ' (requested ' + i.requested + ' was not available, fell back)' : '') + (i.fellBack ? ' (switched after GPU error: ' + i.fellBack + ')' : '') + (i.gpu ? ' \u00B7 ' + i.gpu : '');
      $('[data-i=drvnote]').textContent = drvNote;
      $('[data-i=upnote]').textContent = i.upscaler === 'hq' ? (i.driver === 'canvas' ? 'Canvas 2D fallback: Scale2x\u00D72 on the CPU, then smooth scaling.' : 'Edge-directed (xBR-style) corner interpolation with anti-aliased pixel edges, computed at output resolution on the GPU.') : i.upscaler === 'sharp' ? 'Integer nearest prescale, then bilinear to the final size.' : i.upscaler === 'nearest' ? 'Raw pixels. Uneven at non-integer sizes.' : 'Plain bilinear filtering.';
      var rn = 'Rendering ' + i.renderW + '\u00D7' + i.renderH + (i.ssaa ? ' \u2192 supersampled down to ' + i.canvasW + '\u00D7' + i.canvasH + ' for your display (' + Math.round(i.cssW) + '\u00D7' + Math.round(i.cssH) + ' CSS px \u00D7 ' + (+i.dpr).toFixed(2) + ' DPR).' : ' on a ' + i.canvasW + '\u00D7' + i.canvasH + ' canvas (display ' + Math.round(i.cssW * i.dpr) + '\u00D7' + Math.round(i.cssH * i.dpr) + ' px).');
      if (!i.ssaa && i.canvasW > i.cssW * i.dpr * 1.05) rn += ' The browser downsamples it to the display.';
      $('[data-i=resnote]').textContent = rn;
      var w = '';
      if (i.capped) w = 'Requested ' + i.requestedW + '\u00D7' + i.requestedH + ' exceeds this browser\u2019s limit (max texture ' + i.maxDim + (i.maxArea ? ', max canvas area ' + (i.maxArea / 1e6).toFixed(1) + ' MP' : '') + ') \u2014 capped to ' + i.renderW + '\u00D7' + i.renderH + '.';
      else if (i.renderH >= 2880) w = 'Very high output: heavy GPU work every frame. Lower it if the game stutters.';
      if (i.error && /target|lost/.test(i.error)) w += (w ? ' ' : '') + 'GPU: ' + i.error;
      $('[data-i=reswarn]').textContent = w;
      $('[data-i=stat]').textContent = 'driver   ' + lab + '\nupscaler ' + i.upscaler + '\nsource   240\u00D7160 internal\nrender   ' + i.renderW + '\u00D7' + i.renderH + '\ncanvas   ' + i.canvasW + '\u00D7' + i.canvasH + '\nmax tex  ' + i.maxDim + '\nfps      emu ' + fpsEmu.toFixed(0) + ' / draw ' + fpsDraw.toFixed(0);
      $('[data-i=savenote]').textContent = persisted ? 'Settings are saved in this browser.' : 'Settings are kept for this session (this page cannot use browser storage here).';
    }
    function applySetting(k, v) {
      S[k] = v; save(S);
      if (k === 'skin') buildSkin(v);
      else if (k === 'driver') video.init(v).then(function () { layout(); fillSettings(); refreshInfo(); }, function () { refreshInfo(); });
      else if (k === 'upscaler') { video.setUpscaler(v); screen.classList.toggle('px', v === 'nearest'); }
      else if (k === 'output') video.setOutput(v);
      refreshInfo();
    }
    panel.addEventListener('change', function (e) {
      var k = e.target.getAttribute('data-s'); if (!k) return;
      applySetting(k, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
      if (e.target.blur) e.target.blur();
    });
    app.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-a]'); if (!b || b.tagName === 'SELECT') return;
      var a = b.getAttribute('data-a');
      if (a === 'fs') toggleFs();
      else if (a === 'settings') togglePanel();
      else if (a === 'skin') { var order = ['green', 'classic', 'none']; applySetting('skin', order[(order.indexOf(S.skin) + 1) % 3]); }
      else if (a === 'sound') { if (!BSRPlayer.isStarted()) startGame(); var on = BSRPlayer.toggleSound(); b.textContent = on ? 'Sound: on' : 'Sound: off'; }
      else if (a === 'pause') { if (!BSRPlayer.isStarted()) return; var p = !BSRPlayer.isPaused(); BSRPlayer.setPaused(p); b.textContent = p ? 'Resume' : 'Pause'; b.setAttribute('aria-pressed', p); }
      else if (a === 'reset') { if (BSRPlayer.isStarted()) { releaseAll(); BSRPlayer.reset(); } }
      if (b.blur) b.blur();
    });
    $('[data-a=skinsel]').addEventListener('change', function (e) { applySetting('skin', e.target.value); e.target.blur(); });
    $('[data-a=skinsel]').addEventListener('click', function (e) { e.stopPropagation(); });

    if (root.ResizeObserver) new ResizeObserver(function () { layout(); }).observe(app);
    root.addEventListener('resize', layout);
    root.addEventListener('orientationchange', function () { setTimeout(layout, 200); });

    buildSkin(S.skin);
    video.init(S.driver).then(function () { video.setUpscaler(S.upscaler); video.setOutput(S.output); layout(); }, function (e) { if (!/superseded/.test(e && e.message)) console.error(e); });
    var api = { video: video, settings: S, start: startGame, toggleFs: toggleFs, togglePanel: togglePanel, setSkin: function (n) { applySetting('skin', n); }, set: applySetting, layout: layout, keysAt: keysAt, shell: function () { return shell; }, info: function () { return video.info(); } };
    root.BSRAppInstance = api;
    return api;
  }
  root.BSRApp = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
