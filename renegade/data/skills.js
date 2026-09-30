// §4.3 — all 22 skills live in data. `active` = matters in Slice 1 (gains XP / used by rolls or checks).
window.DATA = window.DATA || {};
DATA.skills = {
  athletics:    { name: "Athletics",    kind: "body", active: true,  desc: "+0.5% Move Speed per level. Climbing, sprinting.", moveSpeedPctPerLevel: 0.5 },
  acrobatics:   { name: "Acrobatics",   kind: "body", active: true,  desc: "Lowers enemy Hit chance (Acrobatics/4)." },
  endurance:    { name: "Endurance",    kind: "body", active: true,  desc: "Lowers Domed chance (Endurance/20)." },
  hauling:      { name: "Hauling",      kind: "body", active: true,  desc: "+0.5 kg carry per level." },
  brawling:     { name: "Brawling",     kind: "body", active: true,  desc: "Hit with fists. Shields (blocks train it)." },
  dual_wielding: { name: "Dual Wielding", kind: "body", active: true, desc: "Two one-handed weapons. Untrained: -25 Hit and +15 fumble on both; the penalty is gone by level 20." },   // Slice 5 §E: config.weaponSets.dual
  blades:       { name: "Blades",       kind: "body", active: true,  desc: "Hit with blades. Parry (contested)." },
  marksmanship: { name: "Marksmanship", kind: "body", active: true,  desc: "Hit and Handling with guns." },
  feral:        { name: "Feral",        kind: "body", active: false, desc: "Hit with feral attacks (enemy beasts use it)." },
  stealth:      { name: "Stealth",      kind: "body", active: true,  desc: "Sneaking (checks). Unseen in combat is later." },
  perception:   { name: "Perception",   kind: "body", active: true,  desc: "Traps, hidden containers (checks)." },
  engineering:  { name: "Engineering",  kind: "mind", active: true,  desc: "Repair, locked containers (checks)." },
  hacking:      { name: "Hacking",      kind: "mind", active: true,  desc: "Terminals (checks)." },
  medicine:     { name: "Medicine",     kind: "mind", active: true,  desc: "Field heal: 60 + Medicine/2." },
  genetics:     { name: "Genetics",     kind: "mind", active: false, desc: "Beasts, Biomass." },
  piloting:     { name: "Piloting",     kind: "mind", active: true,  desc: "Transports at extraction (checks)." },
  tactics:      { name: "Tactics",      kind: "mind", active: true,  desc: "Routes, ambushes. Smoke (Medic) trains it." },
  leadership:   { name: "Leadership",   kind: "mind", active: false, desc: "Rally (later)." },
  persuasion:   { name: "Persuasion",   kind: "mind", active: true,  desc: "Talking past guards (checks)." },
  survival:     { name: "Survival",     kind: "mind", active: true,  desc: "Navigation, shortcuts (checks)." },
  scavenging:   { name: "Scavenging",   kind: "mind", active: true,  desc: "Raises loot rarity rolls; container XP." },
  lore:         { name: "Lore",         kind: "mind", active: true,  desc: "Decoding pre-collapse data (checks)." },
  transference: { name: "Transference", kind: "mind", active: true,  desc: "Claiming bodies (checks). -1% restore time/level (max 50%)." }
};
DATA.stats = {
  max_hp: "Max HP", armor: "Armor", shield: "Shield", evasion: "Evasion", move_speed: "Move Speed",
  accuracy: "Accuracy", damage_pct: "Damage %", attack_speed: "Attack Speed %", range: "Range",
  crit_chance: "Crit Chance %", crit_damage: "Crit Damage %", resistances: "Resistances"
};
DATA.damageTypes = { kinetic: "Kinetic", energy: "Energy", bio: "Bio" };
// starting mind skills of the consciousness (all others start at 1)
DATA.startingMind = { medicine: 1, scavenging: 1 };
