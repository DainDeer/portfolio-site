// Floating "+N XP (Skill)" labels (Slice 2 §10). Subscribes to G.XP events. Real-time durations (not battle speed).
// DOM anchors (objects, buttons, lines) -> a fixed-position DOM layer. Battle unit anchors -> G.XPFloat.battle,
// drawn by js/battleview.js on the battle canvas beside the unit, smaller than combat text.
// Merge: same label + same source within mergeSec sums into one label. Stack: up to maxPerSource labels per source,
// then the rest fold into "+N XP (k skills)".
(function (root) {
  const G = root.G;
  const XF = G.XPFloat = { battle: [], dom: [] };
  const C = () => DATA.config.xpFloat;
  let layer = null;
  const now = () => performance.now();
  const fmtN = (n) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
  function ensureLayer() { if (!layer || !layer.isConnected) { layer = document.createElement("div"); layer.id = "xp-layer"; document.body.appendChild(layer); } return layer; }

  // resolve an anchor to { key, x, y } (page coords) or { key, unit } for battle
  function resolve(anchor) {
    if (anchor && anchor.unit) return { key: "u" + anchor.unit.id, unit: anchor.unit };
    let el = null, rect = null, key = "default";
    if (anchor && anchor.el) { el = anchor.el; key = "el:" + (el.dataset.act || el.textContent || "").slice(0, 20); }
    else if (anchor && anchor.obj) { el = G.SiteView && G.SiteView.els[anchor.obj]; key = "obj:" + anchor.obj; }
    else if (anchor && anchor.rect) { rect = anchor.rect; key = "rect:" + Math.round(rect.left) + "," + Math.round(rect.top); }
    if (!el && !rect) { el = document.querySelector(".map-node.current") || document.querySelector(".site-squad") || document.querySelector(".exp-head") || document.querySelector("#topbar"); if (key === "default") key = "default"; }
    if (el && el.isConnected) rect = el.getBoundingClientRect();
    if (!rect) return null;
    return { key, x: rect.left + rect.width / 2, y: rect.top };
  }

  function labelText(e) { return e.levelUp ? e.levelUp : `+${fmtN(e.n)} XP (${e.label})`; }

  // shared merge/stack bookkeeping per source
  const sources = {};
  function push(src, e) {
    const t = now(), c = C();
    const list = (sources[src.key] = (sources[src.key] || []).filter((f) => t - f.t0 < c.lifeSec * 1000));
    if (!e.levelUp) {
      const same = list.find((f) => f.label === e.label && t - f.born < c.mergeSec * 1000 && !f.summary);
      if (same) { same.n += e.n; same.text = labelText(same); same.t0 = t; return same; }
      if (list.filter((f) => !f.level).length >= c.maxPerSource) {
        let sum = list.find((f) => f.summary);
        const plain = list.filter((f) => !f.level && !f.summary);
        if (!sum) { sum = plain[plain.length - 1]; sum.summary = true; sum.labels = new Set([sum.label]); }
        sum.labels.add(e.label); sum.n += e.n; sum.text = `+${fmtN(sum.n)} XP (${sum.labels.size} skills)`; sum.t0 = t;
        return sum;
      }
    }
    const f = Object.assign({ label: e.label, n: e.n || 0, level: !!e.levelUp, born: t, t0: t, idx: list.length, text: labelText(e), color: e.levelUp ? c.levelColor : c.color }, src);
    list.push(f);
    if (src.unit) XF.battle.push(f); else XF.addDom(f);
    return f;
  }

  XF.addDom = function (f, side) {
    const L = ensureLayer();
    const el = document.createElement("div"); el.className = "xp-float" + (f.level ? " lvl" : "");
    el.textContent = f.text; el.style.color = f.color;
    L.appendChild(el);
    f.el = el; f.side = side;
    XF.dom.push(f);
    if (!XF.raf) XF.raf = requestAnimationFrame(XF.frame);
  };
  XF.frame = function () {
    const t = now(), c = C();
    XF.dom = XF.dom.filter((f) => {
      const age = (t - f.t0) / 1000;
      if (age > c.lifeSec) { f.el.remove(); return false; }
      const rise = c.risePx * Math.min(1, age / c.lifeSec);
      f.el.textContent = f.text;
      const w = f.el.offsetWidth;
      const x = f.side === "right" ? f.x + 60 : f.x - w / 2;
      f.el.style.left = x + "px"; f.el.style.top = (f.y - 16 - f.idx * 14 - rise) + "px";
      f.el.style.opacity = age > c.lifeSec - c.fadeSec ? String(Math.max(0, (c.lifeSec - age) / c.fadeSec)) : "1";
      return true;
    });
    XF.battle = XF.battle.filter((f) => (t - f.t0) / 1000 <= c.lifeSec);
    XF.raf = XF.dom.length ? requestAnimationFrame(XF.frame) : null;
  };
  // battle canvas helper: alpha + rise for an entry (real time)
  XF.battleStyle = function (f) { const c = C(), age = (now() - f.t0) / 1000; return { alpha: age > c.lifeSec - c.fadeSec ? Math.max(0, (c.lifeSec - age) / c.fadeSec) : 1, rise: c.risePx * Math.min(1, age / c.lifeSec) }; };

  // plain floating text next to an element (disturbance readout, extraction summary lines)
  XF.text = function (el, text, color, side) {
    if (!el || !el.isConnected) return;
    const r = el.getBoundingClientRect();
    // "below": under the element (the disturbance readout), so it never covers the XP labels stacking above
    const f = { text, color: color || C().color, t0: now(), idx: 0, x: side === "right" ? r.left + Math.min(r.width, 160) : r.left + r.width / 2, y: side === "right" ? r.top + r.height : side === "below" ? r.bottom + 30 : r.top, level: false };
    XF.addDom(f, side);
  };

  G.XP.listeners.push(function (e) {
    const c = C(); if (!c.enabled || typeof document === "undefined") return;
    if (e.derived && !c.showDerived) return;
    if (!e.levelUp && !(e.n > 0)) return;
    const src = resolve(e.anchor);
    if (!src) return;
    if (src.unit && !(G.UI && G.UI.battle)) return;   // headless battle (no view): nothing to draw
    push(src, e);
  });
})(window);
