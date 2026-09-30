// Slice 3 §3: character perks. They belong to the consciousness (every body). "body" perks apply to the worn body
// only; "squad" ones to your body + allies. Picks: 1 at every `pickEvery` levels; a Keystone pick at `keystoneLevels`.
// Spent at the outpost only; no respec (debug can reset). Effects are read where they apply (see js/perks.js). [DRAFT]
window.DATA = window.DATA || {};
DATA.perks = {
  pickEvery: 3,              // Lv 3, 6, 9, 12, 15, 18, ...
  keystoneLevels: [10, 20],
  list: {
    scav_eye:       { name: "Scavenger's Eye", ranks: 3, icon: "perk_scav_eye",       desc: "+5% loot rarity roll per rank", rarityPct: 5 },
    thick_skin:     { name: "Thick Skin",      ranks: 3, icon: "perk_thick_skin",     desc: "+4% Max HP per rank (your body)", bodyHpPct: 4 },
    quick_hands:    { name: "Quick Hands",     ranks: 3, icon: "perk_quick_hands",    desc: "+3% Attack Speed per rank (your body)", bodyAsPct: 3 },
    mule:           { name: "Mule",            ranks: 3, icon: "perk_mule",           desc: "+4 kg carry per rank", carryKg: 4 },
    gun_nut:        { name: "Gun Nut",         ranks: 2, icon: "perk_gun_nut",        desc: "-20% jam chance per rank (squad)", jamPct: 20 },
    helping_hand:   { name: "Helping Hand",    ranks: 1, icon: "perk_helping_hand",   desc: "Helper bonus on checks is +2 each instead of +1", helperEach: 2 },
    squad_leader:   { name: "Squad Leader",    ranks: 2, icon: "perk_squad_leader",   desc: "+1 deploy score per rank", deployScore: 1 },
    quick_recovery: { name: "Quick Recovery",  ranks: 2, icon: "perk_quick_recovery", desc: "Ability cooldowns -10% per rank", cooldownPct: 10 },
    glass_mind:     { name: "Glass Mind",      keystone: true, ranks: 1, icon: "perk_glass_mind",     desc: "+25% Damage, -20% Max HP (your body)", bodyDmgPct: 25, bodyHpPct: -20 },
    iron_will:      { name: "Iron Will",       keystone: true, ranks: 1, icon: "perk_iron_will",      desc: "Once per expedition, your body survives a lethal hit at 1 HP", ironWill: true },
    expendables:    { name: "Expendables",     keystone: true, ranks: 1, icon: "perk_expendables",    desc: "Grunts deal +30% Damage. Each Grunt death gives the squad +10% Attack Speed for 5 s (up to 3 stacks)", gruntDmgPct: 30, onGruntDeath: { asPct: 10, sec: 5, maxStacks: 3 } },   // design: max 3 stacks (+30%)
    ghost_protocol: { name: "Ghost Protocol",  keystone: true, ranks: 1, icon: "perk_ghost_protocol", desc: "Battles won with no ally down or dead give 0 Heat", ghostProtocol: true }
  }
};
