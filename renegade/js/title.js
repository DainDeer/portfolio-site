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
    const kids = [field("Username", A.labelUser, "text"), field("Password", A.labelPass, "password"), h("div", { class: "title-divider" })];
    if (T.extra) kids.push(T.extra(h));   // Slice 4 §H: the difficulty choice on a new save
    kids.push(h("button", { class: "title-play", "data-act": "play", "data-nosfx": "1", "aria-label": "Play", onclick: () => T.play() }, h("span", { class: "title-play-art" })));
    return h("div", { class: "title-panel" }, kids);
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
      h("div", { class: "title-version", "data-note": "build" }, T.buildLabel()),
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
    if (T.beforePlay && T.beforePlay() === false) return;   // Slice 4 §H: the new save's difficulty
    if (G.Sfx && G.Sfx.play) G.Sfx.play("sfx_ui_click");
    T.close(); G.UI.render();   // the render's music state is outpost / run: title -> outpost crossfades on the bar line
  };
})();
