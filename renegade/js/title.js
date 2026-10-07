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
  const url = (f) => G.Assets ? G.Assets.url(DATA.sprites.basePath + f) : DATA.sprites.basePath + f;
  const phone = () => window.innerWidth <= C().phoneBreakpoint || window.innerHeight > window.innerWidth;
  T.reducedMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  T.buildLabel = () => (window.BUILD_ID && window.BUILD_ID !== "dev" ? "v" + window.BUILD_ID : "dev build");
  T.sceneMode = "none";   // "webgl" | "still" (for the browser checks)

  T.soundOn = () => !!(G.Sfx && G.Sfx.unlocked && G.Sfx.enabled && !(G.state && G.state.settings && G.state.settings.mute) && !(G.Music && G.Music.muted));
  T.syncSound = function () {
    const b = document.querySelector("#title .title-sound"); if (!b) return;
    const on = T.soundOn(); b.classList.toggle("on", on); b.title = on ? "Music on (tap to mute)" : "Music off (tap to play)"; b.setAttribute("aria-pressed", on ? "true" : "false");
  };
  T.toggleSound = function () {
    // by what the button shows: the tap that presses it has already unlocked audio (js/sfx.js resumes on pointerdown).
    // It switches the music for this visit (Megan: music starts muted on every load), through G.Music.setOn
    const b = document.querySelector("#title .title-sound");
    if (G.Music) { G.Music.setOn(!(b && b.classList.contains("on"))); G.Music.set("title"); }
    T.syncSound();
  };

  // the backdrop: WebGL into a tiny canvas (x2+ nearest), else the still
  T.size = (cv) => G.TitleScene.fit(cv);
  T.startScene = function (root, pre) {
    const cv = root.querySelector(".title-gl"), still = () => { if (!T.open || !root.isConnected) return; T.sceneMode = "still"; root.classList.add("still"); if (G.TitleScene) G.TitleScene.stop(); };
    // the loading screen's camp (js/entry.js) is already running in this canvas: keep it going instead of starting over
    if (pre) {
      window.removeEventListener("resize", pre.resize); pre.onError = (e) => { T.error = String(e && e.message || e); still(); }; window.Entry.backdrop = null;
      T.sceneMode = "webgl"; T.onResize = () => T.size(cv); window.addEventListener("resize", T.onResize); return;
    }
    if (!C().scene.webgl || T.reducedMotion() || !G.TitleScene) return still();
    fetch(url(C().scene.file)).then((r) => (r.ok ? r.json() : Promise.reject(new Error("scene " + r.status)))).then((S) => {
      if (!T.open || !root.isConnected) return;
      T.size(cv);
      let st = null;
      try { st = G.TitleScene.start(cv, S, { fps: G.TitleScene.fps(), onError: (e) => { T.error = String(e && e.message || e); still(); } }); }
      catch (e) { T.error = String(e && e.message || e); }
      if (!st) return still();
      T.sceneMode = "webgl"; root.classList.add("gl");
      T.onResize = () => T.size(cv); window.addEventListener("resize", T.onResize);
    }).catch((e) => { T.error = String(e && e.message || e); still(); });
  };

  // one locked Username / Password field (for the future MMO: disabled, it does nothing)
  T.field = function (h, label, labelImg, type) {
    const A = C().art;
    return h("div", { class: "title-row" },
      h("label", { class: "title-label" }, h("img", { src: url(labelImg.file), alt: label, draggable: "false" })),
      h("div", { class: "title-field" }, h("input", { type, disabled: true, placeholder: "", "aria-label": label + " (coming later)", tabindex: "-1" }), h("img", { class: "title-lock", src: url(A.lock.file), alt: "", draggable: "false" })));
  };
  // Megan (Oct 7): two screens over the camp, both in the bottom third under the fire. 1. Login: the blank, locked
  // Username / Password and a Login button that only moves on (no accounts yet). 2. A new save's difficulty + Play.
  // A save whose difficulty is already locked has no step 2: Login continues straight into the game.
  T.step = "login";   // "login" | "diff"; kept across an art-retry re-show, back to "login" after Play
  T.loginPanel = function (h) {
    return h("div", { class: "title-panel login", "data-panel": "login" },
      h("div", { class: "title-fields", title: "Accounts are coming later" }, T.field(h, "Username", C().art.labelUser, "text"), T.field(h, "Password", C().art.labelPass, "password")),
      h("div", { class: "title-divider" }),
      h("button", { class: "title-login", "data-act": "login", "data-nosfx": "1", onclick: () => T.login() }, "LOGIN"));
  };
  T.panel = function () {
    const h = G.UI.h;
    return h("div", { class: "title-panel diff", "data-panel": "diffstep" }, T.diffPicker(h),
      h("div", { class: "t-diff-side" }, h("div", { class: "title-divider" }),
        h("button", { class: "title-play art-fallback", "data-act": "play", "data-nosfx": "1", "aria-label": "Play", onclick: () => T.play() }, h("span", { class: "title-play-fallback" }, "PLAY"), h("span", { class: "title-play-art" }))));
  };
  T.setStep = function (step) {
    T.step = step; const root = document.getElementById("title"); if (root) root.dataset.step = step;
  };
  // Login: no auth. A new save goes on to its difficulty; a locked one continues into the game
  T.login = function () {
    if (!T.open) return;
    if (!T.diffPending()) return T.play();
    if (G.Sfx && G.Sfx.play) G.Sfx.play("sfx_ui_click");
    T.setStep("diff");
    const first = document.querySelector("#title .t-diff.sel") || document.querySelector("#title .t-diff"); if (first && first.focus) first.focus({ preventScroll: true });
  };
  // ---- Slice 4 §H: difficulty (config.difficulty; Smudge's sigils, assets/ui/difficulty) ----
  T.diffPending = () => !!(G.Difficulty && G.state && G.Difficulty.pending());
  T.choice = null;
  const FPS = { standard: 5, hardcore: 4, ragnarok: 8 };   // Smudge's strip speeds (difficulty_manifest.json)
  const abs = (f) => new URL(url(f), document.baseURI).href;
  T.diffPicker = function (h) {
    const D = DATA.config.difficulty, box = h("div", { class: "t-diffs-wrap", "data-panel": "difficulty" });
    const desc = h("p", { class: "t-diff-desc", "aria-live": "polite" }, T.choice ? D.list[T.choice].desc : D.pickHint);
    const cols = h("div", { class: "t-diffs", role: "radiogroup", "aria-label": "Difficulty" });
    const paint = () => { for (const c of cols.children) { const id = c.dataset.diff; c.classList.toggle("sel", T.choice === id); c.classList.toggle("dim", !!T.choice && T.choice !== id); c.setAttribute("aria-checked", T.choice === id ? "true" : "false"); }
      desc.textContent = G.Util.copy(T.choice ? D.list[T.choice].desc : D.pickHint); desc.classList.remove("warn"); };
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
  // CSS backgrounds are not document.images: register title art so loading/retry covers them too.
  T.prepareArt = function (root) {
    if (!G.Assets) return;
    const files = new Set();
    const walk = (o) => { if (!o || typeof o !== "object") return; if (o.file) files.add(o.file); else Object.values(o).forEach(walk); };
    walk(C().art);
    if (T.diffPending()) for (const id of DATA.config.difficulty.order) for (const suffix of ["", "_hover", "_sel", "_dim", "_anim", "_sel_anim"]) files.add(DATA.sprites["diff_" + id + suffix].file);
    for (const file of files) G.Assets.image(DATA.sprites.basePath + file).then(() => {
      if (root.isConnected && file === C().art.logoStrip.file) root.querySelector(".title-logo").classList.remove("art-fallback");
    }).catch(() => {
      if (!root.isConnected) return;
      if (file === C().art.logoStrip.file) root.querySelector(".title-logo").classList.add("art-fallback");
      const pb = root.querySelector(".title-play"); if (pb && Object.values(C().art.play).some((art) => art.file === file)) pb.classList.add("art-fallback");
    });
    Promise.all(Object.values(C().art.play).map((art) => G.Assets.image(DATA.sprites.basePath + art.file))).then(() => {
      const pb = root.querySelector(".title-play"); if (root.isConnected && pb) pb.classList.remove("art-fallback");
    }).catch(() => {});
  };
  T.show = function () {
    if (T.open) return; T.open = true;
    const pre = window.Entry && window.Entry.backdrop && G.TitleScene && G.TitleScene.running ? window.Entry.backdrop : null;
    const h = G.UI.h, A = C().art, root = h("div", { id: "title", class: "title" + (phone() ? " phone" : "") + (pre ? " gl" : "") });
    const diff = T.diffPending(); if (!diff) T.step = "login"; root.dataset.step = T.step;
    const v = (k, f) => root.style.setProperty(k, `url("${new URL(url(f), document.baseURI).href}")`);   // absolute: a url() in a custom property resolves against the stylesheet
    v("--t-still-d", A.stillDesktop.file); v("--t-still-p", A.stillPhone.file); v("--t-logo", A.logoStrip.file); v("--t-panel", A.panel.file); v("--t-div", A.divider.file); v("--t-field", A.field.file);
    v("--t-play", A.play.normal.file); v("--t-play-h", A.play.hover.file); v("--t-play-p", A.play.pressed.file);
    v("--t-btn", A.button.normal.file); v("--t-btn-h", A.button.hover.file); v("--t-btn-p", A.button.pressed.file);
    v("--t-snd-on", A.soundOn.file); v("--t-snd-on-h", A.soundOnHover.file); v("--t-snd-off", A.soundOff.file); v("--t-snd-off-h", A.soundOffHover.file); v("--t-tag", A.versionTag.file);
    root.append(h("div", { class: "title-still" }), pre ? pre.canvas : h("canvas", { class: "title-gl" }), h("div", { class: "title-shade" }),
      h("h1", { class: "title-logo art-fallback", "aria-label": "Renegade" }, h("span", { class: "title-logo-fallback" }, "RENEGADE")), T.loginPanel(h), ...(diff ? [T.panel()] : []),
      h("div", { class: "title-version", "data-note": "build" }, !diff && G.Difficulty && G.state ? h("img", { class: "title-diff", src: url(DATA.sprites["diff_" + G.Difficulty.id() + "_hud"].file), alt: G.Difficulty.name(), title: "Difficulty: " + G.Difficulty.name() }) : null, T.buildLabel(), G.state && G.Cards && G.Cards.title() ? h("span", { class: "title-cardtitle", "data-card-title": "1" }, "★ " + G.Cards.title()) : null),   // Slice 5 §J
      h("button", { class: "title-sound", "data-act": "title-sound", "data-nosfx": "1", onclick: (e) => { e.stopPropagation(); T.toggleSound(); } }));
    document.body.appendChild(root); document.body.classList.add("title-open");
    T.keys = (e) => { if (G.Util.typing(e)) return; if ((e.key === "Enter" || e.key === " ") && T.open && !document.querySelector("#modal-root .modal")) { e.preventDefault(); if (T.step === "login") T.login(); else T.play(); } };
    window.addEventListener("keydown", T.keys);
    T.tapSync = () => setTimeout(T.syncSound, 50); document.addEventListener("pointerup", T.tapSync, true);
    T.prepareArt(root); T.startScene(root, pre); T.syncSound();
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
    T.close(); T.step = "login"; G.UI.render();   // the render's music state is outpost / run: title -> outpost crossfades on the bar line
  };
})();
