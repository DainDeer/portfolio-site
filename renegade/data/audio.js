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
    sfx_card_pickup: { vol: 0.48 },   // §D a card drops (0.6 x0.8)
    sfx_card_foil: { vol: 0.32 },     // §D a Foil drops: plays INSTEAD of sfx_card_pickup (0.4 x0.8)
    sfx_card_new: { vol: 0.24 },      // §D first copy: layered ~200 ms after pickup/foil (DATA.cards.pop.newDelayMs) (0.3 x0.8)
    // Slice 4 §C weapon sounds (each weapon names one in its sfx; not in the gun group: quiet next to firearms)
    sfx_shot_bow_1: { vol: 0.95 }, sfx_shot_bow_2: { vol: 1.0 }, sfx_shot_bow_3: { vol: 0.95 }, sfx_shot_crossbow: { vol: 1.0 },
    // Slice 5 §A truck crash (Smudge d41333a; assets/audio_src/README.md "Slice 5 A"). Not in the gun group.
    sfx_truck_crash_1: { vol: 1.0 },   // once as a truck Bad Fail crash resolves (config.extraction.crash.sfx), with the line + Heat spike
    sfx_truck_crash_2: { vol: 0.9 },   // spare take: registered, not played anywhere yet
    // sfx_truck_wreck_idle (optional 4 s loop, 0.2) is not wired: the loop player runs one loop per screen
    // Slice 5 §B d20 sounds (config.dice.sfx names them; js/dice.js fires them; Smudge 6451cc2). Not in the gun group.
    sfx_dice_bounce_1: { vol: 1.0 }, sfx_dice_bounce_2: { vol: 1.0 }, sfx_dice_bounce_3: { vol: 1.0 },   // a random one per wall bounce, up to 3 a roll
    sfx_dice_land: { vol: 1.0 },       // the landing frame, with stinger_roll
    stinger_roll: { vol: 0.45, path: "music/", noPitch: true },   // Snare (assets/music_src/README_zones2.md): on top of the landing thunk, SFX bus
    // Snare (assets/music_src/README_stingers.md): the battle stingers, once per battle (G.BattleView.sting, js/battleview.js):
    // Vixie (Oct 4) when the kill shot holding the fight-ending blow ends, or right on a skip; with no such shot, when the
    // fight ends. Their files are not in this branch's assets/music/ yet: pending (silent, never requested) until they land.
    stinger_battle_win: { vol: 1.0, path: "music/", noPitch: true, pending: true },    // a battle won
    stinger_battle_wipe: { vol: 1.0, path: "music/", noPitch: true, pending: true },   // the squad went down (or your body died)
    sfx_bonk_1: { vol: 1.0 }, sfx_bonk_2: { vol: 1.0 }, sfx_bonk_3: { vol: 0.95 }, sfx_bonk_bass: { vol: 0.8 }
  },
  // SFX bus: every one-shot goes through a gain + limiter (DynamicsCompressor) before the master, so 6 stacked shots
  // don't clip (loops bypass it). Under file:// (HTMLAudio, no Web Audio graph) gunshots are attenuated instead:
  // vol x 1 / sqrt(1 + gunshots already playing).
  bus: { gain: 0.8, limiter: { threshold: -6, knee: 4, ratio: 12, attack: 0.003, release: 0.12 }, htmlGunAtten: true },
  // ambient loops: which screen plays which (town view + outpost panels / zone map + location views + battles)
  loops: { amb_outpost: { vol: 0.8 }, amb_wastes: { vol: 0.8 } },
  screens: { outpost: "amb_outpost", run: "amb_wastes", title: "amb_outpost" },   // title: the camp at night (Slice 4 §G)
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
      music_hushwood_battle: { vol: 1, bpm: 75, beatsPerBar: 4, loopSec: 102.4, sync: "hushwood" },
      // Slice 4 §G (Snare, assets/music_src/README.md + README_zones2.md). Only tracks a state / zone / preload names are
      // requested or packaged (tools/asset-manifest.js), so the future-zone pairs cost nothing until a zone uses them.
      music_title:           { vol: 1, bpm: 100, beatsPerBar: 4, loopSec: 96 },                        // bar 2.4 s; the start screen
      music_greyback:        { vol: 1, bpm: 125, beatsPerBar: 3, loopSec: 92.16, sync: "greyback" },   // 3/4, bar 1.44 s (Greyback Hills, Slice 5 §G)
      music_greyback_battle: { vol: 1, bpm: 500 / 3, beatsPerBar: 4, loopSec: 92.16, sync: "greyback", quantize: "bar" },   // 4/4 on the same 1.44 s bar: bar lines only
      music_scablands:       { vol: 1, bpm: 150, beatsPerBar: 4, loopSec: 102.4, sync: "scablands" }, // bar 1.6 s (the late wasteland; NOT zone a)
      music_scablands_battle:{ vol: 1, bpm: 150, beatsPerBar: 4, loopSec: 102.4, sync: "scablands" },
      music_drowned:         { vol: 1, bpm: 80, beatsPerBar: 4, loopSec: 96, sync: "drowned" },        // 12/8: bpm counts dotted quarters; bar 3.0 s
      music_drowned_battle:  { vol: 1, bpm: 80, beatsPerBar: 4, loopSec: 96, sync: "drowned" },
      music_hollis:          { vol: 1, bpm: 120, beatsPerBar: 4, loopSec: 96, sync: "hollis" },        // bar 2.0 s (Hollis Outskirts, zone hollis)
      music_hollis_battle:   { vol: 1, bpm: 120, beatsPerBar: 4, loopSec: 96, sync: "hollis" }
    },
    // music state -> track. outpost = town view, outpost panels, the run result and body offer; run = zone map, location
    // views, searches, events and the pre-battle card; battle = the battle screen (placement, fight, summary).
    // title = the start screen (Slice 4 §G): starts on the first tap / the 🔊 button; Play crossfades to the outpost
    states: { title: "music_title", outpost: "music_outpost", run: "music_hushwood", battle: "music_hushwood_battle" },
    // per-zone overrides. b = the Drowned Suburbs (data/zones.js); hollis = the Hollis Outskirts (wired with the zone,
    // Slice 5 §G). Zone a (The Hushwood) keeps the default pair. scablands: the same
    // sync group on both tracks (bar-line crossfade, like the Hushwood pair) (Snare, Slice 5 §G).
    zones: { b: { run: "music_drowned", battle: "music_drowned_battle" }, greyback: { run: "music_greyback", battle: "music_greyback_battle" },   // greyback: Slice 5 §G
             scablands: { run: "music_scablands", battle: "music_scablands_battle" },
             hollis: { run: "music_hollis", battle: "music_hollis_battle" } },   // Slice 5 §G
    preload: {},   // Snare: a run preloads only its own zone's battle track (js/music.js Mu.set: trackFor("battle", zone)), so the switch is on time
    // same key + tempo, different lengths (so not one sync group): the incoming track still restarts from its top, but on
    // the outgoing one's next bar line, so the beat grids line up during the crossfade (Snare: title -> outpost)
    barAlign: [["music_title", "music_outpost"]],
    restartFadeSec: 1.75,                       // different groups (outpost <-> Hushwood): equal-power crossfade, incoming from 0
    toBattle: { quantize: "bar", maxBarWaitBars: 1, fadeSec: 0.4 },   // next bar line, or the next beat if the bar line is more than maxBarWaitBars of the incoming track's own bars away (Snare: was a fixed 2.4 s)
    fromBattle: { quantize: "bar", fadeBars: 1 },                       // starts on the next bar line, one bar long, so it ends on a bar line
    firstFadeSec: 1.5,                          // fade-in when music starts from silence (first tap / unmute)
    leadSec: 0.06                               // scheduling headroom for Web Audio start times
  }
};
