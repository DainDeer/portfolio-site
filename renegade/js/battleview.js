// Battle renderer + input (placement drag, speed toggle, hover). Reads sim state, drains b.fx.
(function (root) {
  const G = root.G, U = G.Util, SP = G.Sprites;
  const BV = G.BattleView = {};
  const C = () => DATA.config.battle;
  const TL = () => !!(G.Touch && G.Touch.layout());   // phone layout (js/touch.js): touch wording instead of keys; desktop text unchanged

  // vIn (SP-100, js/gfx.js): an existing view object to fill in (a 3D load that fell back to 2D keeps UI.battle.v)
  BV.mount = function (container, b, opts, vIn) {
    const c = C(), px = c.pxPerM, W = c.arenaW * px, H = c.arenaH * px;
    const v = Object.assign(vIn || {}, { b, opts, px, W, H, speed: opts.speed == null ? 1 : opts.speed, floaters: [], tracers: [], gibs: [], booms: [], sparks: [], arcs: [], shake: 0, slowmo: 0, last: 0, raf: 0, drag: null, hover: null, mouse: null, corpseIdx: 0, clock: G.BattleClock.create(), rnd: U.makeRng(((b.seed >>> 0) ^ 0x5bd1e995) >>> 0), barks: G.Barks ? G.Barks.state(U.makeRng(((b.seed >>> 0) ^ 0x2545f491) >>> 0)) : null, heads: new Map(), ip: null, done: false, ended: false, is3d: false, dispose: null, pausePanel: null, container });
    container.innerHTML = "";
    if (G.Dice && G.Dice.dismissMini) G.Dice.dismissMini();   // a docked scouting die never lingers into a fight
    const wrap = document.createElement("div"); wrap.className = "battle-wrap";
    const hud = document.createElement("div"); hud.className = "battle-hud";
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H; canvas.className = "battle-canvas";
    const decals = document.createElement("canvas"); decals.width = W; decals.height = H;
    v.canvas = canvas; v.ctx = canvas.getContext("2d"); v.decals = decals; v.dctx = decals.getContext("2d"); v.hud = hud;
    v.dctx.imageSmoothingEnabled = !DATA.sprites.pixelArt;
    wrap.appendChild(hud); wrap.appendChild(canvas); container.appendChild(wrap);
    const bar = document.createElement("div"); bar.className = "ability-bar"; container.appendChild(bar); v.bar = bar; BV.renderBar(v);   // Slice 3 §2
    const bottom = document.createElement("div"); bottom.className = "battle-bottom"; container.appendChild(bottom); v.bottom = bottom;
    const tc = document.createElement("div"); tc.className = "touch-ctl"; container.appendChild(tc); v.touchEl = tc;   // on-screen Pause / Break away (phones only, css/mobile.css)
    v.artPending = !!SP.prepareBattle;
    if (SP.prepareBattle) SP.prepareBattle(b).then(() => { if (!v.done) { v.artPending = false; BV.renderHud(v); } });
    BV.renderHud(v);
    canvas.addEventListener("mousedown", (e) => BV.onDown(v, e));
    canvas.addEventListener("mousemove", (e) => BV.onMove(v, e));
    window.addEventListener("mouseup", v.onUp = (e) => BV.onUp(v, e));
    canvas.addEventListener("mouseleave", () => { v.hover = null; v.mouse = null; G.UI.hideTip(); });
    canvas.addEventListener("contextmenu", (e) => { if (v.b.itemAim) { e.preventDefault(); BV.itemCancel(v); } else if (v.b.aim) { e.preventDefault(); BV.cancelAim(v); } });   // right click cancels aiming
    window.addEventListener("keydown", v.onKey = (e) => BV.onKey(v, e));
    // touch: one finger drives the same handlers as the mouse (tap = hover + press, drag = placement drag); no gestures
    const tp = (e) => { const t = e.changedTouches[0]; return { clientX: t.clientX, clientY: t.clientY, button: 0 }; };
    canvas.addEventListener("touchstart", (e) => { e.preventDefault(); if (e.touches.length > 1) return; const p = tp(e); BV.onMove(v, p); BV.onDown(v, p); }, { passive: false });
    canvas.addEventListener("touchmove", (e) => { e.preventDefault(); if (v.drag) { BV.onMove(v, tp(e)); G.UI.hideTip(); } }, { passive: false });
    canvas.addEventListener("touchend", (e) => { e.preventDefault(); if (v.drag) { BV.onUp(v, tp(e)); G.UI.hideTip(); } }, { passive: false });
    canvas.addEventListener("touchcancel", () => { if (v.drag) { G.Battle.placeAt(v.b, v.drag, v.drag.cell.cx, v.drag.cell.cy); v.drag = null; } });
    v.last = performance.now();
    const loop = (t) => { if (v.done) return; BV.frame(v, t); v.raf = requestAnimationFrame(loop); };
    v.raf = requestAnimationFrame(loop);
    BV.active = v;
    return v;
  };

  BV.unmount = function (v) { if (v.dispose) { v.dispose(); v.dispose = null; } v.done = true; cancelAnimationFrame(v.raf); window.removeEventListener("mouseup", v.onUp); window.removeEventListener("keydown", v.onKey); G.UI.hideTip(); if (BV.active === v) BV.active = null; };

  BV.renderHud = function (v) {
    const b = v.b;
    v.hud.innerHTML = "";
    const title = document.createElement("span"); title.className = "bh-title";
    title.textContent = b.phase === "place" ? "PLACEMENT — drag your units on the grid, then Fight" : (b.mode === "defense" ? "DEFEND THE EXTRACTION" : b.mode === "waves" ? `HOLD THE HANDCAR (${b.waves.length + 1} WAVE${b.waves.length ? "S" : ""})` : "BATTLE");
    v.hud.appendChild(title);
    const timer = document.createElement("span"); timer.className = "bh-timer"; v.timerEl = timer; v.hud.appendChild(timer);
    v.hud.appendChild(BV.speedSlider(v));
    if (b.phase === "fight" && G.Tactical && G.Tactical.on()) {   // tactical pause (Space)
      const pb = document.createElement("button"); pb.className = "bh-pause" + (b.paused ? " on" : ""); pb.dataset.act = "pause";
      pb.textContent = b.paused ? "▶ Resume (Space)" : "⏸ Pause (Space)"; pb.onclick = () => { pb.blur(); BV.togglePause(v); }; v.hud.appendChild(pb);
    }
    if (b.phase === "place") {
      const go = document.createElement("button"); go.className = "primary"; go.dataset.act = "fight"; go.textContent = v.artPending ? "Loading battle artwork…" : TL() ? "Fight!" : "Fight! (Space)"; go.disabled = !!v.artPending; go.onclick = () => { go.blur(); BV.fight(v); };
      v.hud.appendChild(go);
    }
    BV.renderTouch(v);
    if (G.Debug && G.Debug.on) {
      const ar = document.createElement("button"); ar.textContent = "Auto-resolve"; ar.onclick = () => { if (b.phase === "place") G.Battle.start(b); while (!b.over) { G.Battle.step(b, 1 / 30); } BV.renderHud(v); };
      v.hud.appendChild(ar);
    }
  };

  // Fight!: the button, or Space during placement (SP-008)
  BV.fight = function (v) {
    const b = v.b; if (v.done || b.phase !== "place" || v.artPending) return false;
    G.Battle.start(b); BV.renderHud(v);
    if (G.TutView) G.TutView.event("fight");   // SP-003: Fight! ends the battle tutorial's placement steps
    return true;
  };

  // Slice 4 §A2: combat speed slider, 0x (stopped) to 4x, live value, gentle snaps (DATA.config.battle.speedSlider).
  // Double-click / double-tap resets to 1x. 0x only stops the sim (b.paused and the tactical queue are untouched).
  const fmtSpeed = (s) => (s === 0 ? "0" : s < 1 ? s.toFixed(2) : String(+s.toFixed(2))) + "x";
  BV.setSpeed = function (v, s) { v.speed = s; G.UI.battleSpeed = s; if (v.speedIn) { v.speedIn.value = String(Math.round(G.Battle.speedPos(s) * 1000)); v.speedVal.textContent = fmtSpeed(s); v.speedWrap.classList.toggle("stopped", s === 0); } };
  BV.speedSlider = function (v) {
    const wrap = document.createElement("span"); wrap.className = "bh-speeds"; wrap.title = "Combat speed (double-click: 1x)";
    const inp = document.createElement("input"); inp.type = "range"; inp.min = "0"; inp.max = "1000"; inp.step = "1"; inp.className = "bh-speed"; inp.dataset.act = "speed";
    inp.setAttribute("aria-label", "Combat speed");
    const val = document.createElement("b"); val.className = "bh-speed-val";
    v.speedIn = inp; v.speedVal = val; v.speedWrap = wrap;
    inp.addEventListener("input", () => { const s = G.Battle.speedAt(+inp.value / 1000); v.speed = s; G.UI.battleSpeed = s; val.textContent = fmtSpeed(s); wrap.classList.toggle("stopped", s === 0); });
    inp.addEventListener("change", () => { BV.setSpeed(v, v.speed); inp.blur(); });   // settle the thumb on the snapped value
    inp.addEventListener("dblclick", () => BV.setSpeed(v, 1));
    // double-tap (touch browsers don't send dblclick on a range reliably). The range moves on the tap's own (later)
    // events, so the reset lands just after them. The slider never keeps focus: Space / 1-4 / B stay battle keys.
    let lastTap = 0, tapX = 0;
    inp.addEventListener("pointerup", (e) => {
      setTimeout(() => inp.blur(), 0);
      if (e.pointerType !== "touch") return;
      const t = performance.now();
      if (t - lastTap < 350 && Math.abs(e.clientX - tapX) < 30) { lastTap = 0; setTimeout(() => BV.setSpeed(v, 1), 60); } else { lastTap = t; tapX = e.clientX; }
    });
    wrap.appendChild(inp); wrap.appendChild(val);
    BV.setSpeed(v, v.speed);
    return wrap;
  };

  // On-screen Pause / Break away for touch (shown on phones only by css/mobile.css). They call exactly what the
  // Space and B keys call in BV.onKey: BV.togglePause / BV.pressEscape.
  BV.renderTouch = function (v) {
    const el = v.touchEl, b = v.b; if (!el) return;
    el.innerHTML = ""; v.touchEsc = null; v.touchCancel = null;
    if (b.phase !== "fight") return;
    const TP = DATA.config.battle.tacticalPause;
    if (TP && TP.enabled && G.Tactical && G.Tactical.on()) {
      const pb = document.createElement("button"); pb.className = "tc-btn tc-pause" + (b.paused ? " on" : ""); pb.dataset.act = "touch-pause";
      pb.textContent = b.paused ? "▶ Resume" : "⏸ Pause"; pb.onclick = () => { pb.blur(); BV.togglePause(v); }; el.appendChild(pb);
    }
    if (G.Escape && G.Escape.on(b)) {
      const eb = document.createElement("button"); eb.className = "tc-btn tc-esc"; eb.dataset.act = "touch-break-away";
      eb.innerHTML = '⇠ Break away<small class="tc-odds"></small>'; eb.onclick = () => { eb.blur(); BV.pressEscape(v); }; el.appendChild(eb);
      v.touchEsc = { btn: eb, odds: eb.querySelector(".tc-odds") };
    }
    // Cancel aim: shown only while an ability or a Med kit is being aimed (BV.updateTouch); the same calls as Esc / right click
    const cb = document.createElement("button"); cb.className = "tc-btn tc-cancel hidden"; cb.dataset.act = "touch-cancel-aim"; cb.textContent = "✕ Cancel aim";
    cb.onclick = () => { cb.blur(); if (v.b.itemAim) BV.itemCancel(v); else if (v.b.aim) BV.cancelAim(v); BV.updateTouch(v); };
    el.appendChild(cb); v.touchCancel = cb;
  };
  BV.updateTouch = function (v) { if (v.touchCancel) v.touchCancel.classList.toggle("hidden", !(v.b.aim || v.b.itemAim)); };
  const toPx = (v, m) => m * v.px;
  function mouseM(v, e) { const r = v.canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * v.W / v.px, y: ((e.clientY - r.top) / r.height) * v.H / v.px, cx: e.clientX, cy: e.clientY }; }
  // art units stand on (x,y) with the body drawn above it, so hit-test around the torso
  function unitAt(v, m) { const lift = v.art ? 0.5 : 0; return v.b.units.filter((u) => u.state !== "dead").find((u) => Math.hypot(u.x - m.x, u.y - lift - m.y) < 0.9); }

  BV.onDown = function (v, e) {
    if (v.b.itemAim) { if (e.button === 0) BV.itemFire(v, mouseM(v, e)); else if (e.button === 2) BV.itemCancel(v); return; }
    if (v.b.aim) { if (e.button === 0) BV.fireAim(v, mouseM(v, e)); else if (e.button === 2) BV.cancelAim(v); return; }
    if (v.b.phase !== "place") return;
    const m = mouseM(v, e), u = unitAt(v, m);
    if (u && u.side === 0) v.drag = u;
  };
  BV.onMove = function (v, e) {
    const m = mouseM(v, e); v.mouse = m;
    if (v.drag) { v.drag.x = m.x; v.drag.y = m.y; return; }
    if (v.b.aim || v.b.itemAim) { v.hover = unitAt(v, m); G.UI.hideTip(); return; }   // aiming: the reticle + hit % replace the tooltip
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

  // ---------- Slice 3 §2: ability bar + aiming ----------
  const AB = () => G.Abilities;
  BV.body = (v) => AB().body(v.b);
  BV.renderBar = function (v) {
    const bar = v.bar, u = BV.body(v); bar.innerHTML = ""; v.barEls = []; v.escEl = null; v.swapEl = null;
    const esc = G.Escape && G.Escape.on(v.b);
    const sw = !!(u && u.sets && u.sets[1]);   // Slice 5 §E: a Backup set = the Swap button
    if (!u || ((!u.abl || !u.abl.length) && !esc && !sw)) { bar.style.display = "none"; return; }
    bar.style.display = "";
    (u.abl || []).forEach((s, i) => {
      const d = s.d, key = DATA.abilities.hotkeys[i] || "";
      const btn = document.createElement("div"); btn.className = "abl-btn"; btn.dataset.abl = s.id;
      const ico = G.Sprites.icon(d.icon, 32, "abl-icon"), ring = document.createElement("div"); ring.className = "abl-ring";
      const icw = document.createElement("div"); icw.className = "abl-icw"; icw.appendChild(ico); icw.appendChild(ring);
      const cdt = document.createElement("span"); cdt.className = "abl-cd"; icw.appendChild(cdt);
      const hk = document.createElement("span"); hk.className = "abl-key"; hk.textContent = key; icw.appendChild(hk);
      const nm = document.createElement("div"); nm.className = "abl-name"; nm.textContent = d.name;
      const pip = document.createElement("button"); pip.className = "abl-auto"; pip.textContent = "A"; pip.title = "Auto: " + d.autoDesc;
      pip.onclick = (e) => { e.stopPropagation(); AB().setAuto(u, i, !s.auto); G.State.save(); BV.updateBar(v); G.Sfx.play("sfx_ui_click"); };
      btn.appendChild(icw); btn.appendChild(nm); btn.appendChild(pip);
      btn.onclick = () => BV.press(v, i);
      btn.onmouseenter = (e) => G.UI.showTip(`<b>${d.name}</b> <small>${TL() ? "" : `[${key}] · `}${d.source} · ${U.fmt1(s.max)} s cooldown</small><br>${d.desc}<br><i>Auto (${s.auto ? "on" : "off"}): ${d.autoDesc}.</i><br><small>${TL() ? "Tap to aim, then tap a target; tap Cancel aim (or this button again) to cancel." : `Click or press ${key} to aim; left click fires, right click / Esc / ${key} again cancels.`}</small>`, e.clientX, e.clientY - 120);
      btn.onmouseleave = () => G.UI.hideTip();
      bar.appendChild(btn); v.barEls.push({ btn, ring, cdt, pip, s });
    });
    if (esc) {   // Break away (milestone 5): a repeatable escape check
      const BA = DATA.config.battle.breakAway, btn = document.createElement("div"); btn.className = "abl-btn esc-btn"; btn.dataset.act = "break-away";
      const icw = document.createElement("div"); icw.className = "abl-icw esc-ico"; icw.textContent = "⇠";
      const ring = document.createElement("div"); ring.className = "abl-ring"; icw.appendChild(ring);
      const cdt = document.createElement("span"); cdt.className = "abl-cd"; icw.appendChild(cdt);
      const hk = document.createElement("span"); hk.className = "abl-key"; hk.textContent = BA.key.toUpperCase(); icw.appendChild(hk);
      const nm = document.createElement("div"); nm.className = "abl-name"; nm.innerHTML = 'Break away<br><small class="esc-odds"></small>';
      btn.appendChild(icw); btn.appendChild(nm); btn.onclick = () => BV.pressEscape(v);
      btn.onmouseenter = (e) => { const i = G.Escape.info(v.b); G.UI.showTip(`<b>Break away</b> <small>${TL() ? "" : `[${BA.key.toUpperCase()}] · `}${U.fmt1(BA.channelSec)} s channel · ${BA.cooldownSec} s cooldown after a fail</small><br>Your body calls the retreat: best ${DATA.skills[BA.skill].name} of your standing units (skill ${i.best}, +${i.mod}) d20 vs ${i.dc} [${i.why}] — ${Math.round(i.chance)}%.<br><b>Success:</b> everyone standing gets out, downed allies are left behind and die. No loot, +${BA.heat} Heat, back where you came from; the enemies stay here.<br><b>Fail:</b> you stumble: ${BA.stumbleSec} s of free attacks.`, e.clientX, e.clientY - 140); };
      btn.onmouseleave = () => G.UI.hideTip();
      bar.appendChild(btn); v.escEl = { btn, ring, cdt, odds: nm.querySelector(".esc-odds") };
    }
    if (sw) {
      const SW = DATA.config.battle.weaponSets.swap, btn = document.createElement("div"); btn.className = "abl-btn swap-btn"; btn.dataset.act = "swap-set";
      const icw = document.createElement("div"); icw.className = "abl-icw esc-ico"; icw.textContent = "⇄";
      const ring = document.createElement("div"); ring.className = "abl-ring"; icw.appendChild(ring);
      const cdt = document.createElement("span"); cdt.className = "abl-cd"; icw.appendChild(cdt);
      const hk = document.createElement("span"); hk.className = "abl-key"; hk.textContent = SW.key.toUpperCase(); icw.appendChild(hk);
      const nm = document.createElement("div"); nm.className = "abl-name"; nm.innerHTML = 'Swap set<br><small class="swap-cur"></small>';
      btn.appendChild(icw); btn.appendChild(nm); btn.onclick = () => BV.pressSwap(v);
      btn.onmouseenter = (e) => { const o = u.sets[1 - u.setIdx]; G.UI.showTip(`<b>Swap weapon set</b> <small>${TL() ? "" : `[${SW.key.toUpperCase()}] · `}${U.fmt1(SW.baseSec)} s (faster with Attack Speed) · ${SW.cooldownSec} s cooldown</small><br>To: ${o.main.name}${o.off ? " + " + o.off.name : ""}${o.shield ? " + " + o.shield.name : ""}. A Handling roll: a fumble costs ${DATA.config.rolls.fumblePenaltySec} s.<br><i>Your class also swaps by itself: for range, or when the backup is loaded and a reload would take longer.</i>`, e.clientX, e.clientY - 120); };
      btn.onmouseleave = () => G.UI.hideTip();
      bar.appendChild(btn); v.swapEl = { btn, ring, cdt, cur: nm.querySelector(".swap-cur") };
    } else v.swapEl = null;
    const feed = document.createElement("div"); feed.className = "combat-feed"; bar.appendChild(feed); v.feedEl = feed; v.feedN = -1;
    BV.updateBar(v);
  };
  BV.updateBar = function (v) {
    const u = BV.body(v); if (!u || !v.barEls) return;
    const down = u.state !== "alive";
    if (v.escEl) {   // Break away: cooldown ring / stumbling / channel / odds
      const E = v.escEl, es = v.b.esc || {}, BA = DATA.config.battle.breakAway, why = G.Escape.block(v.b), ch = u.channel && u.channel.kind === "escape", qd = (v.b.tq || []).some((a) => a.kind === "escape");
      const f = es.stumble > 0 ? 1 : es.cd > 0 ? es.cd / BA.cooldownSec : 0;
      E.ring.style.background = f > 0 ? `conic-gradient(rgba(0,0,0,.68) ${Math.round(f * 360)}deg, rgba(0,0,0,0) 0)` : "none";
      E.cdt.textContent = es.stumble > 0 ? "!" : es.cd > 0 ? Math.ceil(es.cd) : "";
      const inf = G.Escape.info(v.b);
      E.odds.textContent = ch ? "breaking away…" : qd ? "queued" : down ? "you're down" : `${Math.round(inf.chance)}% · DC ${inf.dc}`;
      E.btn.classList.toggle("ready", !why); E.btn.classList.toggle("disabled", !!why && !ch && !qd); E.btn.classList.toggle("queued", qd);
      const TE = v.touchEsc;   // the touch Break away button mirrors it
      if (TE) { const cd = E.cdt.textContent; TE.odds.textContent = E.odds.textContent + (cd === "!" ? " · stumbling" : cd ? ` · ${cd} s` : ""); TE.btn.classList.toggle("ready", !why); TE.btn.classList.toggle("disabled", !!why && !ch && !qd); TE.btn.classList.toggle("queued", qd); }
    }
    if (v.swapEl) { const E = v.swapEl, SW = DATA.config.battle.weaponSets.swap, f = u.swapCd > 0 ? u.swapCd / SW.cooldownSec : 0;
      E.ring.style.background = f > 0 ? `conic-gradient(rgba(0,0,0,.68) ${Math.round(f * 360)}deg, rgba(0,0,0,0) 0)` : "none"; E.cdt.textContent = u.swapCd > 0 ? Math.ceil(u.swapCd) : "";
      E.cur.textContent = u.swapping ? "swapping…" : `${u.setIdx ? "Backup" : "Main"}: ${u.weapon.name || ""}`; E.btn.classList.toggle("ready", G.Battle.canSwap(v.b, u)); E.btn.classList.toggle("disabled", !G.Battle.canSwap(v.b, u)); }
    if (v.feedEl && !(G.Dice && G.Dice.busy())) { const fd = v.b.feed || []; if (fd.length !== v.feedN) { v.feedN = fd.length; v.feedEl.innerHTML = fd.slice(-5).map((l) => `<div class="cf-${l.kind || "info"}">${G.Util.copy(l.text)}</div>`).join(""); v.feedEl.style.display = fd.length ? "" : "none"; } }
    for (let i = 0; i < v.barEls.length; i++) {
      const E = v.barEls[i], s = E.s, f = s.max > 0 ? s.cd / s.max : 0;
      E.ring.style.background = f > 0 ? `conic-gradient(rgba(0,0,0,.68) ${Math.round(f * 360)}deg, rgba(0,0,0,0) 0)` : "none";
      E.cdt.textContent = s.cd > 0 ? Math.ceil(s.cd) : "";
      E.btn.classList.toggle("ready", !down && s.cd <= 0); E.btn.classList.toggle("disabled", down);
      E.btn.classList.toggle("aiming", !!(v.b.aim && v.b.aim.i === i)); E.pip.classList.toggle("on", s.auto); E.btn.classList.toggle("queued", !!s.queued);
    }
  };
  BV.press = function (v, i) {
    const b = v.b, u = BV.body(v), s = u && u.abl && u.abl[i];
    if (b.paused && s) {   // tactical pause: a self ability queues at once; the rest aim, then queue on the click
      b.itemAim = null;
      if (s.queued) { const k = G.Tactical.queue(b).findIndex((a) => a.kind === "ability" && a.u === u && a.i === i); if (k >= 0) G.Tactical.cancel(b, k); BV.renderPause(v); BV.updateBar(v); return; }
      if (s.d.target === "self") { const err = G.Tactical.queueAbility(b, u, i, null); if (err) { G.UI.toast(err); G.Sfx.play("sfx_ui_error"); } else G.Sfx.play("sfx_ui_click"); BV.renderPause(v); BV.updateBar(v); return; }
    }
    const err = AB().aimStart(v.b, i);
    if (err) { G.UI.toast(err); G.Sfx.play("sfx_ui_error"); }
    else if (v.b.aim) G.Sfx.play("sfx_ability_aim");
    BV.updateBar(v);
  };
  BV.cancelAim = function (v) { AB().aimCancel(v.b); BV.updateBar(v); };
  // Break away: now, or queued while paused (press again to unqueue)
  BV.pressEscape = function (v) {
    const b = v.b; if (b.phase !== "fight") return;
    if (b.paused) {
      const k = G.Tactical.queue(b).findIndex((a) => a.kind === "escape");
      const err = k >= 0 ? G.Tactical.cancel(b, k) : G.Tactical.queueEscape(b);
      if (err) { G.UI.toast(err); G.Sfx.play("sfx_ui_error"); } else G.Sfx.play("sfx_ui_click");
      BV.renderPause(v); BV.updateBar(v); return;
    }
    const err = G.Escape.start(b); if (err) { G.UI.toast(err); G.Sfx.play("sfx_ui_error"); } else G.Sfx.play("sfx_ui_click");
    BV.updateBar(v);
  };
  // the aim target under the cursor: a valid unit for unit abilities, else the ground point
  BV.aimTarget = function (v, m) {
    const b = v.b, u = BV.body(v), s = b.aim && u && u.abl[b.aim.i]; if (!s || !m) return null;
    // The 3D picker also carries snapped unit coordinates. Ground abilities must use the same ground point as their preview.
    if (s.d.target === "ground") return { x: m.gx == null ? m.x : m.gx, y: m.gy == null ? m.y : m.gy };
    const lift = v.art ? 0.5 : 0, valid = AB().validTargets(b, u, s);
    return valid.filter((o) => Math.hypot(o.x - m.x, o.y - lift - m.y) < 1.2).sort((p, q) => Math.hypot(p.x - m.x, p.y - lift - m.y) - Math.hypot(q.x - m.x, q.y - lift - m.y))[0] || null;
  };
  BV.fireAim = function (v, m) {
    const tgt = BV.aimTarget(v, m);
    const err = !tgt ? "Pick a valid target." : v.b.paused ? G.Tactical.queueAbility(v.b, v.b.aim.u, v.b.aim.i, tgt) : AB().aimFire(v.b, tgt);
    if (v.b.paused && !err) { G.Sfx.play("sfx_ui_click"); BV.renderPause(v); }
    if (err) { G.UI.toast(err); G.Sfx.play("sfx_ui_error"); }
    BV.updateBar(v);
  };
  BV.onKey = function (v, e) {
    if (v.done || G.Util.typing(e)) return;
    const i = DATA.abilities.hotkeys.indexOf(e.key), TP = DATA.config.battle.tacticalPause;
    if (e.key === " " && e.repeat) { e.preventDefault(); return; }   // a held Space never starts the fight and then pauses it too
    if (e.key === " " && v.b.phase === "place") { e.preventDefault(); BV.fight(v); }   // SP-008: Space = Fight!
    else if (TP && TP.enabled && e.key === TP.key && v.b.phase === "fight") { e.preventDefault(); BV.togglePause(v); }
    else if (i >= 0 && v.b.phase === "fight") { e.preventDefault(); BV.press(v, i); }
    else if (G.Escape && G.Escape.on(v.b) && e.key.toLowerCase() === DATA.config.battle.breakAway.key && v.b.phase === "fight") { e.preventDefault(); BV.pressEscape(v); }
    else if (e.key.toLowerCase() === DATA.config.battle.weaponSets.swap.key && v.b.phase === "fight") { e.preventDefault(); BV.pressSwap(v); }   // Slice 5 §E
    else if (e.key === "Escape" && v.b.itemAim) { e.preventDefault(); e.stopPropagation(); BV.itemCancel(v); }
    else if (e.key === "Escape" && v.b.aim) { e.preventDefault(); e.stopPropagation(); BV.cancelAim(v); }
  };
  BV.pressSwap = function (v) { const u = BV.body(v); if (G.Battle.swapSet(v.b, u, "manual")) { G.Sfx.play("sfx_ui_click"); BV.updateBar(v); } };
  // ---------- tactical pause: queue panel, items, icons over units ----------
  BV.togglePause = function (v) {
    const b = v.b; if (!G.Tactical || !G.Tactical.canPause(b)) return;
    if (b.paused) { G.Tactical.resume(b); G.Sfx.play("sfx_ui_click"); } else { G.Tactical.pause(b); G.Sfx.play("sfx_ui_click"); }
    BV.renderHud(v); BV.renderPause(v); BV.updateBar(v);
  };
  const qIcon = (a) => (a.kind === "ability" ? a.u.abl[a.i].d.icon : a.kind === "escape" ? "ui_break_away" : DATA.resources.med.sprite);
  BV.renderPause = function (v) {
    const b = v.b, T = G.Tactical; let el = v.pausePanel;
    if (!b.paused) { if (el) el.style.display = "none"; return; }
    if (!el) { el = v.pausePanel = document.createElement("div"); el.className = "tp-panel"; v.bar.parentNode.insertBefore(el, v.bar.nextSibling); }
    el.style.display = ""; el.innerHTML = "";
    const head = document.createElement("div"); head.className = "tp-head"; head.innerHTML = (TL() ? "<b>TACTICAL PAUSE</b> · tap a ready ability to aim it, tap Break away to queue it, and use carried Med kits on your units; they run in this order when you tap Resume. A Med kit" : "<b>TACTICAL PAUSE</b> · aim ready abilities (1/2), queue Break away (B) and use carried Med kits on your units; they run in this order when you resume (Space). A Med kit") + " channels " + DATA.config.battle.tacticalPause.channelSec.med + " s after the resume, then that unit can't take another for " + G.Tactical.medCooldown(b) + " s."; el.appendChild(head);
    const items = document.createElement("div"); items.className = "tp-items";
    for (const it of T.items(b)) {
      const btn = document.createElement("button"); btn.className = "tp-item" + (b.itemAim && b.itemAim.kind === it.kind ? " on" : ""); btn.dataset.item = it.kind; btn.disabled = !(it.n > 0);
      btn.appendChild(G.Sprites.icon(it.sprite, 20)); btn.appendChild(document.createTextNode(` Med kit (${it.n})`));
      btn.onclick = () => { b.aim = null; b.itemAim = b.itemAim && b.itemAim.kind === it.kind ? null : { kind: it.kind }; BV.renderPause(v); BV.updateBar(v); };
      items.appendChild(btn);
    }
    el.appendChild(items);
    const list = document.createElement("div"); list.className = "tp-queue";
    const q = T.queue(b);
    if (!q.length) list.innerHTML = '<span class="hint">Queue empty.</span>';
    q.forEach((a, k) => {
      const row = document.createElement("span"); row.className = "tp-q"; row.dataset.q = k;
      row.appendChild(G.Sprites.icon(qIcon(a), 18)); row.appendChild(document.createTextNode(` ${k + 1}. ${T.label(a)} → ${a.kind === "ability" ? (a.tgt && a.tgt.name ? a.tgt.name : a.tgt ? "the spot" : a.u.name) : a.u.name} `));
      const x = document.createElement("button"); x.textContent = "×"; x.title = a.kind === "med" ? "Cancel (the kit stays in your bag)" : "Cancel"; x.onclick = () => { T.cancel(b, k); BV.renderPause(v); BV.updateBar(v); }; row.appendChild(x);
      list.appendChild(row);
    });
    el.appendChild(list);
  };
  BV.itemCancel = function (v) { v.b.itemAim = null; BV.renderPause(v); };
  BV.itemFire = function (v, m) {
    const b = v.b, u = unitAt(v, m), ia = b.itemAim;
    const err = G.Tactical.queueItem(b, ia.kind, u);
    if (err) { G.UI.toast(err); G.Sfx.play("sfx_ui_error"); return; }
    G.Sfx.play("sfx_ui_click"); b.itemAim = null; BV.renderPause(v);
  };
  const iconAt = (ctx, key, x, y, sz) => { const img = SP.get(key); if (img) { ctx.imageSmoothingEnabled = false; const fw = img.naturalWidth / ((SP.def(key) || {}).frames || 1); ctx.drawImage(img, 0, 0, fw, img.naturalHeight, x - sz / 2, y - sz / 2, sz, sz); } else { const d = SP.def(key) || {}; ctx.fillStyle = d.color || "#b08a3a"; ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz); if (d.text) { ctx.font = `bold ${Math.round(sz * 0.7)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff"; ctx.fillText(d.text, x, y + 1); ctx.textBaseline = "alphabetic"; } } };
  BV.drawTactical = function (v) {
    const b = v.b, ctx = v.ctx, px = v.px, lift = bodyLiftM(v), q = (G.Tactical && b.tq) || [];
    ctx.save();
    // queued actions: an icon per action over its unit, numbered in queue order
    const per = new Map();
    q.forEach((a, k) => { const n = per.get(a.u) || 0; per.set(a.u, n + 1);
      const x = a.u.x * px + (n - 0.5) * 26 + 13, y = (a.u.y - lift) * px - px * 1.35;
      ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.strokeStyle = "#ffe080"; ctx.lineWidth = 2; ctx.beginPath(); ctx.rect(x - 13, y - 13, 26, 26); ctx.fill(); ctx.stroke();
      iconAt(ctx, qIcon(a), x, y, 20);
      ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.strokeText(String(k + 1), x + 11, y + 13); ctx.fillStyle = "#ffe080"; ctx.fillText(String(k + 1), x + 11, y + 13);
      if (a.kind === "ability" && a.tgt) { const tx = a.tgt.x * px, ty = ((a.tgt.side != null ? a.tgt.y - lift : a.tgt.y)) * px; ctx.setLineDash([5, 5]); ctx.strokeStyle = "rgba(255,224,128,.7)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a.u.x * px, (a.u.y - lift) * px); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]); G.Sprites.drawWorld(ctx, "ui_aim_reticle", tx, ty, px, { alpha: 0.8 }); } });
    // channelling units: a bar
    for (const u of b.units) if (u.channel && u.state === "alive") { const c = u.channel, w = px * 1.6, x = u.x * px - w / 2, y = (u.y - lift) * px - px * 1.05;
      ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(x, y, w, 6); ctx.fillStyle = "#7ee0ff"; ctx.fillRect(x, y, w * U.clamp(c.t / c.max, 0, 1), 6);
      ctx.font = "10px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 2.5; ctx.strokeStyle = "#000"; const lb = c.kind === "escape" ? "Breaking away" : "Med kit"; ctx.strokeText(lb, u.x * px, y - 3); ctx.fillStyle = "#bfefff"; ctx.fillText(lb, u.x * px, y - 3); }
    // Med kit cooldown (milestone 5): a small timer over each unit that can't take another kit yet
    for (const u of b.units) if (u.side === 0 && u.medCd > 0 && u.state === "alive") {
      const x = u.x * px + px * 0.75, y = (u.y - lift) * px - px * 0.95, rr = 9, f = u.medCd / Math.max(0.01, u.medCdMax || u.medCd);
      ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#e05050"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, rr - 1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); ctx.stroke();
      ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#ffd0d0"; ctx.fillText(String(Math.ceil(u.medCd)), x, y + 3.5);
      ctx.font = "9px sans-serif"; ctx.lineWidth = 2.5; ctx.strokeStyle = "#000"; ctx.strokeText("✚", x - rr - 5, y + 3); ctx.fillStyle = "#e05050"; ctx.fillText("✚", x - rr - 5, y + 3);
    }
    if (b.paused) {
      ctx.fillStyle = "rgba(20,40,70,.3)"; ctx.fillRect(0, 0, v.W, v.H); ctx.strokeStyle = "rgba(120,190,255,.8)"; ctx.lineWidth = 4; ctx.strokeRect(2, 2, v.W - 4, v.H - 4);
      // phones: the arena is drawn at ~0.3x, so 22 px came out ~6.5 css px; give it the floater word minimum (desktop unchanged)
      const pk = G.Touch && G.Touch.layout() && v.canvas.clientWidth ? v.canvas.width / v.canvas.clientWidth : 0, pw = ((DATA.config.battle || {}).phoneFloatPx || { word: 10 }).word;
      ctx.font = "bold " + (pk ? Math.max(22, Math.ceil(pw * pk - 1e-6)) : 22) + "px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "#000";
      const t = TL() ? (b.itemAim ? "MED KIT: tap one of your units · tap Cancel aim" : "⏸ TACTICAL PAUSE · tap Resume")
        : b.itemAim ? `MED KIT: click one of your units · right click / Esc cancels` : "⏸ TACTICAL PAUSE · Space resumes";
      if (!b.aim) { const ty = pk ? Math.max(36, Math.ceil(pw * pk * 1.4)) : 36; ctx.strokeText(t, v.W / 2, ty); ctx.fillStyle = "#bfe4ff"; ctx.fillText(t, v.W / 2, ty); }
      if (b.itemAim) for (const u of b.units) if (u.side === 0 && u.state === "alive") { const ok = !G.Tactical.itemBlock(b, b.itemAim.kind, u); ctx.beginPath(); ctx.ellipse(u.x * px, u.y * px, px * 0.95, px * 0.45, 0, 0, Math.PI * 2); ctx.strokeStyle = ok ? "rgba(96,255,144,.9)" : "rgba(150,150,150,.6)"; ctx.lineWidth = 3; ctx.stroke();
        if (!ok) { ctx.fillStyle = "rgba(90,90,90,.55)"; ctx.beginPath(); ctx.ellipse(u.x * px, (u.y - lift) * px, px * 0.75, px * 0.95, 0, 0, Math.PI * 2); ctx.fill(); }   // greyed out: on cooldown / full HP / already has one coming
      }
    }
    ctx.restore();
  };

  // aiming overlay: range circle, valid targets, AoE preview, reticle, hit %
  BV.drawAim = function (v) {
    const b = v.b, u = BV.body(v), ctx = v.ctx, px = v.px; if (!b.aim || !u || !u.abl[b.aim.i]) return;
    const s = u.abl[b.aim.i], d = s.d, R = AB().range(u, d), lift = v.art ? 0.5 : 0;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(0, 0, v.W, v.H);
    if (R) { ctx.beginPath(); ctx.arc(u.x * px, u.y * px, R * px, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,224,128,.06)"; ctx.fill(); ctx.setLineDash([8, 6]); ctx.strokeStyle = "rgba(255,224,128,.8)"; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
    for (const o of AB().validTargets(b, u, s)) { ctx.beginPath(); ctx.ellipse(o.x * px, o.y * px, px * 0.95, px * 0.45, 0, 0, Math.PI * 2); ctx.strokeStyle = o.side === u.side ? "rgba(96,255,144,.9)" : "rgba(255,90,60,.95)"; ctx.lineWidth = 3; ctx.stroke(); }
    const m = v.mouse;
    if (m) {
      const tgt = BV.aimTarget(v, m), inRange = d.target === "ground" ? Math.hypot(m.x - u.x, m.y - u.y) <= R : !!tgt;
      if (d.target === "ground" && d.radiusM) { ctx.beginPath(); ctx.arc(m.x * px, m.y * px, d.radiusM * px, 0, Math.PI * 2); ctx.fillStyle = inRange ? "rgba(255,160,60,.16)" : "rgba(160,160,160,.12)"; ctx.fill(); ctx.strokeStyle = inRange ? "rgba(255,160,60,.9)" : "rgba(160,160,160,.7)"; ctx.lineWidth = 2; ctx.stroke(); }
      const rx = tgt && tgt.side != null ? tgt.x * px : m.x * px, ry = tgt && tgt.side != null ? (tgt.y - lift) * px : m.y * px;
      G.Sprites.drawWorld(ctx, "ui_aim_reticle", rx, ry, px * 1.2, { alpha: inRange ? 1 : 0.5 });
      const hc = tgt && tgt.side != null ? AB().hitChance(b, u, s, tgt) : null;
      const label = hc != null ? `${Math.round(hc)}% hit` : !inRange ? "out of range" : "";
      if (label) { ctx.font = "bold 13px sans-serif"; ctx.textAlign = "left"; ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.strokeText(label, rx + 18, ry - 14); ctx.fillStyle = hc != null ? "#ffe080" : "#bbb"; ctx.fillText(label, rx + 18, ry - 14); }
    }
    ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#000";
    const mode = b.paused ? "TACTICAL PAUSE: it queues" : (G.state.settings && G.state.settings.aimMode) === "pause" ? "PAUSED" : "SLOW-MO 25%";
    const hint = TL() ? `${d.name.toUpperCase()}: tap ${d.target === "ground" ? "a spot" : "a target"} · tap Cancel aim · ${mode}`
      : `${d.name.toUpperCase()}: left click ${d.target === "ground" ? "a spot" : "a target"} · right click / Esc cancels · ${mode}`;
    ctx.strokeText(hint, v.W / 2, 22); ctx.fillStyle = "#ffe080"; ctx.fillText(hint, v.W / 2, 22);
    ctx.restore();
  };
  // zones (Smoke, Suppressing Fire), grenades in flight, explosions
  BV.drawZones = function (v) {
    const b = v.b, ctx = v.ctx, px = v.px;
    for (const z of b.zones || []) {
      const fade = U.clamp(z.t / 0.6, 0, 1) * U.clamp((z.max - z.t) / 0.3, 0, 1);
      if (z.kind === "smoke") {
        if (hasArt("fx_smoke_cloud")) { const img = SP.get("fx_smoke_cloud"); G.Sprites.drawWorld(ctx, "fx_smoke_cloud", z.x * px, z.y * px, px, { alpha: 0.6 * fade, scale: (z.r * 2 * px) / (img.naturalWidth * (S().texelScale || 1)) }); }
        else { ctx.beginPath(); ctx.arc(z.x * px, z.y * px, z.r * px, 0, Math.PI * 2); ctx.fillStyle = `rgba(170,176,176,${0.45 * fade})`; ctx.fill(); }
      } else if (z.kind === "suppress") {
        ctx.save(); ctx.beginPath(); ctx.arc(z.x * px, z.y * px, z.r * px, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,70,40,${0.1 * fade})`; ctx.fill();
        ctx.setLineDash([6, 5]); ctx.lineDashOffset = -b.t * 20; ctx.strokeStyle = `rgba(255,90,60,${0.8 * fade})`; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      }
    }
    for (const n of b.nades || []) {   // thrown in an arc over the first half of the fuse, then it sits and blinks
      const f = U.clamp(1 - (n.t - n.d.fuseSec / 2) / (n.d.fuseSec / 2), 0, 1), x = n.sx + (n.x - n.sx) * f, y = n.sy + (n.y - n.sy) * f - Math.sin(f * Math.PI) * 2;
      G.Sprites.drawWorld(ctx, "fx_grenade", x * px, y * px, px * 0.45, { rot: f * 12 });
      if (f >= 1 && Math.floor(b.t * 8) % 2) { ctx.beginPath(); ctx.arc(n.x * px, n.y * px, n.d.radiusM * px, 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,80,40,.5)"; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    for (const e of v.booms) {
      const d = SP.def("fx_explosion"), fr = Math.floor((e.age) * (d.fps || 12));
      if (hasArt("fx_explosion")) G.Sprites.drawWorld(ctx, "fx_explosion", e.x * px, e.y * px, px, { frame: Math.min(3, fr), scale: (e.r * 2 * px) / (64 * (S().texelScale || 1)) });
      else { ctx.beginPath(); ctx.arc(e.x * px, e.y * px, e.r * px * Math.min(1, e.age * 6), 0, Math.PI * 2); ctx.fillStyle = `rgba(255,150,40,${Math.max(0, 0.7 - e.age * 2)})`; ctx.fill(); }
    }
  };

  // §7.1: hover any unit to see its hit and fumble chances
  BV.unitTip = function (v, u) {
    const w = u.weapon;
    const foes = v.b.units.filter((o) => o.side !== u.side && o.state === "alive");
    const tgt = u.target && u.target.state === "alive" ? u.target : foes[0];
    let s = `<b>${u.name}</b>${u.elite ? " ★" : ""}${u.rival ? ` <span style="color:#6ee6ff">GHOST</span> <small>(${u.rivalOf})</small>` : ""}<br>HP ${Math.ceil(u.hp)}/${Math.round(u.maxHp)} · Armor ${u.armor} · Eva ${u.eva} · Speed ${U.fmt1(u.speed)} m/s<br>`;
    s += `${w.name}: ${U.fmt1(w.dmg)} ${w.type} / ${w.interval}s · range ${w.range} m${w.mag ? ` · ${u.ammo}/${w.mag}` : ""}<br>`;
    if (u.dual && u.offW) s += `+ ${u.offW.name}: ${U.fmt1(u.offW.dmg)} / ${u.offW.interval}s (dual wield${G.Battle.dualPen(u) > 0 ? `: −${Math.round(DATA.config.battle.weaponSets.dual.accPenalty * G.Battle.dualPen(u))} Hit, +${Math.round(DATA.config.battle.weaponSets.dual.fumblePenalty * G.Battle.dualPen(u))} fumble` : ""})<br>`;   // Slice 5 §E
    if (u.block) s += `${u.block.name}: blocks ${u.block.pct}% from the front<br>`;
    if (u.sets && u.sets[1]) { const o = u.sets[1 - u.setIdx]; s += `<small>${u.setIdx ? "Backup" : "Main"} set in hand · other: ${o.main.name}${o.off ? " + " + o.off.name : ""}${o.shield ? " + " + o.shield.name : ""}</small><br>`; }
    if (tgt) s += `Hit vs ${tgt.name}: <b>${Math.round(G.Battle.hitChance(u, tgt))}%</b><br>`;
    if (w.mag) s += `Fumble per reload: <b>${U.fmt1(G.Battle.fumbleChance(u))}%</b><br>`;
    if (u.spec) s += `<i>${u.spec.name}: ${u.spec.desc}</i><br>`;
    if (u.abl && u.abl.length) s += "Abilities: " + u.abl.map((a) => `${a.d.name} ${a.cd > 0 ? U.fmt1(a.cd) + " s" : "ready"}${a.auto ? "" : " (manual)"}`).join(" · ") + "<br>";
    const bf = [u.buffs.taunt && "Taunted", u.buffs.armorUp && `+${u.buffs.armorUp.v} Armor`, u.buffs.brace && "Braced", u.buffs.riposte && "Riposte", u.buffs.stagger && "Staggered", u.buffs.marked && `MARKED: +${u.buffs.marked.pct}% damage taken`, u.ventT > 0 && "Venting: +50% damage taken", u.unseen && "Unseen", u.aimT > 0 && `Aiming (${U.fmt1(u.aimT)} s)`, u.cb && (u.cb.phase === "fire" ? "Burst firing" : u.cb.locked ? "Burst: aim locked" : `Burst: aiming (${U.fmt1(u.cb.t)} s)`), u.buffs.sidestep && "Sidestepping", u.buffs.frozen && `Frozen (${U.fmt1(u.buffs.frozen.t)} s)`, u.channel && `Using a Med kit (${U.fmt1(u.channel.max - u.channel.t)} s)`, u.buffs.closeIn && "Close in! +20% AS", u.state === "retreating" && "Retreating", u.buffs.nextHit && `next hit +${u.buffs.nextHit.dmgPct}%`, u.zoneEva && `in smoke +${u.zoneEva} Eva`, u.zoneSlow && `suppressed -${u.zoneSlow}% Move ${u.zoneAcc} Acc`].filter(Boolean);
    if (bf.length) s += `<span style="color:#9fd0ff">${bf.join(" · ")}</span><br>`;
    if (u.quirks && u.quirks.length) s += u.quirks.map((q) => DATA.bodies.quirks[q].name).join(", ");
    // Slice 3 §1: each trait and its effect; conditional ones show whether they're on right now
    if (u.traits && u.traits.length) {
      s += "<br>" + G.UI.traitTipHtml(u.traits);
      if (tgt && G.Battle.traitDmg) { const td = G.Battle.traitDmg(v.b, u, tgt); if (td) s += `<br>Trait damage vs ${tgt.name} now: <b>+${td}%</b>`; }
      if (u.buffs && u.buffs.flee) s += "<br><b style='color:#ffb0b0'>Panicking!</b>";
    }
    // Slice 3 §3: the perks acting on this unit
    if (u.side === 0 && G.Perks) {
      const P = G.Perks, rk = (id) => P.rank(id), bits = [];
      if (u.rank === "body") {
        if (rk("thick_skin")) bits.push(`Thick Skin +${P.def("thick_skin").bodyHpPct * rk("thick_skin")}% HP`);
        if (rk("glass_mind")) bits.push("Glass Mind +25% Dmg / -20% HP");
        if (rk("quick_hands")) bits.push(`Quick Hands +${P.def("quick_hands").bodyAsPct * rk("quick_hands")}% AS`);
        if (rk("quick_recovery")) bits.push(`Quick Recovery cooldowns -${P.def("quick_recovery").cooldownPct * rk("quick_recovery")}%`);
        if (rk("iron_will")) bits.push("Iron Will " + (u.ironWill ? "ready" : "used"));
      }
      if (rk("gun_nut")) bits.push(`Gun Nut jam -${P.def("gun_nut").jamPct * rk("gun_nut")}%`);
      if (u.rank === "grunt" && rk("expendables")) bits.push("Expendables +30% Dmg");
      if (u.buffs && u.buffs.expend) bits.push(`+${u.buffs.expend.pct}% AS for ${U.fmt1(u.buffs.expend.t)} s (a Grunt fell)`);
      if (bits.length) s += "<br><span style='color:#e8c95a'>Perks:</span> " + bits.join(" · ");
    }
    return s;
  };

  // Slice 3 §4 per-unit overlays: Sentry gun (rotates to its aim) + vent steam, Crawler arming blink, drone Mark reticle
  BV.drawUnitExtras = function (v, u, x, y, top, sz, art) {
    const ctx = v.ctx, px = v.px, b = v.b, sd = SP.def(u.sprite) || {};
    const mid = art ? (top + y) / 2 : y;
    if (sd.gun) {
      SP.drawWorld(ctx, sd.gun, x, mid, sz * 0.8, { rot: u.gunAng != null ? u.gunAng : Math.PI });
      if (u.ventT > 0) { const img = SP.get("fx_smoke_cloud"); SP.drawWorld(ctx, "fx_smoke_cloud", x, top, px, { alpha: 0.35 + 0.25 * Math.sin(b.t * 12), scale: img ? (px * 1.4) / (img.naturalWidth * (S().texelScale || 1)) : 1 });
        ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#c0e0ff"; ctx.fillText("VENTING", x, top - 8); }
    }
    if (u.fuse != null && u.state === "alive" && Math.floor(b.t * 10) % 2) {
      ctx.beginPath(); ctx.arc(x, y, (u.beh.mine.radiusM) * px, 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,40,40,.7)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, mid, px * 0.25, 0, Math.PI * 2); ctx.fillStyle = "#ff2020"; ctx.fill();
    }
    if (u.buffs.marked) SP.drawWorld(ctx, "fx_mark", x, mid, px * 1.2, { alpha: 0.6 + 0.4 * Math.sin(b.t * 8) });
    // Slice 3 §9 Burn: fx_fire over the burning unit's feet (flickers)
    if (u.burns && u.burns.length) SP.drawWorld(ctx, "fx_fire", x, y - px * 0.2, px * 0.9 * (1 + 0.08 * Math.sin(b.t * 17)), { alpha: 0.75 + 0.25 * Math.sin(b.t * 11), mirror: Math.floor(b.t * 6) % 2 === 0 });
  };

  // Snare's battle stingers (data/audio.js), once per battle: a win -> stinger_battle_win; a loss by the squad going down
  // or your body dying -> stinger_battle_wipe; a loss on the time cap (body and allies still up) and Break away -> none
  // (my call: the wipe is "the whole squad died"). The 3D view calls it when the kill shot holding the fight-ending blow
  // ends (or on its skip); the 2D view when the fight ends. v.sting records { key, via } for the tests.
  BV.stingKey = function (b) {
    if (b.result === "win") return "stinger_battle_win";
    if (b.result !== "loss") return null;
    const body = b.units.find((u) => u.rank === "body" && u.side === 0), up = b.units.some((u) => u.side === 0 && u.state === "alive");
    return !up || (body && body.state !== "alive" && body.state !== "downed") ? "stinger_battle_wipe" : null;
  };
  BV.sting = function (v, via) {
    if (v.stung) return; v.stung = true; const key = BV.stingKey(v.b);
    v.sting = { key, via: via || "end", t: +v.b.t.toFixed(3) }; if (key && G.Sfx) G.Sfx.play(key);
  };
  BV.frame = function (v, t) {
    const b = v.b;
    let dt = Math.min(0.05, (t - v.last) / 1000); v.last = t;
    const timeScale = v.slowmo > 0 ? C().slowMoOnKill : 1;
    v.slowmo = Math.max(0, v.slowmo - dt);
    if (v.barks) G.Barks.tick(v.barks, dt);
    if (v.tutSeen !== b.phase && G.TutView) { v.tutSeen = b.phase; G.TutView.check(); }   // Slice 4 §A T3: the first frame of placement (SP-003) and of the fight
    const diceHeld = !!(G.Dice && G.Dice.busy()), held = !!(G.TutView && G.TutView.holds()) || diceHeld;   // + Slice 5 §B: Break away's die   // a tutorial step is showing: the fight holds (b.paused untouched)
    // SP-100: the same fixed 1/60 sim clock as the 3D view (js/battleclock.js): real time x G.Abilities.timeScale (aiming:
    // 25% of 1x or paused; the kill slow-mo on top) spent in whole steps, so 2D and 3D play a fight step for step.
    // Units / projectiles are drawn between the last two steps (BV.interp), so slow speeds and 120 Hz screens stay smooth.
    if (b.phase === "fight" && !held) G.BattleClock.advance(v.clock, b, dt, v.speed, timeScale, () => BV.snapStep(v));
    for (const e of v.booms) e.age += dt * v.speed * timeScale; v.booms = v.booms.filter((e) => e.age < 0.4);
    if (!diceHeld) BV.drainFx(v);   // Break away's "OUT!" / "STUMBLE" float (and anything else from that tick) waits for the die
    if (v.barEls) BV.updateBar(v);
    if (v.touchCancel) BV.updateTouch(v);
    BV.updateParticles(v, dt * v.speed * timeScale);   // Slice 4 §A2: effects crawl / freeze with the speed slider (kill slow-mo on top)
    BV.interp(v, () => BV.draw(v));
    if (v.timerEl) v.timerEl.textContent = b.phase === "fight" || b.phase === "over" ? (b.mode === "defense" ? `Hold: ${Math.max(0, Math.ceil(b.surviveSec - b.t))} s` : `${b.t.toFixed(1)} s`) : "";
    if (b.over && !v.stung) BV.sting(v);   // the 2D view has no kill cam: the sting plays as the fight ends
    if (b.over && !v.ended && !diceHeld) { v.ended = true; setTimeout(() => v.opts.onEnd && v.opts.onEnd(b), 900); }
  };

  // draw-time interpolation (render only): positions after the step before last (v.ip.prev) and after the last step
  // (v.ip.cur); drawn at alpha = the clock's leftover fraction of a step. The sim's own x / y are put back right after
  // the draw, bit for bit, before anything else runs.
  const posOf = (b) => { const m = new Map(); for (const u of b.units) m.set(u, [u.x, u.y]); for (const q of b.projectiles || []) if (q && q.x != null) m.set(q, [q.x, q.y]); return m; };
  BV.snapStep = function (v) { const cur = posOf(v.b); v.ip = { prev: v.ip ? v.ip.cur : cur, cur }; };
  BV.interp = function (v, draw) {
    const b = v.b, ip = v.ip;
    if (!ip || b.phase !== "fight") return draw();
    const a = Math.max(0, Math.min(1, v.clock.acc / G.BattleClock.DT)), keep = [];
    for (const [o, c] of ip.cur) { const p = ip.prev.get(o); if (!p || o.x !== c[0] || o.y !== c[1]) continue;
      if (Math.abs(c[0] - p[0]) > 3 || Math.abs(c[1] - p[1]) > 3) continue;   // a teleport (Break away, a charge's snap): no smear
      keep.push(o, o.x, o.y); o.x = p[0] + (c[0] - p[0]) * a; o.y = p[1] + (c[1] - p[1]) * a; }
    try { draw(); } finally { for (let i = 0; i < keep.length; i += 3) { keep[i].x = keep[i + 1]; keep[i].y = keep[i + 2]; } }
  };

  const S = () => DATA.sprites;
  const hasArt = (key) => !!SP.get(key);
  // art units stand on their feet at (x,y); aim/hit/text points sit this far above the ground point (m)
  const bodyLiftM = (v) => (v.art ? 0.5 : 0);

  BV.drainFx = function (v) {
    const b = v.b, lift = bodyLiftM(v);
    for (const e of b.fx) {
      if (e.t === "bark") { if (v.barks) G.Barks.event(v.barks, b, e); continue; }   // SP-010
      if (e.t === "text") v.floaters.push({ x: e.x, y: e.y - (v.art ? 1.0 : 0), text: e.text, color: e.color, big: e.big, life: e.big ? 1.6 : 1.0, max: e.big ? 1.6 : 1.0, dx: (v.rnd() - 0.5) * 0.6 });
      else if (e.t === "shot") {
        let x2 = e.x2, y2 = e.y2;
        if (!e.hit) { x2 += (v.rnd() - 0.5) * 2.5; y2 += (v.rnd() - 0.5) * 2.5; }
        v.tracers.push({ x1: e.x1, y1: e.y1 - lift, x2, y2: y2 - lift, life: e.melee ? 0.12 : 0.09, melee: e.melee, proj: e.proj });
        const ap = S().acidPoolOn;
        if (ap && e.proj === ap.projectile) BV.stampDecal(v, ap.decal, x2, y2, v.rnd() * 6.28, 0.8);
        G.Sfx.play(e.sfx); if (!e.hit && !e.melee) setTimeout(() => G.Sfx.play("sfx_miss"), DATA.audio.missDelayMs || 0);
      } else if (e.t === "blood" && e.kind === "machine") {   // Slice 3 §4a: machines spark (short-lived), oil pool instead of blood
        const MF = S().machineFx || {};
        if (e.pool) { if (MF.pool) BV.stampDecal(v, MF.pool, e.x, e.y, e.rot || 0, 1.1, 0.85); }
        else { const ks = MF.sparks || ["fx_spark_1"], k = ks[Math.min(ks.length - 1, Math.floor((e.size || 1) * ks.length / 1.4))]; v.sparks.push({ x: e.x, y: e.y - lift, key: k, rot: e.rot || 0, life: 0.28, max: 0.28 }); G.Sfx.play("sfx_hit_metal", { vol: 0.8 }); }
      } else if (e.t === "blood") { BV.stampBlood(v, e); if (!e.pool) G.Sfx.play("sfx_hit_flesh", { vol: 0.8 }); }
      else if (e.t === "shield") v.arcs.push({ x: e.x, y: e.y - lift, rot: e.rot, life: 0.3, max: 0.3 });
      else if (e.t === "drag") { if (S().dragOn) BV.stampDecal(v, S().dragOn, e.x - Math.cos(e.dir) * 0.6, e.y - Math.sin(e.dir) * 0.6, e.dir, 1.2); }
      else if (e.t === "gibs") {
        const set = (S().gibs && S().gibs[e.kind || "human"]) || [1, 2, 3], pre = (S().gibPrefix || {})[e.kind] || "fx_gib_";
        for (let i = 0; i < e.n; i++) { const a = v.rnd() * Math.PI * 2, sp = 3 + v.rnd() * 7; v.gibs.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: v.rnd() * 6, vr: (v.rnd() - 0.5) * 20, key: pre + set[Math.floor(v.rnd() * set.length)], life: 0.9 + v.rnd() * 0.5, metal: e.kind === "machine" }); }
        G.Sfx.play(e.kind === "machine" ? "sfx_hit_metal" : "sfx_gib");
      }
      else if (e.t === "shake") { v.shake = Math.max(v.shake, e.mag); }
      else if (e.t === "slowmo") v.slowmo = C().slowMoSec;
      else if (e.t === "sfx") G.Sfx.play(e.key);
      else if (e.t === "explosion") { v.booms.push({ x: e.x, y: e.y, r: e.r, age: 0 }); if (!e.metal) BV.stampDecal(v, "fx_blood_pool", e.x, e.y, v.rnd() * 6.28, e.r * 0.8, 0.25); }
      else if (e.t === "death") G.Sfx.play(e.metal ? "sfx_explosion" : e.beast ? "sfx_death_beast" : "sfx_death_human");
    }
    b.fx.length = 0;
    // stamp new corpses onto the decal layer (they stay). Corpse art lies flat, mirrored by heading.
    while (v.corpseIdx < b.corpses.length) {
      const c = b.corpses[v.corpseIdx++];
      SP.drawWorld(v.dctx, c.sprite, toPx(v, c.x), toPx(v, c.y), v.px * 1.6, { rot: c.rot, facing: true });
    }
  };

  BV.stampDecal = function (v, key, x, y, rot, fallbackSize, alpha) {
    SP.drawWorld(v.dctx, key, toPx(v, x), toPx(v, y), v.px * (fallbackSize || 1), { rot: rot || 0, decal: true, mirror: v.rnd() < 0.5, alpha: alpha != null ? alpha : 0.9 });
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
      if (g.life <= 0) { if (!g.metal) BV.stampBlood(v, { x: g.x, y: g.y, size: 0.35, rot: g.rot }); SP.drawWorld(v.dctx, g.key, toPx(v, g.x), toPx(v, g.y), v.px * 0.6, { rot: g.rot, decal: true, mirror: g.vr > 0 }); }
    }
    v.gibs = v.gibs.filter((g) => g.life > 0);
    for (const s of v.sparks) s.life -= dt; v.sparks = v.sparks.filter((s) => s.life > 0);
    for (const a of v.arcs) a.life -= dt; v.arcs = v.arcs.filter((a) => a.life > 0);
    v.shake = Math.max(0, v.shake - dt * 20);
  };

  // Slice 5 §G: the arena floor by zone (DATA.zones.battleFloors: zone id -> key, zone a = the Hushwood's), else bg_battle
  // (no floor for the zone, or the key isn't registered: SP.or never auto-registers, so no 404s)
  BV.arenaBg = function () {
    const zid = (G.state && G.state.run && G.state.run.zone) || null;
    return SP.or(zid && (DATA.zones.battleFloors || {})[zid], "bg_battle");
  };
  BV.draw = function (v) {
    const ctx = v.ctx, b = v.b, c = C(), px = v.px;
    v.art = b.units.some((u) => hasArt(u.sprite));
    ctx.save();
    ctx.imageSmoothingEnabled = !S().pixelArt;
    if (v.shake > 0) ctx.translate(Math.round((v.rnd() - 0.5) * v.shake), Math.round((v.rnd() - 0.5) * v.shake));
    const bgk = BV.arenaBg(), pat = SP.pattern(ctx, bgk);
    if (pat && pat.setTransform && typeof DOMMatrix !== "undefined") pat.setTransform(new DOMMatrix().scale(S().texelScale || 1));
    ctx.fillStyle = pat || SP.def(bgk).color; ctx.fillRect(-10, -10, v.W + 20, v.H + 20);
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
    BV.drawZones(v);
    for (const g of v.gibs) SP.drawWorld(ctx, g.key, g.x * px, g.y * px, px * 0.6, { rot: g.rot });
    // units: downed first, then back-to-front by y (3/4 view)
    const units = b.units.filter((u) => u.state !== "dead" && u.state !== "fled" && !(u.unseen && b.phase === "place")).sort((p, q) => ((p.state === "critical" || p.state === "downed" || p.buffs.knockdown) ? -1 : 0) - ((q.state === "critical" || q.state === "downed" || q.buffs.knockdown) ? -1 : 0) || p.y - q.y);
    for (const u of units) {
      const art = hasArt(u.sprite), sd = SP.def(u.sprite), sz = px * 1.6 * (u.elite ? 1.2 : 1);
      // art stands up out of its ground point: keep the whole sprite (+ HP bar) inside the canvas at the arena edges (render only)
      const artH = art ? 32 * (S().texelScale || 1) * (sd.imgScale || 1) : 0;
      const x = art ? U.clamp(u.x * px, artH * 0.35, v.W - artH * 0.35) : u.x * px, y = art ? U.clamp(u.y * px, artH * (sd.anchorY || 0.9) + 12, v.H - artH * (1 - (sd.anchorY || 0.9))) : u.y * px;
      const ringCol = u.rank === "body" && u.side === 0 ? "#ffd84a" : u.side === 0 ? "#4aa3ff" : "#ff4a4a";
      const down = u.state === "critical" || u.state === "downed" || u.buffs.knockdown;
      if (art) { // ground ellipse ring + shadow at the feet
        const rx = Math.max(u.r * 1.25, 0.6) * px * (sd.imgScale || 1), ry = rx * 0.42, fy = down ? y : y + artH * ((sd.feetY || sd.anchorY || 0.5) - (sd.anchorY || 0.5)) - ry * 0.3;
        ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x, fy, rx * 0.8, ry * 0.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x, fy, rx, ry, 0, 0, Math.PI * 2); ctx.strokeStyle = ringCol; ctx.lineWidth = u.rank === "body" ? 3 : 2; ctx.stroke();
      } else {
        ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x, y + sz * 0.38, sz * 0.38, sz * 0.14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, sz * 0.5, 0, Math.PI * 2); ctx.strokeStyle = ringCol; ctx.lineWidth = u.rank === "body" ? 3 : 2; ctx.stroke();
      }
      if (down) { // Critical / knocked down: lying pose = the unit's own corpse art
        if (u.state === "downed") { // bleeding out (A2): pool strip, then the body's downed strip (sprites[key].downed), same rotation as the corpse
          const dk = sd.downed && hasArt(sd.downed) ? sd.downed : art && u.corpse && hasArt(u.corpse) ? u.corpse : null, pk = S().downedPool;
          const fr = (k) => b.t * ((SP.def(k) && SP.def(k).fps) || 2);
          if (pk) SP.drawWorld(ctx, pk, x, y, px * 1.4, { rot: u.facing, facing: true, frame: fr(pk) });
          if (dk) SP.drawWorld(ctx, dk, x, y, sz, { rot: u.facing, facing: true, frame: fr(dk) });
          else SP.draw(ctx, u.sprite, x, y, sz, Math.PI / 2, 0.45);
          ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.strokeText("DOWNED — bleeding out", x, y - px * 0.95); ctx.fillStyle = "#ff4040"; ctx.fillText("DOWNED — bleeding out", x, y - px * 0.95); continue;
        }
        if (u.state === "critical" && art && sd.downed && hasArt(sd.downed)) {   // a Critical ally with downed art (Veteran): pool strip + downed strip, like a downed body
          const fr = (k) => b.t * ((SP.def(k) && SP.def(k).fps) || 2), pk = S().downedPool;
          if (pk) SP.drawWorld(ctx, pk, x, y, px * 1.4, { rot: u.facing, facing: true, frame: fr(pk) });
          SP.drawWorld(ctx, sd.downed, x, y, sz, { rot: u.facing, facing: true, frame: fr(sd.downed) });
        } else if (art && u.corpse && hasArt(u.corpse)) SP.drawWorld(ctx, u.corpse, x, y, sz, { rot: u.facing, facing: true, alpha: u.state === "critical" ? 0.9 : 1 });
        else SP.draw(ctx, u.sprite, x, y, sz, Math.PI / 2, 0.45);
        if (u.state === "critical") { ctx.fillStyle = "#ff9030"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.fillText("CRITICAL", x, y - px * 0.9); continue; }
      }
      let top;
      if (!down) {
        // walk strip while moving (data: sprites[key].walk), static frame otherwise
        const lk = u.look && hasArt(u.look) ? u.look : null;   // Slice 4 §F: a Grunt's paper doll once it's composited
        let key = lk || u.sprite, frame = 0; const wk = lk ? lk + "_w" : sd.walk;
        if (art && (u.moving || sd.hover) && wk && hasArt(wk)) { key = wk; frame = b.t * (SP.def(wk).fps || 8); }   // hover: the drone's rotor strip always runs
        if (art && !lk && sd.charge && u.buffs && u.buffs.charge && hasArt(sd.charge)) { key = sd.charge; frame = b.t * (SP.def(sd.charge).fps || 8); }   // Slice 5 §G (Vixie): the goat's charge strip while it charges, else the walk strip
        const alpha = u.unseen ? 0.18 : u.state === "retreating" ? 0.8 : undefined;   // an Unseen Stalker is a faint shimmer
        if (u.rival) { ctx.save(); ctx.shadowColor = "rgba(90,230,255,0.95)"; ctx.shadowBlur = 12; }   // Slice 3 §7: rivals are faint cyan ghosts
        const r = SP.drawWorld(ctx, key, x, y, sz, { rot: u.facing, facing: true, anchor: true, frame, alpha: u.rival ? 0.78 : alpha });
        if (u.rival) ctx.restore();
        top = art ? r.top : y - sz * 0.72;
        BV.drawUnitExtras(v, u, x, y, top, sz, art);
      } else top = y - px * 1.2;
      // hp bar
      const bw = art ? px * 1.3 : sz * 0.9, hpF = U.clamp(u.hp / u.maxHp, 0, 1), by = Math.round(top - 6);
      v.heads.set(u, { x, y: by });   // SP-010: barks sit over this
      ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(x - bw / 2, by, bw, 4);
      ctx.fillStyle = hpF > 0.5 ? "#5fd35f" : hpF > 0.25 ? "#e0c040" : "#e04040"; ctx.fillRect(x - bw / 2, by, bw * hpF, 4);
      if (u.reloadT > 0) { ctx.fillStyle = "#aaa"; ctx.fillRect(x - bw / 2, by + 5, bw * (1 - u.reloadT / Math.max(0.1, u.weapon.reload + 2)), 2); }
      if (u.bleeds.length) { ctx.fillStyle = "#c00"; ctx.fillRect(x + bw / 2 + 2, by, 3, 3); }
      if (u.elite) { ctx.fillStyle = "#ffd84a"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "right"; ctx.fillText("★", x - bw / 2 - 2, by + 5); }
      if (v.hover === u) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; const hh = y - top + 4; ctx.strokeRect(x - bw / 2 - 2, top - 2, bw + 4, hh); }
    }
    // Slice 3 §4: Marksman aim lines, Warden shield flares, machine sparks
    for (const u of b.units) if (u.aimT > 0 && u.aimTgt && u.state === "alive") {
      const f = 1 - u.aimT / (u.aimMax || 1.5), lift = bodyLiftM(v);
      ctx.save(); ctx.strokeStyle = `rgba(255,40,40,${0.35 + 0.55 * f})`; ctx.lineWidth = 1 + f * 1.5; ctx.setLineDash(f > 0.8 ? [] : [6, 4]);
      ctx.beginPath(); ctx.moveTo(u.x * px, (u.y - lift) * px); ctx.lineTo(u.aimTgt.x * px, (u.aimTgt.y - lift) * px); ctx.stroke(); ctx.restore();
    }
    // design call (milestone 4): the Hunter Captain's burst telegraph. Tracking: dashed red line to its target;
    // locked (last 0.5 s): a solid, pulsing line that stays put - step out of it; firing: the line fades
    for (const u of b.units) if (u.cb && u.state === "alive") {
      const c = u.cb, lift = bodyLiftM(v), L = (c.tgt ? Math.hypot(c.tgt.x - u.x, c.tgt.y - u.y) : 10) + 4, f = c.phase === "fire" ? 1 : 1 - c.t / (c.max || 1.5);
      const x2 = u.x + Math.cos(c.ang) * L, y2 = u.y + Math.sin(c.ang) * L;
      ctx.save();
      if (c.phase === "aim" && !c.locked) { ctx.strokeStyle = `rgba(255,60,40,${0.6 + 0.35 * f})`; ctx.lineWidth = 2.5; ctx.setLineDash([10, 5]); ctx.shadowColor = "#000"; ctx.shadowBlur = 3; }
      else { const pulse = 0.6 + 0.4 * Math.abs(Math.sin(performance.now() / 60)); ctx.strokeStyle = c.phase === "fire" ? "rgba(255,210,120,0.5)" : `rgba(255,30,30,${pulse})`; ctx.lineWidth = c.phase === "fire" ? 2 : 4; ctx.shadowColor = "#ff2020"; ctx.shadowBlur = 8; }
      ctx.beginPath(); ctx.moveTo(u.x * px, (u.y - lift) * px); ctx.lineTo(x2 * px, (y2 - lift) * px); ctx.stroke();
      if (c.phase === "aim") {
        ctx.setLineDash([]); ctx.shadowBlur = 0;
        if (c.tgt && c.tgt.state === "alive") { const tx = c.tgt.x * px, ty = (c.tgt.y - lift) * px, rr = px * (0.9 + 0.25 * Math.sin(performance.now() / 90)); ctx.strokeStyle = c.locked ? "#ff2020" : "rgba(255,80,60,0.85)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tx, ty, rr, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(tx - rr - 4, ty); ctx.lineTo(tx - rr + 4, ty); ctx.moveTo(tx + rr - 4, ty); ctx.lineTo(tx + rr + 4, ty); ctx.stroke(); }
        const lbl = c.locked ? "LOCKED - MOVE!" : `BURST IN ${U.fmt1(Math.max(0, c.t))}s`; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.strokeText(lbl, u.x * px, (u.y - lift) * px - 56); ctx.fillStyle = c.locked ? "#ff3030" : "#ff8060"; ctx.fillText(lbl, u.x * px, (u.y - lift) * px - 56);
      }
      ctx.restore();
    }
    for (const a of v.arcs) SP.drawWorld(ctx, "fx_shield_arc", a.x * px, a.y * px, px * 1.5, { rot: a.rot, alpha: a.life / a.max });
    for (const s of v.sparks) SP.drawWorld(ctx, s.key, s.x * px, s.y * px, px * 0.5, { rot: s.rot, alpha: U.clamp(s.life / s.max * 1.5, 0, 1) });
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
    // phones: the arena is drawn at 0.27-0.42x there, so 13 px canvas text came out 3.5-5.5 css px (the goat's CHARGE! /
    // KNOCKDOWN unreadable). On the phone layout, word floaters get at least DATA.config.battle.phoneFloatPx css px (numbers
    // a bit less so a volley stays readable); desktop is unchanged.
    const fk = G.Touch && G.Touch.layout() && v.canvas.clientWidth ? v.canvas.width / v.canvas.clientWidth : 0, fp = (DATA.config.battle || {}).phoneFloatPx || { word: 10, num: 8 };
    for (const f of v.floaters) {
      ctx.globalAlpha = U.clamp(f.life / f.max * 1.5, 0, 1);
      const fs0 = f.big ? 18 : 13, fs = fk ? Math.max(fs0, Math.ceil((/[A-Za-z]{2}/.test(f.text) ? fp.word : fp.num) * (f.big ? 1.3 : 1) * fk - 1e-6)) : fs0;
      ctx.font = "bold " + fs + "px sans-serif";
      // phones: a 3 canvas px outline is ~0.4 css px of halo there, so the paler floaters (reload #999, MISS #aaa, JAMMED #ff5050,
      // hurt #ff8080) sat at 2.4-3:1 on Smudge's brighter zone floors (59c4bf3). Give them phoneFloatPx.halo css px of solid black.
      ctx.lineWidth = fk ? Math.max(3, Math.ceil((fp.halo || 1) * 2 * fk)) : 3; ctx.strokeStyle = fk ? "#000" : "rgba(0,0,0,.85)"; ctx.lineJoin = fk ? "round" : "miter";
      ctx.strokeText(f.text, f.x * px, f.y * px); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x * px, f.y * px);
    }
    ctx.lineJoin = "miter";
    // SP-010: what units say, yellow over their heads (phones: at least phoneFloatPx.word css px)
    if (v.barks) { const bs = fk ? Math.max(14, Math.ceil(fp.word * 1.1 * fk)) : 14;
      for (const k of G.Barks.list(v.barks)) { const hd = v.heads.get(k.u); if (hd) G.Barks.draw(ctx, k.text, hd.x, hd.y - Math.round(bs * 0.6), bs, k.left); } }
    v.heads.clear();
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
    BV.drawTactical(v);
    BV.drawAim(v);
    ctx.restore();
  };
})(window);
