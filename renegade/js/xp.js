// XP events (Slice 2 §10). Logic-only: G.State.giveXp emits one event per visible label; the presentation layer
// (js/xpfloat.js, js/battleview.js) subscribes and draws the floating "+N XP (Skill)" text near the current anchor.
// anchor: { el } (a DOM element), { unit, battle } (a battle unit), or null (the UI picks a default).
(function (root) {
  const G = root.G;
  const XP = G.XP = { listeners: [], anchor: null };
  XP.at = function (anchor, fn) { const prev = XP.anchor; XP.anchor = anchor; try { return fn(); } finally { XP.anchor = prev; } };
  // ev: { label, n } for a gain, or { levelUp: "Rifles 12!" }; derived: true for the Body / Character share of a skill gain
  XP.emit = function (ev) {
    const r = G.state && G.state.run;
    if (r && ev.n) { r.xpTally = r.xpTally || {}; r.xpTally[ev.label] = (r.xpTally[ev.label] || 0) + ev.n; }
    if (!XP.listeners.length) return;
    ev.anchor = ev.anchor || XP.anchor;
    for (const f of XP.listeners) { try { f(ev); } catch (e) { /* presentation errors never break game logic */ } }
  };
})(typeof window !== "undefined" ? window : globalThis);
