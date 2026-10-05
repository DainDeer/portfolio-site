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
  T.LANDSCAPE = "(pointer: coarse) and (max-height: 500px) and (orientation: landscape)";   // css/mobile.css "landscape phones"
  const landMq = root.matchMedia ? root.matchMedia(T.LANDSCAPE) : null;
  T.landscape = () => !!(landMq && landMq.matches);
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
  // Chrome replays mouse leaves around a tap and after layout changes. A leave from an old hotspot must not
  // disarm the current two-tap action; tapping elsewhere still closes it in the click handler above.
  document.addEventListener("mouseleave", (e) => {
    if (T.recent() && e.sourceCapabilities && (e.sourceCapabilities.firesTouchEvents ? UI.tipArmed : fresh())) e.stopPropagation();
  }, true);
  // phones: the zone map scrolls inside its box (css/mobile.css); after each render, centre it on where you are
  T.centerMap = function () {
    const box = document.querySelector(".exp-map"), cur = box && box.querySelector(".map-node.current");
    if (!cur || (box.scrollWidth <= box.clientWidth && box.scrollHeight <= box.clientHeight)) return;   // desktop: nothing scrolls
    const b = box.getBoundingClientRect(), c = cur.getBoundingClientRect();
    box.scrollLeft += c.left + c.width / 2 - (b.left + b.width / 2); box.scrollTop += c.top + c.height / 2 - (b.top + b.height / 2);
  };
  // phones: the pods room (Slice 4 §B, css/mobile.css) is drawn bigger than its box and scrolls. When you walk in, centre
  // it on the wheels; every wheel turn re-renders the view, so after that keep the scroll where the player left it.
  T.siteScroll = null;
  T.centerSite = function () {
    const box = document.querySelector(".exp-map"), wrap = box && box.querySelector(":scope > .site-wrap");
    if (!wrap || (box.scrollWidth <= box.clientWidth && box.scrollHeight <= box.clientHeight)) { T.siteScroll = null; return; }   // desktop / every other room: nothing scrolls
    const key = wrap.dataset.loc;
    if (T.siteScroll && T.siteScroll.key === key) { box.scrollLeft = T.siteScroll.x; box.scrollTop = T.siteScroll.y; return; }
    const ws = [...wrap.querySelectorAll(".site-obj.wheel")].map((e) => e.getBoundingClientRect()); if (!ws.length) return;
    const b = box.getBoundingClientRect(), cx = (Math.min(...ws.map((r) => r.left)) + Math.max(...ws.map((r) => r.right))) / 2, cy = (Math.min(...ws.map((r) => r.top)) + Math.max(...ws.map((r) => r.bottom + 44))) / 2;
    box.scrollLeft += cx - (b.left + b.width / 2); box.scrollTop += cy - (b.top + b.height / 2);
    T.siteScroll = { key, x: box.scrollLeft, y: box.scrollTop };
  };
  // phones: each pods wheel's ↺ / ↻ pair (44 px buttons, css/mobile.css) hangs under the wheel by default. In some saves
  // that is right over the mural (2 in 10 fresh saves at 844x390 covered its middle: half the mural took no tap) or
  // another wheel. After each render pick, per wheel, a spot that keeps the pair inside the room view and off the mural,
  // the other wheels and the other pairs: under or over the wheel, slid sideways by as little as it takes (at most half
  // the pair, so it still reads as that wheel's pair). The way out and the extraction hotspot (Slice 5 D) count like the
  // mural. Grazing another object's 44 px hit area costs its area; each px slid costs
  // 10 (a pair far off its wheel reads as the neighbour's). Inline styles; no rng.
  T.placeWheelBtns = function () {
    const wrap = document.querySelector(".exp-map > .site-wrap"); if (!wrap) return;
    const pairs = [...wrap.querySelectorAll(".site-obj.wheel > .wheel-btns")];
    if (!pairs.length || getComputedStyle(pairs[0]).display === "none") return;   // mouse: no buttons, nothing to place
    const R = (e) => e.getBoundingClientRect(), W = R(wrap);
    const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const hit = (r) => { const w = Math.max(r.width, 44), h = Math.max(r.height, 44), x = r.left + r.width / 2, y = r.top + r.height / 2; return { left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2 }; };   // the 44 px hit area (mobile.css ::after)
    const objs = [...wrap.querySelectorAll(".site-obj")].map((e) => ({ e, r: hit(R(e)), hard: ["mural", "wheel", "exit", "extract"].some((k) => e.classList.contains(k)) })), done = [];
    const put = (b, up, dx) => { Object.assign(b.style, up ? { top: "auto", bottom: "72%" } : { top: "", bottom: "" }); b.style.marginLeft = dx ? dx + "px" : ""; };
    for (const b of pairs) {
      const wheel = b.parentElement, half = Math.round(b.offsetWidth / 2); let best = null;
      const cost = (up, dx) => {
        put(b, up, dx); const r = R(b); let hard = r.width * r.height - area(r, W), soft = Math.abs(dx) * 10;
        for (const o of objs) if (o.e !== wheel) { if (o.hard) hard += area(r, o.r); else soft += area(r, o.r); }
        for (const d of done) hard += area(r, d);
        return (hard > 0.5 ? 1e6 + hard * 100 : 0) + soft;
      };
      for (let m = 0; m <= half; m += 2) {
        for (const up of [0, 1]) for (const dx of m ? [-m, m] : [0]) { const c = cost(up, dx); if (!best || c < best.c - 0.5) best = { up, dx, c }; }
        if (best.c <= (m + 2) * 10) break;   // anything slid further costs more
      }
      put(b, best.up, best.dx);
      b.dataset.spot = (best.up ? "up" : "down") + (best.dx ? (best.dx < 0 ? "" : "+") + best.dx : "");
      done.push(R(b));
    }
  };
  root.addEventListener("resize", () => T.placeWheelBtns());
  document.addEventListener("scroll", (e) => {
    const b = e.target; if (T.siteScroll && b && b.classList && b.classList.contains("exp-map") && b.querySelector(":scope > .site-wrap")) { T.siteScroll.x = b.scrollLeft; T.siteScroll.y = b.scrollTop; }
  }, { capture: true, passive: true });
  new MutationObserver(() => { T.centerMap(); T.placeWheelBtns(); T.centerSite(); }).observe(document.getElementById("screen"), { childList: true });
  // older iOS Safari ignores user-scalable=no: block its pinch gesture events, on touch devices only
  // (desktop Safari fires them for trackpad pinch: left alone there, so pinch-zoom on a Mac still works)
  const coarse = root.matchMedia ? root.matchMedia("(pointer: coarse)") : null;
  for (const k of ["gesturestart", "gesturechange"]) document.addEventListener(k, (e) => { if (coarse && coarse.matches) e.preventDefault(); }, { passive: false });
})(window);
