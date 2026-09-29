// Sprite registry. Every drawable entity references a sprite KEY.
// The renderer tries assets/<file>; if the file is missing it draws the placeholder shape.
// File naming + sizes are documented in ASSETS-SPEC.md. Do not rename keys without updating that doc.
//
// Per-sprite fields:  file, shape/color/size (placeholder), and for real art:
//   anchorY  0..1  image row placed on the unit's sim position (0.75: body sits inside its 2 m placement cell; flat decals: 0.5)
//   feetY    0..1  image row of the feet (ground ring + shadow are drawn there)
//   imgScale       extra size multiplier for image art (snapped to whole texels, see texelScale)
//   walk           key of a horizontal walk strip used while the unit moves; strips set frames + fps
//   corpse         per-unit corpse key (units only)
//   pad            transparent padding baked into the image on each side, in texels (item icons: 2 -> 36x36 canvas, 32px art)
window.DATA = window.DATA || {};
DATA.sprites = {
  basePath: "assets/",
  probeAssets: true,   // set false to stop requesting art files (silences 404s in the console while assets/ is empty)
  // How image sprites for units/corpses show direction. "flip": art faces south (3/4 top-down) and is mirrored
  // left/right by heading (the delivered art). "rotate": art faces east and is rotated.
  facingMode: "flip",
  // Keys whose art isn't delivered yet: never requested, placeholder badges only (no 404s). Remove a prefix when its art lands.
  pendingArt: ["bld_", "skill_", "stat_", "dmg_"],   // prefixes not delivered yet: drawn as placeholders, never requested (all Slice 2 art has landed except bld_*)
  pixelArt: true,      // nearest-neighbour scaling for image sprites (crisp pixel art)
  // Battle canvas: every image sprite is drawn at (native px x texelScale), so a 32px unit = 64 canvas px = 2 m at pxPerM 32.
  texelScale: 2,
  // DOM icons snap to whole multiples of the native size when the requested size is at least this fraction of it
  iconSnapMin: 0.75,
  decalRotation: "quarter",   // "quarter": decals rotate in 90° steps + mirror (keeps pixel art crisp); "free": any angle
  // Death-variant corpses (§7.6 gore). kind = "human" (players, grunts, outlaws) or "beast" (Bio-beasts).
  corpseVariants: {
    // byUnit (by unit sprite key) wins over the human/beast default
    domed: { human: "corpse_human_domed", beast: "corpse_beast_domed",          // Domed roll on a core ally
             byUnit: { enemy_beast_hound: "corpse_beast_hound_domed", enemy_beast_spitter: "corpse_beast_spitter_domed", enemy_beast_maw: "corpse_beast_maw_domed" } },
    gore:  { human: "corpse_human_dismembered", beast: "corpse_beast_domed",    // gibbed kill (overkill / crit / Butcher finisher)
             byUnit: { enemy_beast_hound: "corpse_beast_hound_domed", enemy_beast_spitter: "corpse_beast_spitter_domed", enemy_beast_maw: "corpse_beast_maw_domed" } }
  },
  beastFamilies: ["beasts"],
  // Gibs flung on a gore kill, by corpse kind (fx_gib_8 is mutant hide, 4 hand / 7 boot are human-only)
  gibs: { human: [1, 2, 3, 4, 5, 6, 7], beast: [1, 2, 3, 5, 6, 8] },
  // Blood decals by hit size: < small -> fx_blood_1, < medium -> fx_blood_2, else fx_blood_3
  bloodBySize: { small: 0.6, medium: 1.0 },
  bloodOnCrit: "fx_blood_spray",     // arterial spurt, oriented along the shot, stamped on crits
  dragOn: "fx_blood_drag",           // smear stamped along the push when a unit is knocked down (Breacher charge) or drops Critical
  acidPoolOn: { projectile: "fx_acid", decal: "fx_acid_pool" },   // where an acid glob lands (hit or miss)
  healIcon: "item_med_kit",          // shown on Med Supply heal buttons (field heal / critical care)
  // ---- units (32x32, 3/4 top-down, facing SOUTH; mirrored for left/right) ----
  unit_basic:            { file: "units/unit_basic.png",            shape: "circle",   color: "#9a9a9a", size: 0.9, anchorY: 0.75, feetY: 0.97, walk: "unit_basic_strip2", corpse: "corpse_basic" },
  unit_vanguard:         { file: "units/unit_vanguard.png",         shape: "square",   color: "#4f7fd6", size: 1.0, anchorY: 0.75, feetY: 0.97, walk: "unit_vanguard_strip2", corpse: "corpse_vanguard" },
  unit_striker:          { file: "units/unit_striker.png",          shape: "triangle", color: "#d6a44f", size: 0.9, anchorY: 0.75, feetY: 0.97, walk: "unit_striker_strip2", corpse: "corpse_striker" },
  unit_gunner:           { file: "units/unit_gunner.png",           shape: "circle",   color: "#58c46a", size: 0.9, anchorY: 0.75, feetY: 0.97, walk: "unit_gunner_strip2", corpse: "corpse_gunner" },
  unit_medic:            { file: "units/unit_medic.png",            shape: "cross",    color: "#f0f0f0", size: 0.9, anchorY: 0.75, feetY: 0.97, walk: "unit_medic_strip2", corpse: "corpse_medic" },
  unit_grunt:            { file: "units/unit_grunt.png",            shape: "circle",   color: "#6d8a9e", size: 0.75, anchorY: 0.75, feetY: 0.97, walk: "unit_grunt_strip2", corpse: "corpse_grunt" },
  enemy_outlaw_raider:   { file: "units/enemy_outlaw_raider.png",   shape: "circle",   color: "#c0503a", size: 0.8, anchorY: 0.75, feetY: 0.97, walk: "enemy_outlaw_raider_strip2", corpse: "corpse_outlaw_raider" },
  enemy_outlaw_gunman:   { file: "units/enemy_outlaw_gunman.png",   shape: "diamond",  color: "#d8683a", size: 0.85, anchorY: 0.75, feetY: 0.97, walk: "enemy_outlaw_gunman_strip2", corpse: "corpse_outlaw_gunman" },
  enemy_outlaw_brute:    { file: "units/enemy_outlaw_brute.png",    shape: "square",   color: "#8f2f22", size: 1.1, anchorY: 0.75, feetY: 0.97, walk: "enemy_outlaw_brute_strip2", corpse: "corpse_outlaw_brute" },
  enemy_beast_hound:     { file: "units/enemy_beast_hound.png",     shape: "triangle", color: "#9c5bd0", size: 0.75, anchorY: 0.75, feetY: 0.97, walk: "enemy_beast_hound_strip2", corpse: "corpse_beast_hound" },
  enemy_beast_spitter:   { file: "units/enemy_beast_spitter.png",   shape: "diamond",  color: "#6fbf3a", size: 0.85, anchorY: 0.75, feetY: 0.97, walk: "enemy_beast_spitter_strip2", corpse: "corpse_beast_spitter" },
  enemy_beast_maw:       { file: "units/enemy_beast_maw.png",       shape: "square",   color: "#5e2f7a", size: 1.3, anchorY: 0.75, feetY: 0.97, imgScale: 1.5, walk: "enemy_beast_maw_strip2", corpse: "corpse_beast_maw" },
  // ---- corpses (32x32, lying head-left; mirrored by heading) ----
  corpse_human:          { file: "fx/corpse_human.png",             shape: "corpse",   color: "#5a2a22", size: 1.0 },
  corpse_beast:          { file: "fx/corpse_beast.png",             shape: "corpse",   color: "#3e2450", size: 1.0 },
  corpse_human_searched: { file: "fx/corpse_human_searched.png",    shape: "corpse",   color: "#4a2a22", size: 1.0 },   // a body once looted (site view)
  corpse_beast_searched: { file: "fx/corpse_beast_searched.png",    shape: "corpse",   color: "#2e2440", size: 1.0 },
  // ---- 2-frame walk strips (64x32 = 2 x 32x32, left->right) ----
  unit_basic_strip2:       { file: "units/unit_basic_strip2.png",                   shape: "none", color: "#000", size: 1, frames: 2, fps: 8, anchorY: 0.75, feetY: 0.97 },
  unit_vanguard_strip2:    { file: "units/unit_vanguard_strip2.png",                shape: "none", color: "#000", size: 1, frames: 2, fps: 8, anchorY: 0.75, feetY: 0.97 },
  unit_striker_strip2:     { file: "units/unit_striker_strip2.png",                 shape: "none", color: "#000", size: 1, frames: 2, fps: 8, anchorY: 0.75, feetY: 0.97 },
  unit_gunner_strip2:      { file: "units/unit_gunner_strip2.png",                  shape: "none", color: "#000", size: 1, frames: 2, fps: 8, anchorY: 0.75, feetY: 0.97 },
  unit_medic_strip2:       { file: "units/unit_medic_strip2.png",                   shape: "none", color: "#000", size: 1, frames: 2, fps: 8, anchorY: 0.75, feetY: 0.97 },
  unit_grunt_strip2:       { file: "units/unit_grunt_strip2.png",                   shape: "none", color: "#000", size: 1, frames: 2, fps: 8, anchorY: 0.75, feetY: 0.97 },
  enemy_outlaw_raider_strip2: { file: "units/enemy_outlaw_raider_strip2.png",          shape: "none", color: "#000", size: 1, frames: 2, fps: 8, anchorY: 0.75, feetY: 0.97 },
  enemy_outlaw_gunman_strip2: { file: "units/enemy_outlaw_gunman_strip2.png",          shape: "none", color: "#000", size: 1, frames: 2, fps: 8, anchorY: 0.75, feetY: 0.97 },
  enemy_outlaw_brute_strip2: { file: "units/enemy_outlaw_brute_strip2.png",           shape: "none", color: "#000", size: 1, frames: 2, fps: 8, anchorY: 0.75, feetY: 0.97 },
  enemy_beast_hound_strip2: { file: "units/enemy_beast_hound_strip2.png",            shape: "none", color: "#000", size: 1, frames: 2, fps: 8, anchorY: 0.75, feetY: 0.97 },
  enemy_beast_spitter_strip2: { file: "units/enemy_beast_spitter_strip2.png",          shape: "none", color: "#000", size: 1, frames: 2, fps: 8, anchorY: 0.75, feetY: 0.97 },
  enemy_beast_maw_strip2:  { file: "units/enemy_beast_maw_strip2.png",              shape: "none", color: "#000", size: 1, frames: 2, fps: 8, anchorY: 0.75, feetY: 0.97, imgScale: 1.5 },
  corpse_basic:           { file: "fx/corpse_basic.png",             shape: "corpse",   color: "#5a2a22", size: 1.0, anchorY: 0.5 },
  corpse_vanguard:        { file: "fx/corpse_vanguard.png",          shape: "corpse",   color: "#5a2a22", size: 1.0, anchorY: 0.5 },
  corpse_striker:         { file: "fx/corpse_striker.png",           shape: "corpse",   color: "#5a2a22", size: 1.0, anchorY: 0.5 },
  corpse_gunner:          { file: "fx/corpse_gunner.png",            shape: "corpse",   color: "#5a2a22", size: 1.0, anchorY: 0.5 },
  corpse_medic:           { file: "fx/corpse_medic.png",             shape: "corpse",   color: "#5a2a22", size: 1.0, anchorY: 0.5 },
  corpse_grunt:           { file: "fx/corpse_grunt.png",             shape: "corpse",   color: "#5a2a22", size: 1.0, anchorY: 0.5 },
  corpse_outlaw_raider:   { file: "fx/corpse_outlaw_raider.png",     shape: "corpse",   color: "#5a2a22", size: 1.0, anchorY: 0.5 },
  corpse_outlaw_gunman:   { file: "fx/corpse_outlaw_gunman.png",     shape: "corpse",   color: "#5a2a22", size: 1.0, anchorY: 0.5 },
  corpse_outlaw_brute:    { file: "fx/corpse_outlaw_brute.png",      shape: "corpse",   color: "#5a2a22", size: 1.0, anchorY: 0.5 },
  corpse_beast_hound:     { file: "fx/corpse_beast_hound.png",       shape: "corpse",   color: "#3e2450", size: 1.0, anchorY: 0.5 },
  corpse_beast_spitter:   { file: "fx/corpse_beast_spitter.png",     shape: "corpse",   color: "#3e2450", size: 1.0, anchorY: 0.5 },
  corpse_beast_maw:       { file: "fx/corpse_beast_maw.png",         shape: "corpse",   color: "#3e2450", size: 1.0, anchorY: 0.5, imgScale: 1.5 },
  corpse_human_domed:     { file: "fx/corpse_human_domed.png",       shape: "corpse",   color: "#5a2a22", size: 1.0, anchorY: 0.5 },
  corpse_human_dismembered: { file: "fx/corpse_human_dismembered.png",  shape: "corpse",   color: "#5a2a22", size: 1.0, anchorY: 0.5 },
  corpse_beast_domed:     { file: "fx/corpse_beast_domed.png",       shape: "corpse",   color: "#3e2450", size: 1.0, anchorY: 0.5 },
  corpse_beast_hound_domed:   { file: "fx/corpse_beast_hound_domed.png",   shape: "corpse", color: "#3e2450", size: 1.0, anchorY: 0.5 },
  corpse_beast_spitter_domed: { file: "fx/corpse_beast_spitter_domed.png", shape: "corpse", color: "#3e2450", size: 1.0, anchorY: 0.5 },
  corpse_beast_maw_domed:     { file: "fx/corpse_beast_maw_domed.png",     shape: "corpse", color: "#3e2450", size: 1.0, anchorY: 0.5, imgScale: 1.5 },
  // ---- gore / fx (splats 24x24, pools 32x32, gibs + projectiles 12x12) ----
  fx_blood_1:            { file: "fx/fx_blood_1.png",               shape: "splat",    color: "#7a0a0a", size: 0.6 },
  fx_blood_2:            { file: "fx/fx_blood_2.png",               shape: "splat",    color: "#8a0c0c", size: 0.8 },
  fx_blood_3:            { file: "fx/fx_blood_3.png",               shape: "splat",    color: "#650808", size: 1.0 },
  fx_blood_pool:         { file: "fx/fx_blood_pool.png",            shape: "splat",    color: "#4e0505", size: 1.6 },
  fx_gib_1:              { file: "fx/fx_gib_1.png",                 shape: "gib",      color: "#b03a3a", size: 0.3 },
  fx_gib_2:              { file: "fx/fx_gib_2.png",                 shape: "gib",      color: "#d0a0a0", size: 0.25 },
  fx_gib_3:              { file: "fx/fx_gib_3.png",                 shape: "gib",      color: "#902020", size: 0.35 },
  fx_gib_4:              { file: "fx/fx_gib_4.png",                 shape: "gib",      color: "#c89070", size: 0.3 },
  fx_gib_5:              { file: "fx/fx_gib_5.png",                 shape: "gib",      color: "#e0e0d0", size: 0.2 },
  fx_gib_6:              { file: "fx/fx_gib_6.png",                 shape: "gib",      color: "#b04040", size: 0.3 },
  fx_gib_7:              { file: "fx/fx_gib_7.png",                 shape: "gib",      color: "#4a3a2a", size: 0.3 },
  fx_gib_8:              { file: "fx/fx_gib_8.png",                 shape: "gib",      color: "#6a7a3a", size: 0.35 },
  fx_blood_spray:        { file: "fx/fx_blood_spray.png",           shape: "splat",    color: "#8a0c0c", size: 0.8 },
  fx_blood_drag:         { file: "fx/fx_blood_drag.png",            shape: "splat",    color: "#5a0707", size: 1.2 },
  fx_acid_pool:          { file: "fx/fx_acid_pool.png",             shape: "splat",    color: "#6a9a2a", size: 0.8 },
  fx_bullet:             { file: "fx/fx_bullet.png",                shape: "dot",      color: "#ffe9a0", size: 0.15 },
  fx_acid:               { file: "fx/fx_acid.png",                  shape: "dot",      color: "#8cff3a", size: 0.25 },
  fx_muzzle:             { file: "fx/fx_muzzle.png",                shape: "dot",      color: "#fff3b0", size: 0.3 },
  // ---- battle terrain ----
  bg_battle:             { file: "tiles/bg_battle.png",             shape: "none",     color: "#2b2a24", size: 1 },
  // ---- map ----
  map_bg:                { file: "map/map_bg.png",                  shape: "none",     color: "#1d1f1b", size: 1 },
  map_fog:               { file: "map/map_fog.png",                 shape: "none",     color: "#111",    size: 1 },
  map_revealed:          { file: "map/map_revealed.png",            shape: "none",     color: "#3a3526", size: 1 },
  loc_ruins:             { file: "map/loc_ruins.png",               shape: "square",   color: "#8a8171", size: 1 },
  loc_mall:              { file: "map/loc_mall.png",                shape: "square",   color: "#6f8fa8", size: 1 },
  loc_camp:              { file: "map/loc_camp.png",                shape: "triangle", color: "#b0603a", size: 1 },
  loc_hospital:          { file: "map/loc_hospital.png",            shape: "cross",    color: "#e0e0e0", size: 1 },
  loc_tower:             { file: "map/loc_tower.png",               shape: "diamond",  color: "#a0a0ff", size: 1 },
  loc_settlement:        { file: "map/loc_settlement.png",          shape: "circle",   color: "#c0b060", size: 1 },
  loc_overgrown:         { file: "map/loc_overgrown.png",           shape: "circle",   color: "#5a9a4a", size: 1 },
  loc_depot:             { file: "map/loc_depot.png",               shape: "square",   color: "#9a8a5a", size: 1 },
  loc_tunnel:            { file: "map/loc_tunnel.png",              shape: "diamond",  color: "#707070", size: 1 },
  loc_extraction:        { file: "map/loc_extraction.png",          shape: "star",     color: "#40e0a0", size: 1 },
  loc_outpost:           { file: "map/loc_outpost.png",             shape: "star",     color: "#f0d040", size: 1 },
  loc_aftermath:         { file: "map/loc_aftermath.png",           shape: "triangle", color: "#602020", size: 1 },
  loc_bunker:            { file: "map/loc_bunker.png",              shape: "square",   color: "#6a6a5a", size: 1 },
  loc_distress:          { file: "map/loc_distress.png",            shape: "diamond",  color: "#ff6040", size: 1 },
  loc_den:               { file: "map/loc_den.png",                 shape: "circle",   color: "#4a6a2a", size: 1 },
  loc_unknown:           { file: "map/loc_unknown.png",             shape: "badge",    color: "#444",    size: 1, text: "?" },
  // ---- Slice 2: zone map ----
  map_bg_b:              { file: "map/map_bg_b.png",                shape: "none",     color: "#1a211f", size: 1 },
  map_passage:           { file: "map/map_passage.png",             shape: "badge",    color: "#2a6a8a", size: 1, text: "⇄" },
  loc_insertion:         { file: "map/loc_insertion.png",           shape: "badge",    color: "#5a5a3a", size: 1, text: "IN" },
  loc_pump_station:      { file: "map/loc_pump_station.png",        shape: "square",   color: "#4a8ab0", size: 1 },
  loc_outfall:           { file: "map/loc_outfall.png",             shape: "circle",   color: "#3a6a7a", size: 1 },
  loc_culdesac:          { file: "map/loc_culdesac.png",            shape: "square",   color: "#6a8a9a", size: 1 },
  loc_warrens:           { file: "map/loc_warrens.png",             shape: "triangle", color: "#6a3a6a", size: 1 },
  loc_harrow_clinic:     { file: "map/loc_harrow_clinic.png",       shape: "cross",    color: "#c0d0d0", size: 1 },
  loc_cistern:           { file: "map/loc_cistern.png",             shape: "diamond",  color: "#3a7ab0", size: 1 },
  loc_boat_launch:       { file: "map/loc_boat_launch.png",         shape: "star",     color: "#40c0e0", size: 1 },
  // ---- Slice 2: town view (home screen, 1000x600). Hotspot art is drawn at the hotspot's size (data/town.js) ----
  town_bg:               { file: "town/town_bg.png",                shape: "none",     color: "#2a2820", size: 1 },
  town_trapdoor:         { file: "town/town_trapdoor.png",          shape: "square",   color: "#4a3a22", size: 1 },
  town_vault:            { file: "town/town_vault.png",             shape: "square",   color: "#5a5a66", size: 1 },
  town_body_lab:         { file: "town/town_body_lab.png",          shape: "square",   color: "#3a6a6a", size: 1 },
  town_dunn_stores:      { file: "town/town_dunn_stores.png",       shape: "square",   color: "#6a5a3a", size: 1 },
  town_ilse_tent:        { file: "town/town_ilse_tent.png",         shape: "square",   color: "#7a4a4a", size: 1 },
  town_stockpile:        { file: "town/town_stockpile.png",         shape: "square",   color: "#5a6a3a", size: 1 },
  town_workshop:         { file: "town/town_workshop.png",          shape: "square",   color: "#4a4038", size: 1 },
  town_lot_recruit:      { file: "town/town_lot_recruit.png",       shape: "square",   color: "#3a3830", size: 1 },
  town_lot_comms:        { file: "town/town_lot_comms.png",         shape: "square",   color: "#3a3830", size: 1 },
  town_trapdoor_open:    { file: "town/town_trapdoor_open.png",     shape: "none",     color: "#1a120a", size: 1 },
  // hotspot overlays drawn at the positions in DATA.townArt (outline = hl, lit building + outline = hover)
  town_hl_trapdoor:      { file: "town/town_hl_trapdoor.png", shape: "none", color: "#ffd84a", size: 1 },
  town_hover_trapdoor:   { file: "town/town_hover_trapdoor.png", shape: "none", color: "#ffd84a", size: 1 },
  town_hl_vault:         { file: "town/town_hl_vault.png", shape: "none", color: "#ffd84a", size: 1 },
  town_hover_vault:      { file: "town/town_hover_vault.png", shape: "none", color: "#ffd84a", size: 1 },
  town_hl_body_lab:      { file: "town/town_hl_body_lab.png", shape: "none", color: "#ffd84a", size: 1 },
  town_hover_body_lab:   { file: "town/town_hover_body_lab.png", shape: "none", color: "#ffd84a", size: 1 },
  town_hl_dunn_stores:   { file: "town/town_hl_dunn_stores.png", shape: "none", color: "#ffd84a", size: 1 },
  town_hover_dunn_stores:{ file: "town/town_hover_dunn_stores.png", shape: "none", color: "#ffd84a", size: 1 },
  town_hl_ilse_tent:     { file: "town/town_hl_ilse_tent.png", shape: "none", color: "#ffd84a", size: 1 },
  town_hover_ilse_tent:  { file: "town/town_hover_ilse_tent.png", shape: "none", color: "#ffd84a", size: 1 },
  town_hl_stockpile:     { file: "town/town_hl_stockpile.png", shape: "none", color: "#ffd84a", size: 1 },
  town_hover_stockpile:  { file: "town/town_hover_stockpile.png", shape: "none", color: "#ffd84a", size: 1 },
  town_hl_workshop:      { file: "town/town_hl_workshop.png", shape: "none", color: "#ffd84a", size: 1 },
  town_hover_workshop:   { file: "town/town_hover_workshop.png", shape: "none", color: "#ffd84a", size: 1 },
  town_hl_lot_recruit:   { file: "town/town_hl_lot_recruit.png", shape: "none", color: "#ffd84a", size: 1 },
  town_hover_lot_recruit:{ file: "town/town_hover_lot_recruit.png", shape: "none", color: "#ffd84a", size: 1 },
  town_hl_lot_comms:     { file: "town/town_hl_lot_comms.png", shape: "none", color: "#ffd84a", size: 1 },
  town_hover_lot_comms:  { file: "town/town_hover_lot_comms.png", shape: "none", color: "#ffd84a", size: 1 },
  npc_dunn:              { file: "ui/npc_dunn.png",                 shape: "badge",    color: "#6a5a3a", size: 1, text: "D" },
  npc_ilse:              { file: "ui/npc_ilse.png",                 shape: "badge",    color: "#7a4a4a", size: 1, text: "I" },
  // ---- Slice 2: location view (top-down, battle art style, 32 px texels drawn x2 like the battle canvas) ----
  tile_floor:            { file: "tiles/tile_floor.png",            shape: "none",     color: "#34322a", size: 1 },
  tile_floor_wet:        { file: "tiles/tile_floor_wet.png",        shape: "none",     color: "#2a3434", size: 1 },
  tile_floor_clinic:     { file: "tiles/tile_floor_clinic.png",     shape: "none",     color: "#3a3c3c", size: 1 },
  tile_floor_concrete:   { file: "tiles/tile_floor_concrete.png",   shape: "none",     color: "#3a3830", size: 1 },
  tile_floor_yard:       { file: "tiles/tile_floor_yard.png",       shape: "none",     color: "#6a5a3a", size: 1 },
  tile_floor_b:          { file: "tiles/tile_floor_b.png",          shape: "none",     color: "#3a2a28", size: 1 },
  tile_floor_b_wet:      { file: "tiles/tile_floor_b_wet.png",      shape: "none",     color: "#2a3230", size: 1 },
  // walls (site view): fill texture for everything outside rooms, 16 px bands along room edges (8 native x2),
  // corner caps where bands meet, a south-facing face just inside each room's top edge, doorway plates under doors.
  tile_wall:             { file: "tiles/tile_wall.png",             shape: "none",     color: "#15140f", size: 1 },
  tile_wall_b:           { file: "tiles/tile_wall_b.png",           shape: "none",     color: "#1f1512", size: 1 },
  tile_wall_h:           { file: "tiles/tile_wall_h.png",           shape: "none",     color: "#2a2820", size: 1 },
  tile_wall_h_2:         { file: "tiles/tile_wall_h_2.png",         shape: "none",     color: "#2a2820", size: 1 },
  tile_wall_h_3:         { file: "tiles/tile_wall_h_3.png",         shape: "none",     color: "#2a2820", size: 1 },
  tile_wall_v:           { file: "tiles/tile_wall_v.png",           shape: "none",     color: "#2a2820", size: 1 },
  tile_wall_corner:      { file: "tiles/tile_wall_corner.png",      shape: "none",     color: "#34322a", size: 1 },
  tile_wall_face:        { file: "tiles/tile_wall_face.png",        shape: "none",     color: "#00000060", size: 1 },
  tile_wall_face_b:      { file: "tiles/tile_wall_face_b.png",      shape: "none",     color: "#00000060", size: 1 },
  tile_doorway_h:        { file: "tiles/tile_doorway_h.png",        shape: "none",     color: "#3a3a34", size: 1 },
  tile_doorway_v:        { file: "tiles/tile_doorway_v.png",        shape: "none",     color: "#3a3a34", size: 1 },
  obj_crate:             { file: "objects/obj_crate.png",           shape: "badge",    color: "#8a6a3a", size: 1, text: "CR" },
  obj_locker:            { file: "objects/obj_locker.png",          shape: "badge",    color: "#5a6a7a", size: 1, text: "LK" },
  obj_desk:              { file: "objects/obj_desk.png",            shape: "badge",    color: "#6a5a4a", size: 1, text: "DK" },
  obj_safe:              { file: "objects/obj_safe.png",            shape: "badge",    color: "#4a4a5a", size: 1, text: "SF" },
  obj_door:              { file: "objects/obj_door.png",            shape: "badge",    color: "#7a5a2a", size: 1, text: "DR" },
  obj_grate:             { file: "objects/obj_grate.png",           shape: "badge",    color: "#2a6a8a", size: 1, text: "⇄" },
  obj_pump_machinery:    { file: "objects/obj_pump_machinery.png",  shape: "badge",    color: "#3a7aa0", size: 1, text: "PM" },
  obj_radio:             { file: "objects/obj_radio.png",           shape: "badge",    color: "#a04030", size: 1, text: "📻" },
  obj_terminal:          { file: "objects/obj_terminal.png",        shape: "badge",    color: "#3a5a8a", size: 1, text: "TM" },
  obj_cryo_pod:          { file: "objects/obj_cryo_pod.png",        shape: "badge",    color: "#5a9ab0", size: 1, text: "CP" },
  obj_dead_renegade:     { file: "objects/obj_dead_renegade.png",   shape: "badge",    color: "#5a3a5a", size: 1, text: "DR†" },
  obj_barricade:         { file: "objects/obj_barricade.png",       shape: "badge",    color: "#8a4a2a", size: 1, text: "BR" },
  obj_rubble:            { file: "objects/obj_rubble.png",          shape: "badge",    color: "#5a5a50", size: 1, text: "RB" },
  obj_survivor:          { file: "objects/obj_survivor.png",        shape: "badge",    color: "#4a8a4a", size: 1, text: "☺" },
  obj_gate:              { file: "objects/obj_gate.png",            shape: "badge",    color: "#8a7a3a", size: 1, text: "GT" },
  obj_event:             { file: "objects/obj_event.png",           shape: "badge",    color: "#6a4a8a", size: 1, text: "?" },
  prop_puddle:           { file: "objects/prop_puddle.png",         shape: "splat",    color: "#2a4a5a", size: 1 },
  prop_pipes:            { file: "objects/prop_pipes.png",          shape: "bar",      color: "#4a5a5a", size: 1 },
  prop_shelf:            { file: "objects/prop_shelf.png",          shape: "bar",      color: "#5a4a3a", size: 1 },
  prop_junk:             { file: "objects/prop_junk.png",           shape: "splat",    color: "#4a4438", size: 1 },
  prop_rack:             { file: "objects/prop_rack.png",           shape: "bar",      color: "#5a4a5a", size: 1 },
  prop_console:          { file: "objects/prop_console.png",        shape: "square",   color: "#2a3a4a", size: 1 },
  prop_barrel:           { file: "objects/prop_barrel.png",         shape: "circle",   color: "#5a6a2a", size: 1 },
  prop_bed:              { file: "objects/prop_bed.png",            shape: "bar",      color: "#8a8a8a", size: 1 },
  prop_rubble:           { file: "objects/prop_rubble.png",         shape: "splat",    color: "#3a3a34", size: 1 },
  // container / door states (obj_<type>_open = loot showing, _searched = emptied; doors: closed / _open / _locked / _broken, _v = in a vertical wall)
  obj_crate_open: { file: "objects/obj_crate_open.png", shape: "badge", color: "#8a6a3a", size: 1, text: "CR" },
  obj_crate_searched: { file: "objects/obj_crate_searched.png", shape: "badge", color: "#8a6a3a", size: 1, text: "CR" },
  obj_locker_open: { file: "objects/obj_locker_open.png", shape: "badge", color: "#5a6a7a", size: 1, text: "LK" },
  obj_locker_searched: { file: "objects/obj_locker_searched.png", shape: "badge", color: "#5a6a7a", size: 1, text: "LK" },
  obj_desk_open: { file: "objects/obj_desk_open.png", shape: "badge", color: "#6a5a4a", size: 1, text: "DK" },
  obj_desk_searched: { file: "objects/obj_desk_searched.png", shape: "badge", color: "#6a5a4a", size: 1, text: "DK" },
  obj_safe_open: { file: "objects/obj_safe_open.png", shape: "badge", color: "#4a4a5a", size: 1, text: "SF" },
  obj_safe_searched: { file: "objects/obj_safe_searched.png", shape: "badge", color: "#4a4a5a", size: 1, text: "SF" },
  obj_pump_machinery_open: { file: "objects/obj_pump_machinery_open.png", shape: "badge", color: "#3a7aa0", size: 1, text: "PM" },
  obj_pump_machinery_searched: { file: "objects/obj_pump_machinery_searched.png", shape: "badge", color: "#3a7aa0", size: 1, text: "PM" },
  obj_crate_heavy:       { file: "objects/obj_crate_heavy.png",     shape: "badge",    color: "#5a6a3a", size: 1, text: "HC" },
  obj_crate_heavy_open: { file: "objects/obj_crate_heavy_open.png", shape: "badge", color: "#5a6a3a", size: 1, text: "HC" },
  obj_crate_heavy_searched: { file: "objects/obj_crate_heavy_searched.png", shape: "badge", color: "#5a6a3a", size: 1, text: "HC" },
  obj_door_open: { file: "objects/obj_door_open.png", shape: "badge", color: "#7a5a2a", size: 1, text: "DR" },
  obj_door_locked: { file: "objects/obj_door_locked.png", shape: "badge", color: "#7a5a2a", size: 1, text: "DR" },
  obj_door_broken: { file: "objects/obj_door_broken.png", shape: "badge", color: "#7a5a2a", size: 1, text: "DR" },
  obj_door_v: { file: "objects/obj_door_v.png", shape: "badge", color: "#7a5a2a", size: 1, text: "DR" },
  obj_door_v_open: { file: "objects/obj_door_v_open.png", shape: "badge", color: "#7a5a2a", size: 1, text: "DR" },
  obj_door_v_locked: { file: "objects/obj_door_v_locked.png", shape: "badge", color: "#7a5a2a", size: 1, text: "DR" },
  obj_door_v_broken: { file: "objects/obj_door_v_broken.png", shape: "badge", color: "#7a5a2a", size: 1, text: "DR" },
  obj_grate_open:        { file: "objects/obj_grate_open.png",      shape: "badge",    color: "#2a6a8a", size: 1, text: "⇄" },
  marker_searched:       { file: "objects/marker_searched.png",     shape: "badge",    color: "#cccccc", size: 1, text: "X" },
  marker_quest:          { file: "objects/marker_quest.png",        shape: "badge",    color: "#e8c060", size: 1, text: "!" },
  prop_growth: { file: "objects/prop_growth.png", shape: "splat", color: "#6a3a3a", size: 1 },   // Zone B
  prop_nest: { file: "objects/prop_nest.png", shape: "splat", color: "#5a4a3a", size: 1 },   // Zone B
  prop_pod: { file: "objects/prop_pod.png", shape: "splat", color: "#8a8a3a", size: 1 },   // Zone B
  prop_bones: { file: "objects/prop_bones.png", shape: "splat", color: "#b0a890", size: 1 },   // Zone B
  // ---- item icons (36x36 canvas, art in the central 32x32 -> pad 2) : item_<baseId> ----
  item_pipe_rifle:       { file: "items/item_pipe_rifle.png",       shape: "bar",      color: "#8a7a6a", size: 1, pad: 2 },
  item_nail_gun:         { file: "items/item_nail_gun.png",         shape: "bar",      color: "#7a8a6a", size: 1, pad: 2 },
  item_scav_carbine:     { file: "items/item_scav_carbine.png",     shape: "bar",      color: "#8a8a5a", size: 1, pad: 2 },
  item_kalash_47:        { file: "items/item_kalash_47.png",        shape: "bar",      color: "#9a6a3a", size: 1, pad: 2 },
  item_glokk_17:         { file: "items/item_glokk_17.png",         shape: "bar",      color: "#5a5a5a", size: 1, pad: 2 },
  item_m1912_colter:     { file: "items/item_m1912_colter.png",     shape: "bar",      color: "#6a6a7a", size: 1, pad: 2 },
  item_remingon_870:     { file: "items/item_remingon_870.png",     shape: "bar",      color: "#7a5a4a", size: 1, pad: 2 },
  item_ar16_stoner:      { file: "items/item_ar16_stoner.png",      shape: "bar",      color: "#4a4a4a", size: 1, pad: 2 },
  item_rust_machete:     { file: "items/item_rust_machete.png",     shape: "bar",      color: "#a07050", size: 1, pad: 2 },
  item_knuckle_wraps:    { file: "items/item_knuckle_wraps.png",    shape: "bar",      color: "#c0a080", size: 1, pad: 2 },
  item_scrap_helmet:     { file: "items/item_scrap_helmet.png",     shape: "circle",   color: "#7a7a6a", size: 1, pad: 2 },
  item_padded_vest:      { file: "items/item_padded_vest.png",      shape: "square",   color: "#6a5a4a", size: 1, pad: 2 },
  item_school_bag:       { file: "items/item_school_bag.png",       shape: "square",   color: "#c05050", size: 1, pad: 2 },
  item_military_ruck:    { file: "items/item_military_ruck.png",    shape: "square",   color: "#5a6a3a", size: 1, pad: 2 },
  item_fists:            { file: "items/item_fists.png",            shape: "circle",   color: "#d0b090", size: 1, pad: 2 },
  item_bone_claws:       { file: "items/item_bone_claws.png",       shape: "bar",      color: "#d0c0a0", size: 1, pad: 2 },
  item_acid_gland:       { file: "items/item_acid_gland.png",       shape: "circle",   color: "#8cff3a", size: 1, pad: 2 },
  item_scrap_smg:        { file: "items/item_smg.png",              shape: "bar",      color: "#6a6a5a", size: 1, pad: 2 },
  item_med_kit:          { file: "items/item_med_kit.png",          shape: "cross",    color: "#e04040", size: 1, pad: 2 },
  item_quest_valve:      { file: "items/item_quest_valve.png",      shape: "badge",    color: "#b08a3a", size: 1, pad: 2, text: "V" },
  item_quest_ledger:     { file: "items/item_quest_ledger.png",     shape: "badge",    color: "#b08a3a", size: 1, pad: 2, text: "L" },
  // ---- resource icons (32x32) ----
  res_food:              { file: "icons/res_food.png",              shape: "badge",    color: "#b08040", size: 1, text: "F" },
  res_water:             { file: "icons/res_water.png",             shape: "badge",    color: "#3a80c0", size: 1, text: "W" },
  res_scrap:             { file: "icons/res_scrap.png",             shape: "square",   color: "#9a9a9a", size: 1 },
  res_cloth:             { file: "icons/res_cloth.png",             shape: "badge",    color: "#9a7a9a", size: 1, text: "C" },
  res_electronics:       { file: "icons/res_electronics.png",         shape: "diamond",  color: "#40a0e0", size: 1 },
  res_chemicals:         { file: "icons/res_chemicals.png",         shape: "badge",    color: "#80c040", size: 1, text: "Ch" },
  res_med:               { file: "icons/res_med.png",               shape: "cross",    color: "#e04040", size: 1 },
  res_biomass:           { file: "icons/res_biomass.png",           shape: "circle",   color: "#60c040", size: 1 },   // deferred resource (hidden)
  // ---- rarity frames (36x36, 2px border, transparent centre; drawn over the 36x36 item icon) ----
  frame_grey:            { file: "ui/frame_grey.png",               shape: "frame",    color: "#777",    size: 1, pad: 2 },
  frame_white:           { file: "ui/frame_white.png",              shape: "frame",    color: "#e8e8e8", size: 1, pad: 2 },
  frame_blue:            { file: "ui/frame_blue.png",               shape: "frame",    color: "#4a8cff", size: 1, pad: 2 },
  frame_yellow:          { file: "ui/frame_yellow.png",             shape: "frame",    color: "#ffd84a", size: 1, pad: 2 },
  // ---- building icons (64x64) ----
  bld_command_post:      { file: "buildings/bld_command_post.png",  shape: "square",   color: "#8a7a5a", size: 1 },
  bld_vault:             { file: "buildings/bld_vault.png",         shape: "square",   color: "#7a7a8a", size: 1 },
  bld_body_lab:          { file: "buildings/bld_body_lab.png",      shape: "square",   color: "#5a8a8a", size: 1 },
  bld_workshop:          { file: "buildings/bld_workshop.png",      shape: "square",   color: "#8a6a4a", size: 1 },
  bld_infirmary:         { file: "buildings/bld_infirmary.png",     shape: "square",   color: "#aa5a5a", size: 1 }
};
// Skill icons (32x32) are keyed skill_<skillId>; stat icons stat_<statId>; damage types dmg_<type>.
// They are auto-registered from DATA.skills / DATA.stats in js/sprites.js with a text-badge placeholder.
