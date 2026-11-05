// Web v3 verification: phone/desktop/classic/settings/fullscreen screenshots, forced drivers, output caps,
// single-file over file:// and in a sandboxed iframe. Spawns its own static servers.
// node tests/web3_verify.js [outdir]     (needs /usr/bin/chromium + puppeteer-core)
const P = require(process.env.PUPPETEER || '/tmp/pt/node_modules/puppeteer-core');
const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const out = process.argv[2] || ROOT + '/dist/screens/web3v';
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SBX = '/tmp/bsr_sbx'; fs.mkdirSync(SBX, { recursive: true });
fs.copyFileSync(ROOT + '/dist/web/BulletStormRaiden_web_single.html', SBX + '/single.html');
fs.writeFileSync(SBX + '/wrap.html', '<!doctype html><html><body style="margin:0;background:#222"><iframe id="f" src="single.html" sandbox="allow-scripts" style="width:1000px;height:780px;border:0"></iframe></body></html>');
const srv = [spawn('python3', ['-m', 'http.server', '8766'], { cwd: ROOT + '/site', stdio: 'ignore' }),
             spawn('python3', ['-m', 'http.server', '8767'], { cwd: SBX, stdio: 'ignore' })];
const R = {}; const PH = (process.env.PH || 'phone,desktop,single,sandbox').split(','); // PH=desktop node ... runs one phase
(async () => {
  await sleep(800);
  const b = await P.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--disable-vulkan-surface', '--use-vulkan=swiftshader', '--allow-file-access-from-files'] });
  async function newPage(vp) {
    const ctx = await b.createBrowserContext(); const pg = await ctx.newPage(); pg._logs = [];
    pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') pg._logs.push(m.type() + ': ' + m.text()); });
    pg.on('pageerror', e => pg._logs.push('PAGEERROR ' + e.message));
    await pg.setViewport(vp); return pg;
  }
  const shotScreen = async (pg, name, frame) => { // whole page + crop of the game screen
    await pg.screenshot({ path: out + '/' + name + '.png' });
    const h = await (frame || pg).$('.bsr-screen'); if (h) await h.screenshot({ path: out + '/' + name + '_screen.png' });
  };
  const info = (pg) => pg.evaluate(() => BSRAppInstance.info());

  if (PH.includes('phone')) {
  // ---- phone 390x844 green shell
  let pg;
  pg = await newPage({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await pg.goto('http://localhost:8766/index.html'); await sleep(1500);
  await shotScreen(pg, 'p01_phone_off');
  const dev = await pg.$('.bsr-device'); const box = await dev.boundingBox();
  await pg.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.25);
  await sleep(6000);
  await shotScreen(pg, 'p02_phone_running');
  R.phone = { started: await pg.evaluate(() => BSRPlayer.isStarted()), frames: await pg.evaluate(() => BSRPlayer.frames()), info: await info(pg) };
  // min press test via CDP touch
  const S = await pg.evaluate(() => { const s = BSRAppInstance.shell(); return { W: s.W, H: s.H, m: s.meta } });
  const toPx = (x, y) => ({ x: box.x + x / S.W * box.width, y: box.y + y / S.H * box.height });
  const cdp = await pg.target().createCDPSession();
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })) });
  const held = () => pg.evaluate(() => BSRPlayer.held());
  await pg.evaluate(() => { window.__pl = []; const d = document.querySelector('.bsr-device'); ['pointerdown', 'pointerup', 'pointercancel'].forEach(t => d.addEventListener(t, e => __pl.push(t + '@' + Math.round(performance.now()) + ' held=' + BSRPlayer.held()), true)); });
  const pB = toPx(S.m.b[0], S.m.b[1]); const r = { bKeys: await pg.evaluate((x, y) => BSRAppInstance.keysAt(x, y), S.m.b[0], S.m.b[1]) };
  await touch('touchStart', [{ ...pB, id: 3 }]); await touch('touchEnd', []);
  await sleep(30); r.bAt30 = await held(); await sleep(50); r.bAt80 = await held(); await sleep(90); r.bAt170 = await held();
  const pA = toPx(S.m.a[0], S.m.a[1]); const pR = toPx(S.m.dpad.c[0] + 90, S.m.dpad.c[1]);
  await touch('touchStart', [{ ...pR, id: 1 }]); await touch('touchStart', [{ ...pR, id: 1 }, { ...pA, id: 2 }]); await sleep(60); r.rightPlusA = await held();
  await touch('touchEnd', []); await sleep(200); r.afterRelease = await held();
  r.ptrLog = await pg.evaluate(() => __pl);
  r.inPage = await pg.evaluate((x, y) => new Promise(res => {
    const d = document.querySelector('.bsr-device'), rc = d.getBoundingClientRect(), s = BSRAppInstance.shell();
    const cx = rc.left + x / s.W * rc.width, cy = rc.top + y / s.H * rc.height, o = { pointerId: 77, pointerType: 'touch', clientX: cx, clientY: cy, bubbles: true, cancelable: true };
    const t0 = performance.now(), f0 = BSRPlayer.frames(), out = {};
    d.dispatchEvent(new PointerEvent('pointerdown', o)); d.dispatchEvent(new PointerEvent('pointerup', o));
    out.at0 = BSRPlayer.held();
    const poll = () => { const b = BSRPlayer.held() & 2; if (!b) { out.releasedAfterMs = Math.round(performance.now() - t0); out.framesHeld = BSRPlayer.frames() - f0; res(out); } else if (performance.now() - t0 > 2000) { out.stuck = true; res(out); } else setTimeout(poll, 5); };
    setTimeout(poll, 5);
  }), S.m.b[0], S.m.b[1]);
  R.minPress = r;
  await pg.evaluate(() => BSRAppInstance.togglePanel()); await sleep(700);
  await pg.screenshot({ path: out + '/p03_phone_settings.png' });
  R.phoneLogs = pg._logs.slice(0, 10);

  }
  if (PH.includes('desktop')) {
  // ---- desktop 1280x800
  pg = await newPage({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await pg.goto('http://localhost:8766/index.html'); await sleep(1200);
  await pg.keyboard.press('Enter'); await sleep(6000);
  await shotScreen(pg, 'd01_desktop_running');
  R.desktop = await info(pg);
  for (const d of ['webgpu', 'webgl2', 'canvas']) {
    await pg.evaluate(d => BSRAppInstance.set('driver', d), d); await sleep(2500);
    const i = await info(pg); R['drv_' + d] = { driver: i.driver, gpu: i.gpu, render: i.renderW + 'x' + i.renderH, maxDim: i.maxDim, err: i.error || null, fps: await pg.evaluate(() => document.querySelector('[data-i=stat]').textContent.split('\n').pop()) };
    await shotScreen(pg, 'd02_driver_' + d);
  }
  await pg.evaluate(() => BSRAppInstance.set('driver', 'auto')); await sleep(2000);
  const outInfo = async (k) => { const i = await info(pg); R[k] = { driver: i.driver, requested: i.requestedW + 'x' + i.requestedH, render: i.renderW + 'x' + i.renderH, canvas: i.canvasW + 'x' + i.canvasH, maxDim: i.maxDim, capped: i.capped, note: await pg.evaluate(() => { BSRAppInstance.togglePanel(); BSRAppInstance.togglePanel(); return document.querySelector('[data-i=reswarn]').textContent; }) }; };
  for (const o of ['4320', '4800']) { await pg.evaluate(o => BSRAppInstance.set('output', o), o); await sleep(2500); await outInfo('out_' + o + '_native'); }
  await pg.evaluate(() => BSRAppInstance.video._debugMaxDim(4096)); await sleep(1500); await outInfo('out_4800_maxtex4096');
  await pg.evaluate(() => BSRAppInstance.video._debugMaxDim(0)); await pg.evaluate(() => BSRAppInstance.set('driver', 'canvas')); await sleep(2500); await outInfo('out_4800_canvas2d');
  await pg.evaluate(() => BSRAppInstance.video._debugMaxDim(4096)); await pg.evaluate(() => BSRAppInstance.set('driver', 'webgl2')); await sleep(2500);
  await shotScreen(pg, 'd03b_webgl2_supersampled_4800p'); R.ssaaInfo = await info(pg);
  await pg.evaluate(() => BSRAppInstance.togglePanel()); await sleep(800);
  R.capNote = await pg.evaluate(() => document.querySelector('[data-i=reswarn]').textContent);
  await pg.screenshot({ path: out + '/d03_settings_4800p.png' });
  await pg.evaluate(() => { BSRAppInstance.togglePanel(); BSRAppInstance.video._debugMaxDim(0); BSRAppInstance.set('output', 'match'); BSRAppInstance.setSkin('classic'); }); await sleep(1500);
  await shotScreen(pg, 'd04_classic');
  await pg.evaluate(() => BSRAppInstance.setSkin('green')); await sleep(500);
  await pg.click('.bsr-toolbar [data-a=fs]'); await sleep(2000);
  R.fullscreen = await pg.evaluate(() => ({ fsEl: !!document.fullscreenElement, cls: document.querySelector('.bsr-stage').className, dev: document.querySelector('.bsr-device').style.width + ' x ' + document.querySelector('.bsr-device').style.height }));
  await shotScreen(pg, 'd05_fullscreen');
  R.desktopLogs = pg._logs.slice(0, 10);

  }
  if (PH.includes('single')) {
  // ---- single file over file://
  pg = await newPage({ width: 1000, height: 800, deviceScaleFactor: 1 });
  await pg.goto('file://' + ROOT + '/dist/web/BulletStormRaiden_web_single.html'); await sleep(1500);
  await pg.keyboard.press('Enter'); await sleep(6000);
  await shotScreen(pg, 's01_single_file');
  R.singleFile = { started: await pg.evaluate(() => BSRPlayer.isStarted()), frames: await pg.evaluate(() => BSRPlayer.frames()), driver: (await info(pg)).driver, savenote: await pg.evaluate(() => document.querySelector('[data-i=savenote]').textContent), logs: pg._logs.slice(0, 8) };

  }
  if (PH.includes('sandbox')) {
  // ---- single file in sandbox="allow-scripts" iframe (opaque origin, no storage)
  pg = await newPage({ width: 1000, height: 800, deviceScaleFactor: 1 });
  await pg.goto('http://localhost:8767/wrap.html'); await sleep(1500);
  const fr = pg.frames().find(f => f !== pg.mainFrame());
  const fb = await (await pg.$('#f')).boundingBox(); const db = await (await fr.$('.bsr-device')).boundingBox();
  await pg.mouse.click(fb.x + db.x + db.width / 2, fb.y + db.y + db.height * 0.25); await sleep(7000);
  await pg.screenshot({ path: out + '/s02_sandbox_iframe.png' });
  R.sandbox = { started: await fr.evaluate(() => BSRPlayer.isStarted()), frames: await fr.evaluate(() => BSRPlayer.frames()), driver: await fr.evaluate(() => BSRAppInstance.info().driver),
    storage: await fr.evaluate(() => { try { localStorage.length; return 'available'; } catch (e) { return 'blocked: ' + e.name; } }),
    savenote: await fr.evaluate(() => document.querySelector('[data-i=savenote]').textContent), logs: pg._logs.slice(0, 8) };
  // settings change in sandbox must not throw
  await fr.evaluate(() => BSRAppInstance.set('upscaler', 'sharp')); await sleep(300);
  R.sandbox.afterSet = await fr.evaluate(() => BSRAppInstance.info().upscaler);

  }
  console.log(JSON.stringify(R, null, 1));
  await b.close(); srv.forEach(s => s.kill()); process.exit(0);
})().catch(e => { console.error('FAIL', e); console.log(JSON.stringify(R, null, 1)); srv.forEach(s => s.kill()); process.exit(1); });
