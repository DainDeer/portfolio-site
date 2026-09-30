// Slice 4 §G: the title / login screen (data/title.js). Shown over the game at every load: the scorched logo, the
// login panel (Username / Password greyed out: the future MMO, they do nothing), a glowing Play, the build hash, a sound
// toggle, and the WebGL camp behind (js/titlescene.js; the still when WebGL / motion isn't available). Music:
// music_title from the first tap (or 🔊); Play closes it and the render's music state crossfades to the outpost.
// Skipped with ?notitle, and in automated browsers (navigator.webdriver) unless ?title: the older browser checks
// drive the game directly.
(function () {
  const G = window.G, T = G.Title = { open: false }, C = () => DATA.title;
  const qs = () => (typeof location !== "undefined" ? location.search : "");
  T.shouldShow = () => C().enabled !== false && !/[?&]notitle\b/.test(qs()) && (!navigator.webdriver || /[?&]title\b/.test(qs()));
  const url = (f) => DATA.sprites.basePath + f;
  const phone = () => window.innerWidth <= C().phoneBreakpoint || window.innerHeight > window.innerWidth;
  T.reducedMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  T.buildLabel = () => (window.BUILD_ID && window.BUILD_ID !== "dev" ? "v" + window.BUILD_ID : "dev build");
  T.sceneMode = "none";   // "webgl" | "still" (for the browser checks)

  T.soundOn = () => !!(G.Sfx && G.Sfx.unlocked && G.Sfx.enabled && !(G.state && G.state.settings && G.state.settings.mute));
  T.syncSound = function () {
    const b = document.querySelector("#title .title-sound"); if (!b) return;
    const on = T.soundOn(); b.classList.toggle("on", on); b.title = on ? "Music on (tap to mute)" : "Music off (tap to play)"; b.setAttribute("aria-pressed", on ? "true" : "false");
  };
  T.toggleSound = function () {
    // by what the button shows: the tap that presses it has already unlocked audio (js/sfx.js resumes on pointerdown)
    const st = G.state.settings = G.state.settings || {}, b = document.querySelector("#title .title-sound");
    if (b && b.classList.contains("on")) st.mute = true; else { st.mute = false; G.Sfx.enabled = true; if (G.Sfx.resume) G.Sfx.resume(); }
    G.Sfx.applySettings(); if (G.Music) { G.Music.applySettings(); G.Music.set("title"); }
    G.State.save(); T.syncSound();
  };

  // the backdrop: WebGL into a tiny canvas (x2+ nearest), else the still
  T.size = function (cv) {
    const W = window.innerWidth, H = window.innerHeight, S = C().scene;
    if (H > W) { cv.width = S.fboWidthPortrait; cv.height = Math.round(S.fboWidthPortrait * H / W); }
    else { cv.height = S.fboHeight; cv.width = Math.round(S.fboHeight * W / H); }
  };
  T.startScene = function (root) {
    const cv = root.querySelector(".title-gl"), still = () => { T.sceneMode = "still"; root.classList.add("still"); if (G.TitleScene) G.TitleScene.stop(); };
    if (!C().scene.webgl || T.reducedMotion() || !G.TitleScene) return still();
    fetch(url(C().scene.file)).then((r) => (r.ok ? r.json() : Promise.reject(new Error("scene " + r.status)))).then((S) => {
      if (!T.open) return;
      T.size(cv);
      let st = null;
      try { st = G.TitleScene.start(cv, S, { fps: phone() ? C().scene.fpsPhone : C().scene.fpsDesktop, onError: (e) => { T.error = String(e && e.message || e); still(); } }); }
      catch (e) { T.error = String(e && e.message || e); }
      if (!st) return still();
      T.sceneMode = "webgl"; root.classList.add("gl");
      T.onResize = () => T.size(cv); window.addEventListener("resize", T.onResize);
    }).catch((e) => { T.error = String(e && e.message || e); still(); });
  };

  T.panel = function () {
    const h = G.UI.h, A = C().art;
    const field = (label, labelImg, type) => h("div", { class: "title-row" },
      h("label", { class: "title-label" }, h("img", { src: url(labelImg.file), alt: label, draggable: "false" })),
      h("div", { class: "title-field" }, h("input", { type, disabled: true, placeholder: "", "aria-label": label + " (coming later)", tabindex: "-1" }), h("img", { class: "title-lock", src: url(A.lock.file), alt: "", draggable: "false" })));
    const diff = T.diffPending();
    const kids = diff ? [T.diffPicker(h), h("div", { class: "title-divider" })]   // Slice 4 §H: a new save picks its difficulty (Smudge's layout: in place of the fields)
      : [field("Username", A.labelUser, "text"), field("Password", A.labelPass, "password"), h("div", { class: "title-divider" })];
    kids.push(h("button", { class: "title-play", "data-act": "play", "data-nosfx": "1", "aria-label": "Play", onclick: () => T.play() }, h("span", { class: "title-play-art" })));
    return h("div", { class: "title-panel" + (diff ? " diff" : "") }, kids);
  };
  // ---- Slice 4 §H: difficulty (config.difficulty; Smudge's sigils, assets/ui/difficulty) ----
  T.diffPending = () => !!(G.Difficulty && G.state && G.Difficulty.pending());
  T.choice = null;
  const FPS = { casual: 5, standard: 4, hardcore: 8 };   // Smudge's strip speeds (difficulty_manifest.json)
  const abs = (f) => new URL(url(f), document.baseURI).href;
  T.diffPicker = function (h) {
    const D = DATA.config.difficulty, box = h("div", { class: "t-diffs-wrap", "data-panel": "difficulty" });
    const desc = h("p", { class: "t-diff-desc", "aria-live": "polite" }, T.choice ? D.list[T.choice].desc : D.pickHint);
    const cols = h("div", { class: "t-diffs", role: "radiogroup", "aria-label": "Difficulty" });
    const paint = () => { for (const c of cols.children) { const id = c.dataset.diff; c.classList.toggle("sel", T.choice === id); c.classList.toggle("dim", !!T.choice && T.choice !== id); c.setAttribute("aria-checked", T.choice === id ? "true" : "false"); }
      desc.textContent = T.choice ? D.list[T.choice].desc : D.pickHint; desc.classList.remove("warn"); };
    for (const id of D.order) {
      const c = h("button", { class: "t-diff", "data-diff": id, "data-act": "diff-" + id, role: "radio", "aria-checked": "false", onclick: () => { T.choice = id; paint(); } },
        h("span", { class: "t-diff-label" }, D.list[id].name), h("span", { class: "t-sigil" }));
      const v = (k, key) => c.style.setProperty(k, `url("${abs(DATA.sprites[key].file)}")`);
      v("--d-anim", `diff_${id}_anim`); v("--d-sel-anim", `diff_${id}_sel_anim`); v("--d-hover", `diff_${id}_hover`); v("--d-dim", `diff_${id}_dim`); v("--d-still", `diff_${id}`); v("--d-sel", `diff_${id}_sel`);
      c.style.setProperty("--d-dur", (4 / FPS[id]).toFixed(3) + "s");
      cols.appendChild(c);
    }
    box.append(h("div", { class: "t-diff-head" }, "DIFFICULTIES:"), cols, desc); T._paint = paint; T._desc = desc;
    setTimeout(paint, 0);
    return box;
  };
  T.beforePlay = function () {
    if (!T.diffPending()) return true;
    if (!T.choice) { if (T._desc) { T._desc.textContent = DATA.config.difficulty.pickHint; T._desc.classList.remove("warn"); void T._desc.offsetWidth; T._desc.classList.add("warn"); } return false; }
    G.Difficulty.set(T.choice); G.Difficulty.lock(); G.State.save(); return true;
  };
  T.show = function () {
    if (T.open) return; T.open = true;
    const h = G.UI.h, A = C().art, root = h("div", { id: "title", class: "title" + (phone() ? " phone" : "") });
    const v = (k, f) => root.style.setProperty(k, `url("${new URL(url(f), document.baseURI).href}")`);   // absolute: a url() in a custom property resolves against the stylesheet
    v("--t-still-d", A.stillDesktop.file); v("--t-still-p", A.stillPhone.file); v("--t-logo", A.logoStrip.file); v("--t-panel", A.panel.file); v("--t-div", A.divider.file); v("--t-field", A.field.file);
    v("--t-play", A.play.normal.file); v("--t-play-h", A.play.hover.file); v("--t-play-p", A.play.pressed.file);
    v("--t-snd-on", A.soundOn.file); v("--t-snd-on-h", A.soundOnHover.file); v("--t-snd-off", A.soundOff.file); v("--t-snd-off-h", A.soundOffHover.file); v("--t-tag", A.versionTag.file);
    root.append(h("div", { class: "title-still" }), h("canvas", { class: "title-gl" }), h("div", { class: "title-shade" }),
      h("h1", { class: "title-logo", "aria-label": "Renegade" }), T.panel(),
      h("div", { class: "title-version", "data-note": "build" }, !T.diffPending() && G.Difficulty && G.state ? h("img", { class: "title-diff", src: url(DATA.sprites["diff_" + G.Difficulty.id() + "_hud"].file), alt: G.Difficulty.name(), title: "Difficulty: " + G.Difficulty.name() }) : null, T.buildLabel()),
      h("button", { class: "title-sound", "data-act": "title-sound", "data-nosfx": "1", onclick: (e) => { e.stopPropagation(); T.toggleSound(); } }));
    document.body.appendChild(root); document.body.classList.add("title-open");
    T.keys = (e) => { if ((e.key === "Enter" || e.key === " ") && T.open && !document.querySelector("#modal-root .modal")) { e.preventDefault(); T.play(); } };
    window.addEventListener("keydown", T.keys);
    T.tapSync = () => setTimeout(T.syncSound, 50); document.addEventListener("pointerup", T.tapSync, true);
    T.startScene(root); T.syncSound();
    if (G.Music) G.Music.set("title");
  };
  T.close = function () {
    if (!T.open) return; T.open = false;
    if (G.TitleScene) G.TitleScene.stop();
    if (T.onResize) window.removeEventListener("resize", T.onResize);
    window.removeEventListener("keydown", T.keys); document.removeEventListener("pointerup", T.tapSync, true);
    const el = document.getElementById("title"); if (el) el.remove(); document.body.classList.remove("title-open");
  };
  T.play = function () {
    if (!T.open) return;
    if (T.beforePlay() === false) return;   // Slice 4 §H: a new save picks its difficulty first
    if (G.Sfx && G.Sfx.play) G.Sfx.play("sfx_ui_click");
    T.close(); G.UI.render();   // the render's music state is outpost / run: title -> outpost crossfades on the bar line
  };
})();
