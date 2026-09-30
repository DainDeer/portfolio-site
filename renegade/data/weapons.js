// Slice 4 §C: the weapon flood. 9 lootable weapon types (wtype), 12+ weapons each (the existing ones count and keep
// their stats). Stats are [DRAFT] fills inside Vixie's bands (slice-4.md §C3); names are [PLACEHOLDER] (§C4).
//
// Base fields added by Slice 4 (every weapon, data/items.js too):
//   wtype  pistol | rifle | auto | shotgun | bow | crossbow | blade | club | improvised   (art model + zone drop rules)
//   hands  1 | 2   (paper-doll pose, §F)
// DATA.items.wtypes[wt]: { name, style, skill, sprite, gun }
//   sprite: the one art model per wtype. A weapon uses its own item_<id> art when it has it (the Slice 1-3 weapons),
//   otherwise its type's sprite. wt_pistol / wt_rifle / wt_auto / wt_shotgun / wt_blade point at an existing weapon's
//   file until Smudge's type art lands; wt_bow / wt_crossbow / wt_club / wt_improvised are placeholders (pendingArt).
//   gun: true = a "gun" for DATA.items.zoneTypeWeight.
// Skills: bows / crossbows = Marksmanship (style "gun": they shoot); clubs / improvised = Brawling (style "fists"),
//   except the ones marked (b) in §C4 (Shovel, Broken Bottle) = Blades (style "blades"); blades = Blades.
// DATA.items.zoneTypeWeight[zone][wt]: multiplies dropWeight when loot rolls in that zone (missing = x1). Prefall guns
//   keep their low dropWeight on top of it.
// DATA.items.slotShares: loot first picks the slot by these weights (the Slice 3 totals: weapons 66, head 9, body 9,
//   backpack 7), then the base inside it by dropWeight x zoneTypeWeight x set bonus. Without this, ~100 new weapons
//   would crowd armour and packs out of every container. Set it to null to go back to one flat pool.
DATA.items.wtypes = {
  pistol:     { name: "Pistol",     style: "gun",    skill: "marksmanship", sprite: "wt_pistol",     gun: true },
  rifle:      { name: "Rifle",      style: "gun",    skill: "marksmanship", sprite: "wt_rifle",      gun: true },
  auto:       { name: "Automatic",  style: "gun",    skill: "marksmanship", sprite: "wt_auto",       gun: true },
  shotgun:    { name: "Shotgun",    style: "gun",    skill: "marksmanship", sprite: "wt_shotgun",    gun: true },
  bow:        { name: "Bow",        style: "gun",    skill: "marksmanship", sprite: "wt_bow" },
  crossbow:   { name: "Crossbow",   style: "gun",    skill: "marksmanship", sprite: "wt_crossbow" },
  blade:      { name: "Blade",      style: "blades", skill: "blades",       sprite: "wt_blade" },
  club:       { name: "Club",       style: "fists",  skill: "brawling",     sprite: "wt_club" },
  improvised: { name: "Improvised", style: "fists",  skill: "brawling",     sprite: "wt_improvised" }
};
DATA.items.zoneTypeWeight = {
  a: { pistol: 0.15, rifle: 0.15, auto: 0.15, shotgun: 0.15 },   // first zone (and the tutorial): guns are a lucky find
  b: { pistol: 0.6,  rifle: 0.6,  auto: 0.6,  shotgun: 0.6 }
};
DATA.items.slotShares = { weapon: 66, head: 9, body: 9, backpack: 7 };

