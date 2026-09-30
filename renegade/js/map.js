// Region generation (once per save, from seed) + fog helpers.
(function (root) {
  const G = root.G, U = G.Util;
  const M = G.Map = {};

  M.generate = function (seed) {
    const D = DATA.map, rng = U.makeRng((seed ^ 0x9e3779b9) >>> 0);
    const nodes = { outpost: { id: "outpost", row: 0, x: 60, y: 300, loc: null } };
    const rows = [["outpost"]];
    const W = 1000, H = 600, nRows = D.rows.length;
    D.rows.forEach((count, ri) => {
      const r = ri + 1, ids = [];
      for (let i = 0; i < count; i++) {
        const id = "n" + r + "_" + i;
        const y = (H / (count + 1)) * (i + 1) + rng.range(-35, 35);
        const x = 60 + (r * (W - 120)) / nRows + rng.range(-30, 30);
        nodes[id] = { id, row: r, x, y, loc: null };
        ids.push(id);
      }
      rows.push(ids);
    });
    const edges = [];
    const addEdge = (a, b) => { if (a === b) return; if (!edges.some((e) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a))) edges.push([a, b]); };
    // outpost exits: connect to every row-1 node
    for (const id of rows[1]) addEdge("outpost", id);
    for (let r = 1; r < rows.length - 1; r++) {
      const A = rows[r], B = rows[r + 1];
      A.forEach((a, i) => {
        const j = A.length === 1 ? Math.floor(B.length / 2) : Math.round((i * (B.length - 1)) / (A.length - 1));
        addEdge(a, B[j]);
        if (rng() < D.extraEdgeChance) { const k = U.clamp(j + (rng() < 0.5 ? -1 : 1), 0, B.length - 1); addEdge(a, B[k]); }
      });
      B.forEach((b, j) => { if (!edges.some((e) => e.includes(b) && A.some((a) => e.includes(a)))) addEdge(A[Math.min(A.length - 1, Math.round((j * (A.length - 1)) / Math.max(1, B.length - 1)))], b); });
      for (let i = 0; i < A.length - 1; i++) if (rng() < D.sideEdgeChance) addEdge(A[i], A[i + 1]);
    }
    // Connectivity repair: movement never passes through the outpost, so the locations must form ONE connected
    // graph without it (otherwise a run can wander into a part of the map with no extraction). Deterministic
    // (no rng draws), so maps that were already connected are unchanged.
    for (let guard = 0; guard < 20; guard++) {
      const comp = {}; let c = 0;
      for (const id in nodes) {
        if (id === "outpost" || comp[id] != null) continue;
        const q = [id]; comp[id] = c;
        while (q.length) { const x = q.shift(); for (const e of edges) { const y = e[0] === x ? e[1] : e[1] === x ? e[0] : null; if (y && y !== "outpost" && comp[y] == null) { comp[y] = c; q.push(y); } } }
        c++;
      }
      if (c <= 1) break;
      let fixed = false; // join the first same-row neighbours that sit in different components, shallowest row first
      for (let r = 1; r < rows.length && !fixed; r++) for (let i = 0; i < rows[r].length - 1 && !fixed; i++) if (comp[rows[r][i]] !== comp[rows[r][i + 1]]) { addEdge(rows[r][i], rows[r][i + 1]); fixed = true; }
      if (!fixed) break;
    }
    // assign locations: fixed roles first
    const free = {}; rows.forEach((ids, r) => { if (r > 0) free[r] = ids.slice(); });
    for (const locId in D.fixed) {
      const allowed = D.fixed[locId].rows.filter((r) => free[r] && free[r].length);
      if (!allowed.length) continue;
      const r = rng.pick(allowed), nid = rng.pick(free[r]);
      free[r].splice(free[r].indexOf(nid), 1);
      nodes[nid].loc = locId;
    }
    const pool = rng.shuffle(Object.keys(D.locations).filter((k) => !D.fixed[k] && !D.locations[k].zone && !D.locations[k].secret));   // Zone B locations have their own hand-made map
    for (const r in free) for (const nid of free[r]) nodes[nid].loc = pool.length ? pool.pop() : "riverbed_camp";
    // Slice 4 §B guaranteed locations (deterministic swap, no rng draws: maps that already had them are unchanged)
    for (const locId in D.guaranteed || {}) {
      if (Object.values(nodes).some((n) => n.loc === locId)) continue;
      let swap = null;
      for (const r of D.guaranteed[locId].rows) { swap = (rows[r] || []).find((nid) => nodes[nid].loc && !D.fixed[nodes[nid].loc] && !(D.guaranteed || {})[nodes[nid].loc]); if (swap) break; }
      if (swap) nodes[swap].loc = locId;
    }
    // Slice 5 §G: secret spurs (the Witch's Cottage off Owlfall Hollow). A dead-end node next to its host, hidden from
    // every graph walk (M.neighbors) until a spot check finds it. No rng draws: the rest of the map is unchanged.
    for (const nid in nodes) nodes[nid].tier = DATA.map.rowTier[nodes[nid].row] || 1;
    const map = { seed, zone: "a", insertion: "outpost", nodes, edges };
    M.attachSpurs(map);
    return map;
  };
  // (re)hang every secret spur on its host's node: generation, and after the Main 1 annex clamp swaps the host
  M.attachSpurs = function (map) {
    const D = DATA.map, W = 1000, H = 600;
    map.edges = map.edges.filter((e) => !/^s_/.test(e[1]));
    for (const nid of Object.keys(map.nodes)) {
      const h = map.nodes[nid], l = D.locations[h.loc], sp = l && l.secretSpot; if (!sp || !D.locations[sp.loc] || h.secret) continue;
      const id = "s_" + sp.loc, old = map.nodes[id] || {};
      map.nodes[id] = Object.assign(old, { id, row: h.row, x: U.clamp(h.x + (h.x > W - 160 ? -70 : 48), 40, W - 90), y: U.clamp(h.y + (h.y < H / 2 ? 78 : -78), 40, H - 40), loc: sp.loc, secret: true, tier: h.tier });
      map.edges.push([nid, id]);
    }
  };

  M.neighbors = function (map, nid) {
    const out = [];
    for (const e of map.edges) { if (e[0] === nid) out.push(e[1]); else if (e[1] === nid) out.push(e[0]); }
    return out.filter((n) => !M.hiddenSecret(map.nodes[n]));
  };
  // Slice 5 §G: a secret node nobody has found yet is not on the map at all (no fog "?", no edge, no move, no Hunter path)
  M.secretFound = (locId) => !!(G.state && G.state.secrets && G.state.secrets[locId]);
  M.hiddenSecret = (node) => !!(node && node.secret && !M.secretFound(node.loc));
  M.loc = (node) => (node && node.loc ? DATA.map.locations[node.loc] : null);
  M.nodeOfLoc = (map, locId) => Object.values(map.nodes).find((n) => n.loc === locId);
  // The outpost never appears on a map in Slice 2: Zone A's row-0 node is the Insertion Point (internal id "outpost").
  M.isInsertion = (node) => !!node && !node.loc;
  M.label = (node) => (M.isInsertion(node) ? (DATA.zones.list[node.zone || "a"] || DATA.zones.list.a).insertionName || "Insertion Point" : M.loc(node).name);
})(typeof window !== "undefined" ? window : globalThis);
