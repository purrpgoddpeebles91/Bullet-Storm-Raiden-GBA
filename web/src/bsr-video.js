/* Bullet Storm Raiden - host-side video pipeline for the web player.
   Drivers (auto order): WebGPU -> WebGL2 -> WebGL 1 -> Canvas 2D.
   Upscalers: 'hq'  = AUTO HQ UPSCALE: edge-directed xBR-style corner interpolation (levels 1+2, written for this
                      project) over an anti-aliased nearest base, evaluated at output resolution in one pass.
              'sharp' = Sharp Bilinear (integer nearest prescale + bilinear), 'bilinear', 'nearest'.
   Output: the game is always rendered from the internal 240x160 frame. The chosen output resolution is the size
   of the render target; when it is larger than what the display shows, a second pass box-filters it down to the
   display size (real supersampling). Sizes are capped to the GPU / browser limits.
   Usage: var v = BSRVideo.create(hostElement); await v.init('auto'); v.frame(rgbaUint8Array240x160); v.setUpscaler('hq');
          v.setOutput('match'|'240'|...|'4800'); v.resize(cssW, cssH, dpr); v.info(); */
(function (root) {
  'use strict';
  var SW = 240, SH = 160;
  var RES = [
    ['match', 'Match display (auto)', 0], ['240', '240p (360\u00D7240)', 240], ['480', '480p (720\u00D7480)', 480],
    ['720', '720p (1080\u00D7720)', 720], ['1080', '1080p (1620\u00D71080)', 1080], ['1440', '1440p (2160\u00D71440)', 1440],
    ['2160', '4K 2160p (3240\u00D72160)', 2160], ['2880', '5K 2880p (4320\u00D72880)', 2880], ['4320', '8K 4320p (6480\u00D74320)', 4320],
    ['4800', '4800p (7200\u00D74800)', 4800]
  ];
  var UPS = [
    ['hq', 'AUTO HQ UPSCALE (MetalFX-style)'], ['sharp', 'Sharp Bilinear'], ['bilinear', 'Bilinear (soft)'], ['nearest', 'Nearest (pixel)']
  ];
  var DRV = [
    ['auto', 'Auto (best available)'], ['webgpu', 'WebGPU (Metal on Apple)'], ['webgl2', 'WebGL 2'], ['webgl', 'WebGL 1'], ['canvas', 'Canvas 2D (CPU)']
  ];
  var MODE = { nearest: 0, sharp: 1, bilinear: 2, hq: 3 };

  /* ---------------- shaders ---------------- */
  // GLSL ES 1.00 (works in WebGL 1 and WebGL 2 contexts)
  var GL_VS = 'attribute vec2 a; varying vec2 v; void main(){ v = vec2(a.x*0.5+0.5, 0.5-a.y*0.5); gl_Position = vec4(a,0.0,1.0); }';
  var GL_FS = [
    'precision highp float;',
    'uniform sampler2D T; uniform vec2 S; uniform vec2 O; uniform float M; varying vec2 v;',
    'vec3 px(vec2 p){ p = clamp(p, vec2(0.0), S - 1.0); return texture2D(T, (p + 0.5) / S).rgb; }',
    'float df(vec3 a, vec3 b){ vec3 d = a - b; float y = dot(d, vec3(0.299,0.587,0.114)); float u = dot(d, vec3(-0.169,-0.331,0.5)); float w = dot(d, vec3(0.5,-0.419,-0.081)); return 48.0*abs(y) + 7.0*abs(u) + 6.0*abs(w); }',
    'bool ne(vec3 a, vec3 b){ return df(a,b) > 0.15; }',
    'vec3 bil(vec2 t, float s){ vec2 tx = t - 0.5; vec2 i = floor(tx); vec2 f = clamp((tx - i - 0.5) * s + 0.5, 0.0, 1.0);',
    '  vec3 a = mix(px(i), px(i + vec2(1.0,0.0)), f.x); vec3 b = mix(px(i + vec2(0.0,1.0)), px(i + vec2(1.0,1.0)), f.x); return mix(a, b, f.y); }',
    // one corner of the xBR-style rule; lf = position inside E, corner at (1,1); returns rgb + alpha
    'vec4 corner(vec3 E, vec3 F, vec3 H, vec3 I, vec3 B, vec3 D, vec3 C, vec3 G, vec3 F4, vec3 H5, vec3 I4, vec3 I5, vec2 lf, float w){',
    '  float e = df(E,C) + df(E,G) + df(I,F4) + df(I,H5) + 4.0*df(H,F);',
    '  float i = df(H,D) + df(H,I5) + df(F,I4) + df(F,B) + 4.0*df(E,I);',
    '  if (!(e < i) || !ne(E,F) || !ne(E,H)) return vec4(E, 0.0);',
    '  vec3 c = (df(E,F) <= df(E,H)) ? F : H;',
    '  float a = smoothstep(-w, w, (lf.x + lf.y - 1.5) * 0.70710678);',
    '  float ke = df(F,G), ki = df(H,C);',
    '  if (2.0*ke <= ki && ne(E,G) && ne(D,G)) a = max(a, smoothstep(-w, w, (0.5*lf.x + lf.y - 1.0) * 0.89442719));',
    '  if (ke >= 2.0*ki && ne(E,C) && ne(B,C)) a = max(a, smoothstep(-w, w, (lf.x + 0.5*lf.y - 1.0) * 0.89442719));',
    '  return vec4(c, a); }',
    'void main(){',
    '  vec2 t = v * S; float sc = max(O.x / S.x, 0.001);',
    '  vec3 col;',
    '  if (M < 0.5) { col = px(floor(t)); }',
    '  else if (M < 1.5) { col = bil(t, max(floor(sc), 1.0)); }',
    '  else if (M < 2.5) { col = bil(t, 1.0); }',
    '  else {',
    '    vec2 i0 = floor(t); vec2 fp = t - i0; float w = 0.5 / sc;',
    '    col = bil(t, sc);',
    '    vec3 E = px(i0);',
    '    vec3 B = px(i0+vec2(0.,-1.)), D = px(i0+vec2(-1.,0.)), F = px(i0+vec2(1.,0.)), H = px(i0+vec2(0.,1.));',
    '    vec3 A = px(i0+vec2(-1.,-1.)), C = px(i0+vec2(1.,-1.)), G = px(i0+vec2(-1.,1.)), I = px(i0+vec2(1.,1.));',
    '    vec3 B1 = px(i0+vec2(0.,-2.)), A1 = px(i0+vec2(-1.,-2.)), C1 = px(i0+vec2(1.,-2.));',
    '    vec3 H5 = px(i0+vec2(0.,2.)), G5 = px(i0+vec2(-1.,2.)), I5 = px(i0+vec2(1.,2.));',
    '    vec3 D0 = px(i0+vec2(-2.,0.)), A0 = px(i0+vec2(-2.,-1.)), G0 = px(i0+vec2(-2.,1.));',
    '    vec3 F4 = px(i0+vec2(2.,0.)), C4 = px(i0+vec2(2.,-1.)), I4 = px(i0+vec2(2.,1.));',
    '    vec4 r;',
    '    r = corner(E,F,H,I,B,D,C,G,F4,H5,I4,I5, fp, w); col = mix(col, r.rgb, r.a);',                                  // bottom-right
    '    r = corner(E,D,H,G,B,F,A,I,D0,H5,G0,G5, vec2(1.0-fp.x, fp.y), w); col = mix(col, r.rgb, r.a);',                  // bottom-left
    '    r = corner(E,F,B,C,H,D,I,A,F4,B1,C4,C1, vec2(fp.x, 1.0-fp.y), w); col = mix(col, r.rgb, r.a);',                  // top-right
    '    r = corner(E,D,B,A,H,F,G,C,D0,B1,A0,A1, vec2(1.0-fp.x, 1.0-fp.y), w); col = mix(col, r.rgb, r.a);',              // top-left
    '  }',
    '  gl_FragColor = vec4(col, 1.0); }'
  ].join('\n');
  // downsample (supersampling resolve): box filter over the footprint, using bilinear taps (each tap = 2x2 texels)
  var GL_DS = [
    'precision highp float;',
    'uniform sampler2D T; uniform vec2 S; uniform vec2 O; varying vec2 v;',
    'void main(){ vec2 r = S / O; vec2 n = clamp(ceil(r * 0.5), vec2(1.0), vec2(8.0)); vec2 base = v * S - r * 0.5; vec3 acc = vec3(0.0); float cnt = 0.0;',
    '  for (int y = 0; y < 8; y++) { if (float(y) >= n.y) break; for (int x = 0; x < 8; x++) { if (float(x) >= n.x) break;',
    '    vec2 p = base + (vec2(float(x), float(y)) + 0.5) * (r / n); acc += texture2D(T, vec2(p.x, S.y - p.y) / S).rgb; cnt += 1.0; } }',  // FBO rows are bottom-up in GL: flip y
    '  gl_FragColor = vec4(acc / cnt, 1.0); }'
  ].join('\n');

  // WGSL (WebGPU) - same algorithm
  var WGSL = [
    'struct U { S: vec2f, O: vec2f, M: f32, p0: f32, p1: f32, p2: f32 };',
    '@group(0) @binding(0) var T: texture_2d<f32>;',
    '@group(0) @binding(1) var<uniform> u: U;',
    'struct VO { @builtin(position) pos: vec4f, @location(0) v: vec2f };',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> VO { var p = array<vec2f,3>(vec2f(-1.,-1.), vec2f(3.,-1.), vec2f(-1.,3.)); var o: VO; o.pos = vec4f(p[i], 0., 1.); o.v = vec2f(p[i].x*0.5+0.5, 0.5-p[i].y*0.5); return o; }',
    'fn px(q: vec2f) -> vec3f { let p = clamp(q, vec2f(0.), u.S - 1.); return textureLoad(T, vec2i(p), 0).rgb; }',
    'fn df(a: vec3f, b: vec3f) -> f32 { let d = a - b; let y = dot(d, vec3f(0.299,0.587,0.114)); let uu = dot(d, vec3f(-0.169,-0.331,0.5)); let w = dot(d, vec3f(0.5,-0.419,-0.081)); return 48.*abs(y) + 7.*abs(uu) + 6.*abs(w); }',
    'fn ne(a: vec3f, b: vec3f) -> bool { return df(a,b) > 0.15; }',
    'fn bil(t: vec2f, s: f32) -> vec3f { let tx = t - 0.5; let i = floor(tx); let f = clamp((tx - i - 0.5) * s + 0.5, vec2f(0.), vec2f(1.));',
    '  let a = mix(px(i), px(i + vec2f(1.,0.)), f.x); let b = mix(px(i + vec2f(0.,1.)), px(i + vec2f(1.,1.)), f.x); return mix(a, b, f.y); }',
    'fn corner(E: vec3f, F: vec3f, H: vec3f, I: vec3f, B: vec3f, D: vec3f, C: vec3f, G: vec3f, F4: vec3f, H5: vec3f, I4: vec3f, I5: vec3f, lf: vec2f, w: f32) -> vec4f {',
    '  let e = df(E,C) + df(E,G) + df(I,F4) + df(I,H5) + 4.*df(H,F);',
    '  let i = df(H,D) + df(H,I5) + df(F,I4) + df(F,B) + 4.*df(E,I);',
    '  if (!(e < i) || !ne(E,F) || !ne(E,H)) { return vec4f(E, 0.); }',
    '  var c = H; if (df(E,F) <= df(E,H)) { c = F; }',
    '  var a = smoothstep(-w, w, (lf.x + lf.y - 1.5) * 0.70710678);',
    '  let ke = df(F,G); let ki = df(H,C);',
    '  if (2.*ke <= ki && ne(E,G) && ne(D,G)) { a = max(a, smoothstep(-w, w, (0.5*lf.x + lf.y - 1.) * 0.89442719)); }',
    '  if (ke >= 2.*ki && ne(E,C) && ne(B,C)) { a = max(a, smoothstep(-w, w, (lf.x + 0.5*lf.y - 1.) * 0.89442719)); }',
    '  return vec4f(c, a); }',
    '@fragment fn fs(vin: VO) -> @location(0) vec4f {',
    '  let t = vin.v * u.S; let sc = max(u.O.x / u.S.x, 0.001); var col: vec3f;',
    '  if (u.M < 0.5) { col = px(floor(t)); }',
    '  else if (u.M < 1.5) { col = bil(t, max(floor(sc), 1.)); }',
    '  else if (u.M < 2.5) { col = bil(t, 1.); }',
    '  else {',
    '    let i0 = floor(t); let fp = t - i0; let w = 0.5 / sc;',
    '    col = bil(t, sc);',
    '    let E = px(i0);',
    '    let B = px(i0+vec2f(0.,-1.)); let D = px(i0+vec2f(-1.,0.)); let F = px(i0+vec2f(1.,0.)); let H = px(i0+vec2f(0.,1.));',
    '    let A = px(i0+vec2f(-1.,-1.)); let C = px(i0+vec2f(1.,-1.)); let G = px(i0+vec2f(-1.,1.)); let I = px(i0+vec2f(1.,1.));',
    '    let B1 = px(i0+vec2f(0.,-2.)); let A1 = px(i0+vec2f(-1.,-2.)); let C1 = px(i0+vec2f(1.,-2.));',
    '    let H5 = px(i0+vec2f(0.,2.)); let G5 = px(i0+vec2f(-1.,2.)); let I5 = px(i0+vec2f(1.,2.));',
    '    let D0 = px(i0+vec2f(-2.,0.)); let A0 = px(i0+vec2f(-2.,-1.)); let G0 = px(i0+vec2f(-2.,1.));',
    '    let F4 = px(i0+vec2f(2.,0.)); let C4 = px(i0+vec2f(2.,-1.)); let I4 = px(i0+vec2f(2.,1.));',
    '    var r: vec4f;',
    '    r = corner(E,F,H,I,B,D,C,G,F4,H5,I4,I5, fp, w); col = mix(col, r.rgb, r.a);',
    '    r = corner(E,D,H,G,B,F,A,I,D0,H5,G0,G5, vec2f(1.-fp.x, fp.y), w); col = mix(col, r.rgb, r.a);',
    '    r = corner(E,F,B,C,H,D,I,A,F4,B1,C4,C1, vec2f(fp.x, 1.-fp.y), w); col = mix(col, r.rgb, r.a);',
    '    r = corner(E,D,B,A,H,F,G,C,D0,B1,A0,A1, vec2f(1.-fp.x, 1.-fp.y), w); col = mix(col, r.rgb, r.a);',
    '  }',
    '  return vec4f(col, 1.); }'
  ].join('\n');
  var WGSL_DS = [
    'struct U { S: vec2f, O: vec2f, M: f32, p0: f32, p1: f32, p2: f32 };',
    '@group(0) @binding(0) var T: texture_2d<f32>;',
    '@group(0) @binding(1) var<uniform> u: U;',
    '@group(0) @binding(2) var L: sampler;',
    'struct VO { @builtin(position) pos: vec4f, @location(0) v: vec2f };',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> VO { var p = array<vec2f,3>(vec2f(-1.,-1.), vec2f(3.,-1.), vec2f(-1.,3.)); var o: VO; o.pos = vec4f(p[i], 0., 1.); o.v = vec2f(p[i].x*0.5+0.5, 0.5-p[i].y*0.5); return o; }',
    '@fragment fn fs(vin: VO) -> @location(0) vec4f { let r = u.S / u.O; let n = clamp(ceil(r * 0.5), vec2f(1.), vec2f(8.)); let base = vin.v * u.S - r * 0.5; var acc = vec3f(0.); var cnt = 0.;',
    '  for (var y = 0; y < 8; y++) { if (f32(y) >= n.y) { break; } for (var x = 0; x < 8; x++) { if (f32(x) >= n.x) { break; }',
    '    let p = base + (vec2f(f32(x), f32(y)) + 0.5) * (r / n); acc += textureSampleLevel(T, L, p / u.S, 0.).rgb; cnt += 1.; } }',
    '  return vec4f(acc / cnt, 1.); }'
  ].join('\n');

  /* ---------------- helpers ---------------- */
  function fitCap(w, h, maxDim, maxArea) {
    var s = 1;
    if (w > maxDim) s = Math.min(s, maxDim / w);
    if (h > maxDim) s = Math.min(s, maxDim / h);
    if (maxArea && w * h * s * s > maxArea) s = Math.min(s, Math.sqrt(maxArea / (w * h)));
    if (s >= 1) return { w: w, h: h, capped: false };
    var nh = Math.floor(h * s / 2) * 2;
    return { w: Math.round(nh * 1.5), h: nh, capped: true };
  }

  /* ---------------- WebGL (1 and 2) ---------------- */
  function GLDriver(canvas, v2) {
    var opts = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    var gl = canvas.getContext(v2 ? 'webgl2' : 'webgl', opts) || (!v2 && canvas.getContext('experimental-webgl', opts));
    if (!gl) throw new Error((v2 ? 'WebGL 2' : 'WebGL') + ' unavailable');
    function prog(fs) {
      function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
      var p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, GL_VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return { p: p, T: gl.getUniformLocation(p, 'T'), S: gl.getUniformLocation(p, 'S'), O: gl.getUniformLocation(p, 'O'), M: gl.getUniformLocation(p, 'M') };
    }
    var main = prog(GL_FS), ds = prog(GL_DS);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    function tex(w, h, filter, data) {
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data || null);
      return t;
    }
    var src = tex(SW, SH, gl.NEAREST, new Uint8Array(SW * SH * 4));
    var fbo = null, fboTex = null, fboW = 0, fboH = 0;
    var vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    var maxDim = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), vp[0], vp[1]);
    var dbg = gl.getExtension('WEBGL_debug_renderer_info');
    var gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
    var lost = false;
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; }, false);
    return {
      name: v2 ? 'webgl2' : 'webgl', label: v2 ? 'WebGL 2' : 'WebGL 1', gpu: gpu, maxDim: maxDim, maxArea: 0, ssaa: true,
      upload: function (rgba) { gl.bindTexture(gl.TEXTURE_2D, src); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SW, SH, gl.RGBA, gl.UNSIGNED_BYTE, rgba); },
      render: function (rw, rh, cw, ch, mode) {
        if (lost) throw new Error('context lost');
        var useFbo = rw > cw || rh > ch;
        if (useFbo && (rw !== fboW || rh !== fboH)) {
          if (fboTex) { gl.deleteTexture(fboTex); gl.deleteFramebuffer(fbo); }
          fboTex = tex(rw, rh, gl.LINEAR, null); fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteTexture(fboTex); fboTex = null; fboW = fboH = 0; throw new Error('render target ' + rw + 'x' + rh + ' not supported'); }
          fboW = rw; fboH = rh;
        }
        gl.useProgram(main.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src);
        gl.uniform1i(main.T, 0); gl.uniform2f(main.S, SW, SH); gl.uniform2f(main.O, rw, rh); gl.uniform1f(main.M, mode);
        gl.bindFramebuffer(gl.FRAMEBUFFER, useFbo ? fbo : null); gl.viewport(0, 0, useFbo ? rw : cw, useFbo ? rh : ch);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (useFbo) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cw, ch);
          gl.useProgram(ds.p); gl.bindTexture(gl.TEXTURE_2D, fboTex);
          gl.uniform1i(ds.T, 0); gl.uniform2f(ds.S, rw, rh); gl.uniform2f(ds.O, cw, ch);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      },
      drawingBuffer: function () { return [gl.drawingBufferWidth, gl.drawingBufferHeight]; },
      destroy: function () { try { var e = gl.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); } catch (x) {} }
    };
  }

  /* ---------------- WebGPU ---------------- */
  function GPUDriver(canvas) {
    var nav = (typeof navigator !== 'undefined') ? navigator : null;
    if (!nav || !nav.gpu) return Promise.reject(new Error('WebGPU unavailable'));
    var device, ctx, format, pipe, dsPipe, srcTex, ubuf, ubuf2, bind, sampler, rt = null, rtW = 0, rtH = 0, dsBind = null, info = '';
    return nav.gpu.requestAdapter({ powerPreference: 'high-performance' }).then(function (ad) {
      if (!ad) throw new Error('no WebGPU adapter');
      try { var ai = ad.info || {}; info = [ai.vendor, ai.architecture, ai.description].filter(Boolean).join(' '); } catch (e) {}
      var want = Math.min(ad.limits.maxTextureDimension2D || 8192, 16384);
      return ad.requestDevice({ requiredLimits: { maxTextureDimension2D: want } });
    }).then(function (dev) {
      device = dev;
      ctx = canvas.getContext('webgpu');
      if (!ctx) throw new Error('no webgpu canvas context');
      format = nav.gpu.getPreferredCanvasFormat();
      ctx.configure({ device: device, format: format, alphaMode: 'opaque' });
      var m = device.createShaderModule({ code: WGSL }), m2 = device.createShaderModule({ code: WGSL_DS });
      function mk(mod, fmt) { return device.createRenderPipeline({ layout: 'auto', vertex: { module: mod, entryPoint: 'vs' }, fragment: { module: mod, entryPoint: 'fs', targets: [{ format: fmt }] }, primitive: { topology: 'triangle-list' } }); }
      pipe = mk(m, format); dsPipe = mk(m2, format);
      var pipeRT = mk(m, 'rgba8unorm');
      srcTex = device.createTexture({ size: [SW, SH], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
      ubuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      ubuf2 = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
      bind = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: srcTex.createView() }, { binding: 1, resource: { buffer: ubuf } }] });
      var bindRT = device.createBindGroup({ layout: pipeRT.getBindGroupLayout(0), entries: [{ binding: 0, resource: srcTex.createView() }, { binding: 1, resource: { buffer: ubuf } }] });
      var lost = false; device.lost.then(function (i) { lost = true; try { console.warn('BSR WebGPU device lost:', i && i.reason, i && i.message); } catch (e) {} });
      device.addEventListener && device.addEventListener('uncapturederror', function (e) { try { console.warn('BSR WebGPU error:', e.error && e.error.message); } catch (x) {} });
      var maxDim = device.limits.maxTextureDimension2D;
      return {
        name: 'webgpu', label: 'WebGPU', gpu: info, maxDim: maxDim, maxArea: 0, ssaa: true,
        upload: function (rgba) { device.queue.writeTexture({ texture: srcTex }, rgba, { bytesPerRow: SW * 4, rowsPerImage: SH }, { width: SW, height: SH }); },
        render: function (rw, rh, cw, ch, mode) {
          if (lost) throw new Error('device lost');
          var useRT = rw > cw || rh > ch;
          device.queue.writeBuffer(ubuf, 0, new Float32Array([SW, SH, rw, rh, mode, 0, 0, 0]));
          var enc = device.createCommandEncoder();
          var view = ctx.getCurrentTexture().createView();
          if (useRT) {
            if (rw !== rtW || rh !== rtH) {
              if (rt) rt.destroy();
              rt = device.createTexture({ size: [rw, rh], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
              rtW = rw; rtH = rh;
              dsBind = device.createBindGroup({ layout: dsPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: rt.createView() }, { binding: 1, resource: { buffer: ubuf2 } }, { binding: 2, resource: sampler }] });
            }
            device.queue.writeBuffer(ubuf2, 0, new Float32Array([rw, rh, cw, ch, 0, 0, 0, 0]));
            var p1 = enc.beginRenderPass({ colorAttachments: [{ view: rt.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
            p1.setPipeline(pipeRT); p1.setBindGroup(0, bindRT); p1.draw(3); p1.end();
            var p2 = enc.beginRenderPass({ colorAttachments: [{ view: view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
            p2.setPipeline(dsPipe); p2.setBindGroup(0, dsBind); p2.draw(3); p2.end();
          } else {
            var p = enc.beginRenderPass({ colorAttachments: [{ view: view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
            p.setPipeline(pipe); p.setBindGroup(0, bind); p.draw(3); p.end();
          }
          device.queue.submit([enc.finish()]);
        },
        drawingBuffer: function () { return [canvas.width, canvas.height]; },
        destroy: function () { try { ctx.unconfigure(); } catch (e) {} try { device.destroy(); } catch (e) {} }
      };
    });
  }

  /* ---------------- Canvas 2D (CPU) ---------------- */
  function scale2x(src, w, h, dst) { // Scale2x / EPX (classic public-domain pixel-art edge algorithm), 32-bit pixels
    var W2 = w * 2;
    for (var y = 0; y < h; y++) {
      var ym = y > 0 ? y - 1 : 0, yp = y < h - 1 ? y + 1 : h - 1;
      for (var x = 0; x < w; x++) {
        var xm = x > 0 ? x - 1 : 0, xp = x < w - 1 ? x + 1 : w - 1;
        var E = src[y * w + x], B = src[ym * w + x], H = src[yp * w + x], D = src[y * w + xm], F = src[y * w + xp];
        var o = (y * 2) * W2 + x * 2, e0 = E, e1 = E, e2 = E, e3 = E;
        if (B !== H && D !== F) { if (D === B) e0 = D; if (B === F) e1 = F; if (D === H) e2 = D; if (H === F) e3 = F; }
        dst[o] = e0; dst[o + 1] = e1; dst[o + W2] = e2; dst[o + W2 + 1] = e3;
      }
    }
  }
  function C2DDriver(canvas) {
    var ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D unavailable');
    function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    var src = mk(SW, SH), sctx = src.getContext('2d'), img = sctx.createImageData(SW, SH);
    var hq = mk(SW * 4, SH * 4), hctx = hq.getContext('2d'), himg = hctx.createImageData(SW * 4, SH * 4);
    var t1 = new Uint32Array(SW * SH * 4), h32 = new Uint32Array(himg.data.buffer);
    var pre = null, pk = 0, last = null;
    return {
      name: 'canvas', label: 'Canvas 2D', gpu: 'CPU', maxDim: 16384, maxArea: 16777216, ssaa: false,
      upload: function (rgba) { img.data.set(rgba); sctx.putImageData(img, 0, 0); last = rgba; },
      render: function (rw, rh, cw, ch, mode) {
        // Canvas 2D draws straight at the canvas size (supersampling is not done on the CPU path)
        ctx.imageSmoothingEnabled = mode !== 0;
        try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}
        if (mode === 0 || mode === 2) { ctx.drawImage(src, 0, 0, cw, ch); return; }
        if (mode === 1) {
          var k = Math.max(1, Math.floor(cw / SW));
          if (!pre || pk !== k) { pre = mk(SW * k, SH * k); pk = k; }
          var pc = pre.getContext('2d'); pc.imageSmoothingEnabled = false; pc.drawImage(src, 0, 0, SW * k, SH * k);
          ctx.drawImage(pre, 0, 0, cw, ch); return;
        }
        if (last) {
          var s32 = new Uint32Array(last.buffer, last.byteOffset, SW * SH);
          scale2x(s32, SW, SH, t1); scale2x(t1, SW * 2, SH * 2, h32);
          hctx.putImageData(himg, 0, 0);
        }
        ctx.drawImage(hq, 0, 0, cw, ch);
      },
      drawingBuffer: function () { return [canvas.width, canvas.height]; },
      destroy: function () {}
    };
  }

  /* ---------------- controller ---------------- */
  function create(host) {
    var self = {}, drv = null, canvas = null, frame = null, dirty = true, pending = false;
    var ups = 'hq', out = 'match', cssW = 360, cssH = 240, dpr = 1, rw = 0, rh = 0, cw = 0, ch = 0, capped = false, reqW = 0, reqH = 0;
    var avail = { webgpu: null, webgl2: null, webgl: null, canvas: true }, lastErr = '', requested = 'auto', recovering = false, fellBack = '';

    function newCanvas() {
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      canvas = document.createElement('canvas');
      canvas.className = 'bsr-game-canvas';
      canvas.width = SW; canvas.height = SH;
      host.appendChild(canvas);
      return canvas;
    }
    function tryOne(name) {
      var c = newCanvas(); canvas.setAttribute('data-driver', name);
      if (name === 'webgpu') return Promise.race([GPUDriver(c), new Promise(function (_, rej) { setTimeout(function () { rej(new Error('WebGPU init timed out')); }, 4000); })]);
      return new Promise(function (res) { res(name === 'canvas' ? C2DDriver(c) : GLDriver(c, name === 'webgl2')); });
    }
    var gen = 0, dbgMax = 0;
    self._debugMaxDim = function (n) { dbgMax = n || 0; self.layout(); self.draw(true); }; // test hook: simulate a smaller GPU limit
    self.init = function (want) {
      // Each call supersedes any init still in flight (e.g. a slow WebGPU adapter request while the user
      // switches driver): a stale result is destroyed instead of replacing the newer driver.
      var my = ++gen; gpuCheck = 0; gpuBlack = 0; gpuNext = 0;
      requested = want || 'auto';
      if (drv) { try { drv.destroy(); } catch (e) {} drv = null; }
      var order = requested === 'auto' ? ['webgpu', 'webgl2', 'webgl', 'canvas'] : [requested].concat(['webgpu', 'webgl2', 'webgl', 'canvas'].filter(function (n) { return n !== requested; }));
      var i = 0, errs = [];
      function next() {
        if (my !== gen) return Promise.reject(new Error('superseded'));
        if (i >= order.length) return Promise.reject(new Error('no video driver: ' + errs.join('; ')));
        var n = order[i++];
        return tryOne(n).then(function (d) {
          if (my !== gen) { try { d.destroy(); } catch (e) {} throw new Error('superseded'); }
          avail[n] = true; drv = d; lastErr = errs.length ? errs.join('; ') : '';
          dirty = true; pending = !!frame; self.layout(); self.draw(true);
          return d;
        }, function (e) { if (my !== gen) throw e; avail[n] = false; errs.push(n + ': ' + (e && e.message || e)); return next(); });
      }
      return next();
    };
    self.probe = function () { // availability for the settings list (cheap checks, no device creation)
      var r = {};
      r.webgpu = !!(typeof navigator !== 'undefined' && navigator.gpu);
      try { r.webgl2 = !!document.createElement('canvas').getContext('webgl2'); } catch (e) { r.webgl2 = false; }
      try { r.webgl = !!document.createElement('canvas').getContext('webgl'); } catch (e) { r.webgl = false; }
      r.canvas = true;
      for (var k in avail) if (avail[k] === false) r[k] = false;
      return r;
    };
    self.layout = function () {
      if (!drv) return;
      var targetH;
      if (out === 'match') targetH = Math.max(SH, Math.round(cssH * dpr));
      else targetH = +out;
      reqH = targetH; reqW = Math.round(targetH * 1.5);
      var cap = fitCap(reqW, reqH, dbgMax ? Math.min(dbgMax, drv.maxDim) : drv.maxDim, drv.maxArea);
      capped = cap.capped; rw = cap.w; rh = cap.h;
      // the canvas never needs to be bigger than what the display shows; extra resolution is resolved by supersampling
      var dispH = Math.max(SH, Math.round(cssH * dpr));
      if (drv.ssaa && rh > dispH) { ch = dispH; cw = Math.round(dispH * 1.5); }
      else { cw = rw; ch = rh; if (!drv.ssaa) { var c2 = fitCap(rw, rh, 16384, 16777216); cw = c2.w; ch = c2.h; rw = cw; rh = ch; } }
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      dirty = true;
    };
    self.resize = function (w, h, ratio) { cssW = w; cssH = h; dpr = ratio || 1; self.layout(); self.draw(true); };
    self.setUpscaler = function (u) { if (MODE[u] === undefined) u = 'hq'; ups = u; dirty = true; self.draw(true); };
    self.setOutput = function (o) { out = o; self.layout(); self.draw(true); };
    self.frame = function (rgba) { frame = rgba; pending = true; dirty = true; };
    self.draw = function (force) {
      if (!drv || (!dirty && !force)) return;
      dirty = false;
      if (pending && frame) { pending = false; try { drv.upload(frame); } catch (e) { lastErr = String(e); } }
      try { drv.render(rw, rh, cw, ch, MODE[ups]); if (drv.name === 'webgpu' && gpuCheck < 3 && frame) presentCheck(); }
      catch (e) {
        lastErr = String(e && e.message || e);
        if (/lost/.test(lastErr) && !recovering) {
          // GPU device / context lost: fall back to the next driver automatically
          recovering = true;
          var nextD = { webgpu: 'webgl2', webgl2: 'webgl', webgl: 'canvas' }[drv.name] || 'canvas', keep = requested;
          self.init(nextD).then(function () { requested = keep; recovering = false; fellBack = lastErr; if (self.onchange) self.onchange(); }, function () { recovering = false; });
        } else if (/render target/.test(lastErr) && rh > SH * 2) {
          // render target too large for this GPU: halve it
          rh = Math.floor(rh / 4) * 2; rw = Math.round(rh * 1.5); capped = true; dirty = true;
        }
      }
    };
    // WebGPU self-check: some browsers/GPUs accept every WebGPU call yet the canvas never shows anything.
    // Right after a render (same task) read the canvas back through a tiny 2D canvas; if it is pure black
    // or wildly off from the emulator frame's brightness on three checks in a row, fall back to WebGL 2.
    var gpuCheck = 0, gpuBlack = 0, gpuNext = 0;
    function presentCheck() {
      var now = performance.now(); if (now < gpuNext) return; gpuNext = now + 400;
      var fs = 0, fn = 0; for (var k = 0; k < frame.length; k += 4 * 97) { fs += frame[k] + frame[k + 1] + frame[k + 2]; fn++; }
      var fm = fs / (fn * 3); if (fm < 4) return; // emulator frame itself is (nearly) black: nothing to compare
      var cs = -1;
      try {
        var t = document.createElement('canvas'); t.width = 24; t.height = 16; var x = t.getContext('2d');
        x.drawImage(canvas, 0, 0, 24, 16); var d = x.getImageData(0, 0, 24, 16).data; cs = 0;
        for (var j = 0; j < d.length; j += 4) cs += d[j] + d[j + 1] + d[j + 2];
      } catch (e) { gpuCheck = 3; return; } // readback not allowed here: trust the driver
      gpuCheck++;
      var cm = cs / (384 * 3); if (cs === 0 || Math.abs(cm - fm) > 64) gpuBlack++; else { gpuCheck = 3; return; }
      if (gpuBlack >= 3 && !recovering) {
        recovering = true; var keep = requested;
        lastErr = 'WebGPU canvas output did not match the game frame (presentation failed)';
        self.init('webgl2').then(function () { requested = keep; recovering = false; fellBack = 'WebGPU canvas output did not match the game frame'; if (self.onchange) self.onchange(); }, function () { recovering = false; });
      }
    }
    self.info = function () {
      var db = drv ? drv.drawingBuffer() : [0, 0];
      return {
        driver: drv ? drv.name : 'none', label: drv ? drv.label : 'none', gpu: drv ? drv.gpu : '', requested: requested,
        renderW: rw, renderH: rh, canvasW: db[0], canvasH: db[1], requestedW: reqW, requestedH: reqH, capped: capped,
        maxDim: drv ? (dbgMax ? Math.min(dbgMax, drv.maxDim) : drv.maxDim) : 0, maxArea: drv ? drv.maxArea : 0, ssaa: drv ? (drv.ssaa && rh > ch) : false,
        upscaler: ups, output: out, cssW: cssW, cssH: cssH, dpr: dpr, error: lastErr, fellBack: fellBack
      };
    };
    self.canvas = function () { return canvas; };
    self.destroy = function () { if (drv) drv.destroy(); drv = null; if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas); };
    return self;
  }

  var API = { create: create, RES: RES, UPS: UPS, DRV: DRV, scale2x: scale2x, _GL_FS: GL_FS, _WGSL: WGSL };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.BSRVideo = API;
})(typeof window !== 'undefined' ? window : this);
