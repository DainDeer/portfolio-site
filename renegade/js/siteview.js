// Location view (Slice 2 §5): top-down canvas (floor tiles, walls, props, blood) + clickable DOM objects on top.
// Objects behind a closed door are drawn dimmed and can't be clicked. The squad token stands next to the last object used.
(function (root) {
  const G = root.G, U = G.Util, SP = G.Sprites;
  const SV = G.SiteView = { els: {} };
  const W = 1000, H = 600;
  const TL = () => !!(G.Touch && G.Touch.layout());   // phone layout (js/touch.js): "Tap" wording; desktop text unchanged

  SV.render = function (container, handlers) {
    const X = G.Exp, site = X.site(), loc = G.Map.loc(X.node(site.nid));
    const wrap = document.createElement("div"); wrap.className = "site-wrap"; wrap.dataset.loc = site.loc; wrap.dataset.size = site.size;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H; cv.className = "site-canvas";
    wrap.appendChild(cv);
    SV.paint(cv, site);
    // Slice 4 §E: scenery props are canvas decor: hover (tap on phones) the nearest one for its examine line
    const propAt = (e) => { const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
      // phones: at least a 44 px (css) circle, the tap-target minimum (the view is drawn at 0.4-0.6x there)
      let best = null, bd = Math.max(DATA.searchables.view.propHitPx, TL() ? 22 * W / r.width : 0) ** 2; for (const p of site.props) { if (!site.rooms[p.room] || !site.rooms[p.room].open) continue; const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } } return best; };
    let propTip = null;
    cv.addEventListener("mousemove", (e) => { const p = propAt(e);
      if (p) { const i = X.propInfo(p.sprite); propTip = p; G.UI.showTip(`<b>${i.name}</b><br><span class="examine">${i.examine}</span>`, e.clientX, e.clientY); }
      else if (propTip) { propTip = null; G.UI.hideTip(); } });
    cv.addEventListener("mouseleave", () => { if (propTip) { propTip = null; G.UI.hideTip(); } });
    SV.els = {};
    const busy = G.UI.search;
    for (const o of site.objects) {
      if (!X.objVisible(o, site) || !X.roomOpen(site, o.room)) continue;   // rooms behind closed doors stay unseen
      const open = true, blockedWhy = X.objBlocked(o, site), acts = X.objActions(o);
      const done = o.kind === "train" ? X.trainedNow(o) : o.kind === "search" ? (o.searched && !X.hasLeft(o)) || o.blocked : o.kind === "extract" ? !!blockedWhy && !X.wrecked(X.node(site.nid)) : o.done;   // Slice 5 §D: closed by Heat = dim; the wreck isn't (its smoke says it)
      const el = document.createElement("div");
      el.className = "site-obj" + (open ? "" : " dark") + (done ? " done" : "") + (o.kind !== "search" ? " " + o.kind : "") + (o.type === "door" ? " door" : "") + (o.fresh ? " corpse" : "") + (busy && busy.objId === o.id ? " busy" : "");
      el.dataset.obj = o.id; el.dataset.kind = o.kind; if (o.type) el.dataset.type = o.type;
      el.style.left = (o.x / W * 100) + "%"; el.style.top = (o.y / H * 100) + "%";
      const V = DATA.searchables.view, px = o.type === "door" || o.kind === "exit" ? V.doorPx : V.objPx * (o.wide || (DATA.searchables.types[o.type] || {}).wide || 1);   // the car is wide (2 slots)
      el.style.width = (px / W * 100) + "%";           // scales with the view (objects are 32 native x2 on the 1000 px canvas)
      const spr = SV.spriteFor(o, site); el.dataset.sprite = spr;
      { const ic = SP.icon(spr, px, "site-art"); el.appendChild(ic); if (SP.def(spr).fps && G.MapView) G.MapView.animate(ic, SP.def(spr)); }   // Slice 5 §D: the burning wreck loops (MV's shared timer)
      if (o.kind === "exit") { const l = document.createElement("div"); l.className = "obj-exit-label"; l.textContent = DATA.searchables.access.exit.label; el.appendChild(l); }
      if (o.kind === "mural" && G.Main) G.Main.st().pods.sol.forEach((p, i) => el.appendChild(SP.icon(`obj_mural_arrow_${i + 1}_${["up", "right", "down", "left"][p]}`, px, "site-art mural-arrow")));   // the painted answer
      if (o.sealed != null && o.type === "door" && (o.vertical != null ? o.vertical : site.rooms[o.opens].row === site.rooms[o.room].row)) el.classList.add("sealed-v");   // the bulkhead art is horizontal: turned for a side wall
      const mk = SV.markerFor(o); if (mk) el.appendChild(SP.icon(mk, V.markerPx, "obj-marker"));
      if (o.questId && G.Quests.itemAvailable(o.questId) && !o.searched) el.appendChild(SP.icon("marker_quest", V.markerPx, "obj-quest"));
      if (o.locked && !o.searched && (o.type !== "door" || o.jammed)) { const l = document.createElement("div"); l.className = "obj-lock"; l.textContent = o.jammed ? "⛓" : "🔒"; el.appendChild(l); }
      if (X.hasLeft(o)) { const l = document.createElement("div"); l.className = "obj-left"; l.textContent = "…"; el.appendChild(l); }
      if (o.kind === "wheel") { SV.wheel(el, o, blockedWhy, busy); wrap.appendChild(el); SV.els[o.id] = el; continue; }   // Slice 4 §B pods puzzle
      if (open && !busy) {
        el.addEventListener("mousemove", (e) => G.UI.showTip(SV.tip(o, acts, blockedWhy), e.clientX, e.clientY));
        el.addEventListener("mouseleave", () => G.UI.hideTip());
        if (!blockedWhy && acts.length) { el.classList.add("usable"); el.addEventListener("click", (e) => { e.stopPropagation(); G.UI.hideTip(); handlers.onObject(o, acts, el); }); }
      }
      wrap.appendChild(el);
      SV.els[o.id] = el;
    }
    // squad token next to the last object you used (no pathfinding)
    const at = site.objects.find((o) => o.id === site.squadAt) || X.exitObj(site) || { x: site.rooms[0].x + 40, y: site.rooms[0].y + site.rooms[0].h - 40 };
    const sq = document.createElement("div"); sq.className = "site-squad";
    sq.style.left = ((at.x + 2 + DATA.searchables.view.objPx * (at.wide || (DATA.searchables.types[at.type] || {}).wide || 1) / 2) / W * 100) + "%"; sq.style.top = ((at.y + (at.kind === "exit" ? -40 : 10)) / H * 100) + "%";   // beside it (wide objects: beside the whole car / truck; the exit sits in the wall, so just inside the room)
    sq.style.width = (DATA.searchables.view.objPx / W * 100) + "%";
    sq.appendChild(SP.icon(G.State.bodySprite(X.body()), DATA.searchables.view.objPx, "site-art"));
    wrap.appendChild(sq);
    // search progress bar
    if (busy && SV.els[busy.objId]) {
      const o = X.obj(busy.objId);
      const pb = document.createElement("div"); pb.className = "site-progress"; pb.style.left = (o.x / W * 100) + "%"; pb.style.top = ((o.y - 40) / H * 100) + "%";
      pb.innerHTML = `<div class="sp-fill"></div><span>${busy.label}</span>`;
      const cancel = document.createElement("button"); cancel.className = "sp-cancel"; cancel.textContent = "Cancel"; cancel.addEventListener("click", (e) => { e.stopPropagation(); handlers.onCancel(); });
      pb.appendChild(cancel);
      wrap.appendChild(pb);
    }
    const title = document.createElement("div"); title.className = "site-title";
    title.textContent = `${loc.name} · ${site.size} · ${site.objects.filter((o) => o.kind === "search" && !o.searched && !o.blocked).length} unsearched`;
    wrap.appendChild(title);
    container.appendChild(wrap);
    return wrap;
  };

  SV.actionLabel = { leave: "Leave to the zone map ↩", extract: "Extract", search: "Search", pick: "Pick the lock", force: "Force it", kick: "Kick it", reopen: "Take what's left", use: "Interact", cross: "Crawl through", claim: "Claim the body", examine: "Examine", train: "Train" };
  // Slice 4 §B: a wall wheel. Its arrow points at one of 4 positions. Click the left half to turn it counterclockwise,
  // the right half clockwise; on touch screens two small arrow buttons sit under it (css: .wheel-btns).
  SV.wheel = function (el, o, why, busy) {
    const P = DATA.main.pods, touch = !!(root.matchMedia && root.matchMedia("(pointer: coarse)").matches);
    el.classList.add("wheel"); el.dataset.pos = o.pos; el.dataset.idx = o.idx;   // art: obj_wheel_<a|b|c>_<dir> (SV.spriteFor); tally I / II / III = wheel 1 / 2 / 3 on the mural
    if (why || busy) { el.classList.add("done"); el.addEventListener("mousemove", (e) => G.UI.showTip(`<b>${o.name}</b><br><i>${why || ""}</i>`, e.clientX, e.clientY)); el.addEventListener("mouseleave", () => G.UI.hideTip()); return; }
    el.classList.add("spinnable");
    const spin = (dir) => G.UI.spinWheel(o, dir);
    // how to turn it: where the ↺ / ↻ buttons show (touch screens, css/style.css) only they turn it, so say so ("Tap" on
    // the phone layout); with a mouse there are no buttons and the wheel's own halves turn it (text unchanged)
    const how = (left) => (touch ? `${TL() ? "Tap" : "Click"} ↺ / ↻ to turn` : left ? "↺ Click to turn counterclockwise" : "↻ Click to turn clockwise");
    el.addEventListener("mousemove", (e) => { const r = el.getBoundingClientRect(), left = e.clientX < r.left + r.width / 2; el.dataset.half = left ? "l" : "r";
      G.UI.showTip(`<b>${o.name}</b> · pointing ${P.arrows[o.pos]}<br><span class="examine">${G.Exp.examine(o)}</span><br>${how(left)}`, e.clientX, e.clientY); });
    el.addEventListener("mouseleave", () => { delete el.dataset.half; G.UI.hideTip(); });
    el.addEventListener("click", (e) => { e.stopPropagation(); if (touch) return; const r = el.getBoundingClientRect(); spin(e.clientX < r.left + r.width / 2 ? -1 : 1); });
    const btns = document.createElement("div"); btns.className = "wheel-btns";
    for (const [dir, lbl, t] of [[-1, "↺", "Turn counterclockwise"], [1, "↻", "Turn clockwise"]]) {
      const b = document.createElement("button"); b.className = "wheel-btn"; b.dataset.dir = dir; b.appendChild(SP.icon(dir < 0 ? "btn_spin_ccw" : "btn_spin_cw", 32, "wheel-btn-art")); b.title = t; b.setAttribute("aria-label", `${o.name}: ${t}`);
      b.addEventListener("click", (e) => { e.stopPropagation(); spin(dir); }); btns.appendChild(b);
    }
    el.appendChild(btns);
  };
  SV.tip = function (o, acts, why) {
    const X = G.Exp;
    let t = `<b>${o.name}</b>`;
    const ex = X.examine(o);   // Slice 4 §E: the examine line (the mural's is its answer)
    if (o.kind === "mural") return t + `<br><span class="examine">${ex}</span>`;
    if (o.questId && G.Quests.itemAvailable(o.questId)) t += ` <span style="color:${DATA.items.questColor}">(quest)</span>`;
    if (o.locked && !o.searched) t += o.jammed ? " · lock jammed" : " · locked";
    if (ex) t += `<br><span class="examine">${ex}</span>`;
    if (why) return t + `<br><i>${why}</i>`;
    for (const a of acts) {
      if (a === "extract") { t += `<br>${G.UI.extractLabel(X.extractionDef(X.node()))}`; continue; }   // Slice 5 §D: the same line as the panel button
      if (a === "leave" || a === "use" || a === "cross" || a === "reopen" || a === "claim" || a === "examine") { t += `<br>${SV.actionLabel[a]}`; continue; }
      const i = X.searchInfo(o.id, a);
      const TR = a === "train" && X.trainDef(o);   // Slice 5 §F
      t += `<br>${TR ? TR.label || SV.actionLabel[a] : SV.actionLabel[a]}: <b>${U.fmt1(i.sec)} s</b>${TR ? ` · +${TR.xp} ${DATA.skills[TR.skill].name} XP` : ""} · disturbance <b>${U.fmt1(i.pct)}%</b>` + (i.heatGain ? ` · +${i.heatGain} Heat` : "") + (i.check ? ` · ${DATA.skills[i.check.skill].name} DC ${i.check.dc} ${Math.round(i.check.chance)}%` : "");
      if (G.Debug && G.Debug.rollMath) t += `<br><small>${i.math}</small>`;
    }
    return t;
  };

  // Sprite for an object in its current state (falls back to the base sprite when a state has no art key).
  SV.spriteFor = function (o, site) {
    const X = G.Exp, has = (k) => !!DATA.sprites[k];
    if (o.type === "door" && o.sealed != null) return site.rooms[o.opens].open ? "obj_door_sealed_open" : "obj_door_sealed";   // Slice 4 §B pods bulkhead
    if (o.type === "door") {
      const base = (o.vertical != null ? o.vertical : site.rooms[o.opens] && site.rooms[o.room] && site.rooms[o.opens].row === site.rooms[o.room].row) ? "obj_door_v" : "obj_door";
      const st = site.rooms[o.opens] && site.rooms[o.opens].open ? (o.broken ? "_broken" : "_open") : (o.locked ? "_locked" : "");
      return has(base + st) ? base + st : base;
    }
    if (o.kind === "grate") return G.Zones.passageFound(o.pid) && has(o.sprite + "_open") ? o.sprite + "_open" : o.sprite;
    if (o.kind === "extract") return X.extractSprite(o, typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);   // Slice 5 §D: the wreck burns (the still under reduced motion)
    if (o.kind === "exit") { const E = DATA.searchables.access.exit; return (E.styles[o.style] || E.styles[E.default]).sprite; }   // from data, so new art is a one-line swap
    if (o.kind === "wheel") { const k = `obj_wheel_${"abc"[o.idx] || "a"}_${["up", "right", "down", "left"][o.pos]}`; return has(k) ? k : o.sprite; }   // Slice 4 §B
    if (o.kind !== "search") return o.sprite;
    if (o.type === "body_human" || o.type === "body_beast" || o.type === "body_machine" || o.type === "machine_dormant") {
      if (!o.searched) return o.sprite;
      const k = o.gruntBody ? (o.vet ? "corpse_veteran_searched" : "corpse_grunt_searched") : o.type === "body_beast" ? "corpse_beast_searched" : o.type === "body_machine" || o.type === "machine_dormant" ? "corpse_machine_searched" : "corpse_human_searched"; return X.hasLeft(o) ? o.sprite : (has(k) ? k : o.sprite);
    }
    const base = o.heavy && has(o.sprite + "_heavy") ? o.sprite + "_heavy" : o.sprite;
    const busy = G.UI && G.UI.search && G.UI.search.objId === o.id;   // the _open state also shows during the search bar (assets README)
    const st = busy ? "_open" : !o.searched ? "" : X.hasLeft(o) ? "_open" : "_searched";
    return st && has(base + st) ? base + st : base;
  };
  // "searched" overlay: event objects once dealt with (containers + bodies have their own searched art)
  SV.markerFor = function (o) {
    if (o.kind === "event" && o.done) return "marker_searched";
    return null;
  };

  // Fill a rect with a tiled image at texelScale, anchored at (ax, ay). Returns false if the art isn't loaded.
  function tile(ctx, key, x, y, w, h, ax, ay) {
    const img = SP.get(key); if (!img || w <= 0 || h <= 0) return false;
    const t = DATA.sprites.texelScale || 1, pat = ctx.createPattern(img, "repeat");
    if (pat.setTransform && typeof DOMMatrix !== "undefined") pat.setTransform(new DOMMatrix([t, 0, 0, t, ax == null ? x : ax, ay == null ? y : ay]));
    ctx.fillStyle = pat; ctx.fillRect(x, y, w, h); return true;
  }
  function flat(ctx, key, x, y, w, h) { const c = SP.def(key).color; if (!c) return; ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  const put = (ctx, key, x, y, w, h, ax, ay) => { if (!tile(ctx, key, x, y, w, h, ax, ay)) flat(ctx, key, x, y, w, h); };

  // Order (art README): wall fill, edge bands, corner caps, then the face inside each room's top edge; doorway plates under doors.
  SV.paint = function (cv, site) {
    const ctx = cv.getContext("2d"), S = DATA.searchables, V = S.view, WL = S.walls, wz = Object.assign({}, WL.default, (WL.byZone || {})[site.zone] || {});
    const T = V.wall;
    ctx.imageSmoothingEnabled = !DATA.sprites.pixelArt;
    put(ctx, wz.fill, 0, 0, W, H, 0, 0);
    // floors (anchored at the canvas origin so seams line up across rooms)
    for (const R of site.rooms) { if (!tile(ctx, site.floor, R.x, R.y, R.w, R.h, 0, 0)) { flat(ctx, site.floor, R.x, R.y, R.w, R.h); ctx.strokeStyle = "#ffffff10"; for (let gx = R.x; gx < R.x + R.w; gx += 32) { ctx.beginPath(); ctx.moveTo(gx, R.y); ctx.lineTo(gx, R.y + R.h); ctx.stroke(); } for (let gy = R.y; gy < R.y + R.h; gy += 32) { ctx.beginPath(); ctx.moveTo(R.x, gy); ctx.lineTo(R.x + R.w, gy); ctx.stroke(); } } }
    // edge bands: a 16 px band on every side of every room (shared walls are the same band)
    const hKey = (R, side) => WL.bandsH[((R.col * 7 + R.row * 13 + side * 5) >>> 0) % WL.bandsH.length];
    for (const R of site.rooms) {
      put(ctx, hKey(R, 0), R.x, R.y - T, R.w, T, R.x, R.y - T);
      put(ctx, hKey(R, 1), R.x, R.y + R.h, R.w, T, R.x, R.y + R.h);
      put(ctx, WL.bandV, R.x - T, R.y, T, R.h, R.x - T, R.y);
      put(ctx, WL.bandV, R.x + R.w, R.y, T, R.h, R.x + R.w, R.y);
    }
    for (const R of site.rooms) for (const [cx, cy] of [[R.x - T, R.y - T], [R.x + R.w, R.y - T], [R.x - T, R.y + R.h], [R.x + R.w, R.y + R.h]]) put(ctx, WL.corner, cx, cy, T, T, cx, cy);
    // doorway plates (under the door sprites, which are DOM objects)
    for (const o of site.objects) if (o.type === "door") {
      const v = o.vertical != null ? o.vertical : site.rooms[o.opens].row === site.rooms[o.room].row;
      if (v) put(ctx, WL.doorwayV, o.x - T / 2, o.y - 2 * T, T, 4 * T, o.x - T / 2, o.y - 2 * T); else put(ctx, WL.doorwayH, o.x - 2 * T, o.y - T / 2, 4 * T, T, o.x - 2 * T, o.y - T / 2);
    }
    // Slice 5 §D: the way out sits in the outer wall on a doorway plate
    for (const o of site.objects) if (o.kind === "exit") put(ctx, WL.doorwayH, o.x - 2 * T, o.y - T / 2, 4 * T, T, o.x - 2 * T, o.y - T / 2);
    // south-facing wall face on the floor just inside each room's top wall
    for (const R of site.rooms) tile(ctx, wz.face, R.x, R.y, R.w, T, R.x, R.y);
    const openR = (i) => site.rooms[i] && site.rooms[i].open;
    const t = DATA.sprites.texelScale || 1;
    for (const p of site.props) if (openR(p.room)) { const img = SP.get(p.sprite); if (img) SP.drawWorld(ctx, p.sprite, p.x, p.y, 40, { alpha: 0.95 }); else SP.draw(ctx, p.sprite, p.x, p.y, 40, (p.rot || 0) * Math.PI / 180, 0.9); }
    for (const d of site.decals) if (openR(d.room)) SP.draw(ctx, d.sprite, d.x, d.y, 28 * t, 0, 0.85);
    // closed rooms: shadowed
    for (const R of site.rooms) if (!R.open) { ctx.fillStyle = "#000000b8"; ctx.fillRect(R.x, R.y, R.w, R.h); ctx.fillStyle = "#6a6a60"; ctx.font = "13px sans-serif"; ctx.textAlign = "center"; ctx.fillText("behind a closed door", R.x + R.w / 2, R.y + R.h / 2); }
  };
})(window);
