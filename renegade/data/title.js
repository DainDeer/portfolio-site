// Slice 4 §G: the title / login screen (Megan, Sep 30 00:25 PT; art by Smudge, assets/ui/login/README.md). All numbers here.
// OSRS x WoW: the scorched RENEGADE logo, a wood-and-stone panel with Username / Password greyed out (for the future
// MMO: they do nothing), a glowing Play, the build hash bottom-left, a small sound toggle bottom-right. Behind it a
// hand-written WebGL low-poly Hushwood camp at night (js/titlescene.js, built from ui/login/login_scene.json); the stills
// cover no WebGL / reduced motion / a failed context. Music: music_title on the first tap or the 🔊 button; Play goes in
// and crossfades to the outpost. Every "file" below is under DATA.sprites.basePath and is packaged (tools/asset-manifest.js).
window.DATA = window.DATA || {};
DATA.title = {
  enabled: true,              // false: straight into the game as before
  art: {
    logoStrip: { file: "ui/login/logo_renegade_strip4.png", frame: [175, 39], frames: 4, fps: 6 },   // ember flicker, CSS steps(4)
    panel: { file: "ui/login/panel_9slice.png", slice: 12, border: 24 },          // border-image: 12 fill / 24px repeat
    divider: { file: "ui/login/panel_divider_3slice.png", slice: 6, border: 12 },
    field: { file: "ui/login/field_disabled_9slice.png", slice: 5, border: 10 },
    lock: { file: "ui/login/icon_field_lock.png" },
    labelUser: { file: "ui/login/label_username.png" }, labelPass: { file: "ui/login/label_password.png" },
    play: { normal: { file: "ui/login/btn_play_normal.png" }, hover: { file: "ui/login/btn_play_hover.png" }, pressed: { file: "ui/login/btn_play_pressed.png" } },
    soundOn: { file: "ui/login/btn_sound_on.png" }, soundOnHover: { file: "ui/login/btn_sound_on_hover.png" },
    soundOff: { file: "ui/login/btn_sound_off.png" }, soundOffHover: { file: "ui/login/btn_sound_off_hover.png" },
    versionTag: { file: "ui/login/version_tag_3slice.png", slice: 4 },
    stillDesktop: { file: "ui/login/scene_still_desktop.png" }, stillPhone: { file: "ui/login/scene_still_phone.png" }
  },
  scene: {
    file: "ui/login/login_scene.json",   // Smudge's scene description (numbers, materials, camera, lighting)
    webgl: true,                         // false: always the still
    fpsDesktop: 60, fpsPhone: 30,        // phones: the same tiny FBO at 30 fps ("lighter")
    phoneMaxWidth: 700,                  // narrower (or portrait) = the phone framing (216 px wide FBO, vfov 72)
    fboHeight: 360, fboWidthPortrait: 216,   // native pixels (x2+ nearest upscale); the other side follows the window's aspect
    rngSeed: 20260930,                   // the scene's small random details (rock jitter, stake tips, cone turns)
    embers: 46, stars: 420,
    fireFlicker: 0.12, fireFlickerHz: 4, flameScale: 0.12, flameJitterM: 0.08, flameShadeMs: 120,
    zbias: { flame_mid: 0.3, flame_core: 0.55, flame_tip: 0.75 },   // inner flame cones win the depth test (metres toward the camera)
    owlBlinkMs: 140
  },
  phoneBreakpoint: 700,                  // px: the phone layout (1x logo at x2, 352 px panel)
  logoScaleDesktop: 3, logoScalePhone: 2
};
