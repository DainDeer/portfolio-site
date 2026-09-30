// Touch / phone support. The phone layout is css/mobile.css; this file is the tap behaviour.
// Mouse input is never touched: every handler here only acts on a click that comes right after a real touchstart,
// so desktop hover tooltips and clicks work exactly as before.
//
// Tooltips on touch: the browser turns a tap into mouseover / mouseenter / mousemove / click, so the existing hover
// handlers (UI.tipOn, map nodes, location objects, battle buttons) already open the tooltip on the tap. On top of that:
//  - a tap on something that commits you (moving to a map node, searching a location object) first only shows its
//    tooltip; tap it again to go (the tooltip closes)
//  - a tap that doesn't open a tooltip closes the open one ("tap elsewhere to close")
//  - plain elements with a native title (trait chips, perk chips, map tokens, disabled buttons' reasons) show it in the
//    same tooltip on tap, since touch browsers never show title text
// The battle canvas handles its own touches (js/battleview.js): a tap on a unit shows its tooltip, a tap on empty
// ground closes it. No gestures (pinch / double-tap zoom are off: index.html viewport + css/mobile.css touch-action).
(function (root) {
  if (typeof document === "undefined") return;   // the headless Node tests load every non-presentation js/ file
  const G = root.G, UI = G.UI;
  const T = G.Touch = { lastTouch: -1e9, tapMs: 1000 };
  const now = () => performance.now();
  T.recent = () => now() - T.lastTouch < T.tapMs;
  // the phone layout (same media query as css/mobile.css): touch wording and touch-only controls follow it
  T.PHONE = "(pointer: coarse) and (max-width: 940px), (pointer: coarse) and (max-height: 500px)";
  const phoneMq = root.matchMedia ? root.matchMedia(T.PHONE) : null;
  T.layout = () => !!(phoneMq && phoneMq.matches);
  // committing actions: first tap = tooltip, second tap on the same element = the action
  T.tapFirst = ".map-node.reachable, .map-node.enterable, .site-obj.usable";
  const CONTROL = "button, a, input, select, textarea, label, .abl-btn, .card, .town-hs";
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const tipEl = () => document.getElementById("tooltip");
  const tipOpen = () => !tipEl().classList.contains("hidden");
  const fresh = () => tipOpen() && (UI.tipAt || -1e9) >= T.lastTouch;   // opened by this tap
  const titled = (t) => { const el = t && t.closest && t.closest("[title]"); return el && el.getAttribute("title") ? el : null; };

  document.addEventListener("touchstart", (e) => { T.lastTouch = now(); T.startTarget = e.target; }, { capture: true, passive: true });
  // disabled buttons get no click: show why (their title) when the finger lifts
  document.addEventListener("touchend", (e) => {
    const t = T.startTarget && T.startTarget.closest ? T.startTarget.closest("button:disabled[title]") : null;
    if (t && t.getAttribute("title") && e.changedTouches[0]) { const p = e.changedTouches[0]; UI.showTip(esc(t.getAttribute("title")), p.clientX, p.clientY); }
  }, { capture: true, passive: true });
  document.addEventListener("click", (e) => {
    if (!T.recent()) return;   // mouse / keyboard: desktop behaviour
    const t = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement; if (!t) return;
    const first = t.closest(T.tapFirst);
    if (first && fresh() && UI.tipArmed !== first) { e.preventDefault(); e.stopPropagation(); UI.tipArmed = first; return; }
    if (first && UI.tipArmed === first) { UI.hideTip(); return; }   // second tap: the action runs
    if (fresh()) return;   // this tap opened a tooltip (hover handlers): keep it
    const ti = titled(t);
    if (ti && !ti.closest(CONTROL)) { UI.showTip(esc(ti.getAttribute("title")), e.clientX, e.clientY); return; }
    if (tipOpen()) UI.hideTip();
  }, true);
  // a mouse event that no finger made, right after a tap (Chrome replays a stale mouse position after layout changes):
  // don't let it close the tooltip the tap just opened
  document.addEventListener("mouseleave", (e) => {
    if (T.recent() && e.sourceCapabilities && !e.sourceCapabilities.firesTouchEvents && fresh()) e.stopPropagation();
  }, true);
  // phones: the zone map scrolls inside its box (css/mobile.css); after each render, centre it on where you are
  T.centerMap = function () {
    const box = document.querySelector(".exp-map"), cur = box && box.querySelector(".map-node.current");
    if (!cur || (box.scrollWidth <= box.clientWidth && box.scrollHeight <= box.clientHeight)) return;   // desktop: nothing scrolls
    const b = box.getBoundingClientRect(), c = cur.getBoundingClientRect();
    box.scrollLeft += c.left + c.width / 2 - (b.left + b.width / 2); box.scrollTop += c.top + c.height / 2 - (b.top + b.height / 2);
  };
  new MutationObserver(() => T.centerMap()).observe(document.getElementById("screen"), { childList: true });
  // older iOS Safari ignores user-scalable=no: block its pinch gesture events, on touch devices only
  // (desktop Safari fires them for trackpad pinch: left alone there, so pinch-zoom on a Mac still works)
  const coarse = root.matchMedia ? root.matchMedia("(pointer: coarse)") : null;
  for (const k of ["gesturestart", "gesturechange"]) document.addEventListener(k, (e) => { if (coarse && coarse.matches) e.preventDefault(); }, { passive: false });
})(window);
