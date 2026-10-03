// Area prototype: click-to-move in the MegaMart back office (proto-area-click-to-move.md, Vixie Oct 3 2026) [DRAFT].
// Standalone: plain canvas + DOM, no libraries, no game code, no save. Placeholder shapes (Smudge's art is phase 2).
// Look: "chunky" (THE look, Megan Oct 3) renders at half resolution with nearest upscaling and 4 light bands (dithered
// edges). "smooth" (full device resolution, smooth light falloff) is for testing only: ?look=smooth starts smooth, and the
// Chunky / Smooth toggle button only shows with ?debug.
(function () {
  "use strict";
  const R = window.PROTO_ROOM;
  // ---- tuning [DRAFT] -----------------------------------------------------------------------------------------------
  const SPEED = 4;            // m/s walk speed
  const CELL = 0.5;           // walk grid cell (m): 40 x 24
  const RADIUS = 0.28;        // the character's footprint (m): blockers are grown by this
  const BEAT_MIN = 0.4, BEAT_MAX = 0.8;   // s between arriving and the reveal
  const REVEAL_S = 0.6;       // s the reveal animation runs
  const X_MS = 400;           // click X: 4 frames over this long
  const TIP_MS = 300;         // hover tooltip delay
  const HOLD_MS = 500;        // long-press = examine
  const MIN_HIT_CSS = 44;     // minimum hit area, CSS px
  const PORTRAIT_ZOOM = 1.6;  // portrait phones: zoomed view that follows the character
  const WALK_FPS = 8;
  const BANDS = [0.42, 0.62, 0.82, 1.0];   // chunky look: 4 light levels
  const SFX_DIR = "../../assets/sfx/";

  // ---- isolation: only renegade_proto_* keys may ever be written (this page writes none today) ---------------------
  try {
    const S = window.Storage && window.Storage.prototype, set = S.setItem, rem = S.removeItem, clr = S.clear;
    const ok = (k) => String(k).indexOf("renegade_proto_") === 0;
    S.setItem = function (k, v) { if (!ok(k)) { console.warn("[proto] refused storage write:", k); return; } return set.call(this, k, v); };
    S.removeItem = function (k) { if (!ok(k)) { console.warn("[proto] refused storage remove:", k); return; } return rem.call(this, k); };
    S.clear = function () { console.warn("[proto] refused storage clear"); };
    void clr;
  } catch (e) { /* storage unavailable: nothing to guard */ }

  const $ = (id) => document.getElementById(id);
  const canvas = $("room"), ctx = canvas.getContext("2d"), stage = $("stage"), tipEl = $("tooltip"), actionEl = $("action");
  const trayEl = $("tray"), logEl = $("log");
  const params = new URLSearchParams(location.search);
  const now = () => performance.now();
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---- room geometry -----------------------------------------------------------------------------------------------
  const W = R.w, H = R.h, WT = R.wallThick, TOP = R.wallTop;
  const floor = { x0: WT, y0: TOP, x1: W - WT, y1: H - WT };
  const blockers = R.blockers.map((b) => ({ id: b.id, x: b.r[0], y: b.r[1], w: b.r[2], h: b.r[3] }));
  function freePoint(x, y) {   // can the character's centre be here?
    if (x < floor.x0 + RADIUS || x > floor.x1 - RADIUS || y < floor.y0 + RADIUS * 0.6 || y > floor.y1 - RADIUS) return false;
    for (const b of blockers) if (x > b.x - RADIUS && x < b.x + b.w + RADIUS && y > b.y - RADIUS && y < b.y + b.h + RADIUS) return false;
    return true;
  }
  const COLS = Math.round(W / CELL), ROWS = Math.round(H / CELL);
  const walk = new Uint8Array(COLS * ROWS);
  const cc = (c) => (c + 0.5) * CELL;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) walk[r * COLS + c] = freePoint(cc(c), cc(r)) ? 1 : 0;
  const isWalk = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && walk[r * COLS + c] === 1;
  function lineFree(ax, ay, bx, by) {   // straight walk from a to b without touching a grown blocker
    const d = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(d / 0.08));
    for (let i = 0; i <= n; i++) { const t = i / n; if (!freePoint(ax + (bx - ax) * t, ay + (by - ay) * t)) return false; }
    return true;
  }
  function nearestWalkCell(x, y, needLos) {   // the walkable cell centre closest to (x, y)
    let best = null, bd = Infinity;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (!walk[r * COLS + c]) continue; const d = (cc(c) - x) ** 2 + (cc(r) - y) ** 2;
      if (d < bd && (!needLos || lineFree(x, y, cc(c), cc(r)))) { bd = d; best = { c, r }; }
    }
    return best;
  }
  // A* on the grid, 8 directions, no corner cutting; then a line-of-sight smoothing pass
  function astar(s, g) {
    const N = COLS * ROWS, gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const open = [], si = s.r * COLS + s.c, gi = g.r * COLS + g.c;
    const hfn = (i) => { const dc = Math.abs((i % COLS) - g.c), dr = Math.abs(((i / COLS) | 0) - g.r); return (dc + dr) + (Math.SQRT2 - 2) * Math.min(dc, dr); };
    gs[si] = 0; open.push({ i: si, f: hfn(si) });
    while (open.length) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (open[k].f < open[bi].f) bi = k;
      const cur = open.splice(bi, 1)[0].i; if (cur === gi) break; if (closed[cur]) continue; closed[cur] = 1;
      const c0 = cur % COLS, r0 = (cur / COLS) | 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue; const c = c0 + dc, r = r0 + dr; if (!isWalk(c, r)) continue;
        if (dc && dr && (!isWalk(c0 + dc, r0) || !isWalk(c0, r0 + dr))) continue;   // no corner cutting
        const ni = r * COLS + c, ng = gs[cur] + (dc && dr ? Math.SQRT2 : 1);
        if (ng < gs[ni]) { gs[ni] = ng; from[ni] = cur; open.push({ i: ni, f: ng + hfn(ni) }); }
      }
    }
    if (from[gi] === -1 && gi !== si) return null;
    const cells = []; for (let i = gi; i !== -1; i = from[i]) { cells.push({ x: cc(i % COLS), y: cc((i / COLS) | 0) }); if (i === si) break; }
    return cells.reverse();
  }
  // returns the waypoints from (x, y) to the goal (or the nearest walkable spot to it), or [] if already there
  function findPath(x, y, tx, ty) {
    let goal = freePoint(tx, ty) ? { x: tx, y: ty } : null;
    if (!goal) { const n = nearestWalkCell(tx, ty, false); if (!n) return []; goal = { x: cc(n.c), y: cc(n.r) }; }
    if (lineFree(x, y, goal.x, goal.y)) return [goal];
    const s = nearestWalkCell(x, y, true) || nearestWalkCell(x, y, false), gc = nearestWalkCell(goal.x, goal.y, true) || { c: Math.floor(goal.x / CELL), r: Math.floor(goal.y / CELL) };
    const cells = astar(s, gc); if (!cells) return [];
    const pts = [{ x, y }].concat(cells, [goal]);
    const out = []; let a = 0;   // smoothing: from each anchor jump to the furthest point in straight sight
    while (a < pts.length - 1) {
      let b = pts.length - 1; while (b > a + 1 && !lineFree(pts[a].x, pts[a].y, pts[b].x, pts[b].y)) b--;
      out.push(pts[b]); a = b;
    }
    return out;
  }

  // ---- state ---------------------------------------------------------------------------------------------------------
  const objs = R.searchables.map((o) => ({ ...o, kind: "search", st: "idle", t0: -1e9, n: 0 }));
  const decor = R.decor.map((o) => ({ ...o, kind: "decor", t0: -1e9 }));
  const hits = objs.concat(decor);
  const me = { x: R.start.x, y: R.start.y, face: R.start.face, fy: 0, path: [], moving: false, walkT: 0, task: null };
  let look = params.get("look") === "smooth" ? "smooth" : "chunky", soundOn = true;
  let marker = null, hover = null, hoverSince = 0, tipPinnedUntil = 0, shimmerUntil = 0;
  const particles = [];
  const tray = {};   // loot id -> { n, el }
  const stats = { clipFrames: 0, frames: 0, markers: [] };
  for (const o of objs) if (!freePoint(o.stand[0], o.stand[1])) console.warn("[proto] stand spot not walkable:", o.id);

  // ---- layout / camera ---------------------------------------------------------------------------------------------
  let scale = 50, cssW = 1000, cssH = 600, k = 0.5, camX = 0, camY = 0, viewW = W, viewH = H, portrait = false;
  function layout() {
    const aw = stage.clientWidth, ah = stage.clientHeight;
    portrait = ah > aw * 1.05;
    if (portrait) { scale = (aw / W) * PORTRAIT_ZOOM; cssW = aw; cssH = Math.min(ah, H * scale); }
    else { scale = Math.min(aw / W, ah / H); cssW = W * scale; cssH = H * scale; }
    cssW = Math.floor(cssW); cssH = Math.floor(cssH);
    k = look === "chunky" ? 0.5 : Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(cssW * k)); canvas.height = Math.max(1, Math.round(cssH * k));
    canvas.style.width = cssW + "px"; canvas.style.height = cssH + "px";
    canvas.classList.toggle("chunky", look === "chunky");
    viewW = cssW / scale; viewH = cssH / scale;
    buildLight();
  }
  function updateCam() {
    camX = viewW >= W ? (W - viewW) / 2 : clamp(me.x - viewW / 2, 0, W - viewW);
    camY = viewH >= H ? (H - viewH) / 2 : clamp(me.y - viewH / 2, 0, H - viewH);
  }
  function toWorld(cx, cy) { const b = canvas.getBoundingClientRect(); return { x: camX + (cx - b.left) / scale, y: camY + (cy - b.top) / scale }; }
  function toClient(x, y) { const b = canvas.getBoundingClientRect(); return { x: b.left + (x - camX) * scale, y: b.top + (y - camY) * scale }; }

  // ---- lighting: a darkness overlay, banded + dithered (chunky) or smooth --------------------------------------------
  let light = null;
  const LIGHTS = [
    { x: 8.8, y: 5.0, r: 7.5, a: 0.55 },     // the working fluorescent tube over the desks
    { x: 13.75, y: 1.4, r: 6.0, a: 0.45 },   // daylight through the smashed window
    { x: 16.8, y: 9.4, r: 4.2, a: 0.32 },    // the manager's desk lamp
    { x: 2.3, y: 11.4, r: 3.8, a: 0.3 }      // the open door (Vixie: the door corner read muddy)
  ];
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  function lightAt(x, y) {   // ambient 0.37 (was 0.3; Vixie Oct 3: the bottom-left and door corner read muddy)
    let L = 0.37; for (const s of LIGHTS) { const d = Math.hypot(x - s.x, y - s.y) / s.r; if (d < 1) L += s.a * (1 - d * d); }
    return Math.min(1, L);
  }
  function buildLight() {
    const chunky = look === "chunky", ppm = chunky ? 25 : 12.5, w = Math.round(W * ppm), h = Math.round(H * ppm);
    const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"), img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let L = lightAt((x + 0.5) / ppm, (y + 0.5) / ppm);
      if (chunky) { const q = (L - BANDS[0]) / (1 - BANDS[0]) * (BANDS.length - 1), t = BAYER[(y % 4) * 4 + (x % 4)];
        const lv = clamp(Math.floor(q + (t - 0.5) * 0.35 + 0.5), 0, BANDS.length - 1); L = BANDS[lv]; }
      const i = (y * w + x) * 4; img.data[i] = 8; img.data[i + 1] = 8; img.data[i + 2] = 14; img.data[i + 3] = Math.round((1 - L) * 0.9 * 255);
    }
    g.putImageData(img, 0, 0); light = c;
  }

  // ---- sound: a tiny local player (no G.Sfx) -------------------------------------------------------------------------
  const sfxCache = {};
  function sfx(id, vol) {
    if (!soundOn || !id) return;
    try { const base = sfxCache[id] || (sfxCache[id] = new Audio(SFX_DIR + id + ".mp3")); const a = base.cloneNode(); a.volume = vol == null ? 0.6 : vol; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* no audio */ }
  }

  // ---- log / tray / tooltip ------------------------------------------------------------------------------------------
  function log(text, cls) { const d = document.createElement("div"); d.textContent = text; if (cls) d.className = cls; logEl.appendChild(d); while (logEl.children.length > 6) logEl.removeChild(logEl.firstChild); }
  function trayAdd(l, real) {
    let t = tray[l.id];
    if (!t) { const el = document.createElement("div"); el.className = "pa-slot" + (real ? " real" : ""); el.dataset.id = l.id; el.title = l.name;
      const im = document.createElement("img"); im.src = l.icon; im.alt = l.name; const n = document.createElement("span"); n.className = "n";
      el.appendChild(im); el.appendChild(n); trayEl.appendChild(el); t = tray[l.id] = { n: 0, el }; }
    t.n += l.n; t.el.querySelector(".n").textContent = "x" + t.n;
    t.el.classList.remove("bump"); void t.el.offsetWidth; t.el.classList.add("bump");
  }
  function traySlotRect(id) { const t = tray[id]; if (t) return t.el.getBoundingClientRect(); const b = trayEl.getBoundingClientRect(); return { left: b.left + 8 + Object.keys(tray).length * 46, top: b.bottom - 44, width: 40, height: 40 }; }
  function flyLoot(o, l, real, delay) {   // the icon pops up over the object, then arcs into the tray
    setTimeout(() => {
      const c = toClient(o.box[0] + o.box[2] / 2, o.box[1] + o.box[3] / 2), im = document.createElement("img");
      im.className = "pa-fly"; im.src = l.icon; im.alt = ""; document.body.appendChild(im);
      const t0 = now(), POP = 260, FLY = 520, dst = traySlotRect(l.id), dx = dst.left + dst.width / 2, dy = dst.top + dst.height / 2;
      const step = () => {
        const t = now() - t0; let x, y, s;
        if (t < POP) { const p = t / POP; x = c.x; y = c.y - 34 * Math.sin(p * Math.PI / 2); s = 0.4 + 0.9 * p; }
        else { const p = Math.min(1, (t - POP) / FLY), sx = c.x, sy = c.y - 34; x = sx + (dx - sx) * p; y = sy + (dy - sy) * p - Math.sin(p * Math.PI) * 90; s = 1.3 - 0.3 * p; }
        im.style.left = (x - 16) + "px"; im.style.top = (y - 16) + "px"; im.style.transform = `scale(${s})`;
        if (t < POP + FLY) requestAnimationFrame(step); else { im.remove(); trayAdd(l, real); }
      };
      step();
    }, delay || 0);
  }
  function tipHtml(o) { const e = document.createElement("div"), b = document.createElement("b"), s = document.createElement("span"); b.textContent = o.name; s.className = "examine"; s.textContent = o.examine; e.appendChild(b); e.appendChild(document.createElement("br")); e.appendChild(s); return e.innerHTML; }
  function showTip(o, cx, cy) { tipEl.innerHTML = tipHtml(o); tipEl.hidden = false; const w = tipEl.offsetWidth, h = tipEl.offsetHeight; tipEl.style.left = clamp(cx + 14, 4, innerWidth - w - 4) + "px"; tipEl.style.top = clamp(cy + 16, 4, innerHeight - h - 4) + "px"; }
  function hideTip() { tipEl.hidden = true; }
  function examine(o, cx, cy) { showTip(o, cx, cy); tipPinnedUntil = now() + 2600; log(`${o.name}: ${o.examine}`, "ex"); }
  function verb(o) { return o.kind === "search" ? (o.action || "Search") : (o.action || "Examine"); }
  function setAction(o) {
    actionEl.textContent = "";
    if (!o) { const s = document.createElement("span"); s.className = "walk"; s.textContent = "Walk here"; actionEl.appendChild(s); return; }
    actionEl.appendChild(document.createTextNode(verb(o) + " ")); const s = document.createElement("span"); s.className = "obj"; s.textContent = o.name; actionEl.appendChild(s);
  }

  // ---- picking: the object under a point; boxes padded on screen to MIN_HIT_CSS --------------------------------------
  function pick(x, y) {
    const pad = MIN_HIT_CSS / scale; let best = null, bs = Infinity;
    for (const o of hits) {
      const [bx, by, bw, bh] = o.box, px = Math.max(0, (pad - bw) / 2), py = Math.max(0, (pad - bh) / 2);
      const exact = x >= bx && x <= bx + bw && y >= by && y <= by + bh;
      if (!exact && !(x >= bx - px && x <= bx + bw + px && y >= by - py && y <= by + bh + py)) continue;
      const score = exact ? bw * bh : 1000 + Math.hypot(x - (bx + bw / 2), y - (by + bh / 2));   // the smallest exact hit wins, then the nearest padded one
      if (score < bs) { bs = score; best = o; }
    }
    return best;
  }

  // ---- actions -------------------------------------------------------------------------------------------------------
  function setMarker(x, y, red) { marker = { x, y, red, t0: now() }; stats.markers.push({ x, y, red }); if (stats.markers.length > 50) stats.markers.shift(); }
  function walkTo(x, y, task) { me.task = task || null; me.path = findPath(me.x, me.y, x, y); me.moving = me.path.length > 0; if (!me.moving) arrive(); }
  function act(wx, wy) {
    const o = pick(wx, wy);
    hideTip(); tipPinnedUntil = 0;
    if (!o) { setMarker(wx, wy, false); walkTo(wx, wy, null); return; }
    setMarker(wx, wy, true);
    if (o.kind === "decor" && !o.stand) { me.task = null; examine(o, ...Object.values(clientOf(wx, wy))); return; }
    walkTo(o.stand[0], o.stand[1], { o, phase: "walk" });
  }
  const clientOf = (x, y) => { const c = toClient(x, y); return { x: c.x, y: c.y }; };
  function faceTo(o) { const dx = o.box[0] + o.box[2] / 2 - me.x, dy = o.box[1] + o.box[3] / 2 - me.y; if (Math.abs(dx) > 0.05) me.face = dx < 0 ? -1 : 1; me.fy = Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0; }
  function arrive() {
    me.moving = false; const tk = me.task; if (!tk) return;
    faceTo(tk.o); tk.phase = "beat"; tk.until = now() + (BEAT_MIN + Math.random() * (BEAT_MAX - BEAT_MIN)) * 1000;
  }
  function reveal(o) {
    o.t0 = now();
    if (o.kind === "decor") { log(`${o.name}: ${o.boop || o.examine}`, "ex"); sfx("sfx_ui_click", 0.4); return; }
    if (o.locked) { o.n++; sfx(o.sfx, 0.7); log(o.line, "dim"); return; }   // rattles, never opens
    if (o.st !== "idle") { log("Nothing else here.", "dim"); return; }
    o.st = "open"; o.n++; sfx(o.sfx);
    spawnFx(o);
    log(o.line);
    o.loot.forEach((l, i) => {
      flyLoot(o, l, !!o.real, REVEAL_S * 600 + i * 160);
      setTimeout(() => { log(`You find: ${l.name} x${l.n}`, o.real ? "real" : "find"); if (o.real) sfx("sfx_loot_rare", 0.55); }, REVEAL_S * 600);
    });
    setTimeout(() => { o.st = "searched"; }, REVEAL_S * 1000);
  }
  function spawnFx(o) {
    const cx = o.box[0] + o.box[2] / 2, cy = o.box[1] + o.box[3] / 2, rnd = Math.random;
    const puff = (n, col, x, y, sp) => { for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, v = (0.4 + rnd()) * sp; particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.3, t0: now(), life: 500 + rnd() * 400, col, s: 0.06 + rnd() * 0.08 }); } };
    if (o.reveal === "cabinet") puff(10, "#e8e2cc", cx, o.box[1] + o.box[3] + 0.2, 1.4);
    if (o.reveal === "tile") puff(16, "#b8b0a0", cx, cy, 1.6);
    if (o.reveal === "bin") puff(6, "#e0dccc", cx + 0.3, cy, 1.2);
    if (o.reveal === "vending") puff(4, "#c0c0c0", cx, o.box[1] + o.box[3], 0.6);
  }
  function resetRoom() {
    for (const o of objs) { o.st = "idle"; o.t0 = -1e9; o.n = 0; } for (const d of decor) d.t0 = -1e9;
    for (const id in tray) tray[id].el.remove(); for (const id in tray) delete tray[id];
    logEl.textContent = ""; particles.length = 0; marker = null;
    Object.assign(me, { x: R.start.x, y: R.start.y, face: R.start.face, fy: 0, path: [], moving: false, task: null });
    if (coarse) shimmerUntil = now() + 1000;
    log("The room is as you found it.", "dim");
  }

  // ---- input ---------------------------------------------------------------------------------------------------------
  const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  let press = null;
  canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); if (press && press.held) return; const w = toWorld(e.clientX, e.clientY), o = pick(w.x, w.y); if (o) examine(o, e.clientX, e.clientY); });
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") { if (e.button !== 0) return; const w = toWorld(e.clientX, e.clientY); act(w.x, w.y); return; }
    const p = press = { id: e.pointerId, x: e.clientX, y: e.clientY, held: false };
    p.timer = setTimeout(() => { p.held = true; const w = toWorld(p.x, p.y), o = pick(w.x, w.y); if (o) examine(o, p.x, p.y); }, HOLD_MS);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) { clearTimeout(press.timer); press.moved = true; }
    if (e.pointerType !== "mouse") return;
    const w = toWorld(e.clientX, e.clientY), o = pick(w.x, w.y);
    if (o !== hover) { hover = o; hoverSince = now(); if (now() > tipPinnedUntil) hideTip(); }
    canvas.classList.toggle("hot", !!o); setAction(o);
    if (o && now() - hoverSince >= TIP_MS && now() > tipPinnedUntil) showTip(o, e.clientX, e.clientY);
    lastMouse = { x: e.clientX, y: e.clientY };
  });
  let lastMouse = null;
  canvas.addEventListener("pointerleave", () => { hover = null; canvas.classList.remove("hot"); actionEl.textContent = ""; if (now() > tipPinnedUntil) hideTip(); });
  const endPress = (e, cancel) => {
    if (!press || e.pointerId !== press.id) return; clearTimeout(press.timer);
    if (!cancel && !press.held && !press.moved) { const w = toWorld(press.x, press.y), o = pick(w.x, w.y); setAction(o); act(w.x, w.y); }
    press = null;
  };
  canvas.addEventListener("pointerup", (e) => endPress(e, false));
  canvas.addEventListener("pointercancel", (e) => endPress(e, true));
  $("btn-reset").addEventListener("click", resetRoom);
  $("btn-look").addEventListener("click", () => setLook(look === "chunky" ? "smooth" : "chunky"));
  $("btn-sound").addEventListener("click", () => { soundOn = !soundOn; const b = $("btn-sound"); b.textContent = "Sound: " + (soundOn ? "On" : "Off"); b.setAttribute("aria-pressed", String(soundOn)); });
  function setLook(l) { look = l; const b = $("btn-look"); b.textContent = "Look: " + (l === "chunky" ? "Chunky" : "Smooth"); b.setAttribute("aria-pressed", String(l === "chunky")); layout(); }
  let showFps = params.has("debug");
  if (params.has("debug")) $("btn-look").hidden = false;   // the look toggle is a testing tool (Megan: chunky is the look)
  window.addEventListener("keydown", (e) => { if (e.key === "f" || e.key === "F") showFps = !showFps; });
  window.addEventListener("resize", layout);
  if (window.ResizeObserver) new ResizeObserver(() => layout()).observe(stage);   // the stage can change size without a window resize

  // ---- drawing (meters; one transform per frame) ---------------------------------------------------------------------
  function rect(x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }
  function box3(x, y, w, h, top, front, fh) { rect(x, y, w, h - fh, top); rect(x, y + h - fh, w, fh, front); }   // fake height: a top and a front face
  function circle(x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  function shadow(x, y, w, h) { ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x + 0.08, y + 0.12, w, h); }
  const px = () => 1 / (scale * k);   // one render pixel in meters
  const ease = (p) => 1 - (1 - p) * (1 - p);
  function prog(o, dur) { return clamp((now() - o.t0) / ((dur || REVEAL_S) * 1000), 0, 1); }

  function drawRoom() {
    // floor: worn carpet tiles, a few stains
    rect(0, 0, W, H, "#1b1a15");
    rect(floor.x0, floor.y0, floor.x1 - floor.x0, floor.y1 - floor.y0, "#4a4838");
    ctx.fillStyle = "#423f31";
    for (let y = Math.ceil(floor.y0); y < floor.y1; y++) for (let x = Math.ceil(floor.x0); x < floor.x1; x++) if ((x + y) % 2) ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = "rgba(30,26,18,0.35)"; for (const [x, y, r] of [[3.2, 9.6, 0.7], [11.5, 9.8, 0.9], [9.2, 2.1, 0.5], [14.5, 4.8, 0.8]]) { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0.4, 0, Math.PI * 2); ctx.fill(); }
    // manager's office: a different floor
    rect(12.6, 6.8, floor.x1 - 12.6, floor.y1 - 6.8, "#4d4232");
    // back wall face (north), side walls, south wall with the door
    rect(0, 0, W, TOP, "#5b5a4c"); rect(0, TOP - 0.12, W, 0.12, "#3a392f"); rect(0, 0, W, 0.12, "#2c2b23");
    for (let x = 0.5; x < W; x += 2.5) rect(x, 0.12, 0.04, TOP - 0.24, "#535244");   // wall panel seams
    rect(0, 0, WT, H, "#2c2b23"); rect(W - WT, 0, WT, H, "#2c2b23"); rect(0, H - WT, W, WT, "#2c2b23");
    const d = R.door; rect(d[0], d[1], d[2], d[3], "#141410"); rect(d[0] - 0.08, d[1], 0.08, d[3], "#6a6040"); rect(d[0] + d[2], d[1], 0.08, d[3], "#6a6040");
  }
  function drawDesk(x, y, w, h) { shadow(x, y, w, h); box3(x, y, w, h, "#7a6a4e", "#56492f", 0.28); rect(x + 0.06, y + 0.06, w - 0.12, 0.05, "#8a7a5c"); }
  function drawFurniture(f) {
    if (f.kind === "chair") { circle(f.x + 0.05, f.y + 0.08, 0.3, "rgba(0,0,0,0.3)"); circle(f.x, f.y, 0.28, "#2e3236"); rect(f.x - 0.3, f.y - 0.36, 0.6, 0.14, "#25282b"); }
    if (f.kind === "papers") { ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(0.5); rect(-0.2, -0.14, 0.4, 0.28, "#d8d2bc"); ctx.rotate(-0.9); rect(0.05, -0.1, 0.32, 0.24, "#cfc8b0"); ctx.restore(); }
  }
  function drawBlocker(b) {
    if (b.id === "desk_b" || b.id === "desk_c" || b.id === "desk_mgr") drawDesk(b.x, b.y, b.w, b.h);
    if (b.id === "copier") { shadow(b.x, b.y, b.w, b.h); box3(b.x, b.y, b.w, b.h, "#9a9a92", "#6a6a64", 0.35); rect(b.x + 0.1, b.y + 0.12, b.w - 0.2, 0.35, "#4a5a60"); }
    if (b.id.indexOf("part_") === 0) { rect(b.x, b.y, b.w, b.h, "rgba(150,190,200,0.35)"); ctx.strokeStyle = "#8a8a80"; ctx.lineWidth = px() * 1.5; ctx.strokeRect(b.x, b.y, b.w, b.h); }
  }
  function drawObj(o) {
    const [x, y, w, h] = o.box, p = prog(o), open = o.st !== "idle", done = o.st === "searched", t = now();
    switch (o.draw) {
      case "desk_drawers": { drawDesk(x, y, w, h); const out = open ? 0.38 * ease(done ? 1 : p) : 0; rect(x + 1.55, y + h - 0.28 + out * 0.0, 0.7, 0.28, "#4a3e28");
        if (out > 0) { rect(x + 1.55, y + h - 0.28, 0.7, out + 0.04, "#2a2418"); rect(x + 1.55, y + h - 0.28 + out, 0.7, 0.28, "#6a5a3c"); }
        rect(x + 1.85, y + h - 0.16 + out, 0.1, 0.04, "#c8b88a"); break; }
      case "desk_pc": { drawDesk(x, y, w, h); rect(x + 0.6, y + 0.12, 1.0, 0.55, "#c8c0a8"); let scr = "#202a22";
        if (o.st === "open") scr = (Math.floor(t / 70) % 2) && p < 0.75 ? "#a8f0c8" : p < 0.75 ? "#40705a" : "#101010"; else if (done) scr = "#0e0e0e";
        rect(x + 0.68, y + 0.18, 0.84, 0.4, scr); rect(x + 1.85, y + 0.15, 0.35, 0.7, "#b8b098"); if (!done) circle(x + 2.02, y + 0.7, 0.035, o.st === "open" ? "#ff5040" : "#50ff70");
        rect(x + 0.7, y + 0.75, 0.8, 0.18, "#d8d0b8"); break; }
      case "cabinet": { shadow(x, y, w, h); box3(x, y, w, h, "#8a8e90", "#5c6064", 0.4); const out = open ? 0.32 * ease(done ? 1 : p) : 0;
        if (out > 0) { rect(x + 0.06, y + h - 0.4, w - 0.12, out + 0.1, "#3a3c3e"); rect(x + 0.06, y + h - 0.4 + out, w - 0.12, 0.2, "#7a7e80"); }
        rect(x + w / 2 - 0.12, y + h - 0.3 + out, 0.24, 0.04, "#d0d0c8"); break; }
      case "plant": { circle(x + w / 2 + 0.05, y + h / 2 + 0.08, 0.36, "rgba(0,0,0,0.3)"); circle(x + w / 2, y + h / 2, 0.33, "#6a4430"); circle(x + w / 2, y + h / 2, 0.25, "#3a2a1e");
        const n = 7, fell = open ? Math.floor((done ? 1 : p) * n + 0.001) : 0;
        for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, cx = x + w / 2 + Math.cos(a) * 0.3, cy = y + h / 2 + Math.sin(a) * 0.3;
          if (i < fell) { const fx = x + w / 2 + Math.cos(a) * 0.62, fy = y + h / 2 + Math.sin(a) * 0.55 + 0.2; ctx.fillStyle = "#6a5a30"; ctx.beginPath(); ctx.ellipse(fx, fy, 0.12, 0.06, a, 0, Math.PI * 2); ctx.fill(); }
          else { ctx.fillStyle = "#7a7a3a"; ctx.beginPath(); ctx.ellipse(cx, cy, 0.17, 0.08, a, 0, Math.PI * 2); ctx.fill(); } }
        rect(x + w / 2 - 0.02, y + h / 2 - 0.25, 0.04, 0.3, "#5a4428"); break; }
      case "ceiling_tile": { const cx = x + w / 2, cy = y + h / 2;
        if (o.st === "idle") { ctx.fillStyle = "rgba(0,0,0,0.32)"; ctx.save(); ctx.translate(cx, cy); ctx.rotate(0.18); ctx.fillRect(-0.45, -0.38, 0.9, 0.76); ctx.restore();
          ctx.save(); ctx.translate(cx - 0.18, cy - 0.5); ctx.rotate(0.14); ctx.strokeStyle = "rgba(220,214,196,0.5)"; ctx.lineWidth = px() * 1.5; ctx.strokeRect(-0.45, -0.38, 0.9, 0.76); ctx.restore(); }
        else { const q = done ? 1 : ease(p), s = 1.3 - 0.3 * q; ctx.save(); ctx.translate(cx - 0.18 * (1 - q), cy - 0.5 * (1 - q)); ctx.rotate(0.14 + 0.5 * q); ctx.scale(s, s);
          rect(-0.45, -0.38, 0.9, 0.76, "#c8c2b0"); ctx.fillStyle = "#a8a290"; for (let i = 0; i < 6; i++) ctx.fillRect(-0.4 + i * 0.15, -0.3 + (i % 2) * 0.3, 0.05, 0.05); ctx.restore();
          if (q > 0.6 && !done) rect(cx + 0.45, cy + 0.15, 0.3, 0.2, "#8a6a40"); }
        break; }
      case "vending": { const sh = o.st === "open" && p < 0.5 ? Math.sin(t / 25) * 0.04 : 0; shadow(x, y, w, h); box3(x + sh, y, w, h, "#7a2a24", "#521c18", 0.35);
        rect(x + sh + 0.12, y + 0.08, w - 0.6, h - 0.5, "#28343a");
        for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) rect(x + sh + 0.18 + c * 0.24, y + 0.14 + r * 0.17, 0.14, 0.1, ["#d0b040", "#40a060", "#c04040", "#4080c0"][c]);
        rect(x + sh + w - 0.42, y + 0.1, 0.3, 0.3, "#b0b0a0");
        const stuckY = open ? y + 0.3 + 0.32 * ease(done ? 1 : p) : y + 0.3; if (!done) rect(x + sh + 0.66, stuckY, 0.14, 0.12, "#e0e0e0");
        rect(x + sh + 0.12, y + h - 0.3, w - 0.6, 0.16, "#141414"); break; }
      case "cooler": { circle(x + w / 2 + 0.05, y + h / 2 + 0.08, 0.32, "rgba(0,0,0,0.3)"); box3(x, y, w, h, "#d8d8d0", "#a8a8a0", 0.2); circle(x + w / 2, y + h / 2 - 0.08, 0.24, "rgba(110,170,220,0.85)");
        const lvl = done ? 0.08 : 0.14; circle(x + w / 2, y + h / 2 - 0.08, lvl, "rgba(60,120,190,0.9)");
        if (o.st === "open") { const q = p; circle(x + w / 2 + 0.04, y + h / 2 + 0.05 - q * 0.28, 0.05 + 0.03 * q, "rgba(230,245,255,0.9)"); }
        rect(x + w / 2 - 0.04, y + h - 0.2, 0.08, 0.06, "#4060a0"); break; }
      case "coat": { rect(x + 0.02, y + 0.05, 0.12, 0.08, "#8a7a50");
        const sw = o.st === "open" ? Math.sin(p * Math.PI * 4) * 0.25 * (1 - p) : 0; ctx.save(); ctx.translate(x + 0.08, y + 0.1); ctx.rotate(sw);
        ctx.fillStyle = "#6a6e70"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0.42, 0.25); ctx.lineTo(0.48, 1.0); ctx.lineTo(0.05, 1.0); ctx.closePath(); ctx.fill();
        rect(0.06, 0.1, 0.06, 0.85, "#55585a");
        if (done || (o.st === "open" && p > 0.5)) { rect(0.3, 0.62, 0.16, 0.12, "#d8d4c8"); rect(0.3, 0.84, 0.16, 0.12, "#d8d4c8"); }
        ctx.restore(); break; }
      case "mug": { const cx = x + w / 2, cy = y + h / 2; circle(cx, cy, 0.14, done ? "#a8a090" : "#e0dccc"); circle(cx, cy, 0.09, "#3a3428");
        const pens = [["#2040c0", 0.3], ["#c02020", 1.6], ["#202020", 2.6], ["#20a040", 4.1], ["#c0a020", 5.2]];
        for (const [col, a] of pens) { ctx.strokeStyle = col; ctx.lineWidth = 0.04; ctx.beginPath();
          if (open) { const q = done ? 1 : ease(p), r = 0.1 + q * 0.45, ex = cx + Math.cos(a) * r, ey = cy + Math.sin(a) * r * 0.8; ctx.moveTo(ex - Math.cos(a + 1) * 0.12, ey - Math.sin(a + 1) * 0.12); ctx.lineTo(ex + Math.cos(a + 1) * 0.12, ey + Math.sin(a + 1) * 0.12); }
          else { ctx.moveTo(cx + Math.cos(a) * 0.04, cy + Math.sin(a) * 0.04); ctx.lineTo(cx + Math.cos(a) * 0.12, cy - 0.16 + Math.sin(a) * 0.04); }
          ctx.stroke(); }
        break; }
      case "bin": { const cx = x + w / 2, cy = y + h / 2, q = open ? (done ? 1 : ease(p)) : 0;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(q * 1.4); ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(0.04, 0.06, 0.24, 0.24 - q * 0.08, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#3a4a40"; ctx.beginPath(); ctx.ellipse(0, 0, 0.22, 0.22 - q * 0.08, 0, 0, Math.PI * 2); ctx.fill(); circle(0, 0, 0.15 - q * 0.05, "#1e2420"); ctx.restore();
        if (q > 0) for (let i = 0; i < 4; i++) circle(cx + 0.2 + q * (0.25 + i * 0.16), cy + (i - 1.5) * 0.12 * q, 0.07, "#e8e4d4");
        break; }
      case "mgr_drawer": { const sh = o.n && now() - o.t0 < 500 ? Math.sin((now() - o.t0) / 18) * 0.035 : 0;
        rect(x + 0.08 + sh, y + h - 0.3, w - 0.16, 0.24, "#4a3a26"); rect(x + w / 2 - 0.05 + sh, y + h - 0.22, 0.1, 0.08, "#d0a840");
        if (o.n && now() - o.t0 < 1600) drawLock(x + w / 2, y - 0.25 - 0.15 * ease(clamp((now() - o.t0) / 300, 0, 1)));
        break; }
      case "window": { rect(x, y, w, h, "#2a3238"); rect(x + 0.08, y + 0.08, w - 0.16, h - 0.16, "#7a8c98");
        ctx.fillStyle = "#9ab0bc"; ctx.beginPath(); ctx.moveTo(x + 0.08, y + 0.08); ctx.lineTo(x + 0.6, y + 0.08); ctx.lineTo(x + 0.25, y + 0.45); ctx.lineTo(x + 0.08, y + 0.7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + w - 0.08, y + h - 0.08); ctx.lineTo(x + w - 0.7, y + h - 0.08); ctx.lineTo(x + w - 0.3, y + 0.35); ctx.fill();
        rect(x - 0.05, y + h - 0.06, w + 0.1, 0.1, "#6a6656");
        ctx.fillStyle = "rgba(200,220,230,0.6)"; for (const [gx, gy] of [[13.2, 1.5], [13.9, 1.7], [14.4, 1.45], [12.9, 1.85]]) ctx.fillRect(gx, gy, 0.08, 0.05); break; }
      case "stain": { ctx.fillStyle = "rgba(90,60,30,0.55)"; ctx.beginPath(); ctx.ellipse(x + 0.75, y + 0.45, 0.45, 0.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + 1.25, y + 0.3, 0.16, 0.12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(x + 0.42, y + 0.55, 0.06, 0.22); ctx.fillRect(x + 0.6, y + 0.55, 0.06, 0.22); ctx.fillRect(x + 0.9, y + 0.55, 0.06, 0.22); ctx.fillRect(x + 1.05, y + 0.55, 0.06, 0.22);
        ctx.fillRect(x + 1.2, y + 0.1, 0.04, 0.12); ctx.fillRect(x + 1.3, y + 0.08, 0.04, 0.12); break; }
      case "poster": { rect(x, y, w, h, "#d8d0b0"); rect(x + 0.06, y + 0.06, w - 0.12, h - 0.3, "#7aa0b0"); rect(x + 0.1, y + 0.3, w - 0.2, 0.05, "#5a4028");
        rect(x + 0.1, y + h - 0.2, w - 0.2, 0.08, "#3a3a3a"); break; }
      case "pigeon": { const hop = now() - o.t0 < 500 ? Math.sin((now() - o.t0) / 500 * Math.PI) * 0.25 : 0, cx = x + w / 2, cy = y + h / 2 - hop;
        ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2 + 0.12, 0.18, 0.06, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#8a8e94"; ctx.beginPath(); ctx.ellipse(cx, cy, 0.17, 0.11, 0, 0, Math.PI * 2); ctx.fill(); circle(cx + 0.15, cy - 0.06, 0.07, "#7a7e86"); rect(cx + 0.21, cy - 0.06, 0.05, 0.025, "#c8a060");
        circle(cx + 0.17, cy - 0.08, 0.015, "#101010"); break; }
    }
  }
  function drawLock(x, y) { ctx.strokeStyle = "#e8d080"; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(x, y - 0.06, 0.09, Math.PI, 0); ctx.stroke(); rect(x - 0.13, y - 0.06, 0.26, 0.2, "#d0a840"); rect(x - 0.02, y, 0.04, 0.08, "#3a2a10"); }
  function drawMe() {
    const t = now(), step = me.moving ? Math.floor(me.walkT * WALK_FPS) % 2 : 0, beat = me.task && me.task.phase === "beat", bob = beat ? Math.sin(t / 60) * 0.03 : 0;
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(me.x + 0.04, me.y + 0.12, 0.3, 0.16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(me.x, me.y - bob); ctx.scale(me.face < 0 ? -1 : 1, 1);   // the placeholder faces east; flipped for west
    const lf = step ? 0.1 : -0.1; rect(-0.12 + lf * 0.5, 0.08, 0.1, 0.16, "#2a2a22"); rect(0.04 - lf * 0.5, 0.08, 0.1, 0.16, "#2a2a22");   // 2-frame walk
    rect(-0.27, -0.2, 0.14, 0.3, "#5a4a2a");   // the backpack
    circle(0, -0.02, 0.21, "#6b7a4a"); circle(0.05, -0.28, 0.13, "#c8a07a"); rect(0.12, -0.31, 0.04, 0.04, "#1a1a14");   // body, head, eye
    if (beat) rect(0.18, -0.08, 0.16, 0.07, "#c8a07a");   // reaching
    ctx.restore();
  }
  function drawMarker() {
    if (!marker) return; const t = now() - marker.t0; if (t > X_MS) { marker = null; return; }
    const f = Math.min(3, Math.floor(t / (X_MS / 4))), s = [0.32, 0.26, 0.19, 0.12][f], col = marker.red ? "#ff2a1e" : "#ffe03a";
    ctx.lineCap = "square"; for (const [lw, c] of [[0.13, "#000"], [0.07, col]]) { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath();
      ctx.moveTo(marker.x - s, marker.y - s); ctx.lineTo(marker.x + s, marker.y + s); ctx.moveTo(marker.x + s, marker.y - s); ctx.lineTo(marker.x - s, marker.y + s); ctx.stroke(); }
  }
  function outline(o, a) { const [x, y, w, h] = o.box; ctx.strokeStyle = `rgba(255,248,214,${a})`; ctx.lineWidth = px() * (look === "chunky" ? 1 : 1.5); ctx.strokeRect(x - 0.04, y - 0.04, w + 0.08, h + 0.08); }

  // ---- loop ----------------------------------------------------------------------------------------------------------
  let last = now(), fpsT = 0, fpsN = 0, fps = 0, fpsEl = null;
  function frame() {
    const t = now(), dt = Math.min(0.05, (t - last) / 1000); last = t;
    // move
    if (me.moving && me.path.length) {
      let left = SPEED * dt; me.walkT += dt;
      while (left > 0 && me.path.length) {
        const wp = me.path[0], dx = wp.x - me.x, dy = wp.y - me.y, d = Math.hypot(dx, dy);
        if (Math.abs(dx) > 0.01) me.face = dx < 0 ? -1 : 1;
        if (d <= left) { me.x = wp.x; me.y = wp.y; me.path.shift(); left -= d; } else { me.x += dx / d * left; me.y += dy / d * left; left = 0; }
      }
      if (!me.path.length) arrive();
    }
    if (me.task && me.task.phase === "beat" && t >= me.task.until) { const o = me.task.o; me.task = null; reveal(o); }
    stats.frames++; if (!freePoint(me.x, me.y)) stats.clipFrames++;
    updateCam();
    // draw
    const s = scale * k; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = look !== "chunky";
    ctx.fillStyle = "#0e0e0b"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(s, 0, 0, s, -camX * s, -camY * s);
    drawRoom();
    for (const d of decor) if (d.wall) drawObj(d);
    const items = [];   // draw back to front by the bottom edge
    for (const b of blockers) if (!objs.some((o) => o.id === b.id)) items.push({ y: b.y + b.h, f: () => drawBlocker(b) });
    for (const f of R.furniture) items.push({ y: f.y - 0.2, f: () => drawFurniture(f) });
    for (const o of objs) items.push({ y: o.draw === "ceiling_tile" ? -1 : o.draw === "mug" || o.draw === "mgr_drawer" ? 99 : o.box[1] + o.box[3], f: () => drawObj(o) });
    for (const d of decor) if (!d.wall) items.push({ y: d.box[1] + d.box[3], f: () => drawObj(d) });
    items.push({ y: me.y + 0.1, f: drawMe });
    items.sort((a, b) => a.y - b.y); for (const it of items) it.f();
    for (let i = particles.length - 1; i >= 0; i--) { const q = particles[i], a = (t - q.t0) / q.life; if (a >= 1) { particles.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 0.6 * dt; ctx.globalAlpha = 1 - a; rect(q.x, q.y, q.s, q.s, q.col); ctx.globalAlpha = 1; }
    // light: darkness overlay
    ctx.imageSmoothingEnabled = look !== "chunky"; ctx.drawImage(light, 0, 0, W, H);
    // on top of the light: hover outline, the phone shimmer, the click X
    if (hover) outline(hover, 0.95);
    if (t < shimmerUntil) { const a = Math.sin((1 - (shimmerUntil - t) / 1000) * Math.PI) * 0.8; for (const o of hits) outline(o, a); }
    drawMarker();
    if (lastMouse && hover && t - hoverSince >= TIP_MS && t > tipPinnedUntil && tipEl.hidden) showTip(hover, lastMouse.x, lastMouse.y);
    if (!hover && t > tipPinnedUntil && !tipEl.hidden && !coarse) hideTip();
    if (coarse && tipPinnedUntil && t > tipPinnedUntil) { hideTip(); tipPinnedUntil = 0; }
    // fps
    fpsN++; fpsT += dt; if (fpsT >= 0.5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
    if (showFps) { if (!fpsEl) { fpsEl = document.createElement("div"); fpsEl.className = "pa-fps"; stage.appendChild(fpsEl); } fpsEl.textContent = fps + " fps · " + look; } else if (fpsEl) { fpsEl.remove(); fpsEl = null; }
    requestAnimationFrame(frame);
  }

  // ---- go ------------------------------------------------------------------------------------------------------------
  setLook(look);
  if (coarse || params.has("shimmer")) shimmerUntil = now() + 1000;   // phones have no hover: one shimmer over everything on entry
  requestAnimationFrame(frame);

  // test hook (Playwright): read-only views + coordinate helpers. Not used by the page itself.
  window.PROTO_AREA = {
    me: () => ({ x: me.x, y: me.y, face: me.face, moving: me.moving, path: me.path.map((p) => ({ x: p.x, y: p.y })), task: me.task ? { id: me.task.o.id, phase: me.task.phase } : null }),
    objs: () => objs.map((o) => ({ id: o.id, st: o.st, n: o.n, box: o.box, stand: o.stand })),
    decor: () => decor.map((d) => ({ id: d.id, box: d.box, stand: d.stand || null })),
    tray: () => Object.fromEntries(Object.entries(tray).map(([id, v]) => [id, v.n])),
    log: () => Array.from(logEl.children).map((d) => d.textContent),
    marker: () => (marker ? { ...marker } : null), markers: () => stats.markers.slice(), stats: () => ({ ...stats, markers: undefined, fps }),
    look: () => look, canvasSize: () => ({ w: canvas.width, h: canvas.height, cssW, cssH, scale, portrait }),
    toClient: (x, y) => clientOf(x, y), freePoint, pick: (x, y) => { const o = pick(x, y); return o ? o.id : null; }
  };
})();
