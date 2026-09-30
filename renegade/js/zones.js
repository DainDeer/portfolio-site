// Zones (Slice 2 §4): per-zone maps, the current map, passages between zones.
(function (root) {
  const G = root.G;
  const Z = G.Zones = {};
  Z.def = (zid) => DATA.zones.list[zid];
  // Zone A: generated from the save seed (G.Map.generate). Others: hand-made node lists in data/zones.js.
  Z.build = function (zid, seed) {
    const d = Z.def(zid);
    if (d.generated) return G.Map.generate(seed >>> 0, zid);
    const nodes = {};
    for (const id in d.nodes) { const n = Object.assign({ id }, d.nodes[id]); nodes[id] = { id, x: n.x, y: n.y, loc: n.loc, tier: n.tier || d.tier || 1, zone: zid, hiddenUntilAdjacent: !!n.hiddenUntilAdjacent }; }
    return { zone: zid, insertion: d.insertion, nodes, edges: d.edges.map((e) => e.slice()) };
  };
  Z.buildAll = function (seed) { const out = {}; for (const z of DATA.zones.order) out[z] = Z.build(z, seed); return out; };
  Z.map = function (zid) { const s = G.state; return s.maps[zid || (s.run ? s.run.zone : "a")] || s.maps.a; };
  Z.cur = () => (G.state.run ? G.state.run.zone : "a");
  Z.unlocked = (zid) => !!G.state.zonesUnlocked[zid];
  Z.node = function (nid) { for (const z in G.state.maps) if (G.state.maps[z].nodes[nid]) return G.state.maps[z].nodes[nid]; return null; };
  Z.zoneOf = function (nid) { for (const z in G.state.maps) if (G.state.maps[z].nodes[nid]) return z; return null; };
  Z.insertion = (zid) => Z.map(zid).insertion;
  // passage end in a zone -> node id on that zone's map
  Z.passageNode = function (pid, zid) {
    const P = DATA.zones.passages[pid];
    for (const k in P.ends) { const e = P.ends[k]; if (e.zone !== zid) continue; if (e.node) return e.node; const n = G.Map.nodeOfLoc(Z.map(zid), e.loc); return n && n.id; }
    return null;
  };
  Z.passageAt = function (locId) { const l = DATA.map.locations[locId]; return l && l.passage ? Z.passagesOf(l)[0] : null; };
  // Slice 5 §G: a location can hold several passages (the Rail Yard: the storm drain + the hidden rail spur)
  Z.passagesOf = (loc) => (!loc || !loc.passage ? [] : [].concat(loc.passage));
  Z.otherEnd = function (pid, zid) { const P = DATA.zones.passages[pid]; for (const k in P.ends) if (P.ends[k].zone !== zid) return P.ends[k].zone; return null; };
  Z.passageFound = (pid) => !!G.state.passages[pid];
  // Is the passage visible from this zone's end? (hidden at the Zone A end until spotted; always visible from B1)
  Z.passageVisible = (pid, zid) => Z.passageFound(pid) || DATA.zones.passages[pid].hiddenAt !== zid;
  // zone-select card facts, only what the player has seen
  Z.knownFacts = function (zid) {
    const map = G.state.maps[zid], seen = G.state.everSeen, ex = [], tags = new Set();
    for (const nid in map.nodes) {
      const n = map.nodes[nid], l = G.Map.loc(n);
      if (!l || !seen[nid]) continue;
      if (l.extraction) ex.push(l.name);
      for (const t of l.tags || []) tags.add(t);
    }
    return { extractions: ex, tags: [...tags] };
  };
})(typeof window !== "undefined" ? window : globalThis);