// the Slice 1-3 weapons: type + hands (stats unchanged)
(function () {
  const B = DATA.items.bases;
  const set = { pipe_rifle: ["rifle", 2], nail_gun: ["auto", 1], scrap_smg: ["auto", 2], scav_carbine: ["rifle", 2], kalash_47: ["auto", 2], glokk_17: ["pistol", 1],
    m1912_colter: ["pistol", 1], remingon_870: ["shotgun", 2], ar16_stoner: ["auto", 2], rust_machete: ["blade", 1], militia_carbine: ["rifle", 2], hunter_longrifle: ["rifle", 2] };
  for (const id in set) if (B[id]) { B[id].wtype = set[id][0]; B[id].hands = set[id][1]; }
  if (B.knuckle_wraps) B.knuckle_wraps.hands = 1;   // fists: not part of the flood (no wtype)
  // natural weapons: hands only (paper-doll pose)
  for (const id in B) if (B[id].slot === "weapon" && B[id].natural && !B[id].hands) B[id].hands = B[id].style === "gun" && !/pistol|zapper/.test(id) ? 2 : 1;

  // the flood. Columns: id, name, hands, dmg, interval, range, acc, mag, reload, jam, weight, req, dropWeight, family, tag, sfx, style override
  // (per type: a fast-weak, a slow-heavy, an accurate, a sloppy and a light option; see the notes after each row)
  const T = {
    pistol: [
      ["zip_gun",          "Zip Gun",              1, 9,  0.9,  11, 50, 5,  2.4, 12, 0.6, 1,  4, "scrap",     null, "sfx_shot_scrap"],     // sloppy
      ["snub_38",          "Snub .38",             1, 10, 0.7,  11, 54, 5,  2.0, 5,  0.6, 2,  3, "wasteland", null, "sfx_shot_pistol"],    // light
      ["flare_pistol",     "Flare Pistol",         1, 13, 0.9,  12, 52, 5,  2.4, 6,  1.0, 3,  2, "wasteland", null, "sfx_shot_pistol"],    // slow heavy
      ["service_revolver", "Service Revolver",     1, 12, 0.8,  14, 58, 6,  2.2, 4,  1.3, 5,  2, "prefall",   null, "sfx_shot_pistol"],
      ["wasp_9mm",         "Wasp 9mm",             1, 6,  0.4,  13, 55, 15, 1.6, 7,  0.8, 4,  2, "wasteland", null, "sfx_shot_pistol"],    // fast weak
      ["bent_barrel",      "Bent-Barrel Special",  1, 8,  0.6,  11, 50, 8,  1.8, 11, 1.2, 1,  4, "scrap",     null, "sfx_shot_scrap"],     // sloppy
      ["pocket_derringer", "Pocket Derringer",     1, 11, 0.9,  11, 56, 5,  1.4, 5,  0.5, 2,  2, "prefall",   null, "sfx_shot_pistol"],    // light
      ["makar_pm",         "Makar PM",             1, 8,  0.55, 13, 60, 8,  1.5, 4,  0.7, 4,  2, "prefall",   null, "sfx_shot_pistol"],
      ["ranchero_50",      ".50 Ranchero",         1, 13, 0.85, 16, 55, 5,  2.4, 6,  1.6, 9,  1, "prefall",   null, "sfx_shot_pistol"],    // slow heavy
      ["whisper_22",       "Whisper .22",          1, 5,  0.45, 16, 62, 10, 1.6, 3,  0.7, 6,  1, "prefall",   null, "sfx_shot_pistol"]     // accurate
    ],
    rifle: [
      ["old_faithful",     "Old Faithful",         2, 20, 1.6,  34, 66, 5,  2.8, 5,  4.2, 6,  2, "wasteland", null, "sfx_shot_rifle"],     // bolt-action
      ["homestead_lever",  "Homestead Lever Rifle",2, 15, 1.1,  28, 62, 8,  2.6, 6,  3.6, 5,  2, "wasteland", null, "sfx_shot_rifle"],
      ["varmint_22",       "Varmint .22",          2, 9,  0.9,  30, 68, 10, 1.8, 4,  3.0, 3,  3, "wasteland", null, "sfx_shot_rifle"],     // accurate, light
      ["buckmaster",       "Buckmaster Hunting Rifle", 2, 24, 1.8, 38, 68, 4, 3.0, 4, 4.4, 9, 1, "prefall",  "pierce", "sfx_shot_longrifle"],
      ["moss_nagant",      "Moss-Nagant",          2, 22, 1.7,  36, 64, 5,  3.2, 6,  4.8, 8,  1, "prefall",   null, "sfx_shot_longrifle"],
      ["welded_musket",    "Welded Musket",        2, 26, 2.2,  22, 52, 1,  3.2, 18, 5.0, 2,  3, "scrap",     null, "sfx_shot_scrap"],     // slow heavy, sloppy
      ["longshot_dmr",     "Longshot DMR",         2, 18, 1.2,  40, 70, 10, 2.6, 3,  4.6, 12, 1, "prefall",   "pierce", "sfx_shot_longrifle"],
      ["folding_survival", "Folding Survival Rifle", 2, 11, 1.0, 24, 58, 8, 1.6, 8,  3.0, 2,  3, "wasteland", null, "sfx_shot_rifle"],     // light
      ["tube_plinker",     "Tube-Fed Plinker",     2, 9,  0.9,  22, 56, 10, 3.0, 10, 3.2, 1,  4, "scrap",     null, "sfx_shot_scrap"],     // fast weak
      ["fence_post_rifle", "Fence-Post Rifle",     2, 30, 2.2,  26, 54, 1,  3.0, 20, 5.0, 4,  3, "scrap",     null, "sfx_shot_scrap"]      // slow heavy
    ],
    auto: [
      ["tec_nein",         "Tec-Nein",             1, 4,  0.17, 12, 45, 32, 2.4, 18, 2.5, 3,  3, "wasteland", null, "sfx_shot_smg"],       // sloppy
      ["uzzy",             "Uzzy",                 1, 5,  0.18, 12, 50, 25, 2.2, 8,  2.3, 5,  2, "prefall",   null, "sfx_shot_smg"],       // light
      ["grease_gun",       "Grease Gun",           2, 7,  0.3,  16, 52, 30, 2.8, 10, 3.6, 5,  2, "prefall",   null, "sfx_shot_smg"],
      ["mp_fife",          "MP-Fife",              2, 6,  0.2,  20, 60, 30, 2.4, 5,  3.0, 8,  1, "prefall",   null, "sfx_shot_smg"],       // accurate
      ["squat_bullpup",    "Squat Bullpup",        2, 9,  0.28, 26, 56, 30, 2.6, 7,  3.4, 9,  1, "prefall",   null, "sfx_shot_rifle"],
      ["tommy_drum",       "Tommy Drum",           2, 8,  0.22, 16, 46, 40, 3.0, 12, 4.5, 7,  1, "prefall",   null, "sfx_shot_smg"],       // heavy, sloppy
      ["staple_launcher",  "Staple Launcher",      1, 3,  0.16, 9,  42, 40, 2.2, 22, 2.2, 1,  4, "scrap",     null, "sfx_shot_nail"],      // fast weak (a hair behind the Scrap SMG, which stays the extreme)
      ["rivet_gun",        "Rivet Gun",            2, 10, 0.35, 12, 48, 20, 3.0, 24, 4.2, 2,  3, "scrap",     null, "sfx_shot_nail"]       // slow heavy
    ],
    shotgun: [
      ["sawn_off",         "Sawn-Off",             1, 24, 1.0,  6,  55, 2,  2.6, 8,  2.4, 2,  3, "wasteland", "splash", "sfx_shot_shotgun"],
      ["grandpas_double",  "Grandpa's Double",     2, 22, 1.1,  8,  60, 2,  2.8, 5,  3.4, 3,  3, "wasteland", "splash", "sfx_shot_shotgun"],
      ["pipe_shotgun",     "Pipe Shotgun",         2, 20, 1.6,  7,  55, 1,  3.0, 15, 3.0, 1,  4, "scrap",     "splash", "sfx_shot_shotgun"],  // sloppy
      ["bossa_500",        "Bossa 500",            2, 18, 1.1,  9,  64, 6,  3.4, 5,  3.4, 6,  1, "prefall",   "splash", "sfx_shot_shotgun"],
      ["coach_gun",        "Coach Gun",            2, 21, 1.0,  8,  62, 2,  2.5, 4,  3.2, 4,  2, "wasteland", "splash", "sfx_shot_shotgun"],
      ["street_sweeper",   "Street Sweeper",       2, 16, 1.0,  7,  56, 8,  4.0, 10, 4.2, 7,  1, "prefall",   "splash", "sfx_shot_shotgun"],  // fast weak
      ["slug_thumper",     "Slug Thumper",         2, 28, 1.8,  10, 68, 4,  3.6, 5,  4.0, 9,  1, "prefall",   "pierce", "sfx_shot_shotgun"],  // accurate, slow heavy (slugs)
      ["blunderbuss",      "Blunderbuss",          2, 26, 1.8,  6,  55, 1,  4.0, 12, 4.2, 2,  3, "scrap",     "splash", "sfx_shot_shotgun"],  // slow heavy, sloppy
      ["flare_scattergun", "Flare Scattergun",     2, 17, 1.3,  9,  58, 3,  3.0, 9,  2.6, 3,  2, "wasteland", "splash", "sfx_shot_shotgun"],
      ["snake_charmer",    "Snake Charmer",        1, 16, 1.2,  6,  60, 1,  2.5, 4,  2.4, 2,  2, "prefall",   "splash", "sfx_shot_shotgun"],  // light
      ["pepperbox",        "Pepperbox",            1, 18, 1.0,  7,  57, 5,  3.8, 11, 2.8, 4,  2, "scrap",     "splash", "sfx_shot_shotgun"]
    ],
    bow: [
      ["stick_bow",        "Stick Bow",            2, 8,  1.2,  16, 55, 1,  0.8, 0,  0.6, 1,  5, "scrap",     null, "sfx_shot_bow_2"],     // sloppy
      ["recurve",          "Recurve",              2, 12, 1.1,  24, 64, 1,  0.6, 0,  1.0, 5,  2, "wasteland", null, "sfx_shot_bow_2"],
      ["compound_bow",     "Compound Bow",         2, 15, 1.2,  28, 68, 1,  0.6, 0,  1.6, 10, 1, "prefall",   "pierce", "sfx_shot_bow_3"],   // accurate
      ["longbow",          "Longbow",              2, 16, 1.6,  28, 62, 1,  0.8, 0,  1.4, 8,  1, "wasteland", null, "sfx_shot_bow_3"],     // slow heavy
      ["hunting_bow",      "Hunting Bow",          2, 13, 1.3,  24, 62, 1,  0.7, 0,  1.2, 6,  2, "wasteland", null, "sfx_shot_bow_1"],
      ["pvc_bow",          "PVC Bow",              2, 9,  1.0,  18, 56, 1,  0.6, 0,  0.7, 1,  4, "scrap",     null, "sfx_shot_bow_2"],     // fast weak
      ["ski_pole_bow",     "Ski-Pole Bow",         2, 11, 1.5,  20, 55, 1,  0.8, 0,  1.3, 2,  3, "scrap",     null, "sfx_shot_bow_1"],     // sloppy
      ["horse_bow",        "Horse Bow",            2, 10, 1.0,  18, 60, 1,  0.5, 0,  0.8, 3,  2, "wasteland", null, "sfx_shot_bow_2"],     // fast
      ["takedown_bow",     "Takedown Bow",         2, 12, 1.2,  22, 66, 1,  0.6, 0,  1.1, 6,  2, "prefall",   null, "sfx_shot_bow_1"],     // accurate
      ["kids_archery_bow", "Kid's Archery Bow",    2, 8,  1.0,  16, 58, 1,  0.5, 0,  0.6, 1,  4, "prefall",   null, "sfx_shot_bow_2"],     // light
      ["leaf_spring_bow",  "Leaf-Spring Bow",      2, 16, 1.6,  22, 56, 1,  0.8, 0,  1.6, 4,  3, "scrap",     null, "sfx_shot_bow_3"],     // slow heavy
      ["owlfeather_bow",   "Owlfeather Bow",       2, 14, 1.1,  26, 68, 1,  0.6, 0,  0.9, 11, 1, "wasteland", "pierce", "sfx_shot_bow_1"]
    ],
    crossbow: [
      ["hand_crossbow",    "Hand Crossbow",        1, 14, 1.6,  18, 62, 1,  1.8, 0,  1.5, 2,  3, "wasteland", null, "sfx_shot_crossbow"],  // light, fast
      ["pistol_crossbow",  "Pistol Crossbow",      1, 15, 1.7,  18, 64, 1,  2.0, 0,  1.6, 3,  3, "prefall",   "pierce", "sfx_shot_crossbow"],
      ["rebar_crossbow",   "Rebar Crossbow",       2, 22, 2.4,  22, 60, 1,  2.8, 0,  3.6, 3,  3, "scrap",     "pierce", "sfx_shot_crossbow"],
      ["hunting_crossbow", "Hunting Crossbow",     2, 20, 2.0,  26, 68, 1,  2.2, 0,  2.8, 6,  2, "prefall",   "pierce", "sfx_shot_crossbow"],
      ["repeater_crossbow","Repeater",             2, 14, 1.6,  20, 62, 3,  2.8, 0,  2.6, 5,  2, "wasteland", null, "sfx_shot_crossbow"],  // fast weak (mag 3)
      ["garage_door_crossbow", "Garage-Door Crossbow", 2, 26, 2.6, 20, 60, 1, 2.8, 0, 3.8, 4, 3, "scrap",   "pierce", "sfx_shot_crossbow"],  // slow heavy, sloppy
      ["heavy_arbalest",   "Heavy Arbalest",       2, 26, 2.6,  30, 70, 1,  2.8, 0,  3.8, 11, 1, "prefall",   "pierce", "sfx_shot_crossbow"],
      ["compound_crossbow","Compound Crossbow",    2, 22, 1.8,  28, 72, 1,  2.0, 0,  3.0, 12, 1, "prefall",   "pierce", "sfx_shot_crossbow"],  // accurate
      ["bolt_thrower",     "Bolt Thrower",         2, 18, 1.8,  24, 64, 2,  2.4, 0,  3.2, 7,  1, "wasteland", "pierce", "sfx_shot_crossbow"],
      ["speargun",         "Speargun",             2, 24, 2.2,  18, 66, 1,  2.6, 0,  2.4, 5,  2, "prefall",   "pierce", "sfx_shot_crossbow"],
      ["nailbow",          "Nailbow",              2, 16, 1.7,  22, 60, 2,  2.2, 0,  2.0, 2,  3, "scrap",     null, "sfx_shot_crossbow"],
      ["tripwire_crossbow","Tripwire Crossbow",    2, 19, 2.2,  20, 61, 1,  2.0, 0,  1.8, 2,  3, "scrap",     null, "sfx_shot_crossbow"]   // light
    ],
    blade: [
      ["kitchen_knife",    "Kitchen Knife",        1, 7,  0.5,  1.2, 66, 0, 0, 0,  0.3, 1,  5, "wasteland", "bleed", "sfx_melee_hit"],    // fast weak, light
      ["hatchet",          "Hatchet",              1, 12, 0.8,  1.4, 64, 0, 0, 0,  1.2, 3,  3, "wasteland", "bleed", "sfx_melee_hit"],
      ["cleaver",          "Cleaver",              1, 13, 0.85, 1.3, 60, 0, 0, 0,  1.0, 3,  3, "wasteland", "bleed", "sfx_melee_hit"],    // sloppy
      ["box_cutter",       "Box Cutter",           1, 8,  0.55, 1.2, 60, 0, 0, 0,  0.3, 1,  5, "scrap",     "bleed", "sfx_melee_hit"],
      ["bayonet",          "Bayonet",              1, 10, 0.7,  1.8, 66, 0, 0, 0,  0.6, 4,  2, "prefall",   "bleed", "sfx_melee_hit"],    // reach
      ["hunting_knife",    "Hunting Knife",        1, 10, 0.6,  1.3, 70, 0, 0, 0,  0.5, 4,  3, "wasteland", "bleed", "sfx_melee_hit"],    // accurate
      ["mall_ninja_katana","Mall-Ninja Katana",    2, 15, 0.9,  1.8, 62, 0, 0, 0,  2.2, 9,  1, "prefall",   "bleed", "sfx_melee_hit"],
      ["sickle",           "Sickle",               1, 9,  0.6,  1.5, 61, 0, 0, 0,  0.8, 2,  3, "wasteland", "bleed", "sfx_melee_hit"],
      ["fire_axe",         "Fire Axe",             2, 15, 0.95, 1.7, 60, 0, 0, 0,  3.0, 8,  2, "prefall",   "bleed", "sfx_melee_hit"],    // slow heavy
      ["saw_blade_sword",  "Saw-Blade Sword",      1, 14, 0.9,  1.6, 60, 0, 0, 0,  2.6, 6,  2, "scrap",     "bleed", "sfx_melee_hit"],    // sloppy, heavy
      ["survival_knife",   "Survival Knife",       1, 8,  0.5,  1.2, 72, 0, 0, 0,  0.4, 5,  2, "prefall",   "bleed", "sfx_melee_hit"]     // accurate, light
    ],
    club: [
      ["baseball_bat",     "Baseball Bat",         2, 12, 1.0,  1.7, 64, 0, 0, 0,  1.0, 2,  4, "wasteland", "stagger", "sfx_bonk_1"],
      ["nail_bat",         "Nail Bat",             2, 14, 1.1,  1.7, 60, 0, 0, 0,  1.2, 3,  3, "scrap",     "stagger", "sfx_bonk_1"],
      ["cricket_bat",      "Cricket Bat",          2, 13, 1.1,  1.8, 66, 0, 0, 0,  1.3, 3,  2, "prefall",   "stagger", "sfx_bonk_1"],
      ["tire_iron",        "Tire Iron",            1, 10, 0.8,  1.4, 64, 0, 0, 0,  1.0, 1,  4, "scrap",     "stagger", "sfx_bonk_2"],       // fast weak
      ["crowbar",          "Crowbar",              1, 12, 0.9,  1.5, 62, 0, 0, 0,  1.5, 2,  4, "wasteland", "stagger", "sfx_bonk_2"],
      ["lead_pipe",        "Lead Pipe",            1, 13, 1.0,  1.5, 58, 0, 0, 0,  2.0, 2,  4, "scrap",     "stagger", "sfx_bonk_2"],       // sloppy
      ["hockey_stick",     "Hockey Stick",         2, 10, 0.9,  2.0, 62, 0, 0, 0,  0.9, 2,  3, "prefall",   "stagger", "sfx_bonk_1"],       // reach, light
      ["nine_iron",        "9-Iron",               1, 11, 0.9,  1.9, 66, 0, 0, 0,  0.8, 3,  2, "prefall",   "stagger", "sfx_bonk_2"],       // accurate, light
      ["sledgehammer",     "Sledgehammer",         2, 19, 1.4,  1.8, 58, 0, 0, 0,  6.0, 8,  2, "wasteland", "stagger", "sfx_bonk_3"],       // slow heavy
      ["rolling_pin",      "Rolling Pin",          1, 9,  0.9,  1.3, 61, 0, 0, 0,  0.9, 1,  4, "wasteland", "stagger", "sfx_bonk_1"],
      ["meat_tenderizer",  "Meat Tenderizer",      1, 14, 1.0,  1.3, 62, 0, 0, 0,  1.4, 4,  3, "wasteland", "stagger", "sfx_bonk_3"],
      ["police_baton",     "Police Baton",         1, 11, 0.8,  1.5, 70, 0, 0, 0,  0.8, 5,  2, "prefall",   "stagger", "sfx_bonk_2"]        // accurate
    ],
    improvised: [
      ["frying_pan",       "Frying Pan",           1, 9,  0.9,  1.2, 60, 0, 0, 0,  1.6, 1,  5, "wasteland", "stagger", "sfx_bonk_2"],
      ["garden_rake",      "Garden Rake",          2, 8,  1.1,  1.9, 54, 0, 0, 0,  2.0, 1,  4, "scrap",     "bleed",   "sfx_bonk_3"],       // reach, sloppy
      ["shovel",           "Shovel",               2, 11, 1.1,  1.8, 58, 0, 0, 0,  2.5, 2,  4, "scrap",     "bleed",   "sfx_bonk_3", "blades"],   // (b)
      ["broken_bottle",    "Broken Bottle",        1, 7,  0.6,  1.0, 58, 0, 0, 0,  0.3, 1,  5, "scrap",     "bleed",   "sfx_melee_hit", "blades"], // (b) fast weak, light
      ["stop_sign",        "Stop Sign",            2, 12, 1.3,  1.9, 52, 0, 0, 0,  4.0, 3,  2, "scrap",     "stagger", "sfx_bonk_2"],       // slow heavy, sloppy
      ["bike_chain",       "Bike Chain",           1, 8,  0.7,  1.6, 56, 0, 0, 0,  1.2, 1,  4, "scrap",     "bleed",   "sfx_bonk_2"],
      ["big_wrench",       "Big Wrench",           1, 11, 1.1,  1.3, 58, 0, 0, 0,  3.0, 2,  3, "wasteland", "stagger", "sfx_bonk_3"],
      ["toilet_seat",      "Toilet Seat",          1, 6,  0.8,  1.2, 55, 0, 0, 0,  1.4, 1,  3, "scrap",     "stagger", "sfx_bonk_1"],
      ["bass_guitar",      "Bass Guitar",          2, 13, 1.3,  1.8, 56, 0, 0, 0,  5.0, 4,  1, "prefall",   "stagger", "sfx_bonk_bass"],    // the heaviest-hitting junk weapon, obviously
      ["snow_globe",       "Snow Globe",           1, 7,  0.8,  1.0, 62, 0, 0, 0,  0.8, 1,  2, "prefall",   "bleed",   "sfx_melee_hit"],
      ["pool_cue",         "Pool Cue",             2, 7,  0.7,  1.9, 65, 0, 0, 0,  0.6, 2,  3, "prefall",   "stagger", "sfx_bonk_1"],       // accurate, light
      ["garden_gnome",     "Garden Gnome",         1, 10, 1.2,  1.1, 52, 0, 0, 0,  2.2, 1,  2, "wasteland", "stagger", "sfx_bonk_1"]
    ]
  };
  const W = DATA.items.wtypes;
  for (const wt in T) for (const r of T[wt]) {
    const [id, name, hands, dmg, interval, range, acc, mag, reload, jam, weight, req, dropWeight, family, tag, sfx, style] = r;
    if (B[id]) throw new Error("weapon id clash: " + id);
    const st = style || W[wt].style;
    B[id] = { name, slot: "weapon", family, style: st, skill: st === "blades" ? "blades" : W[wt].skill, dmg, type: "kinetic", interval, range, acc, mag, reload, jam, weight, req, dropWeight,
      sfx, wtype: wt, hands, sprite: W[wt].sprite };
    if (tag) B[id].tag = tag;
  }
})();
