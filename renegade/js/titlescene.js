// Slice 4 §G: the title backdrop, a low-poly Hushwood camp at night in hand-written WebGL (no three.js). The mesh is
// built from Smudge's ui/login/login_scene.json (the same scene her software rasteriser drew the stills and mockups
// from: assets/src/login_scene.py): flat-shaded faces, per-material colour ramps (cold = moon, warm = fire), a 4x4
// Bayer dither into a tiny framebuffer (640x360-ish, phones 216 wide), shown x2+ with nearest filtering.
// G.TitleScene.build(json) is pure (headless-tested); G.TitleScene.start(canvas, json) renders until stop().
(function (root) {
  const G = root.G;
  const TS = G.TitleScene = { running: false };
  const CFG = () => DATA.title.scene;
  // ---- small vector helpers ----
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  TS.BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  // ---- the mesh (a port of login_scene.build_scene; positions from the json, the small random details from our rng) ----
  TS.build = function (S) {
    const rng = G.Util.makeRng(CFG().rngSeed), R = () => rng();
    const matNames = Object.keys(S.colours.materials), MID = {}; matNames.forEach((n, i) => { MID[n] = i; });
    const P = [], N = [], C = [], A = [];   // per vertex: position, face normal, face centre, [mat, sh, jit, 0]
    let jit = 0;
    const tri = (a, b, c, mat, center, sh) => {
      let n = cross(sub(b, a), sub(c, a));
      if (center && dot(n, sub(mul(add(add(a, b), c), 1 / 3), center)) < 0) { const t = b; b = c; c = t; n = mul(n, -1); }
      n = norm(n); const ctr = mul(add(add(a, b), c), 1 / 3), m = MID[mat];
      if (m === undefined) throw new Error("title scene: no material " + mat);
      if (/^ground_/.test(mat) && n[1] < 0) n = mul(n, -1);
      for (const v of [a, b, c]) { P.push(v[0], v[1], v[2]); N.push(n[0], n[1], n[2]); C.push(ctr[0], ctr[1], ctr[2]); A.push(m, sh || 0, jit, 0); }
    };
    const quad = (a, b, c, d, mat, center, sh) => { tri(a, b, c, mat, center, sh); tri(a, c, d, mat, center, sh); };
    const ring = (cx, cz, y, r, n, rot) => { const o = []; for (let i = 0; i < n; i++) { const t = rot + 2 * Math.PI * i / n; o.push([cx + r * Math.cos(t), y, cz + r * Math.sin(t)]); } return o; };
    const prism = (cx, cz, r, y0, y1, n, mat, rot, o) => {
      o = o || {}; const lo = ring(cx, cz, y0, r, n, rot || 0), hi = ring(cx, cz, y1, r, n, rot || 0), ctr = [cx, (y0 + y1) / 2, cz];
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad(lo[i], lo[j], hi[j], hi[i], mat, ctr, i % 2); }
      if (o.tip != null) { const ap = [cx, y1 + o.tip, cz]; for (let i = 0; i < n; i++) tri(hi[i], hi[(i + 1) % n], ap, o.tipmat || mat, [cx, y1 + o.tip * 0.3, cz], i % 2); }
      else if (o.cap !== false) { const c = [cx, y1, cz]; for (let i = 0; i < n; i++) tri(hi[i], hi[(i + 1) % n], c, mat, [cx, y1 - 1, cz]); }
    };
    const cone = (cx, cz, y0, r, h, n, mat, rot, base, lean) => {
      const b = ring(cx, cz, y0, r, n, rot || 0), ln = lean || [0, 0], ap = [cx + ln[0], y0 + h, cz + ln[1]], ctr = [cx, y0 + h * 0.3, cz];
      for (let i = 0; i < n; i++) tri(b[i], b[(i + 1) % n], ap, mat, ctr, i % 2);
      if (base !== false) { const c = [cx, y0, cz]; for (let i = 0; i < n; i++) tri(b[i], b[(i + 1) % n], c, mat, [cx, y0 + 1, cz]); }
    };
    const beam = (p0, p1, r, n, mat, rot) => {
      const ax = norm(sub(p1, p0)), up = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], u = norm(cross(ax, up)), v = cross(ax, u);
      const rg = (p) => { const o = []; for (let i = 0; i < n; i++) { const t = (rot || 0) + 2 * Math.PI * i / n; o.push(add(p, add(mul(u, r * Math.cos(t)), mul(v, r * Math.sin(t))))); } return o; };
      const a = rg(p0), b = rg(p1), ctr = mul(add(p0, p1), 0.5);
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad(a[i], a[j], b[j], b[i], mat, ctr, i % 2); }
      for (const [pts, e] of [[a, p0], [b, p1]]) for (let i = 0; i < n; i++) tri(pts[i], pts[(i + 1) % n], e, mat, ctr);
    };
    const box = (cx, cy, cz, sx, sy, sz, mat, rot, facemat) => {
      const c = Math.cos(rot || 0), s = Math.sin(rot || 0), Pt = (x, y, z) => [cx + x * c - z * s, cy + y, cz + x * s + z * c];
      const hx = sx / 2, hy = sy / 2, hz = sz / 2, v = [];
      for (const x of [-hx, hx]) for (const y of [-hy, hy]) for (const z of [-hz, hz]) v.push(Pt(x, y, z));
      const F = { "-x": [0, 1, 3, 2], "+x": [4, 6, 7, 5], "-y": [0, 4, 5, 1], "+y": [2, 3, 7, 6], "-z": [0, 2, 6, 4], "+z": [1, 5, 7, 3] };
      for (const k in F) { const f = F[k]; quad(v[f[0]], v[f[1]], v[f[2]], v[f[3]], (facemat || {})[k] || mat, [cx, cy, cz], k[1] === "x" ? 1 : 0); }
    };
    const rock = (cx, cz, r) => {
      const n = 6, rot = R() * 6.28, mid = [];
      for (let i = 0; i < n; i++) { const t = rot + i * 2 * Math.PI / n; mid.push([cx + r * (0.8 + 0.4 * R()) * Math.cos(t), r * (0.25 + 0.2 * R()), cz + r * (0.8 + 0.4 * R()) * Math.sin(t)]); }
      const top = [cx + r * 0.2 * (R() - 0.5), r * (0.8 + 0.3 * R()), cz + r * 0.2 * (R() - 0.5)], ctr = [cx, r * 0.35, cz];
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(mid[i], mid[j], top, "stone", ctr, i % 2); quad([mid[i][0], 0, mid[i][2]], [mid[j][0], 0, mid[j][2]], mid[j], mid[i], "stone", ctr, i % 2); }
    };
    const gh = (x, z) => { const r = Math.hypot(x, z); if (r < 14) return 0; const t = Math.min(1, (r - 14) / 40); return 0.35 * Math.sin(x * 0.31) * Math.cos(z * 0.27) * t + t * t * 3.0; };
    // ground: 1 m cells inside r 16, 2.5 m beyond, out to r 60 (path to the east gate, camp dirt, the wild outside)
    const cell = (x0, z0, s) => {
      const cx = x0 + s / 2, cz = z0 + s / 2, r = Math.hypot(cx, cz), path = Math.abs(cz) < 1.4 && cx > 1.8 && r < 13.5;
      const mat = path ? "ground_path" : r < 13.2 ? "ground_camp" : "ground_wild", p = [[x0, z0], [x0 + s, z0], [x0 + s, z0 + s], [x0, z0 + s]].map(([x, z]) => [x, gh(x, z), z]);
      tri(p[0], p[3], p[2], mat); tri(p[0], p[2], p[1], mat);
    };
    for (let x0 = -16; x0 < 16; x0++) for (let z0 = -16; z0 < 16; z0++) if (Math.hypot(x0 + 0.5, z0 + 0.5) < 16.5) cell(x0, z0, 1);
    for (let i = -24; i < 24; i++) for (let j = -24; j < 24; j++) { const s = 2.5, x0 = i * s, z0 = j * s, r = Math.hypot(x0 + s / 2, z0 + s / 2);
      if (r > 16.2 && r < 62 && ![x0, z0, x0 + s, z0 + s].every((v) => Math.abs(v) < 16)) cell(x0, z0, s); }
    // bonfire
    const F = S.fire;
    for (const [x, z, rr] of F.stone_ring.stones) rock(x, z, rr);
    F.logs.list.forEach(([p0, p1], i) => beam(p0, p1, F.logs.radius, F.logs.sides, "log_char", i * 2 * Math.PI / 7 + 0.4));
    cone(0, 0, 0, F.coals.radius, F.coals.height, F.coals.sides, "coals", 0, false);
    for (const f of F.flames) cone(0, 0, 0.1, f.base_radius, f.height, f.sides, f.mat, f.rot, false, f.apex_lean);
    F.tongues.forEach(([x, z, r, h], i) => { const a = Math.atan2(z, x); cone(x, z, 0.15, r, h, 4, "flame_mid", a, false, [0.1 * Math.cos(a), 0.1 * Math.sin(a)]); });
    // palisade: stakes (3-sided prisms + tips), two rails, the east gate with torches and a lintel
    const PA = S.palisade, Rw = PA.radius, g0 = PA.gate_east_deg[0] * Math.PI / 180, g1 = PA.gate_east_deg[1] * Math.PI / 180;
    for (const [x, z, h, r, rot] of PA.stakes) { jit = (R() - 0.5) * 0.14; prism(x, z, r, -0.2, h, 3, "stake", rot, { tip: 0.55 + 0.2 * R(), tipmat: "stake_tip" }); jit = 0; }
    const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    for (const gy of PA.rails.heights) { const k = PA.rails.segments; for (let j = 0; j < k; j++) { const a0 = 2 * Math.PI * j / k, a1 = 2 * Math.PI * (j + 1) / k;
      if ([a0, a1].some((a) => g0 - 0.05 < wrap(a) && wrap(a) < g1 + 0.05)) continue; const ri = Rw - PA.rails.inset;
      beam([ri * Math.cos(a0), gy, ri * Math.sin(a0)], [ri * Math.cos(a1), gy, ri * Math.sin(a1)], PA.rails.radius, 3, "rail"); } }
    for (const a of [g0, g1]) { const x = (Rw + 0.1) * Math.cos(a), z = (Rw + 0.1) * Math.sin(a); prism(x, z, 0.42, -0.2, 4.6, 4, "stake", a, { tip: 0.4, tipmat: "stake_tip" });
      const tx = (Rw - 0.5) * Math.cos(a), tz = (Rw - 0.5) * Math.sin(a); beam([tx, 2.4, tz], [tx * 0.99, 3.1, tz * 0.99], 0.05, 3, "beam"); cone(tx * 0.99, tz * 0.99, 3.1, 0.12, 0.42, 4, "torch", 0, false); }
    { const gp = PA.gate.posts; beam([gp[0].post[0], PA.gate.lintel_y, gp[0].post[1]], [gp[1].post[0], PA.gate.lintel_y, gp[1].post[1]], 0.16, 4, "beam"); }
    // watch tower
    { const T = S.tower, [tx, tz] = T.pos, sp = T.posts.spacing / 2;
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) prism(tx + dx * sp, tz + dz * sp, 0.16, 0, T.posts.height, 4, "stake", 0.78);
      box(tx, T.platform_y, tz, 2.4, 0.22, 2.4, "wall"); box(tx, 5.05, tz, T.parapet[0], T.parapet[1], T.parapet[2], "wall"); cone(tx, tz, 5.4, T.roof.radius, T.roof.height, 4, "roof", Math.PI / 4); }
    // longhouse (long side to the fire; lit door + 2 windows)
    { const Lh = S.longhouse, [lx, lz] = Lh.pos, lr = Lh.rot_deg * Math.PI / 180, c = Math.cos(lr), s = Math.sin(lr), Pt = (x, y, z) => [lx + x * c - z * s, y, lz + x * s + z * c];
      const hx = Lh.length / 2, hz = Lh.width / 2, wh = Lh.wall_h, rd = Lh.ridge_h, ov = Lh.eave_overhang, ctr = Pt(0, 1.5, 0);
      box(lx, wh / 2, lz, Lh.length, wh, Lh.width, "wall", lr);
      const ea = Pt(-hx - 0.3, wh - 0.1, hz + ov), eb = Pt(hx + 0.3, wh - 0.1, hz + ov), ra = Pt(-hx - 0.3, rd, 0), rb = Pt(hx + 0.3, rd, 0), ea2 = Pt(-hx - 0.3, wh - 0.1, -hz - ov), eb2 = Pt(hx + 0.3, wh - 0.1, -hz - ov);
      quad(ea, eb, rb, ra, "roof", ctr, 0); quad(ea2, eb2, rb, ra, "roof", ctr, 1);
      for (const sx of [-1, 1]) { tri(Pt(sx * hx, wh, hz), Pt(sx * hx, wh, -hz), Pt(sx * hx, rd - 0.2, 0), "wall", ctr);
        for (const sz of [-1, 1]) beam(Pt(sx * (hx + 0.3), wh + 0.2, sz * (hz + 0.2)), Pt(sx * (hx + 0.3), rd + 1.0, -sz * 0.9), 0.1, 3, "beam"); }
      beam(Pt(-hx - 0.4, rd + 0.05, 0), Pt(hx + 0.4, rd + 0.05, 0), 0.13, 3, "beam");
      quad(Pt(-0.5, 0, hz + 0.02), Pt(0.5, 0, hz + 0.02), Pt(0.5, 1.45, hz + 0.02), Pt(-0.5, 1.45, hz + 0.02), Lh.door.mat, ctr);
      for (const w of Lh.windows) { const wx = w.local[0]; quad(Pt(wx - 0.3, 0.8, hz + 0.02), Pt(wx + 0.3, 0.8, hz + 0.02), Pt(wx + 0.3, 1.2, hz + 0.02), Pt(wx - 0.3, 1.2, hz + 0.02), "window_light", ctr); }
      for (const bx of [0.9, -0.9]) { const q = Pt(bx, 0.9, hz + 0.3); box(q[0], 0.9, q[2], 0.12, 1.8, 0.12, "beam", lr); }
      const sm = Pt(1.8, rd - 0.3, 0); box(sm[0], rd + 0.1, sm[2], 0.6, 0.5, 0.6, "wall", lr);
      for (const [k, [dy, dz]] of [[0.18, -0.3], [0.18, 0.05], [0.18, 0.4], [0.5, -0.12], [0.5, 0.23], [0.82, 0.05]].entries()) beam(Pt(4.2, dy, hz + 1.2 + dz), Pt(5.6, dy, hz + 1.2 + dz), 0.17, 5, "log", k); }
    // props: benches, stumps, crate + CRT terminal, rifle rack (the woodpile is by the longhouse above)
    for (const p of S.props) {
      if (p.kind === "log bench") beam(p.p0, p.p1, p.radius, p.sides, "log", 0.3);
      else if (p.kind === "stump") prism(p.pos[0], p.pos[1], p.radius, 0, p.h, p.sides, "log");
      else if (/terminal/.test(p.kind)) { const [cx, cz] = p.pos, tr = p.rot; box(cx, 0.4, cz, p.crate[0], p.crate[1], p.crate[2], "crate", tr); box(cx - 0.05, 1.05, cz + 0.05, p.terminal[0], p.terminal[1], p.terminal[2], "terminal", tr);
        const c5 = Math.cos(tr), s5 = Math.sin(tr), sp = (x, y, z) => [cx - 0.05 + x * c5 - z * s5, y, cz + 0.05 + x * s5 + z * c5];
        quad(sp(-0.29, 0.9, -0.18), sp(-0.29, 0.9, 0.18), sp(-0.29, 1.22, 0.18), sp(-0.29, 1.22, -0.18), "screen", [cx, 1.05, cz]); }
      else if (/rifle rack/.test(p.kind)) { for (let k = 0; k < 3; k++) { const rx = -1.6 + k * 0.35; beam([rx, 0, -3.9], [rx + 0.1, 1.15, -3.6], 0.05, 3, "iron"); } beam([-1.8, 0.95, -3.62], [-0.7, 0.95, -3.62], 0.06, 3, "log"); }
    }
    // pines (stacked cones), the far ring, the hills
    for (const p of S.pines) { const [x, z] = p.pos, y0 = gh(x, z), mat = p.far ? "pine_far" : "pine";
      prism(x, z, 0.22, y0 - 0.2, y0 + p.h * 0.25, 5, "trunk", 0, { cap: false });
      for (const [ty, tr, th] of p.tiers) cone(x, z, y0 + ty, tr, th, p.far ? 6 : 7, mat, R() * 6.28); }
    for (const [x, z, hh] of S.hills) cone(x, z, 0, 26 + R() * 12, hh, 5, "hill", R() * 6, false);
    return { pos: new Float32Array(P), nrm: new Float32Array(N), ctr: new Float32Array(C), attr: new Float32Array(A), count: P.length / 3, triangles: P.length / 9, mats: matNames, MID };
  };
  // embers (world pos + colour index at time t) and stars (fixed directions), deterministic
  TS.fx = function (n, t) {
    const rng = G.Util.makeRng(5), out = [];
    for (let i = 0; i < n; i++) { const life = 3.2 + rng() * 2.5, ph = ((t / life + rng()) % 1 + 1) % 1, a = rng() * 6.28 + ph * 2.5, r = 0.15 + ph * (0.4 + rng() * 0.8), y = 1.2 + ph * (4.5 + rng() * 3.0), d = ph * ph * 1.2;
      out.push([r * Math.cos(a) + d * 0.6, y, r * Math.sin(a) - d * 0.2, Math.min(4, Math.floor(ph * 5))]); }
    return out;
  };
  TS.stars = function (n) { const rng = G.Util.makeRng(77), out = []; for (let i = 0; i < n; i++) { const g = () => Math.sqrt(-2 * Math.log(rng() || 1e-9)) * Math.cos(2 * Math.PI * rng()); const v = norm([g(), g(), g()]); if (v[1] > 0.12) out.push(v); } return out; };
  // camera at time t (the 70 s drift + bob); portrait = the phone framing
  TS.camera = function (S, t, portrait) {
    const K = S.camera, th = K.arc_rad * Math.sin(2 * Math.PI * t / K.period_s), h = K.height + K.bob_m * Math.sin(2 * Math.PI * t / K.bob_period_s);
    const eye = [K.radius * Math.sin(th), h, K.radius * Math.cos(th)], tgt = [-Math.sin(th) * K.look_ahead, portrait ? K.target_y_portrait : K.target_y, -Math.cos(th) * K.look_ahead];
    const fwd = norm(sub(tgt, eye)), right = norm(cross(fwd, [0, 1, 0])), up = cross(right, fwd);
    return { eye, fwd, right, up, f: 1 / Math.tan((portrait ? K.vfov_portrait : K.vfov_landscape) * Math.PI / 360), near: K.near, far: K.far };
  };
  // cheap smooth noise in [-1, 1]
  const noise = (x) => (Math.sin(x * 1.7) * 0.5 + Math.sin(x * 3.1 + 1.3) * 0.3 + Math.sin(x * 5.3 + 2.1) * 0.2);

  // ---- WebGL ----
  const VS = `
attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aCtr; attribute vec4 aAttr;
uniform mat4 uVP; uniform vec3 uEye; uniform vec3 uMoon; uniform vec4 uLight; uniform vec4 uMat[32]; uniform vec4 uFx[32];
varying float vLev; varying float vWarm; varying float vMat; varying float vSh; varying float vFront; varying float vEmitK; varying vec3 vM;
void main() {
  int m = int(aAttr.x + 0.5); vec4 M = uMat[0]; vec4 X = uFx[0];
  for (int i = 0; i < 32; i++) { if (i == m) { M = uMat[i]; X = uFx[i]; } }
  vec3 p = aPos;
  if (M.z > 0.5 && X.x != 1.0) { float t = max(p.y - 0.1, 0.0); p.y = 0.1 + t * X.x; p.xz += X.yz * t; }
  if (M.w > 0.0) p += normalize(uEye - p) * M.w;
  vec3 n = aNrm; float moon = clamp(dot(n, uMoon), 0.0, 1.0);
  vec3 d = vec3(0.0, 1.0, 0.0) - aCtr; float dist = length(d); float ndl = clamp(dot(n, d) / (dist + 1e-6), -1.0, 1.0);
  float fire = uLight.z / (1.0 + pow(dist / uLight.w, 2.0)) * clamp(ndl * 0.8 + 0.2, 0.0, 1.0);
  float fog = clamp(1.0 - max(length(aCtr.xz) - 20.0, 0.0) / 60.0, 0.25, 1.0);
  float cold = (uLight.x + uLight.y * moon) * fog, warm = uLight.x + uLight.y * moon * 0.5 + fire;
  vWarm = fire > uLight.y * moon * 0.9 ? 1.0 : 0.0;
  vLev = (vWarm > 0.5 ? warm : cold) - (aAttr.y * 0.04 - aAttr.z);
  vMat = aAttr.x; vSh = aAttr.y; vEmitK = X.w; vM = M.xyz;
  vFront = dot(n, aCtr - uEye) < 0.0 ? 1.0 : 0.0;
  gl_Position = uVP * vec4(p, 1.0);
}`;
  const FS = `
precision mediump float;
uniform sampler2D uRamp; uniform float uFlip; uniform float uNM; uniform float uBayer[16];
varying float vLev; varying float vWarm; varying float vMat; varying float vSh; varying float vFront; varying float vEmitK; varying vec3 vM;
float bayer() { int x = int(mod(gl_FragCoord.x - 0.5, 4.0)), y = int(mod(gl_FragCoord.y - 0.5, 4.0)); int k = y * 4 + x; float b = 0.0;
  for (int i = 0; i < 16; i++) { if (i == k) b = uBayer[i]; } return b; }
void main() {
  if (vFront < 0.5) discard;
  vec3 M = vM;   // cold / warm ramp lengths, emissive (from the vertex shader: no uniform shared between the stages)
  float row = (vMat + 0.5) / uNM;
  if (M.z > 0.5) { float k = mod(vSh + uFlip, 2.0); vec3 c = texture2D(uRamp, vec2((k + 0.5) / 16.0, row)).rgb; gl_FragColor = vec4(c * vEmitK, 1.0); return; }
  float n = vWarm > 0.5 ? M.y : M.x; float f = clamp(vLev / (vWarm > 0.5 ? 1.6 : 0.5), 0.0, 0.9999) * n;
  float i0 = floor(f); if (f - i0 > bayer()) i0 += 1.0; i0 = min(i0, n - 1.0);
  gl_FragColor = vec4(texture2D(uRamp, vec2((i0 + (vWarm > 0.5 ? 8.0 : 0.0) + 0.5) / 16.0, row)).rgb, 1.0);
}`;
  const SKY_VS = `attribute vec2 aP; varying vec2 vP; void main() { vP = aP; gl_Position = vec4(aP, 0.9999, 1.0); }`;
  const SKY_FS = `
precision mediump float;
uniform vec3 uF; uniform vec3 uR; uniform vec3 uU; uniform float uAsp; uniform float uFf; uniform vec3 uMoon; uniform float uBayer[16];
uniform vec3 cZen; uniform vec3 cUp; uniform vec3 cMid; uniform vec3 cHor; uniform vec3 cMoon; uniform vec3 cShade; uniform vec3 cHalo;
varying vec2 vP;
float bayer() { int x = int(mod(gl_FragCoord.x - 0.5, 4.0)), y = int(mod(gl_FragCoord.y - 0.5, 4.0)); int k = y * 4 + x; float b = 0.0;
  for (int i = 0; i < 16; i++) { if (i == k) b = uBayer[i]; } return b; }
void main() {
  vec3 D = normalize(uF + vP.x * uAsp / uFf * uR + vP.y / uFf * uU);
  float el = degrees(asin(clamp(D.y, -1.0, 1.0))), B = bayer(); vec3 c = cZen;
  if (el < 2.0) c = cHor; else if (el < 9.0) c = ((el - 2.0) / 7.0 < B) ? cHor : cMid; else if (el < 22.0) c = ((el - 9.0) / 13.0 < B) ? cMid : cUp; else if (el < 40.0) c = ((el - 22.0) / 18.0 < B) ? cUp : cZen;
  float ang = degrees(acos(clamp(dot(D, uMoon), -1.0, 1.0)));
  if (ang < 9.0 && ang >= 2.6 && (9.0 - ang) / 6.4 * 0.6 > B) c = cHalo;
  if (ang < 2.6) { c = cMoon; float lx = dot(D, uR) - dot(uMoon, uR), ly = dot(D, uU) - dot(uMoon, uU); if (lx * 0.7 - ly * 0.7 > 0.018) c = cShade; }
  gl_FragColor = vec4(c / 255.0, 1.0);
}`;
  const PT_VS = `attribute vec3 aPos; attribute vec3 aCol; uniform mat4 uVP; uniform vec3 uEye; uniform float uPull; varying vec3 vC;
void main() { vC = aCol; vec3 p = aPos + normalize(uEye - aPos) * uPull; gl_Position = uVP * vec4(p, 1.0); gl_PointSize = 1.0; }`;
  const PT_FS = `precision mediump float; varying vec3 vC; void main() { gl_FragColor = vec4(vC / 255.0, 1.0); }`;

  function prog(gl, vs, fs) {
    const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p;
  }
  function mat4VP(cam, asp) {
    // view (right-handed, looking down -z) then a GL perspective with vfov from cam.f
    const r = cam.right, u = cam.up, f = cam.fwd, e = cam.eye, n = cam.near, fa = cam.far;
    const V = [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, e), -dot(u, e), dot(f, e), 1];
    const Pm = [cam.f / asp, 0, 0, 0, 0, cam.f, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0];
    const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) { let s = 0; for (let k = 0; k < 4; k++) s += Pm[k * 4 + rr] * V[c * 4 + k]; o[c * 4 + rr] = s; } return o;
  }
  // start rendering into `canvas` (sized by the caller's resize()); returns false if WebGL isn't available
  TS.start = function (canvas, S, opts) {
    opts = opts || {};
    const gl = canvas.getContext("webgl", { antialias: false, depth: true, preserveDrawingBuffer: !!opts.preserve, powerPreference: "low-power" }) || canvas.getContext("experimental-webgl");
    if (!gl) return false;
    const mesh = TS.build(S), MS = S.colours.materials, nM = mesh.mats.length, C = CFG();
    const p = prog(gl, VS, FS), ps = prog(gl, SKY_VS, SKY_FS), pp = prog(gl, PT_VS, PT_FS);
    const buf = (data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
    const B = { pos: buf(mesh.pos), nrm: buf(mesh.nrm), ctr: buf(mesh.ctr), attr: buf(mesh.attr), sky: buf(new Float32Array([-1, -1, 3, -1, -1, 3])), pts: gl.createBuffer() };
    // ramps: row per material; cold 0-7, warm 8-15 (emissive: its 2 shades at 0-1)
    const tex = new Uint8Array(16 * nM * 4), mat = new Float32Array(32 * 4);
    mesh.mats.forEach((name, i) => { const m = MS[name], put = (x, h) => { const c = hex(h); tex.set([c[0], c[1], c[2], 255], (i * 16 + x) * 4); };
      if (m.emit) { m.emit.forEach((h, k) => put(k, h)); mat.set([2, 2, 1, (C.zbias || {})[name] || 0], i * 4); }
      else { m.cold.forEach((h, k) => put(k, h)); m.warm.forEach((h, k) => put(8 + k, h)); mat.set([m.cold.length, m.warm.length, 0, (C.zbias || {})[name] || 0], i * 4); } });
    const t0 = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t0); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 16, nM, 0, gl.RGBA, gl.UNSIGNED_BYTE, tex);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
    const U = (pr, n) => gl.getUniformLocation(pr, n), L = S.lighting, moon = norm(L.moon_dir), SK = S.colours.sky, FX = S.colours.fx;
    const flames = ["flame_outer", "flame_mid", "flame_core", "flame_tip"].map((n) => mesh.MID[n]), flick = ["screen", "torch"].map((n) => mesh.MID[n]);
    const stars = TS.stars(C.stars), ember = FX.ember.map(hex), owl = hex(FX.owl_eye), starC = hex(SK.star), starB = hex(SK.star_bright);
    const state = { gl, raf: 0, last: 0, t: 0, stop: false, frames: 0, mesh };
    const draw = (tSec) => {
      const W = canvas.width, H = canvas.height, portrait = H > W, cam = TS.camera(S, tSec, portrait), asp = W / H, VP = mat4VP(cam, asp);
      gl.viewport(0, 0, W, H); gl.clearColor(0.047, 0.051, 0.063, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // sky
      gl.disable(gl.DEPTH_TEST); gl.useProgram(ps); gl.bindBuffer(gl.ARRAY_BUFFER, B.sky); const la = gl.getAttribLocation(ps, "aP"); gl.enableVertexAttribArray(la); gl.vertexAttribPointer(la, 2, gl.FLOAT, false, 0, 0);
      gl.uniform3fv(U(ps, "uF"), cam.fwd); gl.uniform3fv(U(ps, "uR"), cam.right); gl.uniform3fv(U(ps, "uU"), cam.up); gl.uniform1f(U(ps, "uAsp"), asp); gl.uniform1f(U(ps, "uFf"), cam.f); gl.uniform3fv(U(ps, "uMoon"), moon);
      gl.uniform1fv(U(ps, "uBayer"), TS.BAYER); for (const [u, k] of [["cZen", "zenith"], ["cUp", "upper"], ["cMid", "mid"], ["cHor", "horizon"], ["cMoon", "moon"], ["cShade", "moon_shade"], ["cHalo", "moon_halo"]]) gl.uniform3fv(U(ps, u), hex(SK[k]));
      gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disableVertexAttribArray(la);
      // stars (behind everything: drawn at 200 m with the depth test on, so the hills and trees cover them)
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
      const pts = [];
      stars.forEach((s, k) => { const ang = Math.acos(Math.max(-1, Math.min(1, dot(s, moon)))) * 180 / Math.PI; if (ang < 9) return; const c = k % 7 === 0 ? starB : starC; pts.push(cam.eye[0] + s[0] * 200, cam.eye[1] + s[1] * 200, cam.eye[2] + s[2] * 200, c[0], c[1], c[2]); });
      const nStars = pts.length / 6;
      // the scene
      gl.useProgram(p);
      for (const [nm, b, sz] of [["aPos", B.pos, 3], ["aNrm", B.nrm, 3], ["aCtr", B.ctr, 3], ["aAttr", B.attr, 4]]) { const l = gl.getAttribLocation(p, nm); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, sz, gl.FLOAT, false, 0, 0); }
      const fx = new Float32Array(32 * 4); for (let i = 0; i < 32; i++) fx.set([1, 0, 0, 1], i * 4);
      flames.forEach((m, i) => { if (m == null) return; fx.set([1 + C.flameScale * noise(tSec * 3 + i * 1.9), C.flameJitterM * noise(tSec * 2.3 + i) / 2.25, C.flameJitterM * noise(tSec * 2.9 + i * 2.7) / 2.25, 1], m * 4); });
      flick.forEach((m, i) => { if (m != null) fx[m * 4 + 3] = 0.95 + 0.05 * noise(tSec * 9 + i * 4); });
      gl.uniformMatrix4fv(U(p, "uVP"), false, VP); gl.uniform3fv(U(p, "uEye"), cam.eye); gl.uniform3fv(U(p, "uMoon"), moon);
      gl.uniform4f(U(p, "uLight"), L.ambient, L.moon, L.fire * (1 - C.fireFlicker + C.fireFlicker * (0.5 + 0.5 * noise(tSec * C.fireFlickerHz))), L.fire_range);
      gl.uniform4fv(U(p, "uMat"), mat); gl.uniform4fv(U(p, "uFx"), fx); gl.uniform1f(U(p, "uFlip"), Math.floor(tSec * 1000 / C.flameShadeMs) % 2); gl.uniform1f(U(p, "uNM"), nM); gl.uniform1fv(U(p, "uBayer"), TS.BAYER);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t0); gl.uniform1i(U(p, "uRamp"), 0);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
      for (const nm of ["aPos", "aNrm", "aCtr", "aAttr"]) gl.disableVertexAttribArray(gl.getAttribLocation(p, nm));
      // points: stars, embers, owl eyes (owls pulled 0.6 m toward the camera: they sit on the needles)
      const em = TS.fx(C.embers, tSec), ep = [];
      for (const e of em) { const c = ember[e[3]]; ep.push(e[0], e[1], e[2], c[0], c[1], c[2]); }
      const op = [];
      for (const o of S.owls) { const b = o.blink, ph = ((tSec - b.offset_s) % b.period_s + b.period_s) % b.period_s; if (ph < b.closed_ms / 1000) continue;
        for (const sgn of [-1, 1]) op.push(o.pos[0] + cam.right[0] * o.spacing / 2 * sgn, o.pos[1] + cam.right[1] * o.spacing / 2 * sgn, o.pos[2] + cam.right[2] * o.spacing / 2 * sgn, owl[0], owl[1], owl[2]); }
      gl.useProgram(pp); gl.uniformMatrix4fv(U(pp, "uVP"), false, VP); gl.uniform3fv(U(pp, "uEye"), cam.eye);
      const all = new Float32Array(pts.concat(ep, op)); gl.bindBuffer(gl.ARRAY_BUFFER, B.pts); gl.bufferData(gl.ARRAY_BUFFER, all, gl.DYNAMIC_DRAW);
      const lp = gl.getAttribLocation(pp, "aPos"), lc = gl.getAttribLocation(pp, "aCol"); gl.enableVertexAttribArray(lp); gl.enableVertexAttribArray(lc);
      gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(lc, 3, gl.FLOAT, false, 24, 12);
      gl.uniform1f(U(pp, "uPull"), 0); gl.drawArrays(gl.POINTS, 0, nStars + ep.length / 6);
      gl.uniform1f(U(pp, "uPull"), 0.6); gl.drawArrays(gl.POINTS, nStars + ep.length / 6, op.length / 6);
      gl.disableVertexAttribArray(lp); gl.disableVertexAttribArray(lc);
      state.frames++;
    };
    const fps = opts.fps || 60, t00 = performance.now() - (opts.t0 || 0) * 1000;
    const loop = (now) => { if (state.stop) return; state.raf = requestAnimationFrame(loop); if (now - state.last < 1000 / fps - 2) return; state.last = now; state.t = (now - t00) / 1000; try { draw(state.t); } catch (e) { state.stop = true; if (opts.onError) opts.onError(e); } };
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); state.stop = true; if (opts.onError) opts.onError(new Error("context lost")); });
    draw(opts.t0 || 0);
    if (!opts.still) state.raf = requestAnimationFrame(loop);
    TS.cur = state; TS.running = !opts.still;
    return state;
  };
  TS.stop = function () { const s = TS.cur; if (!s) return; s.stop = true; cancelAnimationFrame(s.raf); TS.running = false;
    const ext = s.gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); TS.cur = null; };
})(typeof window !== "undefined" ? window : globalThis);
