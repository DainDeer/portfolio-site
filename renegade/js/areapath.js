// Walking inside an Area (SP-032, Maps/Areas/Loot draft §6). DOM-free, so the rules run headless: what's walkable,
// paths, reachability and where you stand to use an object. Space: the location view's 1000 x 600 canvas pixels.
// Walkable = the floor of every open room (shrunk by the squad's radius) plus the doorway between two open rooms.
// Authored Areas also exclude furniture footprints expanded by their navigation radius. Ported from the MegaMart demo (proto/area/area.js:
// A* on a grid, 8 directions, no corner cutting, then a line-of-sight smoothing pass), with the demo's meters swapped
// for the view's pixels.
(function (root) {
  const G = root.G;
  const AP = G.AreaPath = {};
  const W = () => DATA.mapsV2.walk, V = () => DATA.searchables.view;

  // the doorways between open rooms: rects a token centre may stand in while crossing the wall
  function gaps(site) {
    const out = [], rad = W().radiusPx, half = V().wall / 2 + rad + 1, span = Math.max(4, V().doorPx / 2 - rad);
    for (const o of site.objects) {
      if (o.type !== "door" || !site.rooms[o.opens] || !site.rooms[o.room] || !site.rooms[o.opens].open || !site.rooms[o.room].open) continue;
      const vert = o.vertical != null ? o.vertical : site.rooms[o.opens].row === site.rooms[o.room].row;   // a door in a side wall
      out.push(vert ? { x0: o.x - half, x1: o.x + half, y0: o.y - span, y1: o.y + span } : { x0: o.x - span, x1: o.x + span, y0: o.y - half, y1: o.y + half });
    }
    return out;
  }
  // can the token's centre be at (x, y)?
  AP.walkPt = function (g, x, y) {
    const rad = g.radius;
    for (const [bx,by,bw,bh] of g.blockers) if (x > bx-rad && x < bx+bw+rad && y > by-rad && y < by+bh+rad) return false;
    for (const R of g.rooms) if (x >= R.x + rad && x <= R.x + R.w - rad && y >= R.y + rad && y <= R.y + R.h - rad) return true;
    for (const q of g.gaps) if (x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1) return true;
    return false;
  };
  // the walk grid of a site in its current state (cached until a room opens)
  AP.grid = function (site) {
    const sig = site.rooms.map((R) => (R.open ? 1 : 0)).join("") + ":" + site.objects.filter((o) => o.type === "door").length;
    if (site._grid && site._grid.sig === sig) return site._grid;
    const c = W().cellPx, cols = Math.ceil(1000 / c), rows = Math.ceil(600 / c);
    const g = { sig, c, cols, rows, radius:site.navRadius || W().radiusPx, blockers:site.blockers || [], rooms: site.rooms.filter((R) => R.open), gaps: gaps(site), walk: new Uint8Array(cols * rows), comp: new Int32Array(cols * rows).fill(-1) };
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) g.walk[r * cols + k] = AP.walkPt(g, (k + 0.5) * c, (r + 0.5) * c) ? 1 : 0;
    // connected components (8-neighbour, no corner cutting), so "can I get there" is one lookup
    let id = 0;
    for (let i = 0; i < g.walk.length; i++) {
      if (!g.walk[i] || g.comp[i] >= 0) continue;
      const q = [i]; g.comp[i] = id;
      while (q.length) { const cur = q.pop(); for (const n of nbrs(g, cur)) if (g.comp[n.i] < 0) { g.comp[n.i] = id; q.push(n.i); } }
      id++;
    }
    Object.defineProperty(site, "_grid", { value: g, enumerable: false, configurable: true, writable: true });   // never saved
    return g;
  };
  function nbrs(g, i) {
    const out = [], k0 = i % g.cols, r0 = (i / g.cols) | 0, ok = (k, r) => k >= 0 && r >= 0 && k < g.cols && r < g.rows && g.walk[r * g.cols + k] === 1;
    for (let dr = -1; dr <= 1; dr++) for (let dk = -1; dk <= 1; dk++) {
      if (!dk && !dr) continue; const k = k0 + dk, r = r0 + dr; if (!ok(k, r)) continue;
      if (dk && dr && (!ok(k0 + dk, r0) || !ok(k0, r0 + dr))) continue;   // no corner cutting
      out.push({ i: r * g.cols + k, d: dk && dr ? Math.SQRT2 : 1 });
    }
    return out;
  }
  const cellAt = (g, x, y) => { const k = Math.floor(x / g.c), r = Math.floor(y / g.c); return k >= 0 && r >= 0 && k < g.cols && r < g.rows ? r * g.cols + k : -1; };
  const centre = (g, i) => ({ x: ((i % g.cols) + 0.5) * g.c, y: (((i / g.cols) | 0) + 0.5) * g.c });
  // the walkable cell nearest (x, y), optionally only within component `comp`
  AP.nearest = function (g, x, y, comp) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < g.walk.length; i++) {
      if (!g.walk[i] || (comp != null && g.comp[i] !== comp)) continue;
      const p = centre(g, i), d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  // the component a point belongs to (an off-grid point snaps to the nearest walkable cell)
  AP.compOf = function (g, p) { let i = cellAt(g, p.x, p.y); if (i < 0 || !g.walk[i]) i = AP.nearest(g, p.x, p.y); return i < 0 ? -1 : g.comp[i]; };
  AP.lineFree = function (g, a, b) {
    const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / 4));
    for (let i = 0; i <= n; i++) { const t = i / n; if (!AP.walkPt(g, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false; }
    return true;
  };
  // A* from cell s to cell t (binary heap)
  function astar(g, s, t) {
    const N = g.walk.length, gs = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const tc = centre(g, t), h = (i) => { const p = centre(g, i), dx = Math.abs(p.x - tc.x) / g.c, dy = Math.abs(p.y - tc.y) / g.c; return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    const heap = [], push = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top[1]; };
    gs[s] = 0; push(s, h(s));
    while (heap.length) {
      const cur = pop(); if (cur === t) break; if (closed[cur]) continue; closed[cur] = 1;
      for (const n of nbrs(g, cur)) { const ng = gs[cur] + n.d; if (ng < gs[n.i]) { gs[n.i] = ng; from[n.i] = cur; push(n.i, ng + h(n.i)); } }
    }
    if (s !== t && from[t] === -1) return null;
    const cells = []; for (let i = t; i !== -1; i = from[i]) { cells.push(centre(g, i)); if (i === s) break; }
    return cells.reverse();
  }
  // Waypoints from `from` to `to` (the start excluded; [] = already there), or null if `to` can't be reached. A goal that
  // isn't walkable walks to the nearest walkable spot of your own floor (draft §6: "Path blocked" is the caller's call).
  AP.findPath = function (site, from, to) {
    const g = AP.grid(site), comp = AP.compOf(g, from);
    if (comp < 0) return null;
    let goal = to, gi = cellAt(g, to.x, to.y);
    if (gi < 0 || !g.walk[gi] || g.comp[gi] !== comp || !AP.walkPt(g, to.x, to.y)) { gi = AP.nearest(g, to.x, to.y, comp); if (gi < 0) return null; goal = centre(g, gi); }
    if (Math.hypot(goal.x - from.x, goal.y - from.y) < 1) return [];
    if (AP.walkPt(g, from.x, from.y) && AP.lineFree(g, from, goal)) return [goal];
    let si = cellAt(g, from.x, from.y); if (si < 0 || !g.walk[si]) si = AP.nearest(g, from.x, from.y, comp);
    const cells = astar(g, si, gi); if (!cells) return null;
    const pts = [from].concat(cells, [goal]), out = []; let a = 0;
    while (a < pts.length - 1) { let b = pts.length - 1; while (b > a + 1 && !AP.lineFree(g, pts[a], pts[b])) b--; out.push(pts[b]); a = b; }
    return out;
  };
  AP.reachable = function (site, from, to) { const g = AP.grid(site), c = AP.compOf(g, from); return c >= 0 && c === AP.compOf(g, to); };
  AP.pathLength = (from, pts) => { let d = 0, p = from; for (const q of pts || []) { d += Math.hypot(q.x - p.x, q.y - p.y); p = q; } return d; };

  // How far a token at (x, y) is from object o: from its centre line (a wide object, the truck, counts its whole width).
  AP.objDist = function (o, x, y) {
    if (o.stand) return Math.hypot(x-o.stand.x,y-o.stand.y);
    const hw = Math.max(0, (V().objPx * (o.wide || (DATA.searchables.types[o.type] || {}).wide || 1)) / 2 - V().objPx / 2);
    return Math.hypot(Math.max(0, Math.abs(x - o.x) - hw), y - o.y);
  };
  AP.inRange = (o, p) => AP.objDist(o, p.x, p.y) <= (o.stand ? 12 : W().rangePx + 0.5);
  // Where to stand to use o, walking from `from`: the walkable spot of your own floor within interaction range that's the
  // shortest straight line from you (you already in range = stay). null: nothing in range is reachable ("Path blocked").
  AP.standPoint = function (site, o, from) {
    const g = AP.grid(site), comp = AP.compOf(g, from);
    if (comp < 0) return null;
    if (o.stand) return AP.walkPt(g,o.stand.x,o.stand.y) && AP.reachable(site,from,o.stand) ? {x:o.stand.x,y:o.stand.y} : null;
    if (AP.walkPt(g, from.x, from.y) && AP.inRange(o, from)) return { x: from.x, y: from.y };
    let best = null, bd = Infinity;
    for (let i = 0; i < g.walk.length; i++) {
      if (!g.walk[i] || g.comp[i] !== comp) continue;
      const p = centre(g, i); if (!AP.inRange(o, p)) continue;
      const d = Math.hypot(p.x - from.x, p.y - from.y); if (d < bd) { bd = d; best = p; }
    }
    return best;
  };
  // Where you appear at an exit (a new Area's paired anchor, or the way in): a step inside from it (not on top of it),
  // still within reach of it, so one click takes you back.
  AP.anchorFor = function (site, o) {
    if (o.stand && AP.walkPt(AP.grid(site),o.stand.x,o.stand.y)) return {x:o.stand.x,y:o.stand.y};
    const g = AP.grid(site), want = Math.min(48, W().rangePx - 6);
    let best = -1, bd = Infinity;
    for (let i = 0; i < g.walk.length; i++) { if (!g.walk[i]) continue; const p = centre(g, i), d = Math.abs(AP.objDist(o, p.x, p.y) - want) + 0.01 * Math.hypot(p.x - o.x, p.y - o.y); if (d < bd) { bd = d; best = i; } }
    if (best < 0) { const R = site.rooms[0]; return { x: R.x + R.w / 2, y: R.y + R.h / 2 }; }
    return centre(g, best);
  };
})(typeof window !== "undefined" ? window : globalThis);
