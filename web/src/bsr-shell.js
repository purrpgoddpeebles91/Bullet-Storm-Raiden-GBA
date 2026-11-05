/* Bullet Storm Raiden - shell art, drawn entirely in code (original artwork, no third-party logos).
   BSRShell.green(opts)  -> translucent green handheld shell (default skin)
   BSRShell.classic(opts)-> dark flat pad (classic skin)
   Each returns { W, H, screen:{x,y,w,h}, body:'<svg..>', buttons:'<svg..>', full:'<svg..>', zones:[...] }
   body    = static layer (shell, internals, prints). buttons = dynamic layer (ids bsr-k-<KEY>, toggled with class "on").
   zones   = touch zones in viewBox units: {k:'A', c:[cx,cy], r:..} | {k:'DPAD', c:[cx,cy], r, dead} | {k:'START', rect:[x,y,w,h], rot}
   opts: { H: height in units (W is 1000), top: extra top padding (notch), bleed: true = body fills the whole canvas,
           shoulders: 'tabs' | 'face', pressed: {A:true,...} (for static renders), led: true }
   Works in browsers and in node (module.exports). */
(function (root) {
  'use strict';
  var f = function (n) { return Math.round(n * 100) / 100; };

  function rrect(x, y, w, h, r) { // r = [tl,tr,br,bl]
    var a = r[0], b = r[1], c = r[2], d = r[3];
    return 'M' + f(x + a) + ' ' + f(y) + 'H' + f(x + w - b) + 'Q' + f(x + w) + ' ' + f(y) + ' ' + f(x + w) + ' ' + f(y + b) +
      'V' + f(y + h - c) + 'Q' + f(x + w) + ' ' + f(y + h) + ' ' + f(x + w - c) + ' ' + f(y + h) +
      'H' + f(x + d) + 'Q' + f(x) + ' ' + f(y + h) + ' ' + f(x) + ' ' + f(y + h - d) +
      'V' + f(y + a) + 'Q' + f(x) + ' ' + f(y) + ' ' + f(x + a) + ' ' + f(y) + 'Z';
  }
  // smoother superellipse-ish corners using cubic beziers (k ~ 0.55 is a circle; larger = squircle)
  function srect(x, y, w, h, r, k) {
    k = k || 0.62;
    var a = r[0], b = r[1], c = r[2], d = r[3], s = '';
    s += 'M' + f(x + a) + ' ' + f(y) + 'H' + f(x + w - b);
    s += 'C' + f(x + w - b + b * k) + ' ' + f(y) + ' ' + f(x + w) + ' ' + f(y + b - b * k) + ' ' + f(x + w) + ' ' + f(y + b);
    s += 'V' + f(y + h - c);
    s += 'C' + f(x + w) + ' ' + f(y + h - c + c * k) + ' ' + f(x + w - c + c * k) + ' ' + f(y + h) + ' ' + f(x + w - c) + ' ' + f(y + h);
    s += 'H' + f(x + d);
    s += 'C' + f(x + d - d * k) + ' ' + f(y + h) + ' ' + f(x) + ' ' + f(y + h - d + d * k) + ' ' + f(x) + ' ' + f(y + h - d);
    s += 'V' + f(y + a);
    s += 'C' + f(x) + ' ' + f(y + a - a * k) + ' ' + f(x + a - a * k) + ' ' + f(y) + ' ' + f(x + a) + ' ' + f(y) + 'Z';
    return s;
  }
  function cross(cx, cy, len, arm, r) { // plus shape, arm = arm width, len = full length
    var h = len / 2, a = arm / 2;
    return 'M' + f(cx - a + r) + ' ' + f(cy - h) + 'H' + f(cx + a - r) + 'Q' + f(cx + a) + ' ' + f(cy - h) + ' ' + f(cx + a) + ' ' + f(cy - h + r) +
      'V' + f(cy - a) + 'H' + f(cx + h - r) + 'Q' + f(cx + h) + ' ' + f(cy - a) + ' ' + f(cx + h) + ' ' + f(cy - a + r) +
      'V' + f(cy + a - r) + 'Q' + f(cx + h) + ' ' + f(cy + a) + ' ' + f(cx + h - r) + ' ' + f(cy + a) +
      'H' + f(cx + a) + 'V' + f(cy + h - r) + 'Q' + f(cx + a) + ' ' + f(cy + h) + ' ' + f(cx + a - r) + ' ' + f(cy + h) +
      'H' + f(cx - a + r) + 'Q' + f(cx - a) + ' ' + f(cy + h) + ' ' + f(cx - a) + ' ' + f(cy + h - r) +
      'V' + f(cy + a) + 'H' + f(cx - h + r) + 'Q' + f(cx - h) + ' ' + f(cy + a) + ' ' + f(cx - h) + ' ' + f(cy + a - r) +
      'V' + f(cy - a + r) + 'Q' + f(cx - h) + ' ' + f(cy - a) + ' ' + f(cx - h + r) + ' ' + f(cy - a) +
      'H' + f(cx - a) + 'V' + f(cy - h + r) + 'Q' + f(cx - a) + ' ' + f(cy - h) + ' ' + f(cx - a + r) + ' ' + f(cy - h) + 'Z';
  }
  function svgWrap(W, H, inner, extra) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="100%" preserveAspectRatio="none" ' + (extra || '') + '>' + inner + '</svg>';
  }
  // pseudo-random but deterministic
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  /* ------------------------------------------------------------------ green translucent shell */
  function green(o) {
    o = o || {};
    var W = 1000, H = o.H || 1720, top = o.top || 0, bleed = !!o.bleed, pressed = o.pressed || {};
    var shoulders = o.shoulders || (bleed ? 'face' : 'tabs');
    var P = 'g' + (o.idp || ''); // id prefix (several shells on a page)
    // ---- layout
    var bx = bleed ? 0 : 22, by = bleed ? 0 : 62, bw = W - 2 * bx, bh = H - by - (bleed ? 0 : 22);
    var rad = bleed ? [0, 0, 0, 0] : [70, 70, 230, 110];
    var bodyD = srect(bx, by, bw, bh, rad, 0.6);
    var extra = Math.max(0, H - 1720 - top); // extra height beyond the base design (taller phone skins)
    var lensX = 64, lensW = W - 128, lensY = by + 64 + top + (bleed ? 26 : 0);
    var scrW = 696, scrH = 464, scrX = (W - scrW) / 2, scrY = lensY + 74;     // 3:2 window, exactly
    var lensH = scrH + 74 + 92;
    var lensD = srect(lensX, lensY, lensW, lensH, [34, 34, 128, 34], 0.6);
    var logoY = lensY + lensH + 78 + extra * 0.18;
    var ctrlY = logoY + 260 + extra * 0.30;       // D-pad centre line
    var dpC = [232, ctrlY], dpLen = 270, dpArm = 92;
    var aC = [812, ctrlY - 52], bC = [652, ctrlY + 34], abR = 62;
    var ssY = ctrlY + 228 + extra * 0.12;
    var selC = [404, ssY], staC = [596, ssY];
    var menuC = [500, ssY - 118];
    var spkC = [800, Math.min(H - 150, ssY + 170 + extra * 0.25)];
    var shL, shR;
    if (shoulders === 'tabs') { shL = { x: 52, y: 14, w: 250, h: 84 }; shR = { x: W - 52 - 250, y: 14, w: 250, h: 84 }; }
    else { var sy = ctrlY - 206; shL = { x: 70, y: sy, w: 200, h: 62 }; shR = { x: W - 70 - 200, y: sy, w: 200, h: 62 }; }
    var R = rng(7);

    var d = []; // body layer pieces
    // ---- defs
    d.push('<defs>' +
      '<clipPath id="' + P + 'body"><path d="' + bodyD + '"/></clipPath>' +
      '<linearGradient id="' + P + 'tint" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#8af0a0" stop-opacity=".50"/><stop offset=".35" stop-color="#3ccb63" stop-opacity=".46"/>' +
      '<stop offset=".75" stop-color="#22a64a" stop-opacity=".50"/><stop offset="1" stop-color="#127a33" stop-opacity=".60"/></linearGradient>' +
      '<linearGradient id="' + P + 'back" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f4a26"/><stop offset="1" stop-color="#0a3a1d"/></linearGradient>' +
      '<radialGradient id="' + P + 'glow" cx=".3" cy=".25" r=".9"><stop offset="0" stop-color="#d8ffe2" stop-opacity=".30"/><stop offset=".5" stop-color="#9df5b2" stop-opacity=".08"/><stop offset="1" stop-color="#9df5b2" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + P + 'sheen" x1="0" y1="0" x2="1" y2=".55"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".22" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="' + P + 'streak" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="' + P + 'lens" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4046"/><stop offset=".08" stop-color="#262b30"/><stop offset="1" stop-color="#1b1f23"/></linearGradient>' +
      '<linearGradient id="' + P + 'lensgl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".3" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="' + P + 'pcb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2c6b45"/><stop offset="1" stop-color="#1c5233"/></linearGradient>' +
      '<linearGradient id="' + P + 'ribbon" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b8741f"/><stop offset=".5" stop-color="#e3a540"/><stop offset="1" stop-color="#b8741f"/></linearGradient>' +
      '<radialGradient id="' + P + 'screw" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#f2f6f2"/><stop offset=".6" stop-color="#a9b6ad"/><stop offset="1" stop-color="#5d6a62"/></radialGradient>' +
      '<radialGradient id="' + P + 'spk" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#26332b"/><stop offset=".55" stop-color="#121a15"/><stop offset=".8" stop-color="#3b4a40"/><stop offset="1" stop-color="#1a241e"/></radialGradient>' +
      '<radialGradient id="' + P + 'well" cx=".5" cy=".5" r=".5"><stop offset=".72" stop-color="#063016" stop-opacity=".0"/><stop offset=".86" stop-color="#063016" stop-opacity=".45"/><stop offset=".97" stop-color="#c8ffd6" stop-opacity=".35"/><stop offset="1" stop-color="#c8ffd6" stop-opacity="0"/></radialGradient>' +
      '<filter id="' + P + 'soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.6"/></filter>' +
      '<filter id="' + P + 'blur8" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>' +
      '<filter id="' + P + 'shadow" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity=".45"/></filter>' +
      '</defs>');

    // ---- shoulder tabs (behind the body, protruding above the top edge)
    if (shoulders === 'tabs') {
      [shL, shR].forEach(function (s, i) {
        d.push('<path d="' + srect(s.x, s.y, s.w, s.h + 60, [i ? 26 : 60, i ? 60 : 26, 10, 10], 0.6) + '" fill="#1d8a41" fill-opacity=".85" stroke="#0b4f22" stroke-width="3"/>');
      });
    }
    // ---- body: back, internals, tint
    if (!bleed) d.push('<path d="' + bodyD + '" fill="#0b3a1d" filter="url(#' + P + 'shadow)"/>');
    d.push('<g clip-path="url(#' + P + 'body)">');
    d.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#' + P + 'back)"/>');
    // internals (seen through the plastic, softened)
    var I = [];
    // main PCB below the screen
    var pcbY = lensY + lensH - 40;
    I.push('<path d="' + srect(58, pcbY, W - 116, H - pcbY - (bleed ? 40 : 80), [40, 40, bleed ? 40 : 190, 70], 0.6) + '" fill="url(#' + P + 'pcb)" stroke="#5aa874" stroke-opacity=".5" stroke-width="3"/>');
    // LCD module frame behind the lens (wider than the lens, metal)
    I.push('<rect x="44" y="' + f(lensY - 26) + '" width="' + (W - 88) + '" height="' + f(lensH + 40) + '" rx="18" fill="#2a3a33" stroke="#7d9488" stroke-opacity=".6" stroke-width="4"/>');
    // copper traces
    var tr = '';
    for (var t = 0; t < 46; t++) {
      var x0 = 80 + R() * 840, y0 = pcbY + 30 + R() * (H - pcbY - 140), len = 60 + R() * 220, dir = R() < 0.5;
      var x1 = dir ? x0 + len : x0, y1 = dir ? y0 : y0 + len * 0.6, bend = R() * 40;
      tr += 'M' + f(x0) + ' ' + f(y0) + 'L' + f(x1) + ' ' + f(y1) + 'l' + f(bend) + ' ' + f(bend) + ' ';
    }
    I.push('<path d="' + tr + '" fill="none" stroke="#7fcf8c" stroke-opacity=".55" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>');
    // vias
    var vi = '';
    for (t = 0; t < 70; t++) { vi += '<circle cx="' + f(80 + R() * 840) + '" cy="' + f(pcbY + 30 + R() * (H - pcbY - 140)) + '" r="4.5"/>'; }
    I.push('<g fill="#d9c56a" fill-opacity=".7">' + vi + '</g>');
    // chips: CPU + RAM + regulator between the controls
    function chip(x, y, w, h, pins) {
      var s = '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + w + '" height="' + h + '" rx="4" fill="#111814" stroke="#3d4a42" stroke-width="2"/>';
      var p = '';
      for (var i = 0; i < pins; i++) {
        var px = x + 8 + i * (w - 16) / (pins - 1);
        p += 'M' + f(px) + ' ' + f(y - 7) + 'v7M' + f(px) + ' ' + f(y + h) + 'v7';
      }
      for (i = 0; i < Math.round(pins * h / w); i++) {
        var py = y + 8 + i * (h - 16) / Math.max(1, Math.round(pins * h / w) - 1);
        p += 'M' + f(x - 7) + ' ' + f(py) + 'h7M' + f(x + w) + ' ' + f(py) + 'h7';
      }
      return s + '<path d="' + p + '" stroke="#c9cfc9" stroke-opacity=".75" stroke-width="3"/>' +
        '<circle cx="' + f(x + 12) + '" cy="' + f(y + 12) + '" r="4" fill="#2b3a31"/>';
    }
    I.push(chip(392, ctrlY - 110, 150, 150, 14));
    I.push(chip(420, ctrlY + 84, 92, 54, 8));
    I.push(chip(110, ssY + 60, 120, 70, 9));
    // crystal + capacitors + resistors
    I.push('<rect x="575" y="' + f(ctrlY - 150) + '" width="70" height="26" rx="13" fill="#8d9a92" fill-opacity=".55"/>');
    var caps = '';
    for (t = 0; t < 14; t++) {
      var cx = 300 + R() * 420, cy = ctrlY - 170 + R() * 400;
      if (Math.abs(cx - dpC[0]) < 160 && Math.abs(cy - dpC[1]) < 160) continue;
      caps += '<rect x="' + f(cx) + '" y="' + f(cy) + '" width="22" height="11" rx="2" fill="' + (R() < 0.5 ? '#c19a5b' : '#2f2f2f') + '"/>';
    }
    I.push(caps);
    // electrolytic capacitor + battery contacts at the bottom
    I.push('<g opacity=".6"><circle cx="352" cy="' + f(ssY + 120) + '" r="24" fill="#1d2f45" stroke="#7d93a8" stroke-width="3"/><path d="M340 ' + f(ssY + 120) + 'h24" stroke="#7d93a8" stroke-width="3"/></g>');
    var bt = H - (bleed ? 120 : 150);
    I.push('<path d="M' + 110 + ' ' + f(bt) + 'h140M' + 120 + ' ' + f(bt + 18) + 'h120" stroke="#c7cfcb" stroke-opacity=".55" stroke-width="7" stroke-linecap="round"/>');
    // conductive rubber pads under buttons (seen as darker disks)
    I.push('<g fill="#0e2a1a" fill-opacity=".55"><circle cx="' + aC[0] + '" cy="' + aC[1] + '" r="58"/><circle cx="' + bC[0] + '" cy="' + bC[1] + '" r="58"/>' +
      '<path d="' + cross(dpC[0], dpC[1], 250, 84, 10) + '"/></g>');
    // ribbon cable from LCD to PCB (left side)
    I.push('<path d="M150 ' + f(lensY + lensH - 30) + 'h120l40 ' + f(logoY - lensY - lensH + 60) + 'h-120z" fill="url(#' + P + 'ribbon)" fill-opacity=".45"/>');
    var rl = ''; for (t = 0; t < 9; t++) rl += 'M' + (160 + t * 12) + ' ' + f(lensY + lensH - 26) + 'l40 ' + f(logoY - lensY - lensH + 56);
    I.push('<path d="' + rl + '" stroke="#7a4a12" stroke-opacity=".5" stroke-width="2"/>');
    // speaker magnet behind the grille
    I.push('<circle cx="' + spkC[0] + '" cy="' + spkC[1] + '" r="92" fill="url(#' + P + 'spk)"/><circle cx="' + spkC[0] + '" cy="' + spkC[1] + '" r="58" fill="none" stroke="#56685c" stroke-width="4" stroke-opacity=".7"/>');
    // screw bosses (seen through the front)
    var screws = [[96, lensY + lensH + 34], [W - 96, lensY + lensH + 34], [110, H - (bleed ? 70 : 110)], [W - 300, H - (bleed ? 60 : 92)], [500, ctrlY + 160], [W - 92, lensY - 34 < by + 20 ? by + 50 : lensY - 30]];
    screws.forEach(function (s) {
      I.push('<circle cx="' + f(s[0]) + '" cy="' + f(s[1]) + '" r="27" fill="#0c3a1c" fill-opacity=".6" stroke="#6fd08a" stroke-opacity=".5" stroke-width="3"/>' +
        '<circle cx="' + f(s[0]) + '" cy="' + f(s[1]) + '" r="16" fill="url(#' + P + 'screw)"/>' +
        '<path d="M' + f(s[0] - 9) + ' ' + f(s[1]) + 'h18M' + f(s[0]) + ' ' + f(s[1] - 9) + 'v18" stroke="#3f4a44" stroke-width="4" stroke-linecap="round"/>');
    });
    // molded inner ribs
    I.push('<path d="M60 ' + f(pcbY - 18) + 'H' + (W - 60) + '" stroke="#9ff0b4" stroke-opacity=".25" stroke-width="6"/>');
    d.push('<g filter="url(#' + P + 'soft)">' + I.join('') + '</g>');
    // the green plastic itself
    d.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#' + P + 'tint)"/>');
    d.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#' + P + 'glow)"/>');
    // thicker plastic near the edges reads darker + greener
    d.push('<path d="' + bodyD + '" fill="none" stroke="#0a5a25" stroke-opacity=".55" stroke-width="' + (bleed ? 90 : 70) + '" filter="url(#' + P + 'blur8)"/>');
    d.push('</g>');
    // rims: dark outer edge + light refracted inner edge
    if (!bleed) {
      d.push('<path d="' + bodyD + '" fill="none" stroke="#063d18" stroke-width="5"/>');
      d.push('<path d="' + srect(bx + 9, by + 9, bw - 18, bh - 18, [62, 62, 222, 102], 0.6) + '" fill="none" stroke="#d6ffe0" stroke-opacity=".38" stroke-width="3"/>');
    }
    // parting line / top groove with power switch slot
    d.push('<path d="M' + (bx + 70) + ' ' + f(by + 30 + (bleed ? top : 0)) + 'H' + (W - bx - 70) + '" stroke="#0a4a1f" stroke-opacity=".5" stroke-width="3"/>');
    if (!bleed) {
      d.push('<rect x="440" y="' + f(by - 7) + '" width="120" height="20" rx="8" fill="#0b3f1c" stroke="#0a3317" stroke-width="2"/><rect x="510" y="' + f(by - 4) + '" width="42" height="14" rx="5" fill="#9aa59f"/>');
      d.push('<text x="500" y="' + f(by + 36) + '" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="15" fill="#0b4a1f" fill-opacity=".75" text-anchor="middle" letter-spacing="3">OFF \u00B7 ON</text>');
    }

    // lens / bezel (sits in a shallow recess)
    d.push('<path d="' + srect(lensX - 8, lensY - 6, lensW + 16, lensH + 18, [40, 40, 136, 40], 0.6) + '" fill="#04260f" fill-opacity=".35" filter="url(#' + P + 'soft)"/>');
    d.push('<path d="' + lensD + '" fill="url(#' + P + 'lens)" stroke="#0e1113" stroke-width="3"/>');
    d.push('<path d="' + srect(lensX + 6, lensY + 6, lensW - 12, lensH - 12, [30, 30, 122, 30], 0.6) + '" fill="none" stroke="#5b636a" stroke-opacity=".55" stroke-width="2"/>');
    // printed header on the lens
    var hy = lensY + 40;
    d.push('<path d="M' + (scrX) + ' ' + f(hy - 9) + 'H' + (scrX + 150) + 'M' + (scrX) + ' ' + f(hy - 1) + 'H' + (scrX + 150) + '" stroke="#e0407a" stroke-width="4"/>' +
      '<path d="M' + (scrX + scrW - 150) + ' ' + f(hy - 9) + 'H' + (scrX + scrW) + 'M' + (scrX + scrW - 150) + ' ' + f(hy - 1) + 'H' + (scrX + scrW) + '" stroke="#38c8f0" stroke-width="4"/>');
    d.push('<text x="500" y="' + f(hy + 2) + '" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="25" fill="#cfd6db" text-anchor="middle" letter-spacing="3.5">BULLET STORM RAIDEN</text>');
    // screen window (game canvas sits exactly here)
    d.push('<rect x="' + (scrX - 6) + '" y="' + (scrY - 6) + '" width="' + (scrW + 12) + '" height="' + (scrH + 12) + '" rx="5" fill="#0b0d0e"/>');
    d.push('<rect x="' + scrX + '" y="' + scrY + '" width="' + scrW + '" height="' + scrH + '" fill="#000"/>');
    // power LED + label (LED glow lives in the buttons layer so it can switch on)
    d.push('<circle cx="' + f((lensX + scrX) / 2 - 2) + '" cy="' + f(scrY + 150) + '" r="12" fill="#3a1414" stroke="#0c0d0e" stroke-width="2"/>');
    d.push('<text x="' + f((lensX + scrX) / 2 - 2) + '" y="' + f(scrY + 190) + '" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="15" fill="#9aa3a9" text-anchor="middle" letter-spacing="1">POWER</text>');
    // lens gloss (only outside the screen window)
    d.push('<path d="' + lensD + '" fill="url(#' + P + 'lensgl)" pointer-events="none"/>');
    d.push('<text x="' + f(scrX + scrW) + '" y="' + f(scrY + scrH + 50) + '" font-family="Arial,Helvetica,sans-serif" font-style="italic" font-weight="700" font-size="18" fill="#7f888f" text-anchor="end" letter-spacing="2">240 \u00D7 160  \u00B7  3:2</text>');

    // logo printed on the plastic
    var cols = ['#e8304f', '#f08a1c', '#f2c81b', '#2fb4e8', '#7a4ee0', '#ffffff', '#e8304f', '#2fb4e8', '#f2c81b'];
    var word = 'DREAM WAR', adv = [48, 48, 46, 50, 62, 26, 66, 50, 48], tot = 0, lt = '';
    for (var i = 0; i < word.length; i++) tot += adv[i];
    var lx = 500 - tot / 2 + 10;
    for (i = 0; i < word.length; i++) {
      if (word[i] !== ' ') lt += '<text x="' + f(lx) + '" y="0" fill="' + cols[i] + '">' + word[i] + '</text>';
      lx += adv[i];
    }
    d.push('<g transform="translate(0 ' + f(logoY + 6) + ') skewX(-12)" font-family="Arial Black,Arial,Helvetica,sans-serif" font-weight="900" font-size="60" stroke="#0b2e6b" stroke-width="3.5" paint-order="stroke">' + lt + '</g>');
    d.push('<text x="500" y="' + f(logoY + 40) + '" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="15" fill="#0b2e6b" fill-opacity=".75" text-anchor="middle" letter-spacing="6">GAME OFF 2026 EDITION</text>');

    // molded wells around the controls
    d.push('<circle cx="' + dpC[0] + '" cy="' + dpC[1] + '" r="170" fill="url(#' + P + 'well)"/>');
    d.push('<g transform="rotate(-28 ' + f((aC[0] + bC[0]) / 2) + ' ' + f((aC[1] + bC[1]) / 2) + ')"><rect x="' + f((aC[0] + bC[0]) / 2 - 190) + '" y="' + f((aC[1] + bC[1]) / 2 - 86) + '" width="380" height="172" rx="86" fill="#063016" fill-opacity=".22" stroke="#c8ffd6" stroke-opacity=".28" stroke-width="3"/></g>');
    // labels
    var lab = 'font-family="Arial,Helvetica,sans-serif" font-weight="700" fill="#0a3f1b" fill-opacity=".85" text-anchor="middle"';
    d.push('<text x="' + aC[0] + '" y="' + f(aC[1] + abR + 44) + '" ' + lab + ' font-size="32">A</text>');
    d.push('<text x="' + bC[0] + '" y="' + f(bC[1] + abR + 44) + '" ' + lab + ' font-size="32">B</text>');
    d.push('<text x="' + selC[0] + '" y="' + f(selC[1] + 58) + '" ' + lab + ' font-size="20" letter-spacing="2" transform="rotate(-25 ' + selC[0] + ' ' + selC[1] + ')">SELECT</text>');
    d.push('<text x="' + staC[0] + '" y="' + f(staC[1] + 58) + '" ' + lab + ' font-size="20" letter-spacing="2" transform="rotate(-25 ' + staC[0] + ' ' + staC[1] + ')">START</text>');
    d.push('<text x="' + menuC[0] + '" y="' + f(menuC[1] + 46) + '" ' + lab + ' font-size="15" letter-spacing="2">MENU</text>');
    // pill wells for start/select
    [selC, staC].forEach(function (c) {
      d.push('<g transform="rotate(-25 ' + c[0] + ' ' + c[1] + ')"><rect x="' + (c[0] - 62) + '" y="' + (c[1] - 22) + '" width="124" height="44" rx="22" fill="#063016" fill-opacity=".35" stroke="#c8ffd6" stroke-opacity=".3" stroke-width="2"/></g>');
    });
    d.push('<circle cx="' + menuC[0] + '" cy="' + menuC[1] + '" r="26" fill="#063016" fill-opacity=".35" stroke="#c8ffd6" stroke-opacity=".3" stroke-width="2"/>');
    // speaker grille: slanted rows of holes
    var holes = '';
    for (var row = 0; row < 6; row++) {
      for (var c = 0; c < 5; c++) {
        var hx = spkC[0] - 100 + c * 42 + row * 10, hy2 = spkC[1] - 92 + row * 34 + c * -2;
        holes += '<rect x="' + f(hx) + '" y="' + f(hy2) + '" width="30" height="14" rx="7" transform="rotate(-28 ' + f(hx + 15) + ' ' + f(hy2 + 7) + ')"/>';
      }
    }
    d.push('<g fill="#041a0b" fill-opacity=".8" stroke="#bfffd0" stroke-opacity=".35" stroke-width="1.5">' + holes + '</g>');
    if (shoulders === 'face') {
      [shL, shR].forEach(function (s) {
        d.push('<rect x="' + (s.x - 8) + '" y="' + (s.y - 8) + '" width="' + (s.w + 16) + '" height="' + (s.h + 16) + '" rx="' + (s.h / 2 + 8) + '" fill="#063016" fill-opacity=".3" stroke="#c8ffd6" stroke-opacity=".3" stroke-width="2"/>');
      });
    }
    // gloss: big sheen, diagonal streaks, top edge specular
    d.push('<g clip-path="url(#' + P + 'body)" pointer-events="none">');
    d.push('<path d="M' + bx + ' ' + by + 'H' + f(bx + bw * 0.62) + 'C' + f(bx + bw * 0.45) + ' ' + f(by + bh * 0.12) + ' ' + f(bx + bw * 0.2) + ' ' + f(by + bh * 0.3) + ' ' + bx + ' ' + f(by + bh * 0.42) + 'Z" fill="url(#' + P + 'sheen)" opacity=".55"/>');
    d.push('<path d="M' + f(W * 0.70) + ' ' + f(logoY + 30) + 'l90 -40l-380 ' + f(H * 0.5) + 'l-90 40z" fill="url(#' + P + 'streak)" opacity=".7"/>');
    d.push('<path d="M' + f(W * 0.86) + ' ' + f(logoY + 60) + 'l26 -12l-380 ' + f(H * 0.5) + 'l-26 12z" fill="url(#' + P + 'streak)" opacity=".6"/>');
    if (!bleed) d.push('<path d="M' + (bx + 60) + ' ' + (by + 4) + 'H' + (W - bx - 80) + '" stroke="#fff" stroke-opacity=".7" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M' + (bx + 4) + ' ' + (by + 70) + 'V' + f(by + bh * 0.55) + '" stroke="#fff" stroke-opacity=".45" stroke-width="4" stroke-linecap="round"/>');
    if (!bleed) d.push('<path d="M' + f(bx + 120) + ' ' + f(by + bh - 7) + 'H' + f(bx + bw - 240) + 'Q' + f(bx + bw - 30) + ' ' + f(by + bh - 20) + ' ' + f(bx + bw - 8) + ' ' + f(by + bh - 230) + '" fill="none" stroke="#caffd7" stroke-opacity=".45" stroke-width="5" stroke-linecap="round" filter="url(#' + P + 'soft)"/>');
    d.push('</g>');

    // ------------------------------------------------ buttons layer
    var b = [];
    b.push('<defs>' +
      '<linearGradient id="' + P + 'dp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a4f54"/><stop offset=".5" stop-color="#2a2e32"/><stop offset="1" stop-color="#16191b"/></linearGradient>' +
      '<radialGradient id="' + P + 'ab" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#7fe39b"/><stop offset=".45" stop-color="#1f8a42"/><stop offset="1" stop-color="#0a4a20"/></radialGradient>' +
      '<radialGradient id="' + P + 'abP" cx=".5" cy=".55" r=".75"><stop offset="0" stop-color="#3aa85a"/><stop offset=".6" stop-color="#11602c"/><stop offset="1" stop-color="#073a18"/></radialGradient>' +
      '<linearGradient id="' + P + 'pill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8e9893"/><stop offset="1" stop-color="#4c5450"/></linearGradient>' +
      '<linearGradient id="' + P + 'sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fdc80"/><stop offset="1" stop-color="#17803a"/></linearGradient>' +
      '<radialGradient id="' + P + 'ledg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe6d0"/><stop offset=".35" stop-color="#ff3b2e"/><stop offset="1" stop-color="#ff3b2e" stop-opacity="0"/></radialGradient>' +
      '<filter id="' + P + 'bsh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="7" stdDeviation="5" flood-color="#021a09" flood-opacity=".55"/></filter>' +
      '</defs>');
    b.push('<style>.bk{transition:transform 40ms}.bk.on{transform:translate(0,5px)}.bk .p{opacity:0}.bk.on .p{opacity:1}.bk.on .u{opacity:0}#' + P + 'led{opacity:0;transition:opacity .3s}#' + P + 'led.on{opacity:1}' +
      '.dpa{opacity:0}.dpa.on{opacity:1}</style>');
    var on = function (k) { return pressed[k] ? ' on' : ''; };
    // LED
    b.push('<circle id="' + P + 'led" class="' + (o.led ? 'on' : '') + '" cx="' + f((lensX + scrX) / 2 - 2) + '" cy="' + f(scrY + 150) + '" r="26" fill="url(#' + P + 'ledg)"/>');
    // shoulders
    [['L', shL], ['R', shR]].forEach(function (e) {
      var k = e[0], s = e[1];
      if (shoulders === 'tabs') {
        b.push('<g id="bsr-k-' + k + '" class="bk' + on(k) + '">' +
          '<path d="' + srect(s.x, s.y, s.w, s.h, [k === 'L' ? 60 : 24, k === 'L' ? 24 : 60, 12, 12], 0.6) + '" fill="url(#' + P + 'sh)" fill-opacity=".92" stroke="#0a4a1f" stroke-width="3"/>' +
          '<path class="p" d="' + srect(s.x, s.y, s.w, s.h, [k === 'L' ? 60 : 24, k === 'L' ? 24 : 60, 12, 12], 0.6) + '" fill="#032a10" fill-opacity=".35"/>' +
          '<path d="M' + (s.x + 40) + ' ' + (s.y + 10) + 'H' + (s.x + s.w - 40) + '" stroke="#e9fff0" stroke-opacity=".7" stroke-width="5" stroke-linecap="round"/>' +
          '<text x="' + (s.x + s.w / 2) + '" y="' + (s.y + 58) + '" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="34" fill="#073a17" fill-opacity=".8" text-anchor="middle">' + k + '</text></g>');
      } else {
        b.push('<g id="bsr-k-' + k + '" class="bk' + on(k) + '" filter="url(#' + P + 'bsh)">' +
          '<rect x="' + s.x + '" y="' + s.y + '" width="' + s.w + '" height="' + s.h + '" rx="' + s.h / 2 + '" fill="url(#' + P + 'pill)"/>' +
          '<rect class="p" x="' + s.x + '" y="' + s.y + '" width="' + s.w + '" height="' + s.h + '" rx="' + s.h / 2 + '" fill="#000" fill-opacity=".3"/>' +
          '<path d="M' + (s.x + 30) + ' ' + (s.y + 12) + 'H' + (s.x + s.w - 30) + '" stroke="#fff" stroke-opacity=".45" stroke-width="5" stroke-linecap="round"/>' +
          '<text x="' + (s.x + s.w / 2) + '" y="' + (s.y + s.h / 2 + 12) + '" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="32" fill="#1f2422" text-anchor="middle">' + k + '</text></g>');
      }
    });
    // D-pad
    var dx = dpC[0], dy = dpC[1];
    b.push('<g id="bsr-k-DPAD" filter="url(#' + P + 'bsh)">' +
      '<path d="' + cross(dx, dy, dpLen, dpArm, 12) + '" fill="url(#' + P + 'dp)" stroke="#0b0d0e" stroke-width="3"/>' +
      '<path d="' + cross(dx, dy - 3, dpLen - 14, dpArm - 14, 9) + '" fill="none" stroke="#6b737a" stroke-opacity=".6" stroke-width="3"/>' +
      '<circle cx="' + dx + '" cy="' + dy + '" r="26" fill="#1c1f22" stroke="#45494d" stroke-width="2"/>' +
      '<g fill="#14171a" stroke="#5a6066" stroke-opacity=".5" stroke-width="1.5">' +
      '<path d="M' + dx + ' ' + (dy - 118) + 'l-17 26h34z"/><path d="M' + dx + ' ' + (dy + 118) + 'l-17 -26h34z"/>' +
      '<path d="M' + (dx - 118) + ' ' + dy + 'l26 -17v34z"/><path d="M' + (dx + 118) + ' ' + dy + 'l-26 -17v34z"/></g>' +
      // pressed shading per arm
      '<path id="bsr-k-UP" class="dpa' + on('UP') + '" d="M' + (dx - dpArm / 2) + ' ' + (dy - dpLen / 2 + 8) + 'h' + dpArm + 'v' + (dpLen / 2 - 50) + 'h-' + dpArm + 'z" fill="#000" fill-opacity=".38"/>' +
      '<path id="bsr-k-DOWN" class="dpa' + on('DOWN') + '" d="M' + (dx - dpArm / 2) + ' ' + (dy + 42) + 'h' + dpArm + 'v' + (dpLen / 2 - 50) + 'h-' + dpArm + 'z" fill="#000" fill-opacity=".38"/>' +
      '<path id="bsr-k-LEFT" class="dpa' + on('LEFT') + '" d="M' + (dx - dpLen / 2 + 8) + ' ' + (dy - dpArm / 2) + 'h' + (dpLen / 2 - 50) + 'v' + dpArm + 'h-' + (dpLen / 2 - 50) + 'z" fill="#000" fill-opacity=".38"/>' +
      '<path id="bsr-k-RIGHT" class="dpa' + on('RIGHT') + '" d="M' + (dx + 42) + ' ' + (dy - dpArm / 2) + 'h' + (dpLen / 2 - 50) + 'v' + dpArm + 'h-' + (dpLen / 2 - 50) + 'z" fill="#000" fill-opacity=".38"/>' +
      '<path d="M' + (dx - dpArm / 2 + 10) + ' ' + (dy - dpLen / 2 + 8) + 'h' + (dpArm - 20) + '" stroke="#fff" stroke-opacity=".35" stroke-width="4" stroke-linecap="round"/>' +
      '</g>');
    // A / B
    [['A', aC], ['B', bC]].forEach(function (e) {
      var k = e[0], c = e[1];
      b.push('<g id="bsr-k-' + k + '" class="bk' + on(k) + '" filter="url(#' + P + 'bsh)">' +
        '<circle class="u" cx="' + c[0] + '" cy="' + c[1] + '" r="' + abR + '" fill="url(#' + P + 'ab)" fill-opacity=".95" stroke="#063a17" stroke-width="3"/>' +
        '<circle class="p" cx="' + c[0] + '" cy="' + c[1] + '" r="' + abR + '" fill="url(#' + P + 'abP)" stroke="#063a17" stroke-width="3"/>' +
        '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + (abR - 10) + '" fill="none" stroke="#c9ffd8" stroke-opacity=".25" stroke-width="2"/>' +
        '<ellipse cx="' + (c[0] - 18) + '" cy="' + (c[1] - 24) + '" rx="26" ry="14" transform="rotate(-30 ' + (c[0] - 18) + ' ' + (c[1] - 24) + ')" fill="#fff" fill-opacity=".55"/>' +
        '<circle cx="' + (c[0] + 22) + '" cy="' + (c[1] + 26) + '" r="6" fill="#fff" fill-opacity=".18"/></g>');
    });
    // Select / Start
    [['SELECT', selC], ['START', staC]].forEach(function (e) {
      var k = e[0], c = e[1];
      b.push('<g id="bsr-k-' + k + '" class="bk' + on(k) + '"><g transform="rotate(-25 ' + c[0] + ' ' + c[1] + ')" filter="url(#' + P + 'bsh)">' +
        '<rect x="' + (c[0] - 52) + '" y="' + (c[1] - 14) + '" width="104" height="28" rx="14" fill="url(#' + P + 'pill)" stroke="#2a2f2c" stroke-width="2"/>' +
        '<rect class="p" x="' + (c[0] - 52) + '" y="' + (c[1] - 14) + '" width="104" height="28" rx="14" fill="#000" fill-opacity=".35"/>' +
        '<path d="M' + (c[0] - 38) + ' ' + (c[1] - 7) + 'h76" stroke="#fff" stroke-opacity=".4" stroke-width="3" stroke-linecap="round"/></g></g>');
    });
    // Menu
    b.push('<g id="bsr-k-MENU" class="bk' + on('MENU') + '" filter="url(#' + P + 'bsh)"><circle cx="' + menuC[0] + '" cy="' + menuC[1] + '" r="17" fill="url(#' + P + 'pill)" stroke="#2a2f2c" stroke-width="2"/>' +
      '<circle class="p" cx="' + menuC[0] + '" cy="' + menuC[1] + '" r="17" fill="#000" fill-opacity=".35"/>' +
      '<path d="M' + (menuC[0] - 8) + ' ' + (menuC[1] - 5) + 'h16M' + (menuC[0] - 8) + ' ' + menuC[1] + 'h16M' + (menuC[0] - 8) + ' ' + (menuC[1] + 5) + 'h16" stroke="#2a2f2c" stroke-width="2.4" stroke-linecap="round"/></g>');

    var zones = [
      { k: 'DPAD', c: dpC, r: 200, dead: 22, arm: dpArm },
      { k: 'A', c: aC, r: 86 }, { k: 'B', c: bC, r: 86 },
      { k: 'AB', c: [(aC[0] + bC[0]) / 2, (aC[1] + bC[1]) / 2], r: 30 },
      { k: 'SELECT', c: selC, r: 64 }, { k: 'START', c: staC, r: 64 },
      { k: 'MENU', c: menuC, r: 42 },
      { k: 'L', rect: [shL.x - 20, shoulders === 'tabs' ? 0 : shL.y - 24, shL.w + 40, shoulders === 'tabs' ? shL.h + 70 : shL.h + 48] },
      { k: 'R', rect: [shR.x - 20, shoulders === 'tabs' ? 0 : shR.y - 24, shR.w + 40, shoulders === 'tabs' ? shR.h + 70 : shR.h + 48] }
    ];
    var res = {
      W: W, H: H, screen: { x: scrX, y: scrY, w: scrW, h: scrH }, zones: zones, ledId: P + 'led',
      bodyInner: d.join(''), buttonsInner: b.join(''),
      meta: { dpad: { c: dpC, len: dpLen }, a: aC, b: bC, abR: abR, select: selC, start: staC, menu: menuC, L: shL, R: shR }
    };
    res.body = svgWrap(W, H, res.bodyInner, 'class="bsr-shell-body" aria-hidden="true"');
    res.buttons = svgWrap(W, H, res.buttonsInner, 'class="bsr-shell-buttons" aria-hidden="true"');
    res.full = function (screenFill) {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' + res.bodyInner +
        (screenFill ? '<rect x="' + scrX + '" y="' + scrY + '" width="' + scrW + '" height="' + scrH + '" fill="' + screenFill + '"/>' : '') + res.buttonsInner + '</svg>';
    };
    return res;
  }

  /* ------------------------------------------------------------------ classic dark pad */
  function classic(o) {
    o = o || {};
    var W = 1000, H = o.H || 1560, pressed = o.pressed || {}, P = 'c' + (o.idp || '');
    var scrW = 880, scrH = 880 * 2 / 3, scrX = 60, scrY = 120;
    var cy = scrY + scrH + 330, dpC = [250, cy], aC = [800, cy - 60], bC = [640, cy + 40], abR = 70;
    var ssY = cy + 250, selC = [400, ssY], staC = [600, ssY], menuC = [500, ssY - 120];
    var shL = { x: 40, y: scrY + scrH + 50, w: 260, h: 70 }, shR = { x: W - 300, y: scrY + scrH + 50, w: 260, h: 70 };
    var d = [];
    d.push('<defs><linearGradient id="' + P + 'bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2033"/><stop offset="1" stop-color="#11131f"/></linearGradient></defs>');
    d.push('<rect x="10" y="10" width="' + (W - 20) + '" height="' + (H - 20) + '" rx="70" fill="url(#' + P + 'bg)" stroke="#2f3452" stroke-width="4"/>');
    d.push('<text x="500" y="84" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="34" fill="#7fd3ff" text-anchor="middle" letter-spacing="5">BULLET STORM RAIDEN</text>');
    d.push('<rect x="' + (scrX - 10) + '" y="' + (scrY - 10) + '" width="' + (scrW + 20) + '" height="' + (scrH + 20) + '" rx="14" fill="#05060a" stroke="#3a4066" stroke-width="3"/>');
    d.push('<rect x="' + scrX + '" y="' + scrY + '" width="' + scrW + '" height="' + scrH + '" fill="#000"/>');
    var lab = 'font-family="Arial,Helvetica,sans-serif" font-weight="700" fill="#8890b8" text-anchor="middle"';
    d.push('<text x="' + selC[0] + '" y="' + (ssY + 60) + '" ' + lab + ' font-size="22" letter-spacing="2">SELECT</text><text x="' + staC[0] + '" y="' + (ssY + 60) + '" ' + lab + ' font-size="22" letter-spacing="2">START</text>');
    d.push('<text x="' + menuC[0] + '" y="' + (menuC[1] + 50) + '" ' + lab + ' font-size="16" letter-spacing="2">MENU</text>');
    d.push('<text x="500" y="' + (H - 50) + '" ' + lab + ' font-size="24" font-style="italic" letter-spacing="4">DREAM WAR</text>');
    var on = function (k) { return pressed[k] ? ' on' : ''; };
    var b = ['<style>.bk.on{filter:brightness(1.6)}.dpa{opacity:0}.dpa.on{opacity:1}</style>'];
    [['L', shL], ['R', shR]].forEach(function (e) {
      var s = e[1];
      b.push('<g id="bsr-k-' + e[0] + '" class="bk' + on(e[0]) + '"><rect x="' + s.x + '" y="' + s.y + '" width="' + s.w + '" height="' + s.h + '" rx="35" fill="#2d3250" stroke="#4a5280" stroke-width="3"/>' +
        '<text x="' + (s.x + s.w / 2) + '" y="' + (s.y + 47) + '" ' + lab + ' font-size="32" fill="#c8ceff">' + e[0] + '</text></g>');
    });
    b.push('<g id="bsr-k-DPAD"><path d="' + cross(dpC[0], dpC[1], 300, 100, 14) + '" fill="#2d3250" stroke="#4a5280" stroke-width="3"/>' +
      '<path id="bsr-k-UP" class="dpa' + on('UP') + '" d="M' + (dpC[0] - 50) + ' ' + (dpC[1] - 150) + 'h100v100h-100z" fill="#7fd3ff" fill-opacity=".35"/>' +
      '<path id="bsr-k-DOWN" class="dpa' + on('DOWN') + '" d="M' + (dpC[0] - 50) + ' ' + (dpC[1] + 50) + 'h100v100h-100z" fill="#7fd3ff" fill-opacity=".35"/>' +
      '<path id="bsr-k-LEFT" class="dpa' + on('LEFT') + '" d="M' + (dpC[0] - 150) + ' ' + (dpC[1] - 50) + 'h100v100h-100z" fill="#7fd3ff" fill-opacity=".35"/>' +
      '<path id="bsr-k-RIGHT" class="dpa' + on('RIGHT') + '" d="M' + (dpC[0] + 50) + ' ' + (dpC[1] - 50) + 'h100v100h-100z" fill="#7fd3ff" fill-opacity=".35"/></g>');
    [['A', aC, '#e8304f'], ['B', bC, '#f2c81b']].forEach(function (e) {
      b.push('<g id="bsr-k-' + e[0] + '" class="bk' + on(e[0]) + '"><circle cx="' + e[1][0] + '" cy="' + e[1][1] + '" r="' + abR + '" fill="#2d3250" stroke="' + e[2] + '" stroke-width="5"/>' +
        '<text x="' + e[1][0] + '" y="' + (e[1][1] + 14) + '" ' + lab + ' font-size="40" fill="' + e[2] + '">' + e[0] + '</text></g>');
    });
    [['SELECT', selC], ['START', staC]].forEach(function (e) {
      b.push('<g id="bsr-k-' + e[0] + '" class="bk' + on(e[0]) + '"><rect x="' + (e[1][0] - 60) + '" y="' + (e[1][1] - 18) + '" width="120" height="36" rx="18" fill="#2d3250" stroke="#4a5280" stroke-width="3"/></g>');
    });
    b.push('<g id="bsr-k-MENU" class="bk' + on('MENU') + '"><circle cx="' + menuC[0] + '" cy="' + menuC[1] + '" r="22" fill="#2d3250" stroke="#4a5280" stroke-width="3"/></g>');
    var zones = [
      { k: 'DPAD', c: dpC, r: 210, dead: 24, arm: 100 }, { k: 'A', c: aC, r: 92 }, { k: 'B', c: bC, r: 92 },
      { k: 'AB', c: [(aC[0] + bC[0]) / 2, (aC[1] + bC[1]) / 2], r: 30 },
      { k: 'SELECT', c: selC, r: 70 }, { k: 'START', c: staC, r: 70 }, { k: 'MENU', c: menuC, r: 46 },
      { k: 'L', rect: [shL.x - 10, shL.y - 20, shL.w + 20, shL.h + 40] }, { k: 'R', rect: [shR.x - 10, shR.y - 20, shR.w + 20, shR.h + 40] }
    ];
    var res = { W: W, H: H, screen: { x: scrX, y: scrY, w: scrW, h: scrH }, zones: zones, bodyInner: d.join(''), buttonsInner: b.join('') };
    res.body = svgWrap(W, H, res.bodyInner, 'class="bsr-shell-body" aria-hidden="true"');
    res.buttons = svgWrap(W, H, res.buttonsInner, 'class="bsr-shell-buttons" aria-hidden="true"');
    res.full = function (fill) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' + res.bodyInner + (fill ? '<rect x="' + scrX + '" y="' + scrY + '" width="' + scrW + '" height="' + scrH + '" fill="' + fill + '"/>' : '') + res.buttonsInner + '</svg>'; };
    return res;
  }

  var API = { green: green, classic: classic };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.BSRShell = API;
})(typeof window !== 'undefined' ? window : this);
