// Slice 4 §A: the tutorial overlay. Dims the screen (~60%), rings the step's target (every match as one box), a
// bouncing arrow at it and one text box with Next / Got it (+ "Skip tutorial"). Steps come from G.Tut.due (js/tutorial.js,
// data/tutorial.js). Looked for after every UI.render and every DATA.tutorial.pollMs. Clicks under the overlay are
// blocked until Next. In battle the fight holds (TV.holds(): js/battleview.js doesn't advance) while it's showing,
// without touching b.paused or the tactical queue.
// SP-003 (Megan, Oct 5): T3 opens as the battle screen loads (placement). A sequence's `through` element (Fight!) takes
// clicks through the overlay at any step; a `free` step drops the block and dim so you can play under it, and a
// `doneOn` step has no Next: that event (TV.event, e.g. "fight" from js/battleview.js) finishes it. Fight! pressed
// early: the rest of T3 still shows, with the fight held at 0 s until it closes.
(function (root) {
  if (typeof document === "undefined") return;
  const G = root.G;
  const TV = G.TutView = { cur: null };
  const touch = () => !!(G.Touch && G.Touch.layout());
  const D = () => DATA.tutorial;
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
  const find = (sel) => { if (!sel) return []; try { return [...document.querySelectorAll(sel)].filter(vis); } catch (e) { return []; } };
  const targetsOf = (step) => { let els = find(G.Tut.sel(step, touch())); const fb = G.Tut.fallback(step, touch()); if (!els.length && fb) els = find(fb); return els; };
  const ctx = () => ({ touch: touch(), has: (sel, fb) => find(sel).length > 0 || (!!fb && find(fb).length > 0) });

  // the triggers that apply to what's on screen now
  TV.triggers = function () {
    const s = G.state, UI = G.UI; if (!s) return [];
    if (document.querySelector("#modal-root .modal")) return [];
    const bv = G.BattleView && G.BattleView.active;
    if (UI.battle) return bv && !bv.done && !bv.b.over && (bv.b.phase === "place" || (bv.b.phase === "fight" && bv.b.t < 0.1)) ? ["battle"] : [];   // T3: placement, or the fight at 0 s
    if (s.run) {
      const r = s.run; if (r.queue.length || UI.search) return [];
      const out = [], node = G.Exp.node(), loc = G.Map.loc(node);
      if ((loc && loc.extraction) || (G.V2 && G.V2.on() && G.V2.extractInfo(r.loc).canNow)) out.push("extract_site");
      out.push(G.Exp.inSite() ? "site" : "map");
      return out;
    }
    if (UI.panel === "deploy") return ["deploy"];
    return UI.panel ? [] : ["outpost"];
  };
  TV.holds = () => !!(TV.cur && TV.cur.trigger === "battle");
  TV.check = function () {
    if (TV.cur || !G.Tut || !G.Tut.on() || !G.state || (G.Title && G.Title.open)) return;   // not under the title screen
    const trig = TV.triggers(); if (!trig.length) return;
    const due = G.Tut.due(trig, ctx()); if (!due) return;
    TV.open(due);
  };
  TV.open = function (due) {
    TV.cur = { id: due.id, trigger: due.seq.trigger, steps: due.steps, i: 0, seq: due.seq };
    G.UI.hideTip();
    const el = TV.el = document.createElement("div"); el.id = "tut-root"; el.className = "tut"; el.dataset.seq = due.id;
    el.innerHTML = '<div class="tut-block"></div><div class="tut-dim"></div><div class="tut-ring"></div><div class="tut-arrow">▼</div>' +
      '<div class="tut-box" role="dialog"><p class="tut-text"></p><div class="tut-btns"><button class="tut-skip" data-act="tut-skip">Skip tutorial</button><span class="tut-n"></span><button class="primary tut-next" data-act="tut-next">Next</button></div></div>';
    el.style.setProperty("--tut-dim", String(D().dimAlpha != null ? D().dimAlpha : 0.6));
    for (const k of ["pointerdown", "mousedown", "touchstart", "click", "wheel"]) el.querySelector(".tut-block").addEventListener(k, (e) => { e.stopPropagation(); if (e.cancelable && k !== "touchstart") e.preventDefault(); if (k === "click") TV.through(e); }, { passive: false });
    el.querySelector(".tut-next").addEventListener("click", (e) => { e.stopPropagation(); TV.next(); });
    el.querySelector(".tut-skip").addEventListener("click", (e) => { e.stopPropagation(); TV.skip(); });
    document.body.appendChild(el);
    window.addEventListener("keydown", TV.onKey, true);
    TV.show();
  };
  // a click on the blocking layer over the sequence's `through` element (Fight!) goes to it
  TV.through = function (e) {
    const sel = TV.cur && TV.cur.seq.through; if (!sel || !document.elementsFromPoint) return;
    const hit = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.matches && x.matches(sel));
    if (hit && !hit.disabled) hit.click();
  };
  // something the game did (Fight! pressed): flag the open sequence's steps that it finishes; the current one moves on
  TV.event = function (name) {
    if (!TV.cur) return;
    const st = TV.step();
    for (const x of TV.cur.steps) if (x.doneOn === name && x !== st) G.Tut.mark(x.id);
    if (st && st.doneOn === name) TV.next(); else G.State.save();
  };
  TV.onKey = function (e) {
    if (!TV.cur || G.Util.typing(e)) return;
    const st = TV.step();
    if (st && st.doneOn && (e.key === "Enter" || e.key === " " || e.key === "Spacebar")) {   // a doneOn step: the key presses its target (Fight!)
      e.preventDefault(); e.stopPropagation(); if (e.repeat) return;
      const t = targetsOf(st)[0]; if (t && !t.disabled) t.click(); else if (!t) TV.next();
    }
    else if (st && st.free) return;   // a free step: the game keeps its keys
    else if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) TV.next(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); }
    else if (TV.holds()) e.stopPropagation();   // battle hotkeys wait until the step is closed
  };
  TV.step = () => TV.cur && TV.cur.steps[TV.cur.i];
  TV.show = function () {
    const st = TV.step(); if (!st) return TV.close();
    // a step whose condition went false since the sequence opened is skipped (not flagged); so is one already done
    // (a doneOn step whose event came early)
    if (G.Tut.done(st.id) || !G.Tut.cond(st.when) || (st.skipIfMissing && !targetsOf(st).length)) { TV.cur.i++; return TV.show(); }
    const el = TV.el, last = TV.cur.i === TV.cur.steps.length - 1;
    el.classList.toggle("free", !!st.free);
    el.querySelector(".tut-text").textContent = G.Util.copy(G.Tut.text(st, touch()));
    el.querySelector(".tut-next").textContent = last ? "Got it" : "Next";
    el.querySelector(".tut-n").textContent = TV.cur.steps.length > 1 ? `${TV.cur.i + 1}/${TV.cur.steps.length}` : "";
    el.dataset.step = st.id;
    TV.nextBtn();
    if (G.Sfx) G.Sfx.play("sfx_tutorial_pop");   // Slice 4 SFX: each step appears
    TV.scrolled = null;   // TV.place scrolls the new step's target into view
    TV.place();
    if (!TV.raf) { const loop = () => { if (!TV.cur) { TV.raf = 0; return; } TV.place(); TV.raf = requestAnimationFrame(loop); }; TV.raf = requestAnimationFrame(loop); }
  };
  // Scroll the step's (first) target into view once per target element. A render replaces the DOM and the new panel
  // starts scrolled to the top (e.g. main.js re-renders the deploy panel when grunt art finishes loading, just after
  // T1 opens), so a replaced target is scrolled in again. Phones: keep the ring's padding on screen too (scroll-margin).
  TV.scrollIn = function (t) {
    const e = t[0]; if (!e || e === TV.scrolled || !e.scrollIntoView) return;
    TV.scrolled = e;
    const m = touch() ? ((D().ringPadPx || 6) + 3) + "px" : null, was = e.style.scrollMargin;
    try { if (m) e.style.scrollMargin = m; e.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (x) {}
    if (m) e.style.scrollMargin = was;
  };
  // a doneOn step has no Next (its target finishes it), unless the target isn't on screen: then Next, so it can't trap you
  TV.nextBtn = function () {
    const st = TV.step(), b = TV.el && TV.el.querySelector(".tut-next"); if (!st || !b) return;
    b.hidden = !!(st.doneOn && targetsOf(st).length);
  };
  // ring = the union box of every visible match (re-queried every frame: renders replace the DOM)
  TV.place = function () {
    const st = TV.step(), el = TV.el; if (!st || !el) return;
    const vw = window.innerWidth, vh = window.innerHeight, pad = D().ringPadPx || 6;
    const t = targetsOf(st); TV.scrollIn(t); if (st.doneOn) TV.nextBtn();
    const ring = el.querySelector(".tut-ring"), dim = el.querySelector(".tut-dim"), arrow = el.querySelector(".tut-arrow"), box = el.querySelector(".tut-box");
    let R = null;
    if (t.length) {
      let l = 1e9, tp = 1e9, r = -1e9, b = -1e9;
      for (const x of t) { const q = x.getBoundingClientRect(); l = Math.min(l, q.left); tp = Math.min(tp, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); }
      l = Math.max(2, l - pad); tp = Math.max(2, tp - pad); r = Math.min(vw - 2, r + pad); b = Math.min(vh - 2, b + pad);
      if (r > l && b > tp) R = { l, t: tp, w: r - l, h: b - tp };
    }
    el.classList.toggle("no-target", !R);
    if (R) Object.assign(ring.style, { left: R.l + "px", top: R.t + "px", width: R.w + "px", height: R.h + "px" });
    dim.style.display = R ? "none" : "";
    // text box: below the ring if it fits, else above, else beside; centred when there's no target
    const bw = box.offsetWidth, bh = box.offsetHeight, gap = 46;
    let bx, by, dir = st.arrow || "auto";
    if (!R) { bx = (vw - bw) / 2; by = (vh - bh) / 2; dir = "none"; }
    else {
      const cx = R.l + R.w / 2;
      if (R.t + R.h + gap + bh < vh - 4) { by = R.t + R.h + gap; if (dir === "auto") dir = "up"; }
      else if (R.t - gap - bh > 4) { by = R.t - gap - bh; if (dir === "auto") dir = "down"; }
      else { by = Math.max(4, Math.min(vh - bh - 4, R.t + R.h / 2 - bh / 2)); if (dir === "auto") dir = R.l + R.w + gap + bw < vw ? "left" : "right"; }
      bx = dir === "left" ? R.l + R.w + gap : dir === "right" ? R.l - gap - bw : cx - bw / 2;
      if (R.w > vw * 0.8 && R.h > vh * 0.6) { bx = (vw - bw) / 2; by = vh - bh - 12; dir = "none"; }   // a huge target (the battle field): box at the bottom
    }
    bx = Math.max(4, Math.min(vw - bw - 4, bx)); by = Math.max(4, Math.min(vh - bh - 4, by));
    box.style.left = bx + "px"; box.style.top = by + "px";
    arrow.style.display = R && dir !== "none" ? "" : "none";
    if (R && dir !== "none") {
      const A = { up: ["▲", R.l + R.w / 2, R.t + R.h + 4], down: ["▼", R.l + R.w / 2, R.t - 40], left: ["◀", R.l + R.w + 4, R.t + R.h / 2 - 18], right: ["▶", R.l - 40, R.t + R.h / 2 - 18] }[dir];
      arrow.textContent = A[0]; arrow.className = "tut-arrow " + dir; arrow.style.left = (dir === "up" || dir === "down" ? A[1] - 18 : A[1]) + "px"; arrow.style.top = A[2] + "px";
    }
  };
  TV.next = function () {
    const st = TV.step(); if (!st) return TV.close();
    G.Tut.mark(st.id); G.State.save();
    TV.cur.i++;
    if (TV.cur.i >= TV.cur.steps.length) TV.close(); else TV.show();
  };
  TV.skip = function () { G.Tut.setMode("none"); G.State.save(); TV.close(); G.UI.toast("Tutorial off. Settings → Gameplay → Replay tutorial brings it back."); };
  TV.close = function () {
    TV.cur = null; TV.scrolled = null; if (TV.raf) cancelAnimationFrame(TV.raf); TV.raf = 0;
    window.removeEventListener("keydown", TV.onKey, true);
    if (TV.el) TV.el.remove(); TV.el = null;
    setTimeout(TV.check, 0);   // another sequence may be due right away
  };
  setInterval(() => { try { TV.check(); } catch (e) { /* never break the game over a tutorial step */ } }, (DATA.tutorial && DATA.tutorial.pollMs) || 400);
})(window);
