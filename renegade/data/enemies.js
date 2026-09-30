// Enemy families (§6.4, §7.3). Units are bought from a deploy budget per battle. Numbers [DRAFT].
window.DATA = window.DATA || {};
DATA.enemies = {
  families: {
    outlaws: { name: "Outlaws",    units: ["raider", "gunman", "brute"], corpse: "corpse_human" },
    beasts:  { name: "Bio-beasts", units: ["hound", "spitter", "maw"],   corpse: "corpse_beast" },
    // Slice 3 §4a: pre-fall security machines. Shared: resistances, Bleed immunity, Burn 50%, never Critical, sparks /
    // oil / metal gibs instead of blood, a killed machine is a searchable wreck (body_machine). Pierce is the counter.
    machines: { name: "Machines", units: ["ai_drone", "ai_crawler", "ai_sentry", "ai_warden"], corpse: "corpse_machine",
                shared: { res: { kinetic: 20, bio: 60 }, immuneBleed: true, burnPct: 50, metal: true } },
    // Slice 3 §4b: orbital hunter teams. Fixed packs (DATA.enemies.hunters.packs), not bought from a budget.
    rivals:   { name: "Rivals", units: [], corpse: "corpse_human", ghost: true },   // Slice 3 §7: snapshot squads (js/rivals.js), never bought from a budget
    hunters:  { name: "Hunters", units: ["hunter_stalker", "hunter_marksman", "hunter_captain"], corpse: "corpse_human", fixedPacks: true }
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
               skills: { feral: 12, acrobatics: 0, endurance: 15 } },
    // ---- machines (Slice 3 §4a). beh = behaviour numbers read by js/enemyai.js ----
    ai_drone:   { name: "Scout Drone",   family: "machines", cost: 1, sprite: "enemy_ai_drone",   ai: "ranged", weapon: "drone_zapper",
                  stats: { max_hp: 35, armor: 0, evasion: 12, move_speed: 6.5, crit_chance: 5, crit_damage: 150 }, skills: { marksmanship: 6, acrobatics: 6 },
                  beh: { fly: { orbitM: 10, meleeAccPenalty: 20 }, mark: { everySec: 6, sec: 4, dmgTakenPct: 20 } } },
    ai_crawler: { name: "Crawler Mine",  family: "machines", cost: 1, sprite: "enemy_ai_crawler", ai: "melee",  weapon: "crawler_none", maxPerBattle: 3,
                  stats: { max_hp: 28, armor: 2, evasion: 4, move_speed: 5.5, crit_chance: 0, crit_damage: 150 }, skills: { acrobatics: 2 },
                  // arms at armM (fuseSec beeping), then blasts everyone in radiusM (other machines too). Killed before it arms: pops for earlyPct.
                  beh: { mine: { armM: 1.5, fuseSec: 0.8, dmg: 40, radiusM: 2.5, earlyPct: 50, dtype: "kinetic" } } },
    ai_sentry:  { name: "Sentry Turret", family: "machines", cost: 2, sprite: "enemy_ai_sentry",  ai: "ranged", weapon: "sentry_gun", maxPerBattle: 1, res: { kinetic: 25 },
                  stats: { max_hp: 110, armor: 5, evasion: 0, move_speed: 0, crit_chance: 5, crit_damage: 150 }, skills: { marksmanship: 10 },
                  beh: { turret: { coneDeg: 60, turnDegPerSec: 90, burst: 5, burstGapSec: 0.09, ventAfter: 3, ventSec: 2.5, ventDmgTakenPct: 50 } } },
    ai_warden:  { name: "Warden",        family: "machines", cost: 3, sprite: "enemy_ai_warden",  ai: "melee",  weapon: "stun_baton", res: { kinetic: 25 }, relicPct: 10,
                  stats: { max_hp: 190, armor: 4, evasion: 0, move_speed: 3.0, crit_chance: 5, crit_damage: 150 }, skills: { brawling: 10, endurance: 10 },
                  beh: { shield: { arcDeg: 120, pct: 60, turnDegPerSec: 90 }, seekDensest: { radiusM: 4 } } },   // shield: spec 70%; design call (milestone 3): trimmed, and it turns 90°/s so flanking works
    // ---- Hunters (Slice 3 §4b). Damage x the Heat tier budgetMult, HP x 1 + (mult - 1) x hunters.scale.hp (design call, milestone 3) ----
    hunter_stalker:  { name: "Hunter Stalker",  family: "hunters", cost: 2, sprite: "enemy_hunter_stalker",  ai: "melee",  weapon: "hunter_knife",
                       stats: { max_hp: 105, armor: 1, evasion: 10, move_speed: 5.8, crit_chance: 8, crit_damage: 160 }, skills: { blades: 14, acrobatics: 10, endurance: 6, stealth: 30 },
                       // max_hp: spec 90; step 8 tuning 105 (geared bot deaths in a Hunted-pack fight 26.8% -> 35.9%, target 30-40%)
                       // Unseen: Stealth vs the squad's best Perception (contested); spawns behind you, untargetable until it attacks or `sec` pass, first hit +100%
                       beh: { unseen: { stealth: 30, sec: 4, firstHitPct: 100 }, targetWounded: { bodyBelowPct: 50 } } },
    hunter_marksman: { name: "Hunter Marksman", family: "hunters", cost: 2, sprite: "enemy_hunter_marksman", ai: "ranged", weapon: "hunter_rifle_npc",
                       stats: { max_hp: 75, armor: 0, evasion: 6, move_speed: 4.2, crit_chance: 8, crit_damage: 170 }, skills: { marksmanship: 16, acrobatics: 6, endurance: 4 },
                       beh: { marksman: { aimSec: 1.5, resetDmg: 20, critBonus: 50 }, targetBody: true } },
    hunter_captain:  { name: "Hunter Captain",  family: "hunters", cost: 4, sprite: "enemy_hunter_captain",  ai: "ranged", weapon: "hunter_carbine", maxPerBattle: 1, relicAlways: 1,
                       stats: { max_hp: 90, armor: 3, evasion: 5, move_speed: 4.4, crit_chance: 6, crit_damage: 150 }, skills: { marksmanship: 14, acrobatics: 4, endurance: 10 },
                       // max_hp: spec 180; design call (milestone 4) 90. Its carbine (sustained fire) 8 -> 4 damage; the threat is the telegraphed burst:
                       // burst: every everySec (first after firstSec) it stops and aims aimSec at a target (red line, tracks until the last lockSec,
                       // then locks); the target sidesteps out of the line at reactBase% + reactPerAcro x Acrobatics (max reactMax); then `rounds`
                       // shots of `dmg` (x its damage mult, +accBonus) `gapSec` apart down the locked line: they hit the first squad unit within
                       // widthM of the line, else miss
                       beh: { captain: { accAura: 10, closeInAsPct: 20, closeInSec: 5, retreatSec: 3 },
                              burst: { firstSec: 3, everySec: 6, aimSec: 1.5, lockSec: 0.5, rounds: 3, gapSec: 0.15, dmg: 18, accBonus: 15, pierce: true, widthM: 0.35,
                                       reactBase: 35, reactPerAcro: 1, reactMax: 80 } } }
  },
  // Slice 3 §4b Hunters on the zone map + their packs, encounter options, loot and the Captain debuff
  hunters: {
    minTier: "Hunted",
    spawnPct: { Hunted: 20, Marked: 30 },   // per move, while no pack is active (Manhunt uses Marked's). Spec 12 / 25; step 8 tuning (hunters profile: met a pack 22.7% -> 32.7%, target 30-40%)
    spawnDist: [2, 3],                      // nodes from you, never at an extraction
    cooldownMoves: 4,                       // no spawn rolls for this many moves after a pack is beaten or shaken off
    scale: { dmg: 0.25, hp: 0.25 },         // Heat budget mult on Hunter damage / HP: 1 + (mult - 1) x scale. Milestone 3 {dmg 1, hp 0.5}; design call (milestone 4) 0.25 / 0.25
    packs: { Hunted: ["hunter_stalker", "hunter_marksman"],
             Marked: ["hunter_stalker", "hunter_stalker", "hunter_marksman", "hunter_captain"],
             Manhunt: ["hunter_stalker", "hunter_stalker", "hunter_marksman", "hunter_captain"] },
    packDmgMult: { Hunted: 1.8, Marked: 0.6, Manhunt: 0.6 },   // Hunted 1.2 -> 1.8 (milestone 5: with Break away + battle Med kits, Hunted-pack deaths fell to 22%; 1.8 dmg / 1.15 HP -> 35.2%). x damage per pack on top of the Heat scale, for every unit but the Captain. Design call (milestone 4): tune packs here, not via Heat (hunters profile: Hunted deaths 33.1% @Heat 55, Marked won 38.7% @75, Manhunt won 23.5% @100; tests/slice3_milestone4_sweep.txt)
    packHpMult: { Hunted: 1.15, Marked: 0.6, Manhunt: 0.6 },      // x max HP per pack, same rule (not the Captain: his HP is set on the unit). The 2nd Marksman is gone from Manhunt; Manhunt differs from Marked by its Heat mult
    hide: { skill: "stealth", dc: 16 },     // fail: the fight starts with the Stalker ambush (Stalkers Unseen, no contest)
    bait: { deathPct: 60, loseMoves: 3 },   // spend a Grunt: you escape, the pack loses you for 3 moves
    loot: { ilvlPlus: 3, rarityBonus: 10, garbPct: 12, shardPct: 20, relicPct: 8 },
    debuff: { enabled: true, id: "orbital_mark", name: "Marked by the Orbitals", runs: 2, startHeat: 25 }
  },
  // "Tougher enemy compositions" at Marked+ heat (§12): one unit per battle becomes elite.
  elite: { prefix: "Elite ", hpMult: 1.6, dmgMult: 1.3, skillBonus: 6, count: 1 }
};
