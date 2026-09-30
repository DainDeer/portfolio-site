// Region map view: fog of war, visible encounter odds, location states, branching paths.
(function (root) {
  const G = root.G, U = G.Util, SP = G.Sprites;
  const MV = G.MapView = {};
  // Slice 5 §A: animated map icons (a sprite with frames + fps, e.g. the wrecked truck's smoke). One shared timer steps
  // every such canvas still in the page; it stops itself when none is left.
  MV.animate = function (c, d) {
    c.dataset.fps = d.fps; c.dataset.frame = 0; c.dataset.t0 = Date.now();
    if (MV._anim) return;
    MV._anim = setInterval(() => { const cs = document.querySelectorAll("canvas.icon[data-fps]"); if (!cs.length) { clearInterval(MV._anim); MV._anim = 0; return; }
      for (const x of cs) { const f = Math.floor((Date.now() - +x.dataset.t0) / 1000 * +x.dataset.fps); if (f !== +x.dataset.frame) { x.dataset.frame = f; SP.paintIcon(x); } } }, 40);
  };

  // Slice 5 §G (Vixie): the zone backgrounds are painted with their landmarks at the node positions (map space 1000x600
  // stretched over the 1024x640 art). The bg keeps drawing with "cover" (phones keep big tappable nodes), and every node,
  // edge, token and fog hole goes through the same cover transform, so it sits on its landmark at any crop. A node whose
  // landmark falls outside the visible crop is clamped inside the viewport (margin) instead of hidden.
  MV.frame = function (W, H) {
    const V = DATA.map.view || {}, AW = V.artW || 1024, AH = V.artH || 640, k = Math.max(W / AW, H / AH), bw = AW * k, bh = AH * k;
    const ox = (W - bw) / 2, oy = (H - bh) / 2, M = V.edgeMargin || { x: 26, top: 26, bottom: 34 };
    const raw = (x, y) => [ox + (x / 1000) * bw, oy + (y / 600) * bh];
    return { W, H, ox, oy, bw, bh, k: bw / 1000, raw,
      at: (x, y) => { const p = raw(x, y); return [U.clamp(p[0], Math.min(M.x, W / 2), Math.max(W / 2, W - M.x)), U.clamp(p[1], Math.min(M.top, H / 2), Math.max(H / 2, H - M.bottom))]; } };
  };
  // place every map-space element of a rendered map (nodes, tokens, edges, the ground) for the wrap's current size
  MV.layout = function (wrap) {
    const W = wrap.clientWidth || 1000, H = wrap.clientHeight || 600, F = MV.frame(W, H);
    if (wrap._laid === W + "x" + H) return F;
    wrap._laid = W + "x" + H;
    for (const el of wrap.querySelectorAll("[data-mx]")) { const p = F.at(+el.dataset.mx, +el.dataset.my); el.style.left = Math.round(p[0]) + "px"; el.style.top = Math.round(p[1]) + "px"; }
    const svg = wrap.querySelector("svg.map-edges"); if (svg) svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    for (const l of wrap.querySelectorAll("line[data-ax]")) {
      const a = F.at(+l.dataset.ax, +l.dataset.ay), b = F.at(+l.dataset.bx, +l.dataset.by);
      l.setAttribute("x1", a[0]); l.setAttribute("y1", a[1]); l.setAttribute("x2", b[0]); l.setAttribute("y2", b[1]);
    }
    if (wrap._ground) wrap._ground(W, H, F);
    return F;
  };
  const pos = (el, x, y) => { el.dataset.mx = x; el.dataset.my = y; el.style.left = (x / 10) + "%"; el.style.top = (y / 6) + "%"; };   // % until MV.layout runs

  MV.render = function (container, onPick) {
    const s = G.state, map = G.Zones.map(), r = s.run, ins = map.insertion;
    container.innerHTML = "";
    const wrap = document.createElement("div"); wrap.className = "map-wrap";
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg"); svg.setAttribute("viewBox", "0 0 1000 600"); svg.setAttribute("preserveAspectRatio", "none"); svg.classList.add("map-edges");   // viewBox: wrap px once MV.layout runs
    const vis = (nid) => (r ? G.Exp.visible(nid) : false);
    const known = (nid) => vis(nid) || (DATA.config.expedition.fogPersistsBetweenRuns && s.everSeen[nid]) || nid === ins;
    const V = DATA.map.view || {};
    // unscouted: within showUnknownRadius steps of a visited node but not visible -> "?" marker, no name/odds
    const unknownSet = {};
    if (r && (V.showUnknownRadius || 1) > 1) {
      let frontier = Object.keys(r.visited);
      const dist = {}; frontier.forEach((n) => (dist[n] = 0));
      for (let d = 1; d <= V.showUnknownRadius; d++) {
        const next = [];
        for (const n of frontier) for (const m of G.Map.neighbors(map, n)) if (dist[m] == null) { dist[m] = d; next.push(m); }
        frontier = next;
      }
      for (const n in dist) if (!known(n) && !map.nodes[n].hiddenUntilAdjacent) unknownSet[n] = true;   // B6: no "Unscouted" marker
    }
    // a location with a live distress countdown is always drawn (the radio told you where it is)
    const countdownOf = (nid) => { const n = map.nodes[nid], l = G.Map.loc(n); if (!r || !l || !l.worldEvent) return 0; const wo = G.Exp.worldOverride(n); return wo && wo.countdown ? wo.countdown : 0; };
    const known0 = known;
    const knownOrCountdown = (nid) => known0(nid) || countdownOf(nid) > 0;
    for (const n in unknownSet) if (countdownOf(n) > 0) delete unknownSet[n];
    const shown = (nid) => knownOrCountdown(nid) || unknownSet[nid];
    const ground = document.createElement("canvas"); ground.className = "map-ground"; wrap.appendChild(ground);
    for (const [a, b] of map.edges) {
      if (!shown(a) || !shown(b)) continue;
      const na = map.nodes[a], nb = map.nodes[b];
      const l = document.createElementNS(svgNS, "line");
      l.setAttribute("x1", na.x); l.setAttribute("y1", na.y); l.setAttribute("x2", nb.x); l.setAttribute("y2", nb.y);
      l.dataset.ax = na.x; l.dataset.ay = na.y; l.dataset.bx = nb.x; l.dataset.by = nb.y;
      const active = r && ((a === r.loc && G.Exp.canMoveTo(b)) || (b === r.loc && G.Exp.canMoveTo(a)));
      l.setAttribute("class", active ? "edge active" : (vis(a) && vis(b) ? "edge" : "edge dim"));
      if (unknownSet[a] && unknownSet[b]) continue;
      svg.appendChild(l);
    }
    wrap.appendChild(svg);
    for (const nid in map.nodes) {
      const n = map.nodes[nid];
      if (unknownSet[nid]) {
        const el = document.createElement("div"); el.className = "map-node unknown";
        pos(el, n.x, n.y);
        el.appendChild(SP.icon("loc_unknown", 32));
        const name = document.createElement("div"); name.className = "mn-name"; name.textContent = "Unscouted"; el.appendChild(name);
        wrap.appendChild(el); continue;
      }
      if (!knownOrCountdown(nid)) continue;
      const loc = G.Map.loc(n), isVis = vis(nid);
      const el = document.createElement("div");
      el.className = "map-node" + (isVis ? "" : " remembered") + (r && r.loc === nid ? " current" : "") + (r && r.visited[nid] ? " visited" : "");
      pos(el, n.x, n.y);
      const wIcon = loc && loc.worldIcons && loc.worldEvent ? loc.worldIcons[s.world.hollow_creek] : null; // world-state icon (distress / aftermath)
      const wreck = loc && loc.iconWrecked && G.Exp.wrecked(n), still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      const iconKey = !loc ? SP.or((DATA.zones.list[map.zone || "a"] || {}).insertionIcon, "loc_insertion") : wreck ? (loc.iconWreckedAnim && !still ? loc.iconWreckedAnim : loc.iconWrecked) : (wIcon || G.Map.icon(loc));   // Slice 5 §A: the wreck (animated unless reduced motion)
      const ic = SP.icon(iconKey, 32); el.appendChild(ic); if ((SP.def(iconKey) || {}).fps) MV.animate(ic, SP.def(iconKey));
      el.dataset.nid = nid;
      if (loc && loc.extraction) el.classList.add("extract");   // Slice 4 §A: tutorial T2 rings extraction points
      // passage icon (once found), quest marker (an active find quest's object is here and holds the item)
      for (const pid of G.Zones.passagesOf(loc)) if (G.Zones.passageVisible(pid, map.zone || "a")) { const P = DATA.zones.passages[pid], pi = SP.icon(SP.or(P.mapIcon, "map_passage"), 20, "mn-passage"); pi.title = P.name + ": leads to " + DATA.zones.list[G.Zones.otherEnd(pid, map.zone || "a")].name; el.appendChild(pi); }   // Slice 5 §G: the Rail Yard has two
      if (loc && G.Quests.findObjectsAt(map.zone || "a", n.loc).some((q) => G.Quests.itemAvailable(q))) { const qm = document.createElement("div"); qm.className = "mn-quest"; qm.textContent = "!"; qm.title = "Quest objective here"; el.appendChild(qm); }
      const cd = countdownOf(nid);
      if (cd > 0) { const b = document.createElement("div"); b.className = "mn-countdown"; b.textContent = `⏳ ${cd}`; b.title = `Hollow Creek holds for ${cd} more move${cd === 1 ? "" : "s"}. Arrive in time to defend it.`; el.appendChild(b); el.classList.add("distress"); }
      const name = document.createElement("div"); name.className = "mn-name"; name.textContent = G.Map.label(n); el.appendChild(name);
      if (loc && isVis && r) {
        const o = G.Exp.odds(n), revisit = r.visited[nid] && nid !== r.loc, rv = revisit ? G.Exp.revisitInfo(n) : null, site = G.Exp.site(nid), eh = G.Exp.entryHostiles(n);
        o.hostiles = Math.round(eh.pct * 10) / 10;   // Slice 3 §12: a picked-over place has fewer Hostiles on the first entry of a run
        const odds = document.createElement("div"); odds.className = "mn-odds";
        odds.innerHTML = revisit ? `<span class="h">↺⚔${Math.round(rv.pct * 10) / 10}%</span>` + (site ? ` <span class="c">▣${site.objects.filter((x) => x.kind === "search" && !x.searched && !x.blocked).length} left</span>` : "")
          : `<span class="h">⚔${o.hostiles}%</span> <span class="e">?${o.event}%</span> <span class="s">☺${o.survivors}%</span>`;
        el.appendChild(odds);
        if (!loc.extraction) { const lr = document.createElement("div"); const read = G.Exp.lootRead(nid); lr.className = "mn-loot" + (/^Picked/.test(read) ? " picked" : ""); lr.dataset.lootRead = read; lr.textContent = read; el.appendChild(lr); }
        const tags = [];
        if (loc.extraction) { const ex = G.Exp.extractionDef(n); tags.push(G.Exp.extractionOpen(n) ? `EXTRACT (${ex.type === "check" ? DATA.skills[ex.skill].name + " DC " + ex.dc : ex.type})` : G.Exp.wrecked(n) ? "WRECKED" : "EXTRACT CLOSED"); }   // Slice 5 §A
        const wo = G.Exp.worldOverride(n); if (wo) tags.push(wo.label);
        if (r.visited[nid] && nid !== r.loc) tags.push("visited");
        if (loc.size) tags.push(loc.size);
        const scoutHid = G.Scout && G.Scout.hidden(nid);
        tags.push("T" + n.tier + " · " + (scoutHid ? "Unscouted" : DATA.enemies.families[loc.family].name));
        const tg = document.createElement("div"); tg.className = "mn-tags"; tg.textContent = tags.join(" · "); el.appendChild(tg);
        el.addEventListener("mouseenter", (e) => G.UI.showTip(`<b>${loc.name}</b> (${loc.size || "M"})<br>` + (revisit ? `Revisit: ${rv.text}<br>Events and searched objects stay as you left them.` : `${eh.level < 1 ? eh.text + "<br>" : ""}Hostiles ${o.hostiles}% · Event ${o.event}% · Survivors ${o.survivors}%<br>` + (!loc.extraction ? `Loot: ${G.Exp.lootRead(nid)}${site && site.pickedOver ? ` (restocks 1 step per run, ${G.Exp.restockSteps(site)} to full)` : ""}<br>` : "") + `<i>Odds are independent (they don't sum to 100). Event % = is there an event object inside.</i>`) + (G.Scout ? G.Scout.tipHtml(nid) : "") + (scoutHid ? `Tier ${n.tier}; enemies, resources: <span class="unscouted">Unscouted</span>` : `Tier ${n.tier}, ${DATA.enemies.families[loc.family].name}; resources: ${(loc.tags || []).map((t) => DATA.resources[t] || Object.values(DATA.resources).find((r) => r.tag === t)).filter(Boolean).map((r) => r.name).join(", ") || "–"}${(loc.tags || []).some((t) => t === "terminal" || t === "office") ? " · terminals" : ""}`) + (r.loc === nid ? "<br><b>Click to go back inside.</b>" : ""), e.clientX, e.clientY));
        el.addEventListener("mouseleave", () => G.UI.hideTip());
      } else if (loc && !isVis) {
        const tg = document.createElement("div"); tg.className = "mn-tags"; tg.textContent = cd > 0 ? `Distress call · holds ${cd} more move${cd === 1 ? "" : "s"}` : "(remembered — fogged)"; el.appendChild(tg);
      }
      if (r && G.Exp.canMoveTo(nid)) { el.classList.add("reachable"); el.addEventListener("click", () => onPick(nid)); }
      else if (r && r.loc === nid && loc && !r.queue.length) { el.classList.add("enterable"); el.addEventListener("click", () => onPick(nid)); }
      wrap.appendChild(el);
    }
    // Slice 3 §4b: the Hunter pack token (visible through fog) + its last tracks; "You're being tracked" banner once
    const hp = r && r.hunt && r.hunt.pack;
    if (hp && (hp.zone || "a") === (map.zone || "a") && map.nodes[hp.nid]) {
      const n = map.nodes[hp.nid], path = (hp.trail || []).concat([hp.nid]);
      for (let i = 0; i < path.length - 1; i++) {
        const a = map.nodes[path[i]], c = map.nodes[path[i + 1]]; if (!a || !c || a === c) continue;
        const tk = SP.icon("map_hunter_tracks", 16, "map-hunter-tracks"); pos(tk, (a.x + c.x) / 2, (a.y + c.y) / 2);
        tk.style.transform = `translate(-50%,-50%) rotate(${Math.atan2(c.y - a.y, c.x - a.x) + Math.PI / 4}rad)`; wrap.appendChild(tk);
      }
      const tok = document.createElement("div"); tok.className = "map-hunter" + (hp.lostFor > 0 ? " lost" : ""); tok.dataset.hunterAt = hp.nid;
      pos(tok, n.x, n.y); tok.appendChild(SP.icon("map_hunter_pack", 32));
      tok.title = `Hunter pack (${hp.tier}): moves 1 node toward you after each of your moves${G.Hunters.slowEvery() > 1 ? " (every 2nd move: Hunter's Garb)" : ""}${hp.lostFor > 0 ? `. Lost your trail for ${hp.lostFor} more moves` : ""}. Crossing a passage shakes them off.`;
      wrap.appendChild(tok);
    }
    // Slice 3 §7 / §10b: Radio L2 marks where the next rival squad was last seen (drawn through fog)
    const rvn = r && G.Rivals && G.Rivals.markedNode();
    if (rvn && map.nodes[rvn]) {
      const n = map.nodes[rvn], nx = G.Rivals.st().next, snap = G.Rivals.byId(nx.id);
      const tok = document.createElement("div"); tok.className = "map-rival"; tok.dataset.rivalAt = rvn;
      pos(tok, n.x, n.y); tok.appendChild(SP.icon("map_rival", 26));
      tok.title = `Rival squad${snap ? " " + snap.handle : ""} last seen here (Radio). You'll meet them if you enter.`;
      wrap.appendChild(tok);
    }
    if (r && r.hunt && r.hunt.banner && !r.hunt.banner.shown) {
      r.hunt.banner.shown = true; G.Sfx.play("sfx_hunter_alert");
      const bn = document.createElement("div"); bn.className = "map-banner hunter"; bn.textContent = "⚠ " + r.hunt.banner.text; wrap.appendChild(bn); setTimeout(() => bn.remove(), 3500);
    }
    container.appendChild(wrap);
    wrap.dataset.zone = map.zone || "a";
    wrap._ground = (W, H, F) => MV.ground(ground, W, H, map, vis, known, F);
    MV.layout(wrap);
    // re-place on resize (rotation, the side panel opening): positions are px in the bg's cover frame now
    if (typeof ResizeObserver !== "undefined") { const ro = new ResizeObserver(() => { if (!wrap.isConnected) { ro.disconnect(); return; } MV.layout(wrap); }); ro.observe(wrap); }
  };

  // Ground layer: map background, revealed-ground tile around visible locations, fog texture elsewhere.
  // Painted at the wrap's real pixel size (so scouted areas are true circles); node positions are 1000x600 map space.
  MV.ground = function (cv, W, H, map, vis, known, F) {
    F = F || MV.frame(W, H);
    const V = DATA.map.view || {}, zbg = SP.or((DATA.zones.list[map.zone || "a"] || {}).mapBg || (map.zone === "b" ? "map_bg_b" : null), null), bg = (zbg && SP.get(zbg)) || SP.get("map_bg"), fogImg = SP.get("map_fog"), rev = SP.get("map_revealed");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = !DATA.sprites.pixelArt;
    if (bg) ctx.drawImage(bg, F.ox, F.oy, F.bw, F.bh);   // cover (the same frame the nodes are placed in: MV.frame)
    else { ctx.fillStyle = SP.def("map_bg").color; ctx.fillRect(0, 0, W, H); }
    const R = (V.revealRadius || 78) * F.k, P = (n) => F.at(n.x, n.y);
    const circle = (g, n, rr) => { const p = P(n); g.beginPath(); g.arc(p[0], p[1], rr, 0, Math.PI * 2); g.fill(); };
    const visN = Object.values(map.nodes).filter((n) => vis(n.id)), memN = Object.values(map.nodes).filter((n) => !vis(n.id) && known(n.id));
    const revA = zbg && (V.revealedAlphaByZone || {})[map.zone] != null ? V.revealedAlphaByZone[map.zone] : (V.revealedAlpha != null ? V.revealedAlpha : 0.45);
    if (rev && visN.length && revA > 0) { // revealed-ground tile, clipped to the scouted circles
      ctx.save(); ctx.globalAlpha = revA; ctx.beginPath();
      for (const n of visN) { const p = P(n); ctx.moveTo(p[0] + R, p[1]); ctx.arc(p[0], p[1], R, 0, Math.PI * 2); }
      ctx.clip(); ctx.fillStyle = ctx.createPattern(rev, "repeat"); ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    // fog: textured layer with holes punched out (hard inner ring + half-strength outer ring keeps the pixel look)
    const fog = document.createElement("canvas"); fog.width = W; fog.height = H;
    const f = fog.getContext("2d");
    f.fillStyle = fogImg ? f.createPattern(fogImg, "repeat") : SP.def("map_fog").color; f.fillRect(0, 0, W, H);
    f.globalCompositeOperation = "destination-out"; f.fillStyle = "#000";
    const memA = 1 - (V.rememberedFogAlpha != null ? V.rememberedFogAlpha : 0.5) / (V.fogAlpha || 0.9);
    for (const n of memN) { f.globalAlpha = memA * 0.5; circle(f, n, R * 1.15); f.globalAlpha = memA; circle(f, n, R); }
    for (const n of visN) { f.globalAlpha = 0.5; circle(f, n, R * 1.15); f.globalAlpha = 1; circle(f, n, R); }
    ctx.globalAlpha = V.fogAlpha != null ? V.fogAlpha : 0.9; ctx.drawImage(fog, 0, 0); ctx.globalAlpha = 1;
    return cv;
  };
})(window);
