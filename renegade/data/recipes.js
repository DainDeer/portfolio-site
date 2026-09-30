// Slice 3 §9: Workbench recipes [DRAFT numbers from the spec table]. tier: Workbench level needed.
// out: { res: {id: n} } → stockpile | { item: baseId, quality: true } → stash (quality roll: Engineering vs DC, crit = Blue)
//      | { ammo: baseId, n } → stash stack | { reforge: true } → rerolls one affix line on a Blue+ item (you pick the line)
// needs: { rep: { giver: level } } unlock condition.
window.DATA = window.DATA || {};
DATA.recipes = {
  quality: { skill: "engineering", dc: 12, critRarity: "blue", baseRarity: "white" },   // d20 + Engineering / 4 vs DC 12; crit (beat by 10+ or a 20) = Blue
  reforgeMinRarity: "blue",
  list: {
    med_kit:     { name: "Med kit",           tier: 1, cost: { cloth: 2, chemicals: 1, water: 1 },       sec: 30, out: { res: { med: 1 } } },
    handloads:   { name: "Hand-loads",        tier: 1, cost: { scrap: 3, chemicals: 1 },                 sec: 30, out: { ammo: "ammo_handload", n: 3 } },
    pipe_rifle:  { name: "Pipe Rifle",        tier: 1, cost: { scrap: 6, cloth: 1 },                     sec: 45, out: { item: "pipe_rifle", quality: true } },
    scrap_helmet:{ name: "Scrap Helmet",      tier: 1, cost: { scrap: 4, cloth: 1 },                     sec: 45, out: { item: "scrap_helmet", quality: true } },
    padded_vest: { name: "Padded Vest",       tier: 1, cost: { cloth: 5, scrap: 2 },                     sec: 45, out: { item: "padded_vest", quality: true } },
    ap_rounds:   { name: "AP rounds",         tier: 2, cost: { scrap: 3, electronics: 1, chemicals: 1 }, sec: 45, out: { ammo: "ammo_ap", n: 3 } },
    incendiary:  { name: "Incendiary rounds", tier: 2, cost: { scrap: 2, fuel: 2 },                      sec: 45, out: { ammo: "ammo_incendiary", n: 3 } },
    scav_carbine:{ name: "Scav Carbine",      tier: 2, cost: { scrap: 10, electronics: 3, fuel: 1 },     sec: 90, out: { item: "scav_carbine", quality: true } },
    military_ruck:{ name: "Military Ruck",    tier: 2, cost: { cloth: 8, scrap: 3, fuel: 1 },            sec: 90, out: { item: "military_ruck", quality: true } },
    scav_satchel:{ name: "Scav Satchel",      tier: 2, cost: { cloth: 6, scrap: 2, biomass: 1 },         sec: 90, out: { item: "scav_satchel", quality: true } },
    biogel:      { name: "Biogel med kits",   tier: 2, cost: { biomass: 1, chemicals: 1, cloth: 1 },     sec: 45, out: { res: { med: 2 } }, needs: { rep: { ilse: 2 } } },
    reforge:     { name: "Reforge",           tier: 2, cost: { relic: 1, electronics: 3 },               sec: 60, out: { reforge: true } }
  }
};
