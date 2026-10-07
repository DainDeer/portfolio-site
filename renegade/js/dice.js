// Slice 5 §B: the physically simulated d20 (DATA.config.dice; Smudge's scene assets/ui/dice/d20_scene.json + panel art).
// G.Checks.roll decides the number. A deterministic rigid-body throw into the dark box is simulated once from q0, the
// face it lands on (m) is read, and the SAME trajectory is replayed with every orientation right-multiplied by S^-1,
// S = F_n * F_m^T (one of the icosahedron's 60 symmetries): the collision shape is unchanged and face n lands on top.
// Nothing is faked: the carved numbers never move. Played back in a tiny raw-WebGL scene (4 light bands, Bayer
// dithering, like the title scene) in a panel top-left; the die switches tint on landing (gold / ember / ash / blood).
// G.Dice.simulate / plan are pure (headless-tested with the scene json); G.Dice.show(roll) plays and resolves when done.
(function (root) {
  const G = root.G, U = G.Util;
  const Dc = G.Dice = {};
  const C = () => DATA.config.dice;
  const url = (f) => G.Assets ? G.Assets.url(DATA.sprites.basePath + f) : DATA.sprites.basePath + f;
  // ---- vectors / quaternions [w, x, y, z] ----
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]), norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
  const qnorm = (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };
  const qconj = (q) => [q[0], -q[1], -q[2], -q[3]];
  const qrot = (q, v) => { const r = qmul(qmul(q, [0, v[0], v[1], v[2]]), qconj(q)); return [r[1], r[2], r[3]]; };
  const qaxis = (ax, ang) => { const s = Math.sin(ang / 2); return [Math.cos(ang / 2), ax[0] * s, ax[1] * s, ax[2] * s]; };
  const qbetween = (a, b) => { const c = cross(a, b), d = dot(a, b); if (d < -0.999999) { const ax = norm(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0])); return qaxis(ax, Math.PI); } return qnorm([1 + d, c[0], c[1], c[2]]); };
  const qFromMat = (m) => {   // m[row][col], a proper rotation
    const tr = m[0][0] + m[1][1] + m[2][2]; let q;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [s / 4, (m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s]; }
    else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; q = [(m[2][1] - m[1][2]) / s, s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s]; }
    else if (m[1][1] > m[2][2]) { const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; q = [(m[0][2] - m[2][0]) / s, (m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s]; }
    else { const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2; q = [(m[1][0] - m[0][1]) / s, (m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4]; }
    return qnorm(q);
  };
  const matMulT = (A, B) => [0, 1, 2].map((r) => [0, 1, 2].map((c) => A[r][0] * B[c][0] + A[r][1] * B[c][1] + A[r][2] * B[c][2]));   // A * B^T
  Dc.qrot = qrot; Dc.qmul = qmul;

  // ---- the scene (Smudge's d20_scene.json) ----
  Dc.setScene = function (S) {
    const d = S.d20;
    Dc.scene = S;
    Dc.geo = { V: d.vertices, F: d.faces.map((f) => f.verts), N: d.faces.map((f) => f.normal), number: d.faces.map((f) => f.number), frame: d.faces.map((f) => f.frame),
      uv: d.faces.map((f) => f.uv), faceOf: Object.fromEntries(Object.entries(d.number_to_face).map(([n, i]) => [+n, i])), inR: d.rest_height };
    return Dc.geo;
  };
  Dc.load = function () {
    if (Dc._load) return Dc._load;
    return (Dc._load = fetch(url(C().scene.file)).then((r) => (r.ok ? r.json() : Promise.reject(new Error("scene " + r.status)))).then((S) => Dc.setScene(S))
      .catch((e) => { Dc._load = null; Dc.error = String(e && e.message || e); throw e; }));
  };
  // the face pointing most up for orientation q (Smudge's reading rule)
  Dc.topFace = (q) => { let best = -2, bi = 0; Dc.geo.N.forEach((n, i) => { const y = qrot(q, n)[1]; if (y > best) { best = y; bi = i; } }); return bi; };
  Dc.numberUp = (q) => Dc.geo.number[Dc.topFace(q)];

  // ---- the throw: deterministic from seed. frames at 60 fps: [x, y, z, qw, qx, qy, qz] ----
  Dc.simulate = function (seed) {
    const cf = C(), P = cf.physics, T = cf.throw, B = Dc.scene.box.inner, rng = U.makeRng(seed || 1), R = (a) => a[0] + rng() * (a[1] - a[0]);
    const g = Dc.geo, dt = 1 / 240, frames = [], steps = Math.round(cf.maxSimSec / dt);
    let pos = [-B.half_x + 1.1, R(T.height), (rng() - 0.5) * B.half_z], q = qnorm([rng() - 0.5, rng() - 0.5, rng() - 0.5, rng() - 0.5]);
    const dir = norm([1, 0, (rng() - 0.5) * 0.8]); let v = add(mul(dir, R(T.speed)), [0, -1, 0]);
    let w = mul(norm([rng() - 0.5, rng() - 0.5, rng() - 0.5]), R(T.spin));
    const planes = [[[0, 1, 0], 0], [[1, 0, 0], -B.half_x], [[-1, 0, 0], -B.half_x], [[0, 0, 1], -B.half_z], [[0, 0, -1], -B.half_z], [[0, -1, 0], -(cf.lidY || 3)]];
    let rest = 0, restedAt = -1, lastHit = -99; const bounces = [], minHit = ((cf.sfx || {}).bounceMinSpeed) || 1.2;   // wall hits (frame index) for the tumble sounds
    for (let s = 0; s < steps; s++) {
      v = add(v, [0, P.gravity * dt, 0]); pos = add(pos, mul(v, dt));
      const wq = [0, w[0], w[1], w[2]], dq = qmul(wq, q); q = qnorm(q.map((x, i) => x + 0.5 * dt * dq[i]));
      let onFloor = false;
      for (const [n, d] of planes) {
        let deepest = 0;
        for (const lv of g.V) {
          const r = qrot(q, lv), p = add(pos, r), pen = d - dot(n, p); if (pen <= 0) continue;
          if (n[1] === 1) onFloor = true; deepest = Math.max(deepest, pen);
          const vp = add(v, cross(w, r)), vn = dot(vp, n); if (vn >= 0) continue;
          if (n[1] === 0 && -vn > minHit && s - lastHit > 30) { bounces.push(frames.length); lastHit = s; }
          const rn = cross(r, n), den = 1 + dot(rn, rn) / P.inertia, j = -(1 + P.restitution) * vn / den;
          v = add(v, mul(n, j)); w = add(w, mul(cross(r, mul(n, j)), 1 / P.inertia));
          const vp2 = add(v, cross(w, r)), vt = sub(vp2, mul(n, dot(vp2, n))), vtl = len(vt);
          if (vtl > 1e-6) { const tdir = mul(vt, -1 / vtl), rt = cross(r, tdir), dent = 1 + dot(rt, rt) / P.inertia, jt = Math.min(P.friction * j, vtl / dent);
            v = add(v, mul(tdir, jt)); w = add(w, mul(cross(r, mul(tdir, jt)), 1 / P.inertia)); }
        }
        if (deepest > 0) pos = add(pos, mul(n, deepest * 0.8));
      }
      if (onFloor) { w = mul(w, Math.max(0, 1 - P.angDamp * dt)); v = [v[0] * (1 - 0.6 * dt), v[1], v[2] * (1 - 0.6 * dt)]; }
      if (s % 4 === 0) frames.push([pos[0], pos[1], pos[2], q[0], q[1], q[2], q[3]]);
      if (onFloor && len(v) < P.restV && len(w) < P.restW) { rest += dt; if (rest >= P.restSec) { restedAt = s * dt; break; } } else rest = 0;
    }
    // settle exactly flat on the face that's down (a hair's correction when it rested; a short tip-over if time ran out)
    let down = 0, lo = 2; g.N.forEach((n, i) => { const y = qrot(q, n)[1]; if (y < lo) { lo = y; down = i; } });
    const qEnd = qnorm(qmul(qbetween(qrot(q, g.N[down]), [0, -1, 0]), q)), pEnd = [pos[0], g.inR, pos[2]];
    const k = restedAt >= 0 ? 4 : 14, f0 = frames[frames.length - 1] || [pos[0], pos[1], pos[2]].concat(q), q0 = f0.slice(3), sg = Math.sign(q0[0] * qEnd[0] + q0[1] * qEnd[1] + q0[2] * qEnd[2] + q0[3] * qEnd[3]) || 1;
    for (let i = 1; i <= k; i++) { const a = i / k, qa = qnorm(q0.map((x, j) => x + (qEnd[j] * sg - x) * a)); frames.push([f0[0] + (pEnd[0] - f0[0]) * a, f0[1] + (pEnd[1] - f0[1]) * a, f0[2] + (pEnd[2] - f0[2]) * a].concat(qa)); }
    frames[frames.length - 1] = pEnd.concat(qEnd);
    return { frames, top: Dc.topFace(qEnd), rested: restedAt >= 0, restedAt, qEnd, bounces };
  };
  // the symmetry that puts face n where face m was: replay with q * s^-1, s = quat(F_n * F_m^T)
  Dc.symmetry = function (m, n) { return qFromMat(matMulT(Dc.geo.frame[n], Dc.geo.frame[m])); };
  Dc.plan = function (d, seed) {
    const sim = Dc.simulate(seed), m = sim.top, n = Dc.geo.faceOf[d], si = qconj(Dc.symmetry(m, n));
    const frames = sim.frames.map((f) => f.slice(0, 3).concat(qmul(f.slice(3), si)));
    const qEnd = qmul(sim.qEnd, si);
    return { d, seed, frames, qEnd, rested: sim.rested, landedFace: m, face: n, top: Dc.topFace(qEnd), bounces: sim.bounces };
  };
  Dc.tint = (grade) => (C().tints || {})[grade] || "ember";

  // ---- WebGL playback ----
  const VS = `attribute vec3 aP; attribute vec3 aN; attribute vec2 aUV; attribute float aM;
uniform mat4 uVP; uniform vec4 uQ; uniform vec3 uT;
varying vec3 vW; varying vec3 vN; varying vec2 vUV; varying float vM; varying vec2 vDie;
vec3 rot(vec4 q, vec3 v) { vec3 u = q.yzw; return v + 2.0 * cross(u, cross(u, v) + q.x * v); }
void main() { vec3 p = aP, n = aN; if (aM > 4.5) { p = rot(uQ, aP) + uT; n = rot(uQ, aN); }
  vW = p; vN = n; vUV = aUV; vM = aM; vDie = uT.xz; gl_Position = uVP * vec4(p, 1.0); }`;
  const FS = `precision mediump float;
uniform sampler2D uDie; uniform sampler2D uFloor; uniform sampler2D uWall; uniform sampler2D uRim;
uniform vec3 uLantern; uniform vec3 uFillDir; uniform vec4 uLight; uniform float uBayer[16];
uniform vec3 uIron[4]; uniform vec3 uGlass2; uniform vec3 uGlass3;
varying vec3 vW; varying vec3 vN; varying vec2 vUV; varying float vM; varying vec2 vDie;
float bayer() { int x = int(mod(gl_FragCoord.x - 0.5, 4.0)), y = int(mod(gl_FragCoord.y - 0.5, 4.0)); int k = y * 4 + x; float b = 0.0;
  for (int i = 0; i < 16; i++) { if (i == k) b = uBayer[i]; } return b; }
void main() {
  float B = bayer();
  if (vM > 3.5 && vM < 4.5) { gl_FragColor = vec4(B < 0.5 ? uGlass2 : uGlass3, 1.0); return; }   // lantern glass: emissive, dithered
  vec3 N = normalize(vN), toL = uLantern - vW; float dl = length(toL);
  float L = uLight.x + uLight.y * max(0.0, dot(N, toL / dl)) / (1.0 + (dl / uLight.z) * (dl / uLight.z)) + uLight.w * max(0.0, dot(N, uFillDir));
  if (vM < 0.5) { float r = length(vW.xz - vDie) / 1.15; L *= clamp(0.35 + 0.65 * r * r, 0.35, 1.0); }   // contact shadow
  float band = clamp(floor(clamp(L, 0.0, 1.0) * 3.0 + B), 0.0, 3.0);
  vec3 c;
  if (vM > 4.5) c = texture2D(uDie, vec2(vUV.x, (band + vUV.y) / 4.0)).rgb;
  else if (vM > 2.5) { c = band < 0.5 ? uIron[0] : band < 1.5 ? uIron[1] : band < 2.5 ? uIron[2] : uIron[3]; }
  else { vec2 t = vec2(fract(vUV.x), (band + clamp(fract(vUV.y), 0.001, 0.999)) / 4.0);
    c = vM < 0.5 ? texture2D(uFloor, t).rgb : vM < 1.5 ? texture2D(uWall, t).rgb : texture2D(uRim, t).rgb; }
  gl_FragColor = vec4(c, 1.0); }`;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16);
  const MAT = { floor: 0, wall: 1, rim: 2, iron: 3, glass: 4 };
  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  function buildMesh() {
    const S = Dc.scene, g = Dc.geo, P = [], N = [], UV = [], M = [];
    const push = (p, n, uv, m) => { P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); UV.push(uv[0], uv[1]); M.push(m); };
    const quad = (q) => { const p = q.p, n = norm(cross(sub(p[1], p[0]), sub(p[2], p[0]))), uv = q.uv || [[0, 0], [0, 0], [0, 0], [0, 0]], m = MAT[q.mat];
      for (const k of [0, 1, 2, 0, 2, 3]) push(p[k], n, uv[k], m); };
    S.box.quads.forEach(quad); S.box.lantern.quads.forEach(quad);
    const dieStart = M.length;
    g.F.forEach((f, i) => { for (let k = 0; k < 3; k++) push(g.V[f[k]], g.N[i], g.uv[i][k], 5); });
    return { P: new Float32Array(P), N: new Float32Array(N), UV: new Float32Array(UV), M: new Float32Array(M), dieStart, count: M.length };
  }
  function viewProj(cam, asp) {
    const eye = cam.pos, f = norm(sub(cam.target, eye)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f), fv = 1 / Math.tan(cam.vfov * Math.PI / 360), n = cam.near, fa = cam.far;
    const V = [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, eye), -dot(u, eye), dot(f, eye), 1];
    const Pm = [fv / asp, 0, 0, 0, 0, fv, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0];
    const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) { let sm = 0; for (let k = 0; k < 4; k++) sm += Pm[k * 4 + rr] * V[c * 4 + k]; o[c * 4 + rr] = sm; } return o;
  }
  const loadImg = (f) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("image " + f)); im.src = url(f); });
  // resolves to a renderer { frame(fr), tint(name) } or rejects (no WebGL / missing art)
  Dc.render = function (canvas) {
    const gl = canvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: true }); if (!gl) return Promise.reject(new Error("no webgl"));
    const A = C().art, tints = ["ember", "gold", "ash", "blood"];
    return Promise.all([...tints.map((t) => loadImg(A.atlas[t].file)), loadImg(A.box.floor.file), loadImg(A.box.wall.file), loadImg(A.box.rim.file)]).then((ims) => {
      const S = Dc.scene, Lt = S.light;
      const mk = (t, src) => { const sh = gl.createShader(t); gl.shaderSource(sh, src); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
      const pr = gl.createProgram(); gl.attachShader(pr, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr)); gl.useProgram(pr);
      const m = buildMesh(), bind = (name, data, size) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); const l = gl.getAttribLocation(pr, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); };
      bind("aP", m.P, 3); bind("aN", m.N, 3); bind("aUV", m.UV, 2); bind("aM", m.M, 1);
      const tex = (im) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
        for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
        for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE); return t; };
      const dieTex = {}; tints.forEach((t, i) => (dieTex[t] = tex(ims[i]))); const boxTex = [tex(ims[4]), tex(ims[5]), tex(ims[6])];
      const Uf = (n) => gl.getUniformLocation(pr, n), mats = S.box.materials;
      gl.uniformMatrix4fv(Uf("uVP"), false, viewProj(S.camera, canvas.width / canvas.height));
      gl.uniform3fv(Uf("uLantern"), Lt.pos); gl.uniform3fv(Uf("uFillDir"), norm(Lt.fill_dir)); gl.uniform4f(Uf("uLight"), Lt.ambient, Lt.lantern, Lt.range, Lt.fill);
      gl.uniform1fv(Uf("uBayer[0]"), BAYER); gl.uniform3fv(Uf("uIron[0]"), mats.iron.ramp_by_band.flatMap(hex));
      gl.uniform3fv(Uf("uGlass2"), hex(mats.glass.emissive[2])); gl.uniform3fv(Uf("uGlass3"), hex(mats.glass.emissive[3]));
      ["uDie", "uFloor", "uWall", "uRim"].forEach((n, i) => gl.uniform1i(Uf(n), i));
      boxTex.forEach((t, i) => { gl.activeTexture(gl.TEXTURE1 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
      const setTint = (t) => { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dieTex[t] || dieTex.ember); };
      setTint(C().tints.rolling || "ember");
      const cc = hex(S.clear_colour || "#0c0d10");
      gl.viewport(0, 0, canvas.width, canvas.height); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW);
      const frame = (fr) => {
        gl.clearColor(cc[0], cc[1], cc[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniform4f(Uf("uQ"), fr[3], fr[4], fr[5], fr[6]); gl.uniform3f(Uf("uT"), fr[0], fr[1], fr[2]);
        gl.drawArrays(gl.TRIANGLES, 0, m.count);
      };
      return { frame, tint: setTint, gl };
    });
  };

  // SP-118: one shared WebGL context for big d20 rolls. Creating a new context per roll hits Chrome's ~16-context
  // cap and can force-lose the persistent 3D battle renderer. Reuse lazily; recreate only if the context is lost.
  Dc._gl = null;   // { frame, tint, gl, canvas }
  Dc.ensureRender = function (canvas) {
    const live = Dc._gl && Dc._gl.gl && !Dc._gl.gl.isContextLost() && Dc._gl.canvas;
    if (live) {
      if (Dc._gl.canvas !== canvas) {
        // Keep the live canvas; swap it into the panel in place of the fresh placeholder.
        const parent = canvas.parentNode;
        if (parent) { parent.replaceChild(Dc._gl.canvas, canvas); }
        Dc._gl.canvas.className = canvas.className;
        Dc._gl.canvas.style.cssText = canvas.style.cssText;
        if (Dc._gl.canvas.width !== canvas.width || Dc._gl.canvas.height !== canvas.height) {
          Dc._gl.canvas.width = canvas.width; Dc._gl.canvas.height = canvas.height;
          try { Dc._gl.gl.viewport(0, 0, canvas.width, canvas.height); } catch (x) {}
        }
      }
      return Promise.resolve(Dc._gl);
    }
    return Dc.render(canvas).then((rr) => { Dc._gl = Object.assign({ canvas }, rr); return Dc._gl; });
  };

  // ---- the panel ----
  Dc.enabled = (consumer) => { const c = C(); return !!(c && c.enabled && (c.consumers || []).includes(consumer) && typeof document !== "undefined" && Dc.on()); };
  Dc.on = () => !(G.state && G.state.settings && G.state.settings.showDice === false);   // "Show dice rolls" (settings)
  // ---- the queue: G.Checks.roll(info, rng, kind) / scouting / Break away hand their rolls here. While a die is queued or
  // rolling, the UI holds its outcome (UI.render / UI.toast / the crash flash go through Dc.whenIdle), so a check's result
  // shows once the die has landed. Several at once (a new neighbourhood's scouting) play one after another, faster. ----
  Dc.q = []; Dc.playing = false; Dc.waiters = []; Dc.defer = (fn) => setTimeout(fn, 0);
  Dc.capture = function (roll, kind) {
    if (!Dc.enabled(kind)) return false;
    Dc.q.push(Object.assign({ kind, hold: !((C().queue || {}).noHold || []).includes(kind), label: roll.text ? roll.text.replace(/^.*?: /, "") : null }, roll));
    if (!Dc.playing) Dc.defer(Dc.pump);
    return true;
  };
  Dc.busy = () => !!(Dc.playing && Dc.playing.hold) || Dc.q.some((x) => x.hold);   // only holding kinds hold the outcome
  Dc.whenIdle = function (fn) { if (Dc.busy()) Dc.waiters.push(fn); else fn(); };
  Dc.flushWaiters = function () { if (Dc.busy()) return; const w = Dc.waiters; Dc.waiters = []; for (const fn of w) { try { fn(); } catch (e) { console.error(e); } } };
  Dc.pump = function () {
    if (Dc.playing) return;
    if (!Dc.q.length) { Dc.played = 0; return Dc.flushWaiters(); }
    const i = Dc.q.findIndex((x) => x.hold), next = Dc.q.splice(i >= 0 ? i : 0, 1)[0], later = Dc.played > 0 && !next.hold, Q = C().queue || {};   // a batch's followers (scouting) play faster + quieter; a check you clicked never does   // holding checks first
    if (!next.hold && !next.batch) {   // Vixie (Sep 30): only a scouting batch docks. A lone noHold roll (one new scouting read) gets the big panel (no shield)
      const rest = Dc.q.filter((x) => !x.hold && x.kind === next.kind);
      if (rest.length + 1 >= (Q.dockMin || 2)) for (const x of [next].concat(rest)) x.batch = true;
    }
    Dc.playing = next; Dc.played = (Dc.played || 0) + 1;
    Dc.show(next, Object.assign({ noShield: !next.hold, mini: !!next.batch }, later ? { speed: Q.speed, holdMs: Q.holdMs, quiet: true } : {})).then(() => { Dc.playing = false; Dc.flushWaiters(); Dc.pump(); });
  };
  // sounds (config.dice.sfx; all behind the toggle, since no die = no capture)
  Dc.sfx = function (what) {
    const S = C().sfx || {}; if (!G.Sfx) return;
    if (what === "bounce") { const b = S.bounce || []; if (b.length) G.Sfx.play(b[Math.floor(Math.random() * b.length)]); }
    else if (what === "land" || what === "landQuiet") { if (S.land) G.Sfx.play(S.land); if (S.stinger && what === "land") G.Sfx.play(S.stinger); }   // queued followers: the thunk only
  };
  Dc.phone = () => typeof window !== "undefined" && (window.innerWidth <= 700 || window.innerHeight <= 450);
  Dc.reduced = () => !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  // the plaque number in Smudge's digits (cells 13x17, advance cell - 1), centred in the plaque's field
  Dc.digits = function (el, n, tint) {
    const A = C().art, D = A.digits, k = C().scale, [cw, ch] = D.cell, s = String(n), pq = A.plaque;
    el.innerHTML = ""; const w = s.length * (cw - 1) + 1, x0 = Math.round((pq.size[0] - w) / 2), y0 = Math.round((pq.size[1] - ch) / 2);
    [...s].forEach((c, i) => { const g = document.createElement("span"); g.className = "dice-digit";
      g.style.cssText = `left:${(x0 + i * (cw - 1)) * k}px;top:${y0 * k}px;width:${cw * k}px;height:${ch * k}px;background-image:url(${url(D[tint].file)});background-size:${cw * 10 * k}px ${ch * k}px;background-position:${-(+c) * cw * k}px 0`;
      el.appendChild(g); });
    el.dataset.n = s;
  };
  // show roll (from G.Checks.roll) and resolve when it's landed + held (or tapped). Always resolves.
  Dc.show = function (roll, opts) {
    opts = opts || {};
    if (opts.mini) return Dc.showMini(roll, opts);
    return new Promise((resolve) => {
      const cf = C(), A = cf.art, h = G.UI.h, k = cf.scale, [ww, wh] = [A.panel.window[2], A.panel.window[3]], px = (v) => v * k + "px";
      Dc.close();
      const tintEnd = Dc.tint(roll.grade);
      const cv = h("canvas", { class: "dice-gl", width: ww, height: wh, style: `left:${px(A.panel.window[0])};top:${px(A.panel.window[1])};width:${px(ww)};height:${px(wh)}` });
      const plaque = h("div", { class: "dice-plaque", style: `left:${px(A.plaque.at[0])};top:${px(A.plaque.at[1])};width:${px(A.plaque.size[0])};height:${px(A.plaque.size[1])};background-image:url(${url(A.plaque.file)})` });
      const line = h("div", { class: "dice-line", style: `top:${px(A.plaque.at[1] + A.plaque.size[1] + 2)}` });
      const panel = h("div", { class: "dice-panel", "data-dice": "rolling", style: `width:${px(A.panel.size[0])};height:${px(A.panel.size[1])};background-image:url(${url(A.panel.file)})` }, cv, plaque, line);
      const shield = h("div", { class: "dice-shield", title: "Tap to skip" });
      if (opts.noShield) document.body.append(panel); else document.body.append(shield, panel);
      if (opts.noShield && G.Touch && G.Touch.layout && G.Touch.layout()) { Dc.placePanel(panel); setTimeout(() => panel.isConnected && Dc.placePanel(panel), 300); }
      let done = false, raf = 0, r = null, plan = null, landed = false;
      const finish = () => { if (done) return; done = true; cancelAnimationFrame(raf); Dc.close(); resolve(roll); };
      const land = () => { if (landed) return; landed = true; cancelAnimationFrame(raf); Dc.sfx(opts.quiet ? "landQuiet" : "land");
        if (r && plan) { r.tint(tintEnd); r.frame(plan.frames[plan.frames.length - 1]); }
        panel.dataset.dice = "landed"; panel.dataset.face = String(roll.d); panel.dataset.tint = tintEnd;
        Dc.digits(plaque, roll.d, tintEnd);
        line.textContent = roll.label || `d20: ${roll.d}`; line.className = "dice-line " + (G.Checks.isSuccess(roll.grade) ? "good" : "bad");
        setTimeout(finish, opts.holdMs != null ? opts.holdMs : cf.holdMs); };
      const still = (why) => {   // Smudge's still: the lit empty box + the resting die showing the number (frame n - 1)
        if (landed || done) return; Dc.mode = "still"; Dc.stillWhy = why; cv.remove(); const R = A.rest;
        const box = h("div", { class: "dice-still", style: `left:${px(A.panel.window[0])};top:${px(A.panel.window[1])};width:${px(ww)};height:${px(wh)};background-image:url(${url(A.still.file)})` },
          h("div", { class: "dice-rest", style: `left:${px(R.offset[0])};top:${px(R.offset[1])};width:${px(R.frame[0])};height:${px(R.frame[1])};background-image:url(${url(R[tintEnd].file)});background-size:${px(R.frame[0] * 20)} ${px(R.frame[1])};background-position:${-(roll.d - 1) * R.frame[0] * k}px 0` }));
        panel.insertBefore(box, plaque); panel.classList.add("still"); land(); };
      shield.onclick = panel.onclick = () => { if (landed) finish(); else if (plan && r) land(); else still("skipped"); };
      Dc.cur = { panel, shield, get plan() { return plan; }, finish };
      if (Dc.reduced() || opts.still) return still("reduced motion");
      Dc.load().then(() => { if (done || landed) return;
        plan = Dc.plan(roll.d, opts.seed || ((Math.random() * 4294967295) >>> 0) || 1);
        return Dc.ensureRender(cv).then((rr) => { if (done || landed) return; r = rr; Dc.mode = "webgl";
          const speed = (Dc.phone() ? cf.phoneSpeed : 1) * (opts.speed || 1), maxB = (cf.sfx || {}).maxBounces || 3; let t0 = 0, bi = 0;
          const tick = (now) => { if (!t0) t0 = now; const i = Math.floor((now - t0) / 1000 * 60 * speed); if (i >= plan.frames.length) return land();
            while (bi < plan.bounces.length && plan.bounces[bi] <= i) { if (bi < maxB) Dc.sfx("bounce"); bi++; }   // a tumble per wall hit, up to maxBounces
            r.frame(plan.frames[i]); raf = requestAnimationFrame(tick); };
          raf = requestAnimationFrame(tick); });
      }).catch((e) => { Dc.error = String(e && e.message || e); still("error"); });
    });
  };
  // Phones: a lone scouting roll's big panel has no shield, so whatever it sits on can't be tapped while it shows (~2 s).
  // In landscape its top-left spot lay over the "You found something!" Continue button (a found secret is scouted at
  // once). Move it to the corner that covers the fewest buttons (modal / tutorial / battle first, then any button, map
  // node or room object); desktop and the shielded (holding) panel are unchanged.
  Dc.PANEL_AVOID = ".modal button, .modal [data-act], .tut-box, .tut-ring, .touch-ctl, .card-toast, .abl-btn, .battle-hud button, .tp-panel button";
  Dc.PANEL_SOFT = "button, .map-node, .site-obj";
  Dc.placePanel = function (el) {
    const vw = root.innerWidth, vh = root.innerHeight, r0 = el.getBoundingClientRect(), w = r0.width, hh = r0.height, top = Math.max(0, Math.min(46, vh - hh - 6));
    const rects = (sel, wt) => [...document.querySelectorAll(sel)].filter((e) => !el.contains(e)).map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height).map((r) => ({ r, wt }));
    const hit = rects(Dc.PANEL_AVOID, 100).concat(rects(Dc.PANEL_SOFT, 1));
    const over = (x, y) => hit.reduce((c, { r, wt }) => c + wt * Math.max(0, Math.min(x + w, r.right) - Math.max(x, r.left)) * Math.max(0, Math.min(y + hh, r.bottom) - Math.max(y, r.top)), 0);
    let best = null;
    for (const [x, y] of [[6, top], [vw - w - 6, top], [6, vh - hh - 6], [vw - w - 6, vh - hh - 6]]) { const c = over(x, y); if (!best || c < best.c) best = { x, y, c }; if (!c) break; }
    Object.assign(el.style, { left: Math.max(0, best.x) + "px", top: Math.max(0, best.y) + "px" });
  };
  // ---- the docked batch die (Vixie, Sep 30): a batch of rolls that don't hold the screen (scouting a new neighbourhood:
  // config.dice.queue.dockMin or more noHold rolls of one kind queued together; a lone one and every holding check use the big panel)
  // rolls a small d20 in a 64 px box (config.dice.art.mini) docked in a corner (bottom-left first) instead of the big panel,
  // with no shield: the frame lets taps through (pointer-events: none) and only the die's body takes a tap, which skips.
  // Same plan (its length and wall hits time the roll + the bounce sounds), same thunk / stinger rule (pump's opts.quiet:
  // the stinger on a batch's first die only), same speeds as the big panel. It tumbles (the ember loop) with a small hop,
  // then shows face n in the grade's tint. Placement skips anything it would cover: the tutorial box / ring, the pods
  // wheels' buttons, the phone battle buttons, the battlefield + its HUD (placement too), a toast; then, softer, map nodes
  // and room objects (the next corner). A fight starting dismisses it (Dc.dismissMini). Art: config.dice.art.mini =
  // Smudge's 64 px d20 strips (b7e795a); if its files fail to load, the big die's 40x41 resting strips stand in at 1x.
  // Always a whole-number scale, pixelated.
  Dc.miniArt = function (tint) {
    const A = C().art, M = A.mini || {}, size = M.size || 64;
    const r = Dc.mini64 !== false && M.rest && M.rest[tint] ? M.rest : A.rest, fr = r.frame || [size, size];
    return { file: r[tint].file, frame: fr, offset: r === M.rest ? r.offset : null, native: fr[0] === size && fr[1] === size };
  };
  Dc.checkMini64 = function () {   // once: do the configured strips load? (else the stand-in above)
    const M = C().art.mini || {}; if (Dc.mini64 != null || !M.rest || typeof Image === "undefined") return;
    Dc.mini64 = null; const im = new Image(); im.onload = () => { Dc.mini64 = true; }; im.onerror = () => { Dc.mini64 = false; }; im.src = url(M.rest.ember.file);
  };
  Dc.MINI_AVOID = ".tut-box, .tut-ring, .tut-arrow, .wheel-btn, .touch-ctl, .card-toast, #toast.show, .battle-canvas, .battle-hud";
  Dc.MINI_SOFT = ".map-node, .site-obj";   // taps it would block; weighed 1/100 of the above (a corner clear of both wins)
  Dc.MINI_SOFT_PHONE = ".sq-row, .exp-side .panel > h3, #topbar button";   // + phones: in portrait bottom-left sat on the Squad panel's title + first row
  Dc.placeMini = function (el) {
    const rects = (sel, wt) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height).map((r) => ({ r, wt }));
    const hit = rects(Dc.MINI_AVOID, 100).concat(rects(Dc.MINI_SOFT + (G.Touch && G.Touch.layout && G.Touch.layout() ? ", " + Dc.MINI_SOFT_PHONE : ""), 1));
    const over = (a) => hit.reduce((s, { r: b, wt }) => s + wt * Math.max(0, Math.min(a.right, b.right + 4) - Math.max(a.left, b.left - 4)) * Math.max(0, Math.min(a.bottom, b.bottom + 4) - Math.max(a.top, b.top - 4)), 0);
    let best = null;
    for (const spot of ["bl", "br", "tl", "tr"]) {
      el.dataset.spot = spot; const c = over(el.getBoundingClientRect());
      if (!best || c < best.c) best = { spot, c };
      if (!c) break;
    }
    el.dataset.spot = best.spot;
  };
  Dc.showMini = function (roll, opts) {
    return new Promise((resolve) => {
      const cf = C(), h = G.UI.h, M = cf.art.mini || {}, size = M.size || 64, tintEnd = Dc.tint(roll.grade), tint0 = (cf.tints || {}).rolling || "ember", body = M.body || [4, 1, 58, 60];
      Dc.close(); Dc.checkMini64();
      const face = h("div", { class: "dice-mini-face" });
      const hit = h("div", { class: "dice-mini-hit", role: "button", "aria-label": roll.label || `d20: ${roll.d}`, style: `left:${body[0]}px;top:${body[1]}px;width:${body[2] - body[0]}px;height:${body[3] - body[1]}px` });
      const el = h("div", { class: "dice-mini", "data-dice": "rolling", "data-kind": roll.kind || "" }, face, hit);
      el.style.width = el.style.height = size + "px";
      const setFace = (n, tint, lift) => {   // a rest frame: face n up
        const a = Dc.miniArt(tint), k = Math.max(1, Math.floor(Math.min(size / a.frame[0], size / a.frame[1]))), w = a.frame[0] * k, fh = a.frame[1] * k;
        const x = a.offset && k === 1 ? a.offset[0] : Math.floor((size - w) / 2), y = a.offset && k === 1 ? a.offset[1] : Math.floor((size - fh) / 2);
        face.style.cssText = `width:${w}px;height:${fh}px;left:${x}px;top:${y}px;background-image:url(${url(a.file)});background-size:${w * 20}px ${fh}px;background-position:${-(n - 1) * w}px 0;transform:translateY(${-(lift || 0)}px)`;
        el.dataset.art = a.native ? "64" : "stand-in";
      };
      const setTumble = (i, lift) => {   // the tumble loop (mini.tumble); none / stand-in: cycle the rest frames
        const T = M.tumble; if (!T || Dc.mini64 === false) return setFace(1 + (i * 7) % 20, tint0, lift);
        face.style.cssText = `width:${size}px;height:${size}px;left:0;top:0;background-image:url(${url(T.file)});background-size:${size * T.frames}px ${size}px;background-position:${-(i % T.frames) * size}px 0;transform:translateY(${-(lift || 0)}px)`;
        el.dataset.art = "64";
      };
      setTumble(0);
      document.body.append(el); Dc.placeMini(el);
      let done = false, raf = 0, landed = false, plan = null; const iv = setInterval(() => { if (!done) { if (document.querySelector("#screen .battle-wrap")) return Dc.dismissMini(); Dc.placeMini(el); } }, 250);
      const finish = () => { if (done) return; done = true; cancelAnimationFrame(raf); clearInterval(iv); Dc.close(); resolve(roll); };
      const land = () => { if (landed) return; landed = true; cancelAnimationFrame(raf); Dc.sfx(opts.quiet ? "landQuiet" : "land");
        setFace(roll.d, tintEnd); el.dataset.dice = "landed"; el.dataset.face = String(roll.d); el.dataset.tint = tintEnd;
        setTimeout(finish, opts.holdMs != null ? opts.holdMs : cf.holdMs); };
      hit.onclick = (e) => { e.stopPropagation(); if (landed) finish(); else land(); };
      Dc.cur = { panel: el, shield: null, get plan() { return plan; }, finish, mini: true };
      if (Dc.reduced() || opts.still) { Dc.mode = "still"; Dc.stillWhy = "reduced motion"; return land(); }
      Dc.load().then(() => { if (done || landed) return;
        plan = Dc.plan(roll.d, opts.seed || ((Math.random() * 4294967295) >>> 0) || 1); Dc.mode = "mini";
        const speed = (Dc.phone() ? cf.phoneSpeed : 1) * (opts.speed || 1), maxB = (cf.sfx || {}).maxBounces || 3, fps = (M.tumble && M.tumble.fps) || 12; let t0 = 0, bi = 0;
        const tick = (now) => { if (!t0) t0 = now; const i = Math.floor((now - t0) / 1000 * 60 * speed); if (i >= plan.frames.length) return land();
          while (bi < plan.bounces.length && plan.bounces[bi] <= i) { if (bi < maxB) Dc.sfx("bounce"); bi++; }
          setTumble(Math.floor((now - t0) / 1000 * fps * speed), Math.round(Math.max(0, plan.frames[i][1] - Dc.geo.inR) * 5));
          raf = requestAnimationFrame(tick); };
        raf = requestAnimationFrame(tick);
      }).catch((e) => { Dc.error = String(e && e.message || e); Dc.mode = "still"; Dc.stillWhy = "error"; land(); });
    });
  };
  // a fight is starting (G.BattleView.mount) / showing: the docked die goes now, with the rest of its batch (they only
  // show a result the map already has; nothing waits on them)
  Dc.dismissMini = function () {
    const had = !!(Dc.cur && Dc.cur.mini) || Dc.q.some((x) => x.batch);
    Dc.q = Dc.q.filter((x) => !x.batch);
    if (Dc.cur && Dc.cur.mini) Dc.cur.finish();
    return had;
  };
  Dc.close = function () {
    if (typeof document === "undefined") return;
    // SP-118: pull the shared GL canvas out before removing the panel so the context stays alive for the next roll.
    if (Dc._gl && Dc._gl.canvas && Dc._gl.canvas.parentNode) Dc._gl.canvas.remove();
    for (const el of document.querySelectorAll(".dice-panel, .dice-shield, .dice-mini")) el.remove();
    Dc.cur = null;
  };
})(typeof window !== "undefined" ? window : globalThis);
