// Slice 3 §8: audio. Keys -> files, volumes, throttles, limits and the default settings. [DRAFT]
// Missing files are silent (requested once, then remembered as missing). Audio starts after the first click.
window.DATA = window.DATA || {};
DATA.audio = {
  enabled: true,                  // SFX on by default (was G.Sfx.enabled = false in Slice 2)
  sfxPath: "sfx/", ambPath: "amb/", ext: ".mp3", loopExts: [".ogg", ".mp3"],   // under DATA.sprites.basePath (assets/); loops prefer .ogg (gapless), .mp3 if the browser can't play ogg or the file is missing
  defaults: { master: 0.6, sfx: 0.8, ambient: 0.5, music: 0.7, mute: false },   // Settings panel, saved with the game (state.settings); music 0.7: Snare's tracks are -20 LUFS vs the -18 LUFS ambience
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
    sfx_crit: { vol: 0.9 },        // layered over sfx_hit_flesh on a crit (battle.js emits it beside the crit shake)
    // Slice 4 (assets/audio_src/README.md "Slice 4 set"): UI sounds x0.8, no group
    sfx_wheel_click: { vol: 0.64 },   // each spin of a pods-room wall wheel (§B1)
    sfx_door_heavy: { vol: 0.8 },     // once, when the wheels match and the sealed door opens
    sfx_tutorial_pop: { vol: 0.64 },  // a tutorial box appears (each step)
    // Slice 4 §C weapon sounds (each weapon names one in its sfx; not in the gun group: quiet next to firearms)
    sfx_shot_bow_1: { vol: 0.95 }, sfx_shot_bow_2: { vol: 1.0 }, sfx_shot_bow_3: { vol: 0.95 }, sfx_shot_crossbow: { vol: 1.0 },
    sfx_bonk_1: { vol: 1.0 }, sfx_bonk_2: { vol: 1.0 }, sfx_bonk_3: { vol: 0.95 }, sfx_bonk_bass: { vol: 0.8 }
  },
  // SFX bus: every one-shot goes through a gain + limiter (DynamicsCompressor) before the master, so 6 stacked shots
  // don't clip (loops bypass it). Under file:// (HTMLAudio, no Web Audio graph) gunshots are attenuated instead:
  // vol x 1 / sqrt(1 + gunshots already playing).
  bus: { gain: 0.8, limiter: { threshold: -6, knee: 4, ratio: 12, attack: 0.003, release: 0.12 }, htmlGunAtten: true },
  // ambient loops: which screen plays which (town view + outpost panels / zone map + location views + battles)
  loops: { amb_outpost: { vol: 0.8 }, amb_wastes: { vol: 0.8 } },
  screens: { outpost: "amb_outpost", run: "amb_wastes" },
  // Music (Snare, assets/music_src/README.md): its own channel (gain = master x music slider), separate from SFX and
  // ambience. Web Audio buffers with loop = true (gapless); .ogg first (sample-exact), .mp3 if the browser can't play
  // ogg or the ogg fails. Under file:// it falls back to HTMLAudio (no sample-exact sync there).
  music: {
    enabled: true,
    path: "music/", exts: [".ogg", ".mp3"],      // under DATA.sprites.basePath (assets/)
    // key: { vol (before the Music slider), bpm, beatsPerBar, loopSec (the loop length the files decode to), sync group }
    // Tracks in the same sync group share one bar grid (same length and tempo): switching between them keeps the
    // playback position and lands on the grid. Different groups crossfade and restart the incoming track from the top.
    tracks: {
      music_outpost:         { vol: 1, bpm: 100, beatsPerBar: 4, loopSec: 76.8 },                      // bar 2.4 s
      music_hushwood:        { vol: 1, bpm: 75, beatsPerBar: 4, loopSec: 102.4, sync: "hushwood" },  // bar 3.2 s
      music_hushwood_battle: { vol: 1, bpm: 75, beatsPerBar: 4, loopSec: 102.4, sync: "hushwood" }
    },
    // music state -> track. outpost = town view, outpost panels, the run result and body offer; run = zone map, location
    // views, searches, events and the pre-battle card; battle = the battle screen (placement, fight, summary).
    states: { outpost: "music_outpost", run: "music_hushwood", battle: "music_hushwood_battle" },
    zones: {},                                  // per-zone overrides, e.g. b: { run: "...", battle: "..." }; none yet: Hushwood in every zone
    preload: { run: ["music_hushwood_battle"] },   // decode the battle track as soon as a run starts, so the switch is on time
    restartFadeSec: 1.75,                       // different groups (outpost <-> Hushwood): equal-power crossfade, incoming from 0
    toBattle: { quantize: "bar", maxBarWaitSec: 2.4, fadeSec: 0.4 },   // next bar line, or the next beat if the bar line is more than 2.4 s away
    fromBattle: { quantize: "bar", fadeBars: 1 },                       // starts on the next bar line, one bar long, so it ends on a bar line
    firstFadeSec: 1.5,                          // fade-in when music starts from silence (first tap / unmute)
    leadSec: 0.06                               // scheduling headroom for Web Audio start times
  }
};
