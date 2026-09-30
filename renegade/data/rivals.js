// Slice 3 §7 rival snapshots (async ghosts, no server). A snapshot is a self-contained JSON record (doc §7.7), schema
// `version` below. Seeded ones are hand-made [PLACEHOLDER handles]; "own echoes" are recorded from your squad at every
// extraction and death (the last `echoes.keep`). Numbers [DRAFT].
//   snapshot: { version, id, handle, source: "seeded" | "own", zone, tier, heat, deployScore, createdRun,
//     units: [{ kind: "body" | "grunt" | "core", name, nickname, cls, spec, bodyLevel, skills: { skill: level }, quirks,
//               tplKey ("grunt" | "veteran", allies), weapon (an ally's own weapon base), gear: [{ slot, base, rarity, ilvl, affixes }],
//               traits, abilities }],
//     layout: [{ cx, cy }] (one placement cell per unit, in YOUR side's grid; mirrored onto the enemy side in the fight) }
// deployScore: the squad's deploy score when it was recorded (ASSUMPTION: the table's "Deploy" = the rival's score).
window.DATA = window.DATA || {};
DATA.rivals = {
  version: 1,
  enabled: true,
  // encounter: entering a new location (not the insertion point, an extraction or Hollow Creek), at most 1 per run, never in the tutorial
  zones: ["b"],        // follow-up (Vixie): no rivals in Zone A at all (they slowed the early town too much)
  minExtractions: 3,   // natural rivals (and Radio-marked ones) only once you've extracted this many times; debug / sim forcing ignores it
  encounterPct: 7,   // Slice 3 §11 tuning (milestone 5): 2.5 -> 7, target "about 1 per 7 runs" (5 gave 1 per 9.8 Zone B runs)
  echoes: { keep: 10, fromRun: 6, sharePct: 40, prefix: "Echo of " },
  // options: Ambush (success: they're frozen at the start), Hide (success: skip), Parley (success: intel; crit: + 1 item from
  // their pack; fail: they leave; bad fail: they ambush you). A failed Ambush / Hide is a normal Engage.
  ambush: { skill: "stealth", dc: 14, freezeSec: 3 },
  hide: { skill: "stealth", dc: 13 },
  parley: { skill: "persuasion", dc: 15, revealNearest: 3, freezeSec: 3 },
  // loot: each rival unit leaves a body with its equipped gear (the rival body's weapon always, other slots at otherSlotPct),
  // item level capped at the location's item level + ilvlCapPlus; plus a Rival's pack (searchables.rival_pack)
  loot: { bodyWeaponPct: 100, otherSlotPct: 50, ilvlCapPlus: 4 },
  // Radio intel (§10b): before each run a rival is pre-rolled for one unlocked zone; with the Radio built that zone's rival
  // chance is x intelMult for the run (L2: its location is marked and the rival is there for sure)
  intelMult: 2,
  // rival units' damage / max HP multipliers (1 = the snapshot as recorded; their better gear stays: it's the loot draw).
  // Design call (milestone 5): 0.45 / 0.65 (sweep: 0.5 / 0.7 -> 35.0% of matched-rival fights lost, 0.35 / 0.6 -> 22.6%)
  scale: { dmg: 0.65, hp: 0.85 },   // follow-up (Vixie): 0.75 / 0.95 -> 0.65 / 0.85, not re-swept; milestone 5: 0.45 / 0.65 -> 0.75 / 0.95 (Break away + battle Med kits dropped matched-rival losses to 13%; target 25-35%)
  seeded: [
    { version: 1, id: "r_sable9", handle: "SABLE-9", source: "seeded", zone: "a", tier: 1, heat: 22, deployScore: 5, createdRun: 0,
      units: [
        { kind: "body", name: "SABLE-9", cls: "gunner", spec: "marksman", bodyLevel: 12, skills: { marksmanship: 22, perception: 14, athletics: 10, acrobatics: 6, endurance: 6, stealth: 8 },
          quirks: [], gear: [{ slot: "weapon", base: "kalash_47", rarity: "blue", ilvl: 6, affixes: [{ id: "flat_accuracy", v: 7 }, { id: "pct_damage", v: 10 }] }], abilities: ["called_shot", "frag"] },
        { kind: "grunt", name: "Tack Morrow", tplKey: "grunt", weapon: "pipe_rifle", skills: { marksmanship: 6, blades: 4, athletics: 3, acrobatics: 3, endurance: 3 }, traits: ["steady_aim"], gear: [] },
        { kind: "grunt", name: "Rill Hatch", tplKey: "grunt", weapon: "pipe_rifle", skills: { marksmanship: 6, blades: 4, athletics: 3, acrobatics: 3, endurance: 3 }, traits: ["shaky_hands"], gear: [] }
      ],
      layout: [{ cx: 2, cy: 6 }, { cx: 3, cy: 4 }, { cx: 3, cy: 8 }] },
    { version: 1, id: "r_kitruns", handle: "kit.runs", source: "seeded", zone: "a", tier: 1, heat: 30, deployScore: 6, createdRun: 0,
      units: [
        { kind: "body", name: "kit.runs", cls: "striker", spec: "duelist", bodyLevel: 10, skills: { blades: 22, acrobatics: 16, athletics: 10, endurance: 6, stealth: 10 },
          quirks: [], gear: [{ slot: "weapon", base: "rust_machete", rarity: "yellow", ilvl: 5, affixes: [{ id: "flat_hp", v: 12 }, { id: "pct_attack_speed", v: 9 }, { id: "pct_crit", v: 6 }] },
                             { slot: "head", base: "scav_hood", rarity: "white", ilvl: 5, affixes: [{ id: "flat_armor", v: 2 }] }], abilities: ["riposte", "dash"] },
        { kind: "grunt", name: "Pell Garner", tplKey: "grunt", weapon: "rust_machete", skills: { marksmanship: 5, blades: 5, athletics: 3, acrobatics: 3, endurance: 3 }, traits: ["quick_feet"], gear: [] },
        { kind: "grunt", name: "Juno Vask", tplKey: "grunt", weapon: "rust_machete", skills: { marksmanship: 5, blades: 5, athletics: 3, acrobatics: 3, endurance: 3 }, traits: ["glory_hound"], gear: [] },
        { kind: "grunt", name: "Ode Brask", tplKey: "grunt", weapon: "rust_machete", skills: { marksmanship: 5, blades: 4, athletics: 3, acrobatics: 3, endurance: 3 }, traits: ["coward"], gear: [] }
      ],
      layout: [{ cx: 4, cy: 6 }, { cx: 5, cy: 4 }, { cx: 5, cy: 8 }, { cx: 4, cy: 2 }] },
    { version: 1, id: "r_olddune", handle: "OLD_DUNE", source: "seeded", zone: "a", tier: 1, heat: 18, deployScore: 7, createdRun: 0,
      units: [
        { kind: "body", name: "OLD_DUNE", cls: "vanguard", spec: "bulwark", bodyLevel: 15, skills: { brawling: 17, endurance: 18, hauling: 12, acrobatics: 6, athletics: 6 },
          quirks: [], gear: [{ slot: "weapon", base: "knuckle_wraps", rarity: "white", ilvl: 6, affixes: [{ id: "flat_hp", v: 12 }] },
                             { slot: "head", base: "militia_helmet", rarity: "white", ilvl: 7, affixes: [{ id: "flat_armor", v: 2 }] },
                             { slot: "body", base: "militia_vest", rarity: "white", ilvl: 7, affixes: [{ id: "flat_armor", v: 3 }] }], abilities: ["brace", "taunt"] },
        { kind: "core", name: "Aldo Pike", nickname: "Mule", tplKey: "veteran", weapon: "pipe_rifle", skills: { marksmanship: 11, blades: 8, athletics: 7, acrobatics: 7, endurance: 8 },
          traits: ["tough", "pack_rat", "steady_aim"], gear: [{ slot: "weapon", base: "scav_carbine", rarity: "white", ilvl: 6, affixes: [{ id: "flat_hp", v: 14 }] }] },
        { kind: "grunt", name: "Wen Carrow", tplKey: "grunt", weapon: "pipe_rifle", skills: { marksmanship: 6, blades: 4, athletics: 3, acrobatics: 3, endurance: 3 }, traits: ["field_dresser"], gear: [] }
      ],
      layout: [{ cx: 5, cy: 6 }, { cx: 3, cy: 6 }, { cx: 3, cy: 9 }] },
    { version: 1, id: "r_wardnine", handle: "Ward Nine", source: "seeded", zone: "b", tier: 2, heat: 34, deployScore: 9, createdRun: 0,
      units: [
        { kind: "body", name: "Ward Nine", cls: "medic", spec: "field_surgeon", bodyLevel: 16, skills: { endurance: 14, perception: 13, blades: 8, marksmanship: 12, medicine: 14, acrobatics: 6 },
          quirks: [], gear: [{ slot: "weapon", base: "glokk_17", rarity: "blue", ilvl: 8, affixes: [{ id: "flat_accuracy", v: 9 }, { id: "pct_attack_speed", v: 10 }] }], abilities: ["heal", "smoke"] },
        { kind: "core", name: "Cass Lowry", tplKey: "veteran", weapon: "pipe_rifle", skills: { marksmanship: 12, blades: 8, athletics: 7, acrobatics: 7, endurance: 8 },
          traits: ["steady_aim", "tough", "trigger_happy"], gear: [{ slot: "weapon", base: "scav_carbine", rarity: "white", ilvl: 8, affixes: [{ id: "flat_accuracy", v: 5 }] }, { slot: "body", base: "padded_vest", rarity: "white", ilvl: 8, affixes: [{ id: "flat_hp", v: 12 }] }] },
        { kind: "core", name: "Bram Oake", tplKey: "veteran", weapon: "rust_machete", skills: { marksmanship: 9, blades: 11, athletics: 7, acrobatics: 7, endurance: 8 },
          traits: ["quick_feet", "beast_scarred", "tough"], gear: [{ slot: "weapon", base: "rust_machete", rarity: "blue", ilvl: 8, affixes: [{ id: "flat_hp", v: 14 }, { id: "pct_damage", v: 9 }] }, { slot: "head", base: "scrap_helmet", rarity: "white", ilvl: 8, affixes: [{ id: "flat_armor", v: 2 }] }] },
        { kind: "grunt", name: "Tibb Rook", tplKey: "grunt", weapon: "pipe_rifle", skills: { marksmanship: 6, blades: 4, athletics: 3, acrobatics: 3, endurance: 3 }, traits: ["loudmouth"], gear: [] }
      ],
      layout: [{ cx: 1, cy: 6 }, { cx: 3, cy: 4 }, { cx: 4, cy: 7 }, { cx: 3, cy: 9 }] },
    { version: 1, id: "r_haleecho", handle: "HALE//ECHO", source: "seeded", zone: "b", tier: 2, heat: 41, deployScore: 7, createdRun: 0,
      units: [
        { kind: "body", name: "HALE//ECHO", cls: "gunner", spec: "suppressor", bodyLevel: 18, skills: { marksmanship: 21, endurance: 13, hauling: 12, perception: 8, acrobatics: 6, athletics: 6 },
          quirks: [], gear: [{ slot: "weapon", base: "ar16_stoner", rarity: "purple", ilvl: 9, affixes: [{ id: "flat_hp", v: 15 }, { id: "pct_damage", v: 10 }, { id: "pct_jam", v: 30 }, { id: "cx_kill_cd", v: 1 }] }], abilities: ["suppress", "frag"] },
        { kind: "grunt", name: "Moss Kettle", tplKey: "grunt", weapon: "pipe_rifle", skills: { marksmanship: 6, blades: 4, athletics: 3, acrobatics: 3, endurance: 3 }, traits: ["steady_aim"], gear: [] },
        { kind: "grunt", name: "Rue Danner", tplKey: "grunt", weapon: "rust_machete", skills: { marksmanship: 5, blades: 5, athletics: 3, acrobatics: 3, endurance: 3 }, traits: ["tough"], gear: [] }
      ],
      layout: [{ cx: 2, cy: 6 }, { cx: 4, cy: 4 }, { cx: 4, cy: 8 }] }
  ]
};
