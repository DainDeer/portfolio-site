// §3 Bodies: families, classes, specialties, quirks, human roll templates. Numbers [DRAFT].
window.DATA = window.DATA || {};
DATA.bodies = {
  families: {
    basic: { name: "Basic", deployCost: 1, skillCap: 20, bodyLevelCap: 10, restoreBaseSec: 0,   xpMult: 1 },
    human: { name: "Human", deployCost: 3, skillCap: 60, bodyLevelCap: 60, restoreBaseSec: 120, xpMult: 1 } // slice: 2 min (doc: 1-2 h)
  },
  basicBody: {
    name: "Basic Body", family: "basic", cls: null, sprite: "unit_basic",
    stats: { max_hp: 90, armor: 0, evasion: 0, move_speed: 4.5, crit_chance: 5, crit_damage: 150 },
    skills: {}, // all body skills 1 ("no stats")
    naturalWeapon: "nat_fists", ai: "melee"
  },
  classes: {
    vanguard: { name: "Vanguard", sprite: "unit_vanguard", ai: "melee",  naturalWeapon: "nat_fists",
                stats: { max_hp: 210, armor: 4, evasion: 0, move_speed: 4.0, crit_chance: 5, crit_damage: 150 },
                specialties: ["bulwark", "breacher"] },
    striker:  { name: "Striker",  sprite: "unit_striker",  ai: "melee",  naturalWeapon: "nat_shiv",
                stats: { max_hp: 150, armor: 1, evasion: 5, move_speed: 5.5, crit_chance: 10, crit_damage: 160 },
                specialties: ["butcher", "duelist"] },
    gunner:   { name: "Gunner",   sprite: "unit_gunner",   ai: "ranged", naturalWeapon: "nat_pistol",
                stats: { max_hp: 135, armor: 1, evasion: 3, move_speed: 4.5, crit_chance: 8, crit_damage: 150 },
                specialties: ["marksman", "suppressor"] },
    medic:    { name: "Medic",    sprite: "unit_medic",    ai: "support",naturalWeapon: "nat_pistol",
                stats: { max_hp: 128, armor: 1, evasion: 4, move_speed: 4.6, crit_chance: 5, crit_damage: 150 },
                specialties: ["field_surgeon", "chemist"] }
  },
  // Each specialty = its doc-described trick (§3.2). Passives here; the actives (Slice 3 §2) are in data/abilities.js (bySpec).
  specialties: {
    bulwark:       { name: "Bulwark",       desc: "Takes hits for nearby allies.", passive: { type: "intercept", radiusM: 3, pct: 30 },
                     skills: { brawling: 14, endurance: 14, hauling: 10, acrobatics: 4 } },
    breacher:      { name: "Breacher",      desc: "Charges and knocks down.",
                     skills: { brawling: 20, endurance: 15, hauling: 12 } },
    butcher:       { name: "Butcher",       desc: "Bleeds, gore finishers.", passive: { type: "bleed", pctOfHit: 30, durationSec: 3, finisherGib: true },
                     skills: { blades: 18, athletics: 12, endurance: 8 } },
    duelist:       { name: "Duelist",       desc: "Parries melee attacks (contested Blades vs attacker weapon skill).", passive: { type: "parry" },
                     skills: { blades: 20, acrobatics: 14, athletics: 8 } },
    marksman:      { name: "Marksman",      desc: "Called headshots on the highest-value target.",
                     skills: { marksmanship: 18, perception: 12, athletics: 8 } },
    suppressor:    { name: "Suppressor",    desc: "Slows targets under fire.", passive: { type: "slow", pct: 30, durationSec: 2 },
                     skills: { marksmanship: 16, endurance: 10, hauling: 10 } },
    field_surgeon: { name: "Field Surgeon", desc: "Heals allies below 40% (Field heal roll); stabilizes Critical allies.",
                     skills: { endurance: 10, perception: 10, blades: 6, marksmanship: 6 } },
    chemist:       { name: "Chemist",       desc: "Combat stims: +Attack Speed to an ally.",
                     skills: { endurance: 8, perception: 8, marksmanship: 10, acrobatics: 6 } }
  },
  // §3.3 example quirks (Slice 1 pool). Human bodies roll quirksPerBody.
  quirks: {
    steady_breath: { name: "Steady Breath", desc: "The first shot each battle can't miss.", effect: "first_shot_hits" },
    thick_neck:    { name: "Thick Neck",    desc: "Half Domed chance.", effect: "half_domed" },
    light_frame:   { name: "Light Frame",   desc: "-5 kg carry base.", effect: "carry_base", value: -5 },
    calm_hands:    { name: "Calm Hands",    desc: "Field heals can't fail.", effect: "heals_cant_fail" }
  },
  humanRoll: {
    offerCount: [2, 3],        // pick 1 of 2-3 after first extraction
    classPool: ["vanguard", "striker", "gunner", "medic"],
    distinctClasses: true,
    skillVariance: 3,          // +/- on each spread value
    quirksPerBody: [1, 2],
    // names/pasts are [PLACEHOLDER]
    names: ["Rook", "Vesna", "Kit", "Ansel", "Mara", "Dusk", "Tobin", "Ines", "Garr", "Sable", "Oren", "Petra", "Juno", "Hale"],
    pasts: ["ex-militia", "dock brawler", "rooftop runner", "ward orderly", "salvage diver", "caravan guard", "pit fighter", "hospital porter", "convoy medic", "trapper"]
  },
  grunt: {
    name: "Grunt", sprite: "unit_grunt", ai: "auto", deployCost: 1, rank: "grunt",
    stats: { max_hp: 75, armor: 0, evasion: 2, move_speed: 4.2, crit_chance: 5, crit_damage: 150 },
    skills: { marksmanship: 5, blades: 4, athletics: 3, acrobatics: 3, endurance: 3 },
    weapons: ["pipe_rifle", "rust_machete"],  // random pick at recruit: the Grunt's own weapon when nothing is equipped
    // Megan's playtest: every Grunt gets a random name at recruit (renameable from the roster). [PLACEHOLDER] list.
    names: ["Rust", "Ash", "Moss", "Tallow", "Grit", "Nails", "Jinx", "Scab", "Dutch", "Mags", "Cinder", "Wick", "Bones",
            "Lark", "Hatch", "Rivet", "Sprocket", "Patch", "Tully", "Marrow", "Crow", "Dace", "Nettle", "Sloan", "Kestrel",
            "Hobb", "Ivy", "Brick", "Fen", "Rook", "Tarn", "Slate", "Vee", "Quill", "Bram", "Juniper", "Knox", "Skiv", "Pike", "Ember"]
  }
};
// Core allies are "later" in Slice 1, but Critical/Domed (§9.4) is implemented for rank "core".
// The debug panel can add this test ally to exercise Critical / Domed / Med Supplies choices.
DATA.bodies.coreAllyTest = {
  name: "Test Core Ally", sprite: "unit_grunt", ai: "auto", deployCost: 3, rank: "core",
  stats: { max_hp: 120, armor: 1, evasion: 3, move_speed: 4.4, crit_chance: 6, crit_damage: 150 },
  skills: { marksmanship: 12, blades: 8, athletics: 8, acrobatics: 8, endurance: 10 },
  weapons: ["scav_carbine"]
};
// §9.4 post-battle choices for Critical allies
DATA.bodies.criticalCare = { healMed: 2, healHpPct: 60, stabilizeMed: 1, stabilizeHpPct: 25, carryKg: 30, rallyHpPct: 20 };
