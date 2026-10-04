// SP-096 scenario links, the DOM side: the SANDBOX banner + Exit, the "couldn't be opened" screen, and the Share /
// Load dialogs (opened from the debug panel's Scenario section). Logic + checks: js/scenario.js. Styles: css/scenario.css.
(function (root) {
  const G = root.G, Sc = G.Scenario, St = G.State;
  const V = G.ScenarioView = {};
  const h = (...a) => G.UI.h(...a);
  const plainUrl = () => root.location.pathname;   // the game with no ?scenario= / #s=

  // --- banner (fixed over the top edge + a coloured frame; the game's layout underneath is unchanged so a repro looks
  // exactly like the real thing). Tap the label to shrink it; Exit always stays.
  V.mount = function () {
    const sb = St.sandbox; if (!sb || document.getElementById("sandbox-banner")) return;
    document.body.classList.add("sandbox");
    const label = h("span", { class: "sb-label", title: "Tap to shrink / expand" },
      h("b", { class: "sb-tag" }, "SANDBOX"),
      h("span", { class: "sb-name" }, " · " + sb.name),
      h("span", { class: "sb-sub" }, " · not your save"),
      sb.warnings.length ? h("span", { class: "sb-warn", title: sb.warnings.join("; ") }, " · ⚠ " + sb.warnings[0]) : null);
    const bar = h("div", { id: "sandbox-banner", role: "status", "aria-label": "Sandbox: " + sb.name + ". Not your save." },
      label, h("button", { class: "sb-exit", "data-act": "exit-sandbox", onclick: V.exit }, "Exit sandbox"));
    label.addEventListener("click", () => bar.classList.toggle("compact"));
    document.body.appendChild(bar);
    const stamp = document.getElementById("build-stamp"); if (stamp && !/sandbox/.test(stamp.textContent)) stamp.textContent += " · sandbox";
    document.title = "SANDBOX · " + document.title;
  };
  V.exit = function () { Sc.exit(); root.location.replace(plainUrl()); };

  // --- failure: nothing was written; the real save is opened by the button (a plain load of the game)
  V.fail = function (err) {
    const why = Sc.isScenarioError(err) ? err.message : "something went wrong (" + ((err && err.message) || err) + ")";
    if (!Sc.isScenarioError(err)) console.error(err);
    G.UI.modal([
      h("h2", null, "Scenario link"),
      h("p", { class: "sb-fail-msg" }, "This scenario link couldn't be opened: " + why + "."),
      h("p", null, "Your own save wasn't touched."),
      h("div", { class: "sb-row" },
        h("button", { class: "primary", "data-act": "open-my-game", onclick: () => root.location.replace(plainUrl()) }, "Open my game"),
        h("button", { onclick: () => root.location.reload() }, "Try again")),
    ], "sb-fail");
  };

  // Share / Load open in their own layer over everything (outside #modal-root): G.UI.modal would replace whatever the
  // game has open there, e.g. a queued step's "Hostiles! / To battle" pop-up, and closing it would leave the run with
  // no way to resolve that step (Hex, SP-097 B2). Closing this layer removes only itself.
  // Hex retest (f): Escape and a backdrop tap close it exactly like Close (the game's pop-up underneath stays). Pocket
  // (phones): a backdrop close needs the press AND the release on the backdrop itself (a text selection dragged out of
  // the dialog doesn't count), and a tap outside while a text field in the dialog has focus only drops the focus (the
  // keyboard), never closes. Nothing listens to resize, so the on-screen keyboard opening can't close it.
  const textField = (el) => !!el && (/^(INPUT|TEXTAREA)$/.test(el.tagName) || !!el.isContentEditable);
  V.dialog = function (content, cls) {
    const opener = document.querySelector(".sb-layer") ? V._opener : document.activeElement;   // Hex: focus goes back here on close
    V.closeDialog(); V._opener = opener;
    const box = h("div", { class: "modal " + (cls || ""), tabindex: "-1" }, content);
    const layer = h("div", { class: "modal-back sb-layer", "data-layer": "scenario" }, box);
    let down = false, shut = false;
    layer.addEventListener("pointerdown", (e) => {
      down = e.target === layer;
      const f = document.activeElement;
      if (down && textField(f) && box.contains(f)) { down = false; f.blur(); }   // first tap outside: just the keyboard
    });
    layer.addEventListener("pointerup", (e) => {
      const was = down; down = false;
      // touch keeps the release on the press's target, so check what's really under the finger
      const under = document.elementFromPoint ? document.elementFromPoint(e.clientX, e.clientY) : e.target;
      shut = was && e.target === layer && under === layer;   // close on the click, not here, or the tap's click lands on what was under the backdrop
    });
    layer.addEventListener("click", (e) => { if (shut && e.target === layer) { e.preventDefault(); V.closeDialog(); } shut = false; });
    layer.addEventListener("pointercancel", () => { down = false; shut = false; });
    document.body.appendChild(layer);
    if (!V._esc) window.addEventListener("keydown", V._esc = (e) => {   // capture: before the game's own Escape (closes outpost panels)
      if (e.key !== "Escape" || !document.querySelector(".sb-layer")) return;
      e.preventDefault(); e.stopPropagation(); V.closeDialog();
    }, true);
    // Hex: focus moves into the dialog: its first text field with a mouse / keyboard, the dialog itself on touch (no surprise keyboard)
    const first = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches ? null : box.querySelector("input[type=text]:not([disabled]), textarea:not([readonly]):not([disabled])");
    const tgt = first || box; if (typeof tgt.focus === "function") tgt.focus({ preventScroll: true });
    return box;
  };
  V.closeDialog = function () {
    const layers = document.querySelectorAll(".sb-layer"); if (!layers.length) return;
    layers.forEach((el) => el.remove());
    const o = V._opener; V._opener = null;
    if (o && o.isConnected && typeof o.focus === "function" && o !== document.body) o.focus({ preventScroll: true });   // back to the opener
  };

  // --- Share run…  (name + note -> link / code / .renegade file)
  const slug = (s) => (String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "scenario");
  V.download = function (payload) {
    const blob = new Blob([JSON.stringify(payload, null, 1) + "\n"], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: slug(payload.name) + ".renegade" });
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); G.UI.toast("Copied."); } catch (e) { G.UI.toast("Couldn't copy: select the text and copy it by hand."); } };
  V.shareDialog = function () {
    const name = h("input", { type: "text", maxlength: 120, placeholder: "Name (e.g. Greyback rooftop wipe)", class: "sb-in" });
    const note = h("textarea", { rows: 3, maxlength: 2000, placeholder: "Note: what to look at, what to try", class: "sb-in" });
    const out = h("div", { class: "sb-out" });
    const go = h("button", { class: "primary", "data-act": "make-link", onclick: async () => {
      go.disabled = true; out.innerHTML = "";
      try {
        const r = await Sc.share({ name: name.value, note: note.value });
        V.last = r;
        if (r.link) {
          const ta = h("textarea", { class: "sb-in sb-code", rows: 3, readonly: true, "data-out": "scenario-link" }, r.link);
          out.appendChild(h("p", null, `Link ready (${r.chars} characters)` + (r.copied ? ", copied to the clipboard." : ".")));
          out.appendChild(ta);
          out.appendChild(h("div", { class: "sb-row" }, h("button", { onclick: () => copy(r.link) }, "Copy link"), h("button", { onclick: () => V.download(r.payload) }, "Download .renegade")));
        } else {
          out.appendChild(h("p", null, `This run is too big for a link (${r.chars} characters, the limit is ${Sc.MAX_FRAGMENT}). Download the .renegade file and send it, or publish it under scenarios/ for a short ?scenario= link.`));
          out.appendChild(h("div", { class: "sb-row" }, h("button", { class: "primary", onclick: () => V.download(r.payload) }, "Download .renegade"), h("button", { onclick: () => copy(r.code) }, "Copy code")));
        }
        if (r.sanitized) out.appendChild(h("p", { class: "sb-small" }, `${r.sanitized} name(s) with < or > were saved with ‹ › instead.`));
      } catch (e) { console.error(e); out.appendChild(h("p", { class: "sb-fail-msg" }, "Couldn't make the link: " + e.message)); }
      go.disabled = false;
    } }, "Make link");
    V.dialog([h("h2", null, "Share this run"), h("p", { class: "sb-small" }, "Anyone who opens the link gets this exact moment in a sandbox. Their own save isn't touched."),
      name, note, h("div", { class: "sb-row" }, go, h("button", { "data-act": "close-scenario-dialog", onclick: V.closeDialog }, "Close")), out], "sb-dialog");
  };

  // --- Load scenario…  (.renegade / .json file, a pasted link, or a pasted code). Checked here first, then the page
  // reloads into the sandbox (?scenario=local reads it from this tab's sessionStorage, never localStorage).
  V.openPayload = function (p) {
    Sc.prepare(p);   // throws a readable error before anything happens
    root.sessionStorage.setItem(Sc.PENDING_KEY, JSON.stringify(p));
    root.location.assign(plainUrl() + "?scenario=" + Sc.LOCAL_ID);
  };
  V.loadDialog = function () {
    const msg = h("p", { class: "sb-fail-msg" });
    const run = async (text) => {
      msg.textContent = "";
      try {
        const m = /[?&]scenario=([a-z0-9-]{1,64})(?:$|[&#])/.exec(String(text).trim());
        if (m && !/^\s*\{/.test(text)) { root.location.assign(plainUrl() + "?scenario=" + m[1]); return; }
        V.openPayload(await Sc.parseAny(text));
      } catch (e) { if (!Sc.isScenarioError(e)) console.error(e); msg.textContent = "This scenario couldn't be opened: " + e.message + ". Your own save wasn't touched."; }
    };
    const file = h("input", { type: "file", accept: ".renegade,.json,application/json", "data-act": "scenario-file", onchange: async (e) => { const f = e.target.files[0]; if (f) run(await f.text()); } });
    const paste = h("textarea", { rows: 4, class: "sb-in sb-code", placeholder: "…or paste a scenario link, code or JSON", "data-act": "scenario-paste" });
    V.dialog([h("h2", null, "Load a scenario"), h("p", { class: "sb-small" }, "Opens in a sandbox: your own save stays as it is, and Exit sandbox brings it back."),
      h("div", { class: "sb-row" }, file), paste,
      h("div", { class: "sb-row" }, h("button", { class: "primary", "data-act": "scenario-open", onclick: () => run(paste.value) }, "Open"), h("button", { "data-act": "close-scenario-dialog", onclick: V.closeDialog }, "Close")), msg], "sb-dialog");
  };
})(window);
