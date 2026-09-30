// Slice 3 §8: audio. Keys -> files, volumes, throttles, limits and the default settings. [DRAFT]
// Missing files are silent (requested once, then remembered as missing). Audio starts after the first click.
window.DATA = window.DATA || {};
DATA.audio = {
  enabled: true,                  // SFX on by default (was G.Sfx.enabled = false in Slice 2)
  sfxPath: "sfx/", ambPath: "amb/", ext: ".mp3", loopExts: [".ogg", ".mp3"],   // under DATA.sprites.basePath (assets/); loops prefer .ogg (gapless), .mp3 if the browser can't play ogg or the file is missing
  defaults: { master: 0.6, sfx: 0.8, ambient: 0.5, mute: false },   // Settings panel, saved with the game (state.settings)
  pitchVar: 0.05,                 // ±5% playback rate per play
  retriggerMs: 50,
  missDelayMs: 40,               // sfx_miss plays this long after the shot sound                // the same key can't retrigger within this
  maxGunshots: 6,                 // at most this many gunshots at once (the quietest is dropped first)
  crossfadeSec: 1,                // ambient loop crossfade on screen change
  // key: { vol (0..1, before the SFX slider), group ("gun" counts toward maxGunshots) }
  // Starting volumes from assets/audio_src/README.md ("suggested volume": evens every key to about -18 LUFS, the rifle's
  // loudness, since the files are peak- not loudness-normalised). UI sounds sit a step lower (x0.8, click excepted).
  sfx: {
    sfx_shot_scrap: { vol: 0.87, group: "gun" }, sfx_shot_nail: { vol: 1.0, group: "gun" }, sfx_shot_smg: { vol: 1.0, group: "gun" },
    sfx_shot_pistol: { vol: 1.0, group: "gun" }, sfx_shot_rifle: { vol: 1.0, group: "gun" }, sfx_shot_shotgun: { vol: 0.78, group: "gun" },
    sfx_shot_longrifle: { vol: 0.93, group: "gun" }, sfx_shot_machine: { vol: 1.0, group: "gun" },
    sfx_jam: { vol: 1.0 }, sfx_reload: { vol: 1.0 },
    sfx_melee_hit: { vol: 1.0 }, sfx_claw: { vol: 0.93 }, sfx_acid: { vol: 1.0 },
    sfx_hit_flesh: { vol: 1.0 }, sfx_hit_metal: { vol: 0.94 }, sfx_gib: { vol: 0.96 }, sfx_domed: { vol: 1.0 },
    sfx_death_human: { vol: 0.65 }, sfx_death_beast: { vol: 0.56 }, sfx_explosion: { vol: 0.88 },
    sfx_ability_aim: { vol: 0.91 }, sfx_heal: { vol: 0.53 },
    sfx_ui_click: { vol: 0.8 }, sfx_ui_error: { vol: 0.46 }, sfx_search_done: { vol: 0.49 }, sfx_check_success: { vol: 0.44 },
    sfx_check_fail: { vol: 0.8 }, sfx_loot_rare: { vol: 0.66 },
    sfx_level_up: { vol: 0.91 }, sfx_extract: { vol: 0.72 }, sfx_player_death: { vol: 0.87 }, sfx_hunter_alert: { vol: 0.54 }, sfx_radio: { vol: 0.44 },
    // approved after the Slice 3 list (assets/audio_src/README.md wiring notes). Not in the gun group.
    // `pending: true` on a key keeps it silent and never requested until its file lands.
    sfx_miss: { vol: 0.5 },        // a non-melee miss, ~40 ms after the shot (missDelayMs)
    sfx_crit: { vol: 0.9 }         // layered over sfx_hit_flesh on a crit (battle.js emits it beside the crit shake)
  },
  // SFX bus: every one-shot goes through a gain + limiter (DynamicsCompressor) before the master, so 6 stacked shots
  // don't clip (loops bypass it). Under file:// (HTMLAudio, no Web Audio graph) gunshots are attenuated instead:
  // vol x 1 / sqrt(1 + gunshots already playing).
  bus: { gain: 0.8, limiter: { threshold: -6, knee: 4, ratio: 12, attack: 0.003, release: 0.12 }, htmlGunAtten: true },
  // ambient loops: which screen plays which (town view + outpost panels / zone map + location views + battles)
  loops: { amb_outpost: { vol: 0.8 }, amb_wastes: { vol: 0.8 } },
  screens: { outpost: "amb_outpost", run: "amb_wastes" }
};
