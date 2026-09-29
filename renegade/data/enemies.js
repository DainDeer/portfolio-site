// Enemy families (§6.4, §7.3). Units are bought from a deploy budget per battle. Numbers [DRAFT].
window.DATA = window.DATA || {};
DATA.enemies = {
  families: {
    outlaws: { name: "Outlaws",    units: ["raider", "gunman", "brute"], corpse: "corpse_human" },
    beasts:  { name: "Bio-beasts", units: ["hound", "spitter", "maw"],   corpse: "corpse_beast" }
  },
  units: {
    raider:  { name: "Raider",  family: "outlaws", cost: 1, sprite: "enemy_outlaw_raider", ai: "ranged", weapon: "pipe_rifle",
               stats: { max_hp: 63, armor: 0, evasion: 4, move_speed: 4.2, crit_chance: 5, crit_damage: 150 },
               skills: { marksmanship: 6, acrobatics: 4, endurance: 3, blades: 3 } },
    gunman:  { name: "Gunman",  family: "outlaws", cost: 2, sprite: "enemy_outlaw_gunman", ai: "ranged", weapon: "scav_carbine",
               stats: { max_hp: 84, armor: 1, evasion: 5, move_speed: 4.3, crit_chance: 6, crit_damage: 150 },
               skills: { marksmanship: 12, acrobatics: 6, endurance: 5, blades: 3 } },
    brute:   { name: "Brute",   family: "outlaws", cost: 3, sprite: "enemy_outlaw_brute",  ai: "melee",  weapon: "rust_machete",
               stats: { max_hp: 168, armor: 3, evasion: 0, move_speed: 4.2, crit_chance: 8, crit_damage: 160 },
               skills: { blades: 12, acrobatics: 2, endurance: 10 } },
    hound:   { name: "Hound",   family: "beasts",  cost: 1, sprite: "enemy_beast_hound",   ai: "melee",  weapon: "bone_claws",
               stats: { max_hp: 60, armor: 0, evasion: 8, move_speed: 6.5, crit_chance: 8, crit_damage: 150 },
               skills: { feral: 8, acrobatics: 10, endurance: 3 } },
    spitter: { name: "Spitter", family: "beasts",  cost: 2, sprite: "enemy_beast_spitter", ai: "ranged", weapon: "acid_gland",
               stats: { max_hp: 85, armor: 0, evasion: 4, move_speed: 3.8, crit_chance: 5, crit_damage: 150 },
               skills: { feral: 10, acrobatics: 4, endurance: 4 } },
    maw:     { name: "Maw",     family: "beasts",  cost: 4, sprite: "enemy_beast_maw",     ai: "melee",  weapon: "maw_bite",
               stats: { max_hp: 330, armor: 5, evasion: 0, move_speed: 3.2, crit_chance: 5, crit_damage: 150 },
               skills: { feral: 12, acrobatics: 0, endurance: 15 } }
  },
  // "Tougher enemy compositions" at Marked+ heat (§12): one unit per battle becomes elite.
  elite: { prefix: "Elite ", hpMult: 1.6, dmgMult: 1.3, skillBonus: 6, count: 1 }
};
