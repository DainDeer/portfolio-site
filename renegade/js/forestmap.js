// SP-131 · the 3D forest map screen (SP-129 style C, Smudge's BUILD_NOTES): traversal on a V2 run in a forest zone.
// The scene is js/b3d/map3d.js (an ES module, loaded on demand like the 3D battles); it draws the forest, the fog and the
// modifier features. Everything with text is DOM here: map names, feature pins, the notoriety token. The Map card is the
// existing panel (js/traversal.js), restyled (css/forest.css). Presentation only: every rule stays in G.V2 / G.Exp.
// The view is built once and kept across UI.render() calls (one WebGL context, one bake); it re-bakes only when what it
// shows changes (fog, Maps, modifiers, the frame size). No WebGL / Low graphics / any failure: the 2D map (G.MapView).
(function (root) {
  const G = root.G;
  const FM = G.ForestMap = { MODULE: "js/b3d/map3d.js", view: null, host: null, sig: null, failed: null, loading: null, mod: null };
  const D = () => DATA.forestMap;
  const hex = (c) => parseInt(String(c).replace("#", ""), 16);

  // ---------- pure: what the forest shows (tested headless, tests/forestmap.js) ----------
  // a modifier's rung on the six-colour ladder: its own tier if it has one, else by danger pips (data, PLACEHOLDER)
  FM.tierOf = function (def) {
    const C = D(); if (def && def.tier && C.colors[def.tier]) return def.tier;
    const d = Math.max(-1, Math.min(5, Math.round((def && def.danger) || 0)));
    return C.tierByDanger[String(d)] || "white";
  };
  FM.featureOf = (id) => D().features[id] || "unknown";
  FM.notoStage = function (level) {   // 0 = no token; 1..4 = Smudge's stages
    const A = D().notoriety.stageAt; let st = 0;
    for (let i = 0; i < A.length; i++) if (level >= A[i]) st = i + 1;
    return st;
  };
  FM.scene = function () {
    const s = G.state, r = s.run, map = G.Zones.map(), C = D(), V = DATA.map.view || {};
    const vis = (nid) => !!(r && G.Exp.visible(nid));
    const known = (nid) => vis(nid) || (DATA.config.expedition.fogPersistsBetweenRuns && s.everSeen[nid]) || nid === map.insertion;
    const unknown = {};
    if (r) { let fr = Object.keys(r.visited); const dist = {}; fr.forEach((n) => (dist[n] = 0));
      for (let d = 1; d <= (V.showUnknownRadius || 1); d++) { const nx = []; for (const n of fr) for (const m of G.Map.neighbors(map, n)) if (dist[m] == null) { dist[m] = d; nx.push(m); } fr = nx; }
      for (const n in dist) if (!known(n) && !map.nodes[n].hiddenUntilAdjacent) unknown[n] = true; }
    const maps = [], fog = [], mods = [], tags = [];
    for (const nid in map.nodes) {
      const n = map.nodes[nid], loc = G.Map.loc(n), isK = known(nid), isU = !!unknown[nid];
      if (!isK && !isU) continue;
      const lid = loc ? loc.id || n.loc : "insertion";
      maps.push({ id: nid, x: n.x, y: n.y, r: C.nodeR, landmark: C.landmarks[loc ? n.loc : "insertion"] });
      fog.push(vis(nid) ? { x: n.x, y: n.y, r: C.revealR } : { x: n.x, y: n.y, r: isU ? C.thinR : C.revealR * 0.8, thin: true });
      const tag = { id: nid, name: isU ? C.text.unscouted : G.Util.copy(G.Map.label(n)), fog: isU, here: !!(r && r.loc === nid), sub: "", noto: 0, reachable: !!(r && G.Exp.canMoveTo(nid)), loc: lid };
      if (!isU && loc && vis(nid) && G.V2 && G.V2.on()) {
        const I = G.V2.intel(nid);
        if (I) {
          tag.sub = [I.className, I.danger ? "\u2620".repeat(I.danger) : ""].filter(Boolean).join(" \u00b7 ");
          I.mods.forEach((m, i) => {
            const def = G.V2.modDef(m.id) || {}, k = I.mods.length, a = (i / Math.max(1, k)) * Math.PI * 2 - Math.PI / 2 + (n.x % 7) * 0.1, tier = FM.tierOf(def);
            mods.push({ id: "fm_" + nid + "_" + m.id, mapId: nid, modId: m.id, type: FM.featureOf(m.id), tier, cat: m.cat, name: m.name, x: n.x + Math.cos(a) * C.modRing, y: n.y + Math.sin(a) * C.modRing * 0.75, yaw: a });
          });
        }
        const st = G.V2.attState(nid); tag.noto = st ? G.V2.attNoto(st) : 0;
      }
      tags.push(tag);
    }
    const ids = new Set(maps.map((m) => m.id)), edges = map.edges.filter(([a, b]) => ids.has(a) && ids.has(b) && !(unknown[a] && unknown[b]));
    return { maps, edges, fog, mods, tags, zone: map.zone || "a" };
  };
  FM.wanted = function () {
    const C = D(), r = G.state.run;
    if (!C || !C.enabled || !r || !(G.V2 && G.V2.on())) return false;
    if (C.zones.indexOf(G.Zones.map().zone || "a") < 0) return false;
    if (FM.failed) return false;
    if (G.Gfx && (G.Gfx.graphics() === "low" || !G.Gfx.webgl())) return false;
    return typeof document !== "undefined";
  };

  // ---------- the DOM view ----------
  FM.load = function () {
    if (!FM.loading) FM.loading = import(new URL(FM.MODULE, document.baseURI).href).then((m) => (FM.mod = m), (e) => { FM.loading = null; throw e; });
    return FM.loading;
  };
  FM.fail = function (why) { FM.failed = String(why || "failed"); console.warn("[forestmap] 2D map instead: " + FM.failed); try { if (FM.view) FM.view.dispose(); } catch (e) { /* gone */ } FM.view = null; FM.host = null; FM.sig = null; if (G.UI) G.UI.render(); };
  FM.render = function (box, onPick) {
    const C = D(), phone = !!(G.Touch && G.Touch.layout());
    FM.onPick = onPick;
    if (!FM.host) {
      FM.host = document.createElement("div"); FM.host.className = "forest-wrap"; FM.host.dataset.forest = "loading";
      FM.stage = document.createElement("div"); FM.stage.className = "forest-stage"; FM.host.appendChild(FM.stage);
      FM.chrome = document.createElement("div"); FM.chrome.className = "forest-chrome"; FM.host.appendChild(FM.chrome);
      const ld = document.createElement("div"); ld.className = "forest-loading"; ld.textContent = C.text.loading; FM.host.appendChild(ld);
      if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => FM.fit()).observe(FM.host);
    }
    box.appendChild(FM.host);
    FM.phone = phone;
    const S = FM.scene(); FM.last = S;
    const sig = JSON.stringify([S.maps, S.edges, S.fog, S.mods.map((m) => [m.id, m.tier, m.type]), phone]);
    // the box joins the page after this returns (UI.render): measure and place the chrome on the next frame
    if (FM.view) { FM.view.stop(); FM.view.select(G.Traversal && G.Traversal.sel); requestAnimationFrame(() => { if (!FM.view || !FM.host.isConnected) return; FM.fit(); FM.view.start();
      if (sig !== FM.sig) { FM.sig = sig; FM.push(S).then(() => FM.chromeDraw(), (e) => FM.fail(e && e.message)); } else FM.chromeDraw(); }); return; }
    if (FM.building) return;
    FM.building = true;
    requestAnimationFrame(() => FM.build(sig).catch((e) => FM.fail(e && e.message)).then(() => { FM.building = false; }));
  };
  FM.build = async function (sig) {
    const C = D(), m = await FM.load(), W = FM.host.clientWidth || 800, H = FM.host.clientHeight || 520;
    const v = await m.createMapView(FM.stage, { assetRoot: (G.Gfx && G.Gfx.MODELS_BASE) || "assets/3d/", width: W, height: H, portrait: FM.phone && H > W, dpr: C.dpr, fit: C.fit || "maps",
      fogCards: FM.phone ? C.fogCardsPhone : C.fogCards, colorKey: (x) => x.tier,
      featureOf: (x) => m.FEATURES[x.type] || m.FEATURES.unknown,
      onSelect: (hit) => { if (!hit) return; const mp = hit.kind === "map" ? hit.id : (FM.last.mods.find((x) => x.id === hit.id) || {}).mapId; if (mp && FM.onPick) FM.onPick(mp); } });
    if (!v) throw new Error("no WebGL");
    FM.view = v; v.setWorld(C.world); v.setPalette(Object.fromEntries(Object.entries(C.colors).map(([k, c]) => [k, hex(c)])));
    FM.sig = sig; await FM.push(FM.last);
    FM.size = [W, H]; FM.host.dataset.forest = "on"; FM.fit(); v.start(); FM.chromeDraw();
    root.__forestStats = v.stats();
  };
  FM.push = async function (S) { const v = FM.view; v.setMaps(S.maps, S.edges); v.setFog(S.fog); v.setModifiers(S.mods); await v.update(); };
  FM.fit = function () {
    if (!FM.view || !FM.host || !FM.host.isConnected) return;
    const W = FM.host.clientWidth, H = FM.host.clientHeight; if (!W || !H || (FM.size && FM.size[0] === W && FM.size[1] === H)) return;
    FM.size = [W, H]; FM.view.resize(W, H); FM.chromeDraw();
  };
  FM.stop = function () { if (FM.view) FM.view.stop(); };
  // map names, feature pins and notoriety tokens, placed with view.project (crisp at any DPR, styled by CSS)
  FM.chromeDraw = function () {
    const v = FM.view, S = FM.last, C = D(), ch = FM.chrome; if (!v || !S || !ch || !FM.host.isConnected) return;
    ch.innerHTML = ""; const W = FM.host.clientWidth, sel = G.Traversal && G.Traversal.sel;
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    for (const t of S.tags) {
      const p = v.project(t.id); if (!p) continue;
      const tg = el("button", "forest-tag" + (t.here ? " here" : "") + (t.fog ? " fog" : "") + (t.reachable ? " reachable" : "") + (sel === t.id ? " sel" : ""));
      tg.type = "button"; tg.dataset.node = t.id; tg.dataset.forestTag = t.id;
      if (t.here) tg.appendChild(el("i", "ft-here", C.text.here));
      const nm = el("span", "ft-name", (t.fog ? "? " : "") + t.name); tg.appendChild(nm);
      const stage = FM.notoStage(t.noto);
      if (stage) { const img = el("img", "ft-noto"); img.src = DATA.sprites.basePath + C.notoriety.files[stage - 1].file; img.alt = `${C.text.notoriety}: ${C.notoriety.names[stage - 1]}`; img.title = img.alt; img.dataset.noto = String(stage); nm.appendChild(img); }
      if (t.sub && !FM.phone) tg.appendChild(el("small", null, t.sub));
      if (!t.fog) tg.addEventListener("click", () => FM.onPick && FM.onPick(t.id)); else tg.disabled = true;
      tg.style.top = Math.round(p.y + (FM.phone ? 10 : 14)) + "px"; ch.appendChild(tg);
      const half = tg.offsetWidth / 2 + 4; tg.style.left = Math.round(Math.max(half, Math.min(W - half, p.x))) + "px";
    }
    for (const f of S.mods) {
      const p = v.project(f.id); if (!p) continue;
      const pin = el("button", "forest-pin"); pin.type = "button"; pin.dataset.mod = f.modId; pin.dataset.tier = f.tier; pin.title = f.name;
      pin.style.setProperty("--c", C.colors[f.tier] || C.colors.unknown);
      const ic = el("img"); ic.src = DATA.sprites.basePath + (C.icons[f.cat] || C.icons.unknown).file; ic.alt = f.name; pin.appendChild(ic);
      pin.addEventListener("click", () => FM.onPick && FM.onPick(f.mapId));
      pin.style.left = Math.round(p.x) + "px"; pin.style.top = Math.round(p.y - (FM.phone ? 30 : 44)) + "px"; ch.appendChild(pin);
    }
    ch.appendChild(el("div", "forest-hint", FM.phone ? C.text.hint : C.text.hintDesktop));
  };
})(typeof window !== "undefined" ? window : globalThis);
