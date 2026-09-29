// Battle renderer + input (placement drag, speed toggle, hover). Reads sim state, drains b.fx.
(function (root) {
  const G = root.G, U = G.Util, SP = G.Sprites;
  const BV = G.BattleView = {};
  const C = () => DATA.config.battle;

  BV.mount = function (container, b, opts) {
    const c = C(), px = c.pxPerM, W = c.arenaW * px, H = c.arenaH * px;
    const v = { b, opts, px, W, H, speed: opts.speed || 1, floaters: [], tracers: [], gibs: [], shake: 0, slowmo: 0, last: 0, raf: 0, drag: null, hover: null, corpseIdx: 0, done: false };
    container.innerHTML = "";
    const wrap = document.createElement("div"); wrap.className = "battle-wrap";
    const hud = document.createElement("div"); hud.className = "battle-hud";
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H; canvas.className = "battle-canvas";
    const decals = document.createElement("canvas"); decals.width = W; decals.height = H;
    v.canvas = canvas; v.ctx = canvas.getContext("2d"); v.decals = decals; v.dctx = decals.getContext("2d"); v.hud = hud;
    v.dctx.imageSmoothingEnabled = !DATA.sprites.pixelArt;
    wrap.appendChild(hud); wrap.appendChild(canvas); container.appendChild(wrap);
    const bottom = document.createElement("div"); bottom.className = "battle-bottom"; container.appendChild(bottom); v.bottom = bottom;
    BV.renderHud(v);
    canvas.addEventListener("mousedown", (e) => BV.onDown(v, e));
    canvas.addEventListener("mousemove", (e) => BV.onMove(v, e));
    window.addEventListener("mouseup", v.onUp = (e) => BV.onUp(v, e));
    canvas.addEventListener("mouseleave", () => { v.hover = null; G.UI.hideTip(); });
    v.last = performance.now();
    const loop = (t) => { if (v.done) return; BV.frame(v, t); v.raf = requestAnimationFrame(loop); };
    v.raf = requestAnimationFrame(loop);
    BV.active = v;
    return v;
  };

  BV.unmount = function (v) { v.done = true; cancelAnimationFrame(v.raf); window.removeEventListener("mouseup", v.onUp); G.UI.hideTip(); if (BV.active === v) BV.active = null; };

  BV.renderHud = function (v) {
    const b = v.b;
    v.hud.innerHTML = "";
    const title = document.createElement("span"); title.className = "bh-title";
    title.textContent = b.phase === "place" ? "PLACEMENT — drag your units on the grid, then Fight" : (b.mode === "defense" ? "DEFEND THE EXTRACTION" : "BATTLE");
    v.hud.appendChild(title);
    const timer = document.createElement("span"); timer.className = "bh-timer"; v.timerEl = timer; v.hud.appendChild(timer);
    const speeds = document.createElement("span"); speeds.className = "bh-speeds";
    for (const s of C().speeds) {
      const btn = document.createElement("button"); btn.textContent = s + "x"; btn.className = s === v.speed ? "on" : "";
      btn.onclick = () => { v.speed = s; G.UI.battleSpeed = s; BV.renderHud(v); };
      speeds.appendChild(btn);
    }
    v.hud.appendChild(speeds);
    if (b.phase === "place") {
      const go = document.createElement("button"); go.className = "primary"; go.textContent = "Fight!"; go.onclick = () => { G.Battle.start(b); BV.renderHud(v); };
      v.hud.appendChild(go);
    }
    if (G.Debug && G.Debug.on) {
      const ar = document.createElement("button"); ar.textContent = "Auto-resolve"; ar.onclick = () => { if (b.phase === "place") G.Battle.start(b); while (!b.over) { G.Battle.step(b, 1 / 30); } BV.renderHud(v); };
      v.hud.appendChild(ar);
    }
  };

  const toPx = (v, m) => m * v.px;
  function mouseM(v, e) { const r = v.canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * v.W / v.px, y: ((e.clientY - r.top) / r.height) * v.H / v.px, cx: e.clientX, cy: e.clientY }; }
  // art units stand on (x,y) with the body drawn above it, so hit-test around the torso
  function unitAt(v, m) { const lift = v.art ? 0.5 : 0; return v.b.units.filter((u) => u.state !== "dead").find((u) => Math.hypot(u.x - m.x, u.y - lift - m.y) < 0.9); }

  BV.onDown = function (v, e) {
    if (v.b.phase !== "place") return;
    const m = mouseM(v, e), u = unitAt(v, m);
    if (u && u.side === 0) v.drag = u;
  };
  BV.onMove = function (v, e) {
    const m = mouseM(v, e);
    if (v.drag) { v.drag.x = m.x; v.drag.y = m.y; return; }
    const u = unitAt(v, m); v.hover = u;
    if (u) G.UI.showTip(BV.unitTip(v, u), m.cx, m.cy); else G.UI.hideTip();
  };
  BV.onUp = function (v, e) {
    if (!v.drag) return;
    const c = C(), m = mouseM(v, e);
    const cx = U.clamp(Math.floor(m.x / c.gridCell), 0, c.playerZoneCols - 1), cy = U.clamp(Math.floor(m.y / c.gridCell), 0, Math.floor(c.arenaH / c.gridCell) - 1);
    if (!G.Battle.placeAt(v.b, v.drag, cx, cy)) G.Battle.placeAt(v.b, v.drag, v.drag.cell.cx, v.drag.cell.cy);
    v.drag = null;
  };

  // §7.1: hover any unit to see its hit and fumble chances
  BV.unitTip = function (v, u) {
    const w = u.weapon;
    const foes = v.b.units.filter((o) => o.side !== u.side && o.state === "alive");
    const tgt = u.target && u.target.state === "alive" ? u.target : foes[0];
    let s = `<b>${u.name}</b>${u.elite ? " ★" : ""}<br>HP ${Math.ceil(u.hp)}/${Math.round(u.maxHp)} · Armor ${u.armor} · Eva ${u.eva} · Speed ${U.fmt1(u.speed)} m/s<br>`;
    s += `${w.name}: ${U.fmt1(w.dmg)} ${w.type} / ${w.interval}s · range ${w.range} m${w.mag ? ` · ${u.ammo}/${w.mag}` : ""}<br>`;
    if (tgt) s += `Hit vs ${tgt.name}: <b>${Math.round(G.Battle.hitChance(u, tgt))}%</b><br>`;
    if (w.mag) s += `Fumble per reload: <b>${U.fmt1(G.Battle.fumbleChance(u))}%</b><br>`;
    if (u.spec) s += `<i>${u.spec.name}: ${u.spec.desc}</i><br>`;
    if (u.quirks && u.quirks.length) s += u.quirks.map((q) => DATA.bodies.quirks[q].name).join(", ");
    return s;
  };

  BV.frame = function (v, t) {
    const b = v.b;
    let dt = Math.min(0.05, (t - v.last) / 1000); v.last = t;
    const timeScale = v.slowmo > 0 ? C().slowMoOnKill : 1;
    v.slowmo = Math.max(0, v.slowmo - dt);
    if (b.phase === "fight") {
      let sim = dt * v.speed * timeScale;
      while (sim > 0 && !b.over) { const s = Math.min(1 / 60, sim); G.Battle.step(b, s); sim -= s; }
    }
    BV.drainFx(v);
    BV.updateParticles(v, dt * Math.max(1, v.speed * timeScale));
    BV.draw(v);
    if (v.timerEl) v.timerEl.textContent = b.phase === "fight" || b.phase === "over" ? (b.mode === "defense" ? `Hold: ${Math.max(0, Math.ceil(b.surviveSec - b.t))} s` : `${b.t.toFixed(1)} s`) : "";
    if (b.over && !v.ended) { v.ended = true; setTimeout(() => v.opts.onEnd && v.opts.onEnd(b), 900); }
  };

  const S = () => DATA.sprites;
  const hasArt = (key) => !!SP.get(key);
  // art units stand on their feet at (x,y); aim/hit/text points sit this far above the ground point (m)
  const bodyLiftM = (v) => (v.art ? 0.5 : 0);

  BV.drainFx = function (v) {
    const b = v.b, lift = bodyLiftM(v);
    for (const e of b.fx) {
      if (e.t === "text") v.floaters.push({ x: e.x, y: e.y - (v.art ? 1.0 : 0), text: e.text, color: e.color, big: e.big, life: e.big ? 1.6 : 1.0, max: e.big ? 1.6 : 1.0, dx: (Math.random() - 0.5) * 0.6 });
      else if (e.t === "shot") {
        let x2 = e.x2, y2 = e.y2;
        if (!e.hit) { x2 += (Math.random() - 0.5) * 2.5; y2 += (Math.random() - 0.5) * 2.5; }
        v.tracers.push({ x1: e.x1, y1: e.y1 - lift, x2, y2: y2 - lift, life: e.melee ? 0.12 : 0.09, melee: e.melee, proj: e.proj });
        const ap = S().acidPoolOn;
        if (ap && e.proj === ap.projectile) BV.stampDecal(v, ap.decal, x2, y2, Math.random() * 6.28, 0.8);
        G.Sfx.play(e.sfx);
      } else if (e.t === "blood") BV.stampBlood(v, e);
      else if (e.t === "drag") { if (S().dragOn) BV.stampDecal(v, S().dragOn, e.x - Math.cos(e.dir) * 0.6, e.y - Math.sin(e.dir) * 0.6, e.dir, 1.2); }
      else if (e.t === "gibs") {
        const set = (S().gibs && S().gibs[e.kind || "human"]) || [1, 2, 3];
        for (let i = 0; i < e.n; i++) { const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 7; v.gibs.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20, key: "fx_gib_" + set[Math.floor(Math.random() * set.length)], life: 0.9 + Math.random() * 0.5 }); }
        G.Sfx.play("sfx_gib");
      }
      else if (e.t === "shake") v.shake = Math.max(v.shake, e.mag);
      else if (e.t === "slowmo") v.slowmo = C().slowMoSec;
      else if (e.t === "sfx") G.Sfx.play(e.key);
      else if (e.t === "death") G.Sfx.play(e.side === 1 ? "sfx_death_human" : "sfx_death_human");
    }
    b.fx.length = 0;
    // stamp new corpses onto the decal layer (they stay). Corpse art lies flat, mirrored by heading.
    while (v.corpseIdx < b.corpses.length) {
      const c = b.corpses[v.corpseIdx++];
      SP.drawWorld(v.dctx, c.sprite, toPx(v, c.x), toPx(v, c.y), v.px * 1.6, { rot: c.rot, facing: true });
    }
  };

  BV.stampDecal = function (v, key, x, y, rot, fallbackSize, alpha) {
    SP.drawWorld(v.dctx, key, toPx(v, x), toPx(v, y), v.px * (fallbackSize || 1), { rot: rot || 0, decal: true, mirror: Math.random() < 0.5, alpha: alpha != null ? alpha : 0.9 });
  };
  BV.stampBlood = function (v, e) {
    const bs = S().bloodBySize || { small: 0.6, medium: 1.0 }, sz = e.size || 1;
    let key = e.pool ? "fx_blood_pool" : sz < bs.small ? "fx_blood_1" : sz < bs.medium ? "fx_blood_2" : "fx_blood_3";
    if (e.spray && S().bloodOnCrit) key = S().bloodOnCrit;
    BV.stampDecal(v, key, e.x, e.y, e.rot || 0, sz * (e.pool ? 1.1 : 1), 0.85);
  };

  BV.updateParticles = function (v, dt) {
    for (const f of v.floaters) { f.life -= dt; f.y -= dt * 1.2; f.x += f.dx * dt; }
    v.floaters = v.floaters.filter((f) => f.life > 0);
    for (const tr of v.tracers) tr.life -= dt;
    v.tracers = v.tracers.filter((t) => t.life > 0);
    for (const g of v.gibs) {
      g.x += g.vx * dt; g.y += g.vy * dt; g.vx *= Math.pow(0.05, dt); g.vy *= Math.pow(0.05, dt); g.rot += g.vr * dt; g.life -= dt;
      if (g.life <= 0) { BV.stampBlood(v, { x: g.x, y: g.y, size: 0.35, rot: g.rot }); SP.drawWorld(v.dctx, g.key, toPx(v, g.x), toPx(v, g.y), v.px * 0.6, { rot: g.rot, decal: true, mirror: g.vr > 0 }); }
    }
    v.gibs = v.gibs.filter((g) => g.life > 0);
    v.shake = Math.max(0, v.shake - dt * 20);
  };

  BV.draw = function (v) {
    const ctx = v.ctx, b = v.b, c = C(), px = v.px;
    v.art = b.units.some((u) => hasArt(u.sprite));
    ctx.save();
    ctx.imageSmoothingEnabled = !S().pixelArt;
    if (v.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * v.shake), Math.round((Math.random() - 0.5) * v.shake));
    const pat = SP.pattern(ctx, "bg_battle");
    if (pat && pat.setTransform && typeof DOMMatrix !== "undefined") pat.setTransform(new DOMMatrix().scale(S().texelScale || 1));
    ctx.fillStyle = pat || SP.def("bg_battle").color; ctx.fillRect(-10, -10, v.W + 20, v.H + 20);
    // faint ground grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)"; ctx.lineWidth = 1;
    for (let x = 0; x <= c.arenaW; x += c.gridCell) { ctx.beginPath(); ctx.moveTo(x * px, 0); ctx.lineTo(x * px, v.H); ctx.stroke(); }
    for (let y = 0; y <= c.arenaH; y += c.gridCell) { ctx.beginPath(); ctx.moveTo(0, y * px); ctx.lineTo(v.W, y * px); ctx.stroke(); }
    if (b.phase === "place") {
      ctx.fillStyle = "rgba(80,160,255,0.08)"; ctx.fillRect(0, 0, c.playerZoneCols * c.gridCell * px, v.H);
      ctx.strokeStyle = "rgba(80,160,255,0.25)";
      for (let x = 0; x <= c.playerZoneCols; x++) { ctx.beginPath(); ctx.moveTo(x * c.gridCell * px, 0); ctx.lineTo(x * c.gridCell * px, v.H); ctx.stroke(); }
      for (let y = 0; y <= c.arenaH; y += c.gridCell) { ctx.beginPath(); ctx.moveTo(0, y * px); ctx.lineTo(c.playerZoneCols * c.gridCell * px, y * px); ctx.stroke(); }
      ctx.fillStyle = "rgba(255,80,80,0.06)"; ctx.fillRect(c.enemyZoneFromX * px, 0, v.W - c.enemyZoneFromX * px, v.H);
    }
    ctx.drawImage(v.decals, 0, 0);
    for (const g of v.gibs) SP.drawWorld(ctx, g.key, g.x * px, g.y * px, px * 0.6, { rot: g.rot });
    // units: downed first, then back-to-front by y (3/4 view)
    const units = b.units.filter((u) => u.state !== "dead").sort((p, q) => ((p.state === "critical" || p.buffs.knockdown) ? -1 : 0) - ((q.state === "critical" || q.buffs.knockdown) ? -1 : 0) || p.y - q.y);
    for (const u of units) {
      const art = hasArt(u.sprite), sd = SP.def(u.sprite), sz = px * 1.6 * (u.elite ? 1.2 : 1);
      // art stands up out of its ground point: keep the whole sprite (+ HP bar) inside the canvas at the arena edges (render only)
      const artH = art ? 32 * (S().texelScale || 1) * (sd.imgScale || 1) : 0;
      const x = art ? U.clamp(u.x * px, artH * 0.35, v.W - artH * 0.35) : u.x * px, y = art ? U.clamp(u.y * px, artH * (sd.anchorY || 0.9) + 12, v.H - artH * (1 - (sd.anchorY || 0.9))) : u.y * px;
      const ringCol = u.rank === "body" ? "#ffd84a" : u.side === 0 ? "#4aa3ff" : "#ff4a4a";
      const down = u.state === "critical" || u.buffs.knockdown;
      if (art) { // ground ellipse ring + shadow at the feet
        const rx = Math.max(u.r * 1.25, 0.6) * px * (sd.imgScale || 1), ry = rx * 0.42, fy = down ? y : y + artH * ((sd.feetY || sd.anchorY || 0.5) - (sd.anchorY || 0.5)) - ry * 0.3;
        ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x, fy, rx * 0.8, ry * 0.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x, fy, rx, ry, 0, 0, Math.PI * 2); ctx.strokeStyle = ringCol; ctx.lineWidth = u.rank === "body" ? 3 : 2; ctx.stroke();
      } else {
        ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x, y + sz * 0.38, sz * 0.38, sz * 0.14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, sz * 0.5, 0, Math.PI * 2); ctx.strokeStyle = ringCol; ctx.lineWidth = u.rank === "body" ? 3 : 2; ctx.stroke();
      }
      if (down) { // Critical / knocked down: lying pose = the unit's own corpse art
        if (art && u.corpse && hasArt(u.corpse)) SP.drawWorld(ctx, u.corpse, x, y, sz, { rot: u.facing, facing: true, alpha: u.state === "critical" ? 0.9 : 1 });
        else SP.draw(ctx, u.sprite, x, y, sz, Math.PI / 2, 0.45);
        if (u.state === "critical") { ctx.fillStyle = "#ff9030"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.fillText("CRITICAL", x, y - px * 0.9); continue; }
      }
      let top;
      if (!down) {
        // walk strip while moving (data: sprites[key].walk), static frame otherwise
        let key = u.sprite, frame = 0;
        if (art && u.moving && sd.walk && hasArt(sd.walk)) { key = sd.walk; frame = b.t * (SP.def(sd.walk).fps || 8); }
        const r = SP.drawWorld(ctx, key, x, y, sz, { rot: u.facing, facing: true, anchor: true, frame });
        top = art ? r.top : y - sz * 0.72;
      } else top = y - px * 1.2;
      // hp bar
      const bw = art ? px * 1.3 : sz * 0.9, hpF = U.clamp(u.hp / u.maxHp, 0, 1), by = Math.round(top - 6);
      ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(x - bw / 2, by, bw, 4);
      ctx.fillStyle = hpF > 0.5 ? "#5fd35f" : hpF > 0.25 ? "#e0c040" : "#e04040"; ctx.fillRect(x - bw / 2, by, bw * hpF, 4);
      if (u.reloadT > 0) { ctx.fillStyle = "#aaa"; ctx.fillRect(x - bw / 2, by + 5, bw * (1 - u.reloadT / Math.max(0.1, u.weapon.reload + 2)), 2); }
      if (u.bleeds.length) { ctx.fillStyle = "#c00"; ctx.fillRect(x + bw / 2 + 2, by, 3, 3); }
      if (u.elite) { ctx.fillStyle = "#ffd84a"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "right"; ctx.fillText("★", x - bw / 2 - 2, by + 5); }
      if (v.hover === u) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; const hh = y - top + 4; ctx.strokeRect(x - bw / 2 - 2, top - 2, bw + 4, hh); }
    }
    // tracers / swings
    for (const t of v.tracers) {
      const a = Math.atan2(t.y2 - t.y1, t.x2 - t.x1);
      if (t.melee) { ctx.strokeStyle = `rgba(255,255,255,${t.life * 6})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(t.x1 * px, t.y1 * px, px * 0.9, a - 0.7, a + 0.7); ctx.stroke(); }
      else {
        const acid = t.proj === (S().acidPoolOn || {}).projectile;
        ctx.strokeStyle = acid ? "rgba(140,255,60,.9)" : "rgba(255,235,160,.9)"; ctx.lineWidth = acid ? 3 : 1.5; ctx.beginPath(); ctx.moveTo(t.x1 * px, t.y1 * px); ctx.lineTo(t.x2 * px, t.y2 * px); ctx.stroke();
        if (!acid) SP.drawWorld(ctx, "fx_muzzle", (t.x1 + Math.cos(a) * 0.55) * px, (t.y1 + Math.sin(a) * 0.55) * px, px * 0.5, { rot: a });
        SP.drawWorld(ctx, t.proj || "fx_bullet", t.x2 * px, t.y2 * px, px * 0.5, { rot: a });
      }
    }
    // floating combat text
    ctx.textAlign = "center";
    for (const f of v.floaters) {
      ctx.globalAlpha = U.clamp(f.life / f.max * 1.5, 0, 1);
      ctx.font = f.big ? "bold 18px sans-serif" : "bold 13px sans-serif";
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.strokeText(f.text, f.x * px, f.y * px); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x * px, f.y * px);
    }
    // XP floats (Slice 2 §10): small pale-cyan labels beside the unit, real-time fade, stacked upward
    if (G.XPFloat && G.XPFloat.battle.length) {
      ctx.textAlign = "left"; ctx.font = "10px sans-serif"; ctx.lineWidth = 2.5;
      for (const f of G.XPFloat.battle) {
        const u = f.unit; if (!b.units.includes(u)) continue;
        const st = G.XPFloat.battleStyle(f);
        const x = u.x * px + px * 0.85, y = u.y * px - px * 0.35 - f.idx * 11 - st.rise;
        ctx.globalAlpha = st.alpha; ctx.strokeStyle = "rgba(0,0,0,.8)"; ctx.strokeText(f.text, x, y); ctx.fillStyle = f.color; ctx.fillText(f.text, x, y);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  };
})(window);
