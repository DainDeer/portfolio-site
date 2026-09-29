// §10 Loot. Base templates are item-level-1 values; stats scale by (1 + 0.06*(ilvl-1)).
// Gun names are lightly altered real guns (§10.4) and are [PLACEHOLDER]-swappable here.
window.DATA = window.DATA || {};
DATA.items = {
  questColor: "#e8c060",   // Slice 2: quest items show in gold
  rarities: {
    grey:   { name: "Scrap",    color: "#8a8a8a", affixes: 0, tiers: [],                     weight: 0,   enabled: false },
    white:  { name: "Standard", color: "#e8e8e8", affixes: 1, tiers: ["basic"],              weight: 80,  enabled: true },
    blue:   { name: "Tuned",    color: "#4a8cff", affixes: 2, tiers: ["basic", "advanced"],  weight: 14,  enabled: true },
    yellow: { name: "Advanced", color: "#ffd84a", affixes: 3, tiers: ["basic", "advanced"],  weight: 4.5, enabled: true },
    purple: { name: "Masterwork", color: "#b060ff", affixes: 4, tiers: ["basic", "advanced", "complex"], weight: 1.2, enabled: false },
    orange: { name: "Prototype",  color: "#ff8a30", affixes: 4, tiers: ["basic", "advanced", "complex"], weight: 0.3, enabled: false }
  },
  // First tier listed = basic slot, rest advanced (blue: 1 basic + 1 advanced, yellow: 1 basic + 2 advanced) — ASSUMPTION
  rarityAffixTiers: { white: ["basic"], blue: ["basic", "advanced"], yellow: ["basic", "advanced", "advanced"] },

  // slot: weapon | head | body | backpack ; skill = feeder skill for weapons ; style: gun|blades|fists|feral
  bases: {
    pipe_rifle:    { name: "Pipe Rifle",        slot: "weapon", family: "scrap",     style: "gun",    skill: "marksmanship", dmg: 11, type: "kinetic", interval: 1.1, range: 20, acc: 50, mag: 1,  reload: 1.5, jam: 20, weight: 4.0, req: 1,  dropWeight: 10, sfx: "sfx_shot_scrap" },
    nail_gun:      { name: "Nail Gun",          slot: "weapon", family: "scrap",     style: "gun",    skill: "marksmanship", dmg: 4,  type: "kinetic", interval: 0.35,range: 10, acc: 45, mag: 20, reload: 2.5, jam: 16, weight: 3.0, req: 1,  dropWeight: 8,  sfx: "sfx_shot_scrap" },
    scrap_smg:     { name: "Scrap SMG",         slot: "weapon", family: "scrap",     style: "gun",    skill: "marksmanship", dmg: 3,  type: "kinetic", interval: 0.15,range: 8,  acc: 45, mag: 30, reload: 2.4, jam: 26, weight: 2.8, req: 1,  dropWeight: 10, sprite: "item_scrap_smg", sfx: "sfx_shot_scrap" }, // approved (design owner, Slice 1): common (drop weight = Pipe Rifle), rolls rarity like any base. High fire rate, low damage/hit, highest jam, short range
    scav_carbine:  { name: "Scav Carbine",      slot: "weapon", family: "wasteland", style: "gun",    skill: "marksmanship", dmg: 9,  type: "kinetic", interval: 1.0, range: 25, acc: 60, mag: 10, reload: 2.2, jam: 12, weight: 3.5, req: 5,  dropWeight: 7,  sfx: "sfx_shot_rifle" },
    kalash_47:     { name: "Kalash-47",         slot: "weapon", family: "prefall",   style: "gun",    skill: "marksmanship", dmg: 11, type: "kinetic", interval: 0.25,range: 30, acc: 55, mag: 30, reload: 2.5, jam: 4,  weight: 4.3, req: 10, dropWeight: 2,  sfx: "sfx_shot_rifle" },
    glokk_17:      { name: "Glokk 17",          slot: "weapon", family: "prefall",   style: "gun",    skill: "marksmanship", dmg: 7,  type: "kinetic", interval: 0.45,range: 15, acc: 60, mag: 17, reload: 1.5, jam: 3,  weight: 0.9, req: 3,  dropWeight: 5,  sfx: "sfx_shot_pistol" },
    m1912_colter:  { name: "M1912 \"Colter\"",  slot: "weapon", family: "prefall",   style: "gun",    skill: "marksmanship", dmg: 11, type: "kinetic", interval: 0.6, range: 15, acc: 58, mag: 7,  reload: 1.8, jam: 4,  weight: 1.1, req: 3,  dropWeight: 4,  sfx: "sfx_shot_pistol" },
    remingon_870:  { name: "Remingon 870",      slot: "weapon", family: "prefall",   style: "gun",    skill: "marksmanship", dmg: 22, type: "kinetic", interval: 1.2, range: 9,  acc: 65, mag: 6,  reload: 3.5, jam: 4,  weight: 3.6, req: 6,  dropWeight: 3,  tag: "splash", sfx: "sfx_shot_shotgun" },
    ar16_stoner:   { name: "AR-16 \"Stoner\"",  slot: "weapon", family: "prefall",   style: "gun",    skill: "marksmanship", dmg: 7,  type: "kinetic", interval: 0.3, range: 32, acc: 62, mag: 30, reload: 2.3, jam: 5,  weight: 3.3, req: 10, dropWeight: 2,  sfx: "sfx_shot_rifle" },
    rust_machete:  { name: "Rust Machete",      slot: "weapon", family: "wasteland", style: "blades", skill: "blades",       dmg: 11, type: "kinetic", interval: 0.7, range: 1.5,acc: 65, mag: 0,  reload: 0,   jam: 0,  weight: 1.5, req: 1,  dropWeight: 8,  tag: "bleed", sfx: "sfx_melee_hit" },
    knuckle_wraps: { name: "Knuckle Wraps",     slot: "weapon", family: "wasteland", style: "fists",  skill: "brawling",     dmg: 7,  type: "kinetic", interval: 0.6, range: 1.0,acc: 70, mag: 0,  reload: 0,   jam: 0,  weight: 0.3, req: 1,  dropWeight: 6,  tag: "stagger", sfx: "sfx_melee_hit" },
    scrap_helmet:  { name: "Scrap Helmet",      slot: "head",     armor: 1, domedBonus: 3, weight: 1.2, req: 0, dropWeight: 7 },
    padded_vest:   { name: "Padded Vest",       slot: "body",     armor: 2, weight: 3.0, req: 0, dropWeight: 7 },
    school_bag:    { name: "School Bag",        slot: "backpack", carryKg: 8,  weight: 0.8, req: 0, dropWeight: 4, noScale: true },
    military_ruck: { name: "Military Ruck",     slot: "backpack", carryKg: 20, moveSpeedPct: -3, weight: 2.0, req: 0, dropWeight: 2, noScale: true },
    // quest items (Slice 2 §9): weigh something, carried in the bag only (never the Secure Pouch), lost on death
    quest_pump_valve:  { name: "Pump valve",    slot: "quest", quest: "dunn_pump_house", weight: 3,   dropWeight: 0, noScale: true, sprite: "item_quest_valve" },
    quest_ilse_ledger: { name: "Ilse's ledger", slot: "quest", quest: "ilse_ledger",     weight: 0.5, dropWeight: 0, noScale: true, sprite: "item_quest_ledger" },
    // natural / enemy weapons (not lootable: dropWeight 0)
    nat_fists:     { name: "Fists",             slot: "weapon", natural: true, style: "fists",  skill: "brawling",     dmg: 4, type: "kinetic", interval: 0.7, range: 1.0, acc: 65, mag: 0, reload: 0, jam: 0, weight: 0, dropWeight: 0, sprite: "item_fists", sfx: "sfx_melee_hit" },
    nat_shiv:      { name: "Shiv",              slot: "weapon", natural: true, style: "blades", skill: "blades",       dmg: 6, type: "kinetic", interval: 0.6, range: 1.2, acc: 65, mag: 0, reload: 0, jam: 0, weight: 0, dropWeight: 0, sprite: "item_rust_machete", sfx: "sfx_melee_hit" },
    nat_pistol:    { name: "Scrap Pistol",      slot: "weapon", natural: true, style: "gun",    skill: "marksmanship", dmg: 6, type: "kinetic", interval: 0.8, range: 12, acc: 50, mag: 6, reload: 2.0, jam: 8, weight: 0, dropWeight: 0, sprite: "item_glokk_17", sfx: "sfx_shot_pistol" },
    bone_claws:    { name: "Bone Claws",        slot: "weapon", natural: true, style: "feral",  skill: "feral",        dmg: 7, type: "bio", interval: 0.8, range: 1.2, acc: 65, mag: 0, reload: 0, jam: 0, weight: 0, dropWeight: 0, sfx: "sfx_claw" },
    maw_bite:      { name: "Maw Bite",          slot: "weapon", natural: true, style: "feral",  skill: "feral",        dmg: 20,type: "bio", interval: 1.4, range: 1.8, acc: 60, mag: 0, reload: 0, jam: 0, weight: 0, dropWeight: 0, sprite: "item_bone_claws", sfx: "sfx_claw" },
    acid_gland:    { name: "Acid Gland",        slot: "weapon", natural: true, style: "gun",    skill: "feral",        dmg: 9, type: "bio", interval: 1.6, range: 12, acc: 55, mag: 0, reload: 0, jam: 0, weight: 0, dropWeight: 0, projectile: "fx_acid", sfx: "sfx_acid" }
  },

  // §10.3 affixes: one line each. value range at ilvl 1; scales with ilvl if scales:true.
  affixes: {
    // basic
    flat_hp:       { tier: "basic",    label: "+{v} Max HP",         stat: "max_hp",      min: 8,  max: 16, scales: true,  slots: ["weapon", "head", "body", "backpack"] },
    flat_armor:    { tier: "basic",    label: "+{v} Armor",          stat: "armor",       min: 1,  max: 3,  scales: true,  slots: ["head", "body"] },
    flat_accuracy: { tier: "basic",    label: "+{v} Accuracy",       stat: "accuracy",    min: 3,  max: 6,  scales: true,  slots: ["weapon", "head"] },
    flat_carry:    { tier: "basic",    label: "+{v} kg carry",       stat: "carry_kg",    min: 4,  max: 8,  scales: false, slots: ["body", "backpack", "weapon"] },
    flat_evasion:  { tier: "basic",    label: "+{v} Evasion",        stat: "evasion",     min: 2,  max: 5,  scales: true,  slots: ["head", "body"] },
    check_skill:   { tier: "basic",    label: "+{v} {skill} (checks)", stat: "check_skill", min: 2, max: 5, scales: false, slots: ["head", "body", "backpack"],
                     skills: ["stealth", "perception", "scavenging", "persuasion", "hauling", "athletics", "survival"] },
    // advanced (blue+)
    pct_attack_speed: { tier: "advanced", label: "+{v}% Attack Speed", stat: "attack_speed", min: 5, max: 10, scales: false, slots: ["weapon", "body"] },
    pct_jam:          { tier: "advanced", label: "-{v}% jam chance",   stat: "jam_pct",      min: 20, max: 35, scales: false, slots: ["weapon"], gunOnly: true },
    magazine:         { tier: "advanced", label: "+{v} magazine",      stat: "magazine",     min: 2, max: 3,  scales: false, slots: ["weapon"], gunOnly: true },
    pct_move:         { tier: "advanced", label: "+{v}% Move Speed",   stat: "move_speed_pct", min: 3, max: 6, scales: false, slots: ["body", "backpack", "head"] },
    pct_damage:       { tier: "advanced", label: "+{v}% Damage",       stat: "damage_pct",   min: 5, max: 12, scales: false, slots: ["weapon"] },
    pct_crit:         { tier: "advanced", label: "+{v}% Crit Chance",  stat: "crit_chance",  min: 3, max: 6,  scales: false, slots: ["weapon", "head"] },
    adds_pierce:      { tier: "advanced", label: "adds Pierce",        stat: "tag_pierce",   min: 1, max: 1,  scales: false, slots: ["weapon"], gunOnly: true }
  },
  // §7.4 weapon tags used in slice
  tags: {
    splash:  { radiusM: 2, pct: 50 },
    pierce:  { armorIgnorePct: 50 },
    bleed:   { pctOfHit: 30, durationSec: 3 },
    stagger: { everyNthHit: 3, interruptSec: 0.6 }
  },
  // resources: defined in data/resources.js (Slice 2: 7 resources); aliased here so existing paths keep working
  resources: DATA.resources,
  startingStash: { resources: { food: 0, water: 0, scrap: 0, cloth: 0, electronics: 0, chemicals: 0, med: 2 }, items: [] },
  startingGear: { weapon: { base: "pipe_rifle", rarity: "white", ilvl: 1 } } // "starter gear" for the Basic body (§3.5)
};
