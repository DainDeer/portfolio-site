// Slice 3 §1: allies. Traits, nicknames, recruit candidates, promotion to Veteran, history log, Memorial Wall. [DRAFT]
window.DATA = window.DATA || {};
DATA.allies = {
  // ---- traits ----
  // kind: positive (green) / mixed (yellow) / negative (red). Effects are read by js/allies.js (G.Allies.mods):
  //   acc (Accuracy), hpPct, movePct, asPct, dmgPct (always on), jam (Jam rating added to the weapon's),
  //   dmgVsFamily {family: pct}, nearBody {m, dmgPct}, healAfterBattlePct, target "highest_cost",
  //   carryKg (your carry while deployed and standing), disturbPct (added to every search's disturbance while deployed),
  //   flee {belowPct, sec} (once per battle)
  traitKinds: {
    positive: { weight: 55, color: "#6fd36f", label: "Positive" },
    mixed:    { weight: 30, color: "#e8c95a", label: "Mixed" },
    negative: { weight: 15, color: "#e86060", label: "Negative" }
  },
  traits: {
    steady_aim:    { name: "Steady Aim",      kind: "positive", desc: "+8 Accuracy", acc: 8 },
    tough:         { name: "Tough",           kind: "positive", desc: "+15% Max HP", hpPct: 15 },
    quick_feet:    { name: "Quick Feet",      kind: "positive", desc: "+10% Move Speed", movePct: 10 },
    beast_scarred: { name: "Beast-scarred",   kind: "positive", desc: "+15% Damage vs Bio-beasts", dmgVsFamily: { beasts: 15 } },
    field_dresser: { name: "Field Dresser",   kind: "positive", desc: "Heals itself 15% Max HP after every battle it survives", healAfterBattlePct: 15 },
    owes_you:      { name: "Owes You a Life", kind: "positive", desc: "+10% Damage while within 6 m of your body", nearBody: { m: 6, dmgPct: 10 } },
    trigger_happy: { name: "Trigger-Happy",   kind: "mixed",    desc: "+20% Attack Speed, +6 Jam rating", asPct: 20, jam: 6 },
    glory_hound:   { name: "Glory Hound",     kind: "mixed",    desc: "+15% Damage, always targets the enemy with the highest deploy cost", dmgPct: 15, target: "highest_cost" },
    pack_rat:      { name: "Pack Rat",        kind: "mixed",    desc: "+5 kg to your carry capacity while deployed, -5% Move Speed", carryKg: 5, movePct: -5 },
    loudmouth:     { name: "Loudmouth",       kind: "mixed",    desc: "+10% Damage, +2% disturbance on every search while deployed", dmgPct: 10, disturbPct: 2 },
    shaky_hands:   { name: "Shaky Hands",     kind: "negative", desc: "+5 Jam rating", jam: 5 },
    coward:        { name: "Coward",          kind: "negative", desc: "The first time it drops below 30% HP in a battle, it runs from enemies for 3 s", flee: { belowPct: 30, sec: 3 } }
  },
  recruitTraits: 2,          // traits rolled at recruit
  maxNegative: 1,            // at most this many negative traits
  promoteTraitKinds: ["positive", "mixed"],   // the Veteran's 3rd trait
  tutorialNoNegative: true,  // the tutorial's free Grunts never roll a negative trait

  // ---- recruiting (Recruitment lot) ----
  candidates: 3,             // cards on the lot; reroll after every run (extract or death), not when the panel opens

  // ---- names: First "Nickname" Last ----
  // first names are DATA.bodies.grunt.names; surnames [PLACEHOLDER]
  surnames: ["Vale", "Harrow", "Kade", "Stroud", "Marsh", "Crane", "Voss", "Ruck", "Tallis", "Brandt", "Sorrow", "Graves",
             "Holt", "Mercer", "Quarry", "Flint", "Coyle", "Dray", "Hask", "Morrow", "Pell", "Birch", "Sallow", "Thorne",
             "Wrenn", "Yarrow", "Blight", "Colter", "Drummond", "Fenwick", "Gault", "Hollis", "Kettle", "Lusk", "Mott",
             "Nash", "Orrin", "Pratt", "Rask", "Scully"],

  // ---- nicknames ----
  // each trigger's pool [PLACEHOLDER]. With no nickname yet it's applied with a toast; with one, the extraction
  // summary offers Keep / Take the new one.
  nicknames: {
    last_standing: { desc: "Last one standing: won a battle while your body was downed and no other ally was up", pool: ["Last Light", "Holdout", "Anchor"] },
    multi_kill:    { desc: "4+ kills in one battle", kills: 4, pool: ["Reaper", "Scythe", "Butcher"] },
    low_hp_win:    { desc: "Won a battle below 10% HP", belowPct: 10, pool: ["Lucky", "Nine Lives", "Cat"] },
    giant_kill:    { desc: "Killed an Elite, a Maw, a Warden or a Hunter", elite: true, units: ["maw", "warden"], families: ["hunters"], pool: ["Giantkiller", "Big Game", "Tin Opener"] },
    old_hand:      { desc: "Survived 5 extractions", extractions: 5, pool: ["Old Hand", "Grey", "Furniture"] }
  },

  // ---- promotion (Grunt -> Veteran) ----
  promotion: { extractions: 3, veteranCap: 3 },
  // Veteran template (rank core: goes Critical at 0 HP and can be Domed). skillBonus is added to each skill at promotion.
  // Design answer: 4 slots (weapon, head, body, pack) - the spec text says 3 (weapon, head, body).
  veteran: {
    name: "Veteran", sprite: "unit_veteran", ai: "auto", deployCost: 2, rank: "core",
    stats: { max_hp: 100, armor: 1, evasion: 2, move_speed: 4.2, crit_chance: 5, crit_damage: 150 },
    skillBonus: 4,
    slots: { weapon: ["weapon"], offhand: ["weapon", "shield"], head: ["head"], body: ["body"], pack: ["backpack"] }
  },

  // ---- history log ----
  history: { max: 10, extractedEvery: 5, multiKill: 4 },

  // ---- Memorial Wall (town hotspot `memorial`) ----
  memorial: { plaque: "ui_memorial_plaque", plaqueW: 320, plaqueH: 96, vetScale: 1.25, border: 12 }
};
