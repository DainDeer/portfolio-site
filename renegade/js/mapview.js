// Region map view: fog of war, visible encounter odds, location states, branching paths.
(function (root) {
  const G = root.G, U = G.Util, SP = G.Sprites;
  const MV = G.MapView = {};

  MV.render = function (container, onPick) {
    const s = G.state, map = G.Zones.map(), r = s.run, ins = map.insertion;
    container.innerHTML = "";
    const wrap = document.createElement("div"); wrap.className = "map-wrap";
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg"); svg.setAttribute("viewBox", "0 0 1000 600"); svg.setAttribute("preserveAspectRatio", "none"); svg.classList.add("map-edges");
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
        el.style.left = (n.x / 10) + "%"; el.style.top = (n.y / 6) + "%";
        el.appendChild(SP.icon("loc_unknown", 32));
        const name = document.createElement("div"); name.className = "mn-name"; name.textContent = "Unscouted"; el.appendChild(name);
        wrap.appendChild(el); continue;
      }
      if (!knownOrCountdown(nid)) continue;
      const loc = G.Map.loc(n), isVis = vis(nid);
      const el = document.createElement("div");
      el.className = "map-node" + (isVis ? "" : " remembered") + (r && r.loc === nid ? " current" : "") + (r && r.visited[nid] ? " visited" : "");
      el.style.left = (n.x / 10) + "%"; el.style.top = (n.y / 6) + "%";
      const wIcon = loc && loc.worldIcons && loc.worldEvent ? loc.worldIcons[s.world.hollow_creek] : null; // world-state icon (distress / aftermath)
      const iconKey = !loc ? "loc_insertion" : (wIcon || loc.icon);
      el.appendChild(SP.icon(iconKey, 32));
      el.dataset.nid = nid;
      // passage icon (once found), quest marker (an active find quest's object is here and holds the item)
      if (loc && loc.passage && G.Zones.passageVisible(loc.passage, map.zone || "a")) { const pi = SP.icon(DATA.zones.passages[loc.passage].mapIcon, 20, "mn-passage"); pi.title = DATA.zones.passages[loc.passage].name + ": leads to " + DATA.zones.list[G.Zones.otherEnd(loc.passage, map.zone || "a")].name; el.appendChild(pi); }
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
        if (loc.extraction) { const ex = G.Exp.extractionDef(n); tags.push(G.Exp.extractionOpen(n) ? `EXTRACT (${ex.type === "check" ? DATA.skills[ex.skill].name + " DC " + ex.dc : ex.type})` : "EXTRACT CLOSED"); }
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
        const tk = SP.icon("map_hunter_tracks", 16, "map-hunter-tracks"); tk.style.left = ((a.x + c.x) / 2 / 10) + "%"; tk.style.top = ((a.y + c.y) / 2 / 6) + "%";
        tk.style.transform = `translate(-50%,-50%) rotate(${Math.atan2(c.y - a.y, c.x - a.x) + Math.PI / 4}rad)`; wrap.appendChild(tk);
      }
      const tok = document.createElement("div"); tok.className = "map-hunter" + (hp.lostFor > 0 ? " lost" : ""); tok.dataset.hunterAt = hp.nid;
      tok.style.left = (n.x / 10) + "%"; tok.style.top = (n.y / 6) + "%"; tok.appendChild(SP.icon("map_hunter_pack", 32));
      tok.title = `Hunter pack (${hp.tier}): moves 1 node toward you after each of your moves${G.Hunters.slowEvery() > 1 ? " (every 2nd move: Hunter's Garb)" : ""}${hp.lostFor > 0 ? `. Lost your trail for ${hp.lostFor} more moves` : ""}. Crossing a passage shakes them off.`;
      wrap.appendChild(tok);
    }
    // Slice 3 §7 / §10b: Radio L2 marks where the next rival squad was last seen (drawn through fog)
    const rvn = r && G.Rivals && G.Rivals.markedNode();
    if (rvn && map.nodes[rvn]) {
      const n = map.nodes[rvn], nx = G.Rivals.st().next, snap = G.Rivals.byId(nx.id);
      const tok = document.createElement("div"); tok.className = "map-rival"; tok.dataset.rivalAt = rvn;
      tok.style.left = (n.x / 10) + "%"; tok.style.top = (n.y / 6) + "%"; tok.appendChild(SP.icon("map_rival", 26));
      tok.title = `Rival squad${snap ? " " + snap.handle : ""} last seen here (Radio). You'll meet them if you enter.`;
      wrap.appendChild(tok);
    }
    if (r && r.hunt && r.hunt.banner && !r.hunt.banner.shown) {
      r.hunt.banner.shown = true; G.Sfx.play("sfx_hunter_alert");
      const bn = document.createElement("div"); bn.className = "map-banner hunter"; bn.textContent = "⚠ " + r.hunt.banner.text; wrap.appendChild(bn); setTimeout(() => bn.remove(), 3500);
    }
    container.appendChild(wrap);
    wrap.dataset.zone = map.zone || "a";
    MV.ground(ground, wrap.clientWidth || 1000, wrap.clientHeight || 600, map, vis, known);
  };

  // Ground layer: map background, revealed-ground tile around visible locations, fog texture elsewhere.
  // Painted at the wrap's real pixel size (so scouted areas are true circles); node positions are 1000x600 map space.
  MV.ground = function (cv, W, H, map, vis, known) {
    const V = DATA.map.view || {}, bg = (map.zone === "b" && SP.get("map_bg_b")) || SP.get("map_bg"), fogImg = SP.get("map_fog"), rev = SP.get("map_revealed");
    const sx = W / 1000, sy = H / 600;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = !DATA.sprites.pixelArt;
    if (bg) { const k = Math.max(W / bg.naturalWidth, H / bg.naturalHeight), bw = bg.naturalWidth * k, bh = bg.naturalHeight * k; ctx.drawImage(bg, (W - bw) / 2, (H - bh) / 2, bw, bh); } // cover
    else { ctx.fillStyle = SP.def("map_bg").color; ctx.fillRect(0, 0, W, H); }
    const R = (V.revealRadius || 78) * (sx + sy) / 2;
    const circle = (g, n, rr) => { g.beginPath(); g.arc(n.x * sx, n.y * sy, rr, 0, Math.PI * 2); g.fill(); };
    const visN = Object.values(map.nodes).filter((n) => vis(n.id)), memN = Object.values(map.nodes).filter((n) => !vis(n.id) && known(n.id));
    const revA = (V.revealedAlphaByZone || {})[map.zone] != null ? V.revealedAlphaByZone[map.zone] : (V.revealedAlpha != null ? V.revealedAlpha : 0.45);
    if (rev && visN.length && revA > 0) { // revealed-ground tile, clipped to the scouted circles
      ctx.save(); ctx.globalAlpha = revA; ctx.beginPath();
      for (const n of visN) { ctx.moveTo(n.x * sx + R, n.y * sy); ctx.arc(n.x * sx, n.y * sy, R, 0, Math.PI * 2); }
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
