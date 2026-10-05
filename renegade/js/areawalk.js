// Walking in a V2 Area (SP-032, Maps/Areas/Loot draft §6; the feel of the MegaMart demo, proto/area/). Click or tap
// the ground to walk there; click something to walk within range of it, then use it. One intent at a time: a new click
// replaces it, a pop-up pauses it, a battle cancels it. Walking never rolls anything. The squad's position lives in the
// Area's site record (site.pos), so a re-render, a battle or a reload never snaps you back to the door.
// Presentation only: the rules (walkable floor, paths, stand points) are js/areapath.js; the actions are G.UI's.
(function (root) {
  const G = root.G, U = G.Util;
  const AW = G.AreaWalk = { s: null };
  const VW = 1000, VH = 600;
  const C = () => DATA.mapsV2.walk;
  const now = () => performance.now();
  const coarse = () => !!(root.matchMedia && root.matchMedia("(pointer: coarse)").matches);
  const modalOpen = () => !!document.querySelector("#modal-root .modal");
  const busy = () => { const r = G.state.run; return !r || !!r.queue.length || !!G.UI.search || !!G.UI.battle; };

  // is the location view a walkable V2 Area right now?
  AW.active = () => !!(G.V2 && G.state.run && G.V2.isAreaMap(G.state.run.loc) && G.Exp.inSite());
  const verbOf = (a, o) => (a === "search" && o && o.type === "door" ? "Open" : { search: "Search", pick: "Pick the lock of", force: "Force", kick: "Kick", loot: "Loot", go: "Go to", use: "Use", leave: "", extract: "Use", cross: "Crawl through", boop: "Boop", claim: "Claim", examine: "Examine", train: "Train at", spin: "Turn" }[a] || "Use");   // Search / Open / Use / Enter stay distinct (draft §6)
  AW.label = function (o) {
    const acts = G.Exp.objActions(o);
    if (o.kind === "exit") return o.name;   // "Back to traversal"
    if (o.kind === "areaExit") return o.name;   // "To the Gym"
    return acts.length ? `${verbOf(acts[0], o)} ${o.name}` : o.name;
  };

  // SiteView.render hands over each freshly built Area view
  AW.attach = function (wrap, site, handlers) {
    let s = AW.s;
    if (!s || s.key !== site.key || s.runCount !== G.state.runCount) {
      if (s && s.raf) cancelAnimationFrame(s.raf);
      const p = site.pos || G.V2.anchor(site, null);
      s = AW.s = { key: site.key, runCount: G.state.runCount, x: p.x, y: p.y, path: [], intent: null, marker: null, raf: 0, guardUntil: now() + C().arrivalGuardMs, last: 0 };
    } else if (site.pos && !s.path.length && (Math.abs(site.pos.x - s.x) > 1 || Math.abs(site.pos.y - s.y) > 1)) { s.x = site.pos.x; s.y = site.pos.y; }   // moved by the rules (a retreat, a reload)
    s.guardUntil = Math.max(s.guardUntil, AW.guardAll || 0);
    s.wrap = wrap; s.site = site; s.handlers = handlers;
    s.tok = wrap.querySelector(".site-squad");
    s.mk = document.createElement("div"); s.mk.className = "aw-marker"; s.mk.hidden = true; wrap.appendChild(s.mk);
    s.lab = document.createElement("div"); s.lab.className = "aw-label"; s.lab.hidden = true; wrap.appendChild(s.lab);
    s.act = document.createElement("div"); s.act.className = "aw-action"; wrap.appendChild(s.act);
    if (s.intent) { const o = G.Exp.obj(s.intent.objId, site); if (o) showTarget(o); }
    if (s.marker && now() - s.marker.t0 < 450) showMarker(s.marker.x, s.marker.y, s.marker.red);
    place();
    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointerup", onUp);
    wrap.addEventListener("pointercancel", () => { if (s.press) { clearTimeout(s.press.timer); s.press = null; } });
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", () => { s.act.textContent = ""; wrap.classList.remove("aw-hot"); });
    wrap.addEventListener("contextmenu", (e) => { e.preventDefault(); const o = pick(e.clientX, e.clientY)[0]; if (o) examine(o, e.clientX, e.clientY); });
    if (s.path.length || s.intent) loop();
  };
  const pct = (x, y) => [(x / VW * 100) + "%", (y / VH * 100) + "%"];
  function place() { const s = AW.s; if (!s.tok) return; const [l, t] = pct(s.x, s.y - 18); s.tok.style.left = l; s.tok.style.top = t; if (s.site.art) s.tok.style.zIndex = Math.round(s.y); s.tok.classList.toggle("walking", s.path.length > 0); }
  function showMarker(x, y, red) { const s = AW.s; const [l, t] = pct(x, y); Object.assign(s.mk.style, { left: l, top: t }); s.mk.className = "aw-marker" + (red ? " red" : ""); s.mk.hidden = false; void s.mk.offsetWidth; s.mk.classList.add("go"); }
  function showTarget(o) { const s = AW.s; const [l, t] = pct(o.x, o.y - 46); Object.assign(s.lab.style, { left: l, top: t }); s.lab.textContent = "→ " + U.copy(AW.label(o)); s.lab.hidden = false; }
  function clearTarget() { const s = AW.s; if (s && s.lab) s.lab.hidden = true; }

  // canvas px of a client point
  function toView(cx, cy) { const b = AW.s.wrap.getBoundingClientRect(); return { x: (cx - b.left) / b.width * VW, y: (cy - b.top) / b.height * VH }; }
  // objects under a client point: exact hits first (smallest wins), then 44 px padded hits nearest first (draft §6, SP-062)
  function pick(cx, cy) {
    const s = AW.s, out = [], min = C().hitMinCss;
    for (const el of s.wrap.querySelectorAll(".site-obj[data-obj]")) {
      const o = G.Exp.obj(el.dataset.obj, s.site); if (!o) continue;
      const r = el.getBoundingClientRect(), w = Math.max(r.width, min), h = Math.max(r.height, min), mx = r.left + r.width / 2, my = r.top + r.height / 2;
      const exact = cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom, pad = Math.abs(cx - mx) <= w / 2 && Math.abs(cy - my) <= h / 2;
      if (exact || pad) out.push({ o, exact, score: exact ? r.width * r.height : 1e6 + Math.hypot(cx - mx, cy - my) });
    }
    out.sort((a, b) => a.score - b.score);
    // phones: overlapping padded targets and no exact hit -> let the player choose (no invisible overlap wins)
    if (coarse() && out.length > 1 && !out[0].exact) return out.map((x) => x.o);
    return out.length ? [out[0].o] : [];
  }
  function onMove(e) {
    const s = AW.s; if (e.pointerType !== "mouse") return;
    const o = pick(e.clientX, e.clientY)[0];
    s.wrap.classList.toggle("aw-hot", !!o);
    s.act.textContent = busy() ? "" : o ? U.copy(AW.label(o)) : "Walk here";
  }
  function onDown(e) {
    const s = AW.s;
    if (e.target.closest("button, .site-progress, .aw-picker")) return;
    if (e.pointerType === "mouse") { if (e.button !== 0) return; tap(e.clientX, e.clientY); return; }
    const p = s.press = { id: e.pointerId, x: e.clientX, y: e.clientY, held: false };
    p.timer = setTimeout(() => { p.held = true; const o = pick(p.x, p.y)[0]; if (o) examine(o, p.x, p.y); }, 500);   // long-press examines
  }
  function onUp(e) {
    const s = AW.s, p = s.press; if (!p || p.id !== e.pointerId) return;
    clearTimeout(p.timer); s.press = null;
    if (!p.held && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 14) tap(p.x, p.y);
  }
  function examine(o, cx, cy) { G.UI.showTip(`<b>${o.name}</b><br><span class="examine">${G.Exp.examine(o) || ""}</span>`, cx, cy); }
  function tap(cx, cy) {
    const s = AW.s;
    closePicker();
    if (now() < s.guardUntil || busy()) return;   // the click that brought you here can't send you straight back
    G.UI.hideTip();
    const hits = pick(cx, cy);
    if (hits.length > 1) return picker(hits, cx, cy);
    if (hits.length) return AW.go(hits[0]);
    const p = toView(cx, cy);
    walkTo(p, null);
    s.marker = { x: p.x, y: p.y, red: false, t0: now() }; showMarker(p.x, p.y, false);
  }
  function picker(objs, cx, cy) {
    const s = AW.s, el = document.createElement("div"); el.className = "aw-picker";
    const b = s.wrap.getBoundingClientRect();
    el.style.left = Math.min(b.width - 180, Math.max(0, cx - b.left - 80)) + "px"; el.style.top = Math.max(0, cy - b.top - 10) + "px";
    for (const o of objs.slice(0, 5)) { const bt = document.createElement("button"); bt.textContent = U.copy(AW.label(o)); bt.addEventListener("click", (e) => { e.stopPropagation(); closePicker(); AW.go(o); }); el.appendChild(bt); }
    s.wrap.appendChild(el); s.pickerEl = el;
  }
  function closePicker() { const s = AW.s; if (s && s.pickerEl) { s.pickerEl.remove(); s.pickerEl = null; } }

  // walk to o, then use it (the side panel's "Here" list calls this too)
  AW.go = function (o) {
    const s = AW.s; if (!s || busy()) return;
    const acts = G.Exp.objActions(o), why = G.Exp.objBlocked(o, s.site);
    s.marker = { x: o.x, y: o.y, red: true, t0: now() }; showMarker(o.x, o.y, true);
    if (!acts.length) { const r = s.wrap.getBoundingClientRect(); examine(o, r.left + o.x / VW * r.width, r.top + o.y / VH * r.height); return; }   // scenery: just look
    if (why) { G.UI.toast(why === "Searched." ? DATA.mapsV2.text.alreadyEmpty : why); return; }   // a closed door says why
    const sp = G.AreaPath.standPoint(s.site, o, { x: s.x, y: s.y });
    if (!sp) { G.UI.toast(DATA.mapsV2.text.pathBlocked); return; }
    s.intent = { objId: o.id }; showTarget(o);
    walkTo(sp, o);
  };
  function walkTo(p, o) {
    const s = AW.s;
    if (!o) { s.intent = null; clearTarget(); }
    const path = G.AreaPath.findPath(s.site, { x: s.x, y: s.y }, p);
    if (!path) { s.intent = null; clearTarget(); G.UI.toast(DATA.mapsV2.text.pathBlocked); return; }
    s.path = path;
    if (!path.length) return arrive();
    loop();
  }
  function loop() {
    const s = AW.s; if (s.raf) return;
    s.last = now();
    const step = () => {
      s.raf = 0;
      if (!s.wrap || !s.wrap.isConnected) { if (G.UI.battle) { s.path = []; s.intent = null; } return; }   // a battle cancels the walk; a re-render re-attaches
      const t = now(), dt = Math.min(0.1, (t - s.last) / 1000); s.last = t;
      if (!modalOpen()) {   // a pop-up pauses the walk
        let d = C().speedPx * G.V2.modNum(G.state.run.loc, "walkMult", 1) * dt;
        while (d > 0 && s.path.length) {
          const q = s.path[0], dx = q.x - s.x, dy = q.y - s.y, len = Math.hypot(dx, dy);
          if (len <= d) { s.x = q.x; s.y = q.y; d -= len; s.path.shift(); }
          else { s.x += dx / len * d; s.y += dy / len * d; d = 0; }
          if (s.tok && Math.abs(dx) > 1) s.tok.classList.toggle("face-left", dx < 0);
        }
        place();
        if (!s.path.length) return arrive();
      }
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
  }
  // arrived: check again that it's still there, still usable and in reach, then act once
  function arrive() {
    const s = AW.s; place();
    G.V2.setPos(s.site, { x: s.x, y: s.y });
    const it = s.intent; s.intent = null; clearTarget();
    if (!it) { G.State.save(); return; }
    const o = G.Exp.obj(it.objId, s.site);
    if (!o || !G.Exp.objVisible(o, s.site)) return G.UI.toast("It's gone.");
    const acts = G.Exp.objActions(o), why = G.Exp.objBlocked(o, s.site);
    if (!acts.length || why) return G.UI.toast(why && why !== "Searched." ? why : DATA.mapsV2.text.alreadyEmpty);
    if (!G.AreaPath.inRange(o, { x: s.x, y: s.y })) return G.UI.toast(DATA.mapsV2.text.pathBlocked);
    s.handlers.onObject(o, acts, s.wrap.querySelector(`.site-obj[data-obj="${o.id}"]`));
  }
  // after a battle (or anything that swaps the screen): ignore input for a moment so the click that closed it can't walk
  AW.guard = function () { AW.guardAll = now() + C().arrivalGuardMs; };
  // a new Area or a new run: forget the old walk (the next attach starts from the Area's saved spot)
  AW.reset = function () { const s = AW.s; if (s && s.raf) cancelAnimationFrame(s.raf); AW.s = null; };
  // the side panel's "Here" list: what you can use in this Area, nearest first
  AW.here = function () {
    const s = AW.s, site = G.Exp.site(); if (!site) return [];
    const from = s && s.key === site.key ? { x: s.x, y: s.y } : site.pos || { x: 500, y: 300 };
    return site.objects.filter((o) => G.Exp.objVisible(o, site) && G.Exp.roomOpen(site, o.room) && G.Exp.objActions(o).length && !G.Exp.objBlocked(o, site))
      .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y));
  };
})(window);
