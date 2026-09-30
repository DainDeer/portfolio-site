// Slice 3 §2 Manual abilities. Your body's 1-2 actives: Basic = Shove; a human body = its specialty active (hotkey 1)
// + its class active (hotkey 2). Allies stay on Auto and have none this slice. Numbers [DRAFT].
// target: "enemy" | "ally" (incl. Critical when stabilize) | "self" | "ground". rangeM is from your body (weaponRange: your
// weapon's range). skill: the body skill that gets a normal combat-roll XP on use. auto: the Auto rule (js/abilities.js).
window.DATA = window.DATA || {};
DATA.abilities = {
  aimTimeScale: 0.25,        // while aiming: 25% of 1x, whatever the 1x/2x/4x setting (Settings "Slow-mo 25%")
  startCdFrac: 0.5,          // every ability starts each battle at 50% of its cooldown
  hotkeys: ["1", "2"],
  basic: ["shove"],
  byClass: { vanguard: "taunt", striker: "dash", gunner: "frag", medic: "smoke" },
  bySpec: { bulwark: "brace", breacher: "charge", butcher: "rend", duelist: "riposte", marksman: "called_shot", suppressor: "suppress", field_surgeon: "heal", chemist: "stim" },
  list: {
    shove:       { name: "Shove", icon: "abl_shove", source: "Basic", target: "enemy", rangeM: 2, cooldownSec: 8, skill: "brawling",
                   knockbackM: 3, staggerSec: 1, autoDesc: "a melee enemy is adjacent", desc: "Shove an enemy within 2 m: knockback 3 m, Stagger 1 s." },
    taunt:       { name: "Taunt", icon: "abl_taunt", source: "Class", target: "self", radiusM: 6, cooldownSec: 16, skill: "endurance",
                   sec: 3, armor: 3, autoAllyBelowPct: 40, autoDesc: "an ally within 6 m is below 40% HP", desc: "Enemies within 6 m target you for 3 s; you get +3 Armor for 3 s." },
    dash:        { name: "Dash", icon: "abl_dash", source: "Class", target: "ground", rangeM: 8, cooldownSec: 10, skill: "athletics",
                   speedMult: 4, nextHitDmgPct: 50, maxSec: 2, autoMinDistM: 4, autoDesc: "the lowest-HP enemy is more than 4 m away", desc: "Dash to a point within 8 m at 4× speed; your next hit deals +50% Damage." },
    frag:        { name: "Frag Grenade", icon: "abl_frag", source: "Class", target: "ground", rangeM: 15, cooldownSec: 18, skill: "athletics",
                   fuseSec: 1, radiusM: 3, dmg: 30, dtype: "kinetic", knockbackM: 1.5, friendlyPct: 50, autoMinEnemies: 3,
                   autoDesc: "3+ enemies within 3 m and no ally within 3 m", desc: "Throw a grenade within 15 m: 1 s fuse, 3 m radius, 30 Kinetic + knockback. Hurts your side at 50%." },
    smoke:       { name: "Smoke", icon: "abl_smoke", source: "Class", target: "ground", rangeM: 12, cooldownSec: 20, skill: "tactics",
                   radiusM: 3, sec: 5, evasion: 25, autoAllies: 2, autoBelowPct: 50, autoDesc: "2+ allies below 50% within 3 m of each other", desc: "A 3 m smoke cloud within 12 m for 5 s: every unit inside gets +25 Evasion." },
    brace:       { name: "Brace", icon: "abl_brace", source: "Specialty", target: "self", cooldownSec: 14, skill: "endurance",
                   sec: 4, dmgTakenPct: -40, interceptPct: 60, autoTargetedBy: 2, autoAllyM: 3, autoAllyBelowPct: 50,
                   autoDesc: "2+ enemies target you, or an ally within 3 m is below 50%", desc: "4 s: take 40% less damage; your intercept rises from 30% to 60%." },
    charge:      { name: "Charge", icon: "abl_charge", source: "Specialty", target: "enemy", rangeM: 12, cooldownSec: 8, skill: "brawling",
                   autoRangeM: 8, speedMult: 3, knockdownSec: 1.2, bonusDmgPct: 50, maxSec: 2, autoDesc: "your target is within 8 m", desc: "Charge an enemy within 12 m at 3× speed: knockdown 1.2 s, +50% Damage." },
    rend:        { name: "Rend", icon: "abl_rend", source: "Specialty", target: "enemy", rangeM: 6, cooldownSec: 10, skill: "blades",
                   speedMult: 3, bleedMult: 3, maxSec: 2, autoDesc: "the lowest-HP enemy within 6 m", desc: "Dash to an enemy within 6 m. The next hit applies triple Bleed and always gibs on a kill." },
    riposte:     { name: "Riposte", icon: "abl_riposte", source: "Specialty", target: "self", cooldownSec: 12, skill: "blades",
                   sec: 2.5, counterPct: 100, autoMeleeM: 2, autoDesc: "a melee enemy is within 2 m", desc: "2.5 s: every melee attack against you is parried (no roll) and countered for 100% weapon damage." },
    called_shot: { name: "Called Shot", icon: "abl_called_shot", source: "Specialty", target: "enemy", rangeM: "weapon", cooldownSec: 6, skill: "marksmanship", shot: true,
                   critChanceBonus: 100, accuracyBonus: 10, autoDesc: "the highest-value enemy in weapon range", desc: "A shot at any enemy in weapon range: +100% crit chance, +10 Accuracy." },
    suppress:    { name: "Suppressing Fire", icon: "abl_suppress", source: "Specialty", target: "ground", rangeM: "weapon", cooldownSec: 14, skill: "marksmanship",
                   radiusM: 3, sec: 4, slowPct: 50, accuracy: -15, attackSpeedPct: 50, autoMinEnemies: 2,
                   autoDesc: "the densest cluster of 2+ enemies in weapon range", desc: "Suppress a 3 m area in weapon range for 4 s: enemies inside -50% Move Speed, -15 Accuracy; you fire into it at +50% Attack Speed." },
    heal:        { name: "Field Heal", icon: "abl_heal", source: "Specialty", target: "ally", rangeM: 10, cooldownSec: 5, skill: "medicine", stabilize: true,
                   healPctOfMax: 35, belowPct: 40, autoDesc: "a Critical ally, else the lowest ally below 40%", desc: "Heal an ally within 10 m for 35% Max HP (Field heal roll), or stabilize a Critical ally." },
    stim:        { name: "Stim", icon: "abl_stim", source: "Specialty", target: "ally", rangeM: 10, cooldownSec: 7, skill: "medicine",
                   attackSpeedPct: 30, durationSec: 5, autoDesc: "the best-damage ally in the fight", desc: "An ally within 10 m (or you) gets +30% Attack Speed for 5 s." }
  }
};
