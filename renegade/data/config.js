// Core tuning numbers. Everything here is live-editable from the debug panel (` or F1).
// Tags follow the design doc: most numbers are [DRAFT] (design doc v0.4, Slice 2).
window.DATA = window.DATA || {};
DATA.config = {
  version: 2,               // save format. Slice 1 saves (version 1) are migrated on load (js/state.js St.migrate)
  saveKey: "renegade_slice1_save",      // same key as Slice 1 so an existing save is found and migrated
  overridesKey: "renegade_slice1_tuning",
  // Megan, for now: a new build (window.BUILD_ID from js/build_id.js, the commit hash in packaged builds) wipes the saved
  // progression once, so every build starts at the introduction. Set resetOnNewBuild: false to keep saves across builds.
  // BUILD_ID "dev" (running from the repo) never resets.
  save: { resetOnNewBuild: true, buildIdKey: "renegade_build_id" },

  // §7.3 Deployment score by progression stage. Tutorial = Basic body(1) + 2 Grunts.
  deploy: {
    tutorialScore: 3,
    earlyScore: 8,            // ASSUMPTION: after the tutorial (first human body) score jumps to doc's "Early 8-12" low end
    gruntCost: 1,
    startingGrunts: 2,
    tutorialReissueStarterGear: true, // ASSUMPTION: lost starter Pipe Rifle is re-issued while still in the tutorial
    // Design call on ff17090: deploying with no weapon equipped -> the outpost issues this one for free (unlimited, one per deploy)
    fallbackWeapon: { base: "pipe_rifle", rarity: "white", ilvl: 1 }
  },
  // Grunt recruiting (design call on b00ebee, replaces the old free refill; v0.4 §9.1/§11.3: recruits cost Food + Water).
  // During the tutorial the roster is topped up to deploy.startingGrunts for free. After it, dead Grunts are gone until
  // you recruit more at the Recruitment lot (town view) for recruitCost from the stockpile, up to rosterCap Grunts.
  grunts: {
    recruitCost: { food: 3, water: 3 },
    rosterCap: 5
  },

  // §2.4 carry weight
  carry: {
    baseKg: 20,
    kgPerHaulingLevel: 0.5,
    speedPenaltyPerPctOver: 1,  // -1% Move Speed for each 1% over capacity
    immobileAtPct: 150,         // at 150% you cannot move on the map
    equippedCountsTowardCarry: true, // ASSUMPTION
    pouchSlots: 1,              // Vault L1 (Vault upgrades override these, data/outpost.js)
    pouchMaxKg: 1
  },

  // §12 Heat
  heat: {
    max: 100,
    perMove: 2,                 // every move, including to a revisited location
    passageCross: 5,            // crossing a passage into another zone (Slice 2 §3)
    kickDoor: 3,                // loud searches (Slice 2 §4)
    forceLock: 5,
    perBattle: 5,
    longBattleExtra: 3,
    longBattleSeconds: 30,
    thresholds: [
      // min heat, name, enemy budget mult, hostiles-odds bonus (pp), loot rarity bonus (%), extra flags.
      // siteBonus (Slice 2): the Heat bonus added to revisit Hostiles % and search Disturbance % (Quiet 0, Noticed +3, Hunted +6, Marked +10)
      { min: 0,   name: "Quiet",   budgetMult: 1.00, hostileBonus: 0,  lootBonus: 0,  siteBonus: 0,  closeExtractions: 0, color: "#7ac07a" },
      { min: 25,  name: "Noticed", budgetMult: 1.15, hostileBonus: 0,  lootBonus: 5,  siteBonus: 3,  closeExtractions: 0, color: "#d8c04a" },
      { min: 50,  name: "Hunted",  budgetMult: 1.30, hostileBonus: 10, lootBonus: 10, siteBonus: 6,  closeExtractions: 0, color: "#e08a3a" },
      { min: 75,  name: "Marked",  budgetMult: 1.50, hostileBonus: 15, lootBonus: 20, siteBonus: 10, closeExtractions: 1, eliteUnits: true, color: "#e0503a" },
      { min: 100, name: "Manhunt", budgetMult: 2.00, hostileBonus: 100,lootBonus: 20, siteBonus: 10, closeExtractions: 99, eliteUnits: true, forcedBattle: true, color: "#ff2020" }  // Manhunt keeps its forced battle; siteBonus = Marked's (ASSUMPTION)
    ]
  },

  // §4.4 leveling
  leveling: {
    bodyBase: 20,
    mindBase: 60,
    exponent: 1.8,
    mindXpSourceMult: 0.5,
    checkFailXpMult: 0.4,
    bodyLevelDivisor: 40,     // floor(sqrt(bodyXP/40))
    charLevelDivisor: 100,    // floor(sqrt(lifetimeXP/100))
    xp: {                     // XP per action (before multipliers). Tuned toward §4.4 feel targets (body L10 in 1-2 runs, mind L10 in 4-6)
      combatRoll: 15,          // each Hit roll (hit or miss) -> weapon skill
      evadeRoll: 6,           // each time a unit is attacked -> Acrobatics
      handlingRoll: 12,        // each reload -> weapon skill
      fieldHeal: 300,          // -> Medicine (mind)
      check: 300,              // skill check success (fail = 40%)
      search: 40,              // -> Scavenging (mind) when a location-view search completes (Slice 2; was 500 per Slice 1 container)
      haulingPerMovePerKg: 8, // moving on the map while carrying X kg -> Hauling
      athleticsPerMove: 60,    // -> Athletics
      enduranceOnDamaged: 6   // -> Endurance per hit taken
    }
  },

  // §6.3 combat rolls
  rolls: {
    hitMin: 5, hitMax: 95,
    hitSkillDiv: 2,           // + weapon skill / 2
    hitAcroDiv: 4,            // - target Acrobatics / 4
    fumbleSkillDiv: 5,        // Jam rating - weapon skill / 5
    fumbleMin: 1,
    fumblePenaltySec: 2,
    fieldHealBase: 60, fieldHealSkillDiv: 2, fieldHealFailMult: 0.25,
    contestedBase: 50, contestedDiv: 2,
    domedBase: 5, domedOverkillDiv: 10, domedEnduranceDiv: 20, domedMin: 1,
    critDamageBase: 150,
    armorConstant: 10,        // dmg * 10/(10+Armor)
    resistCap: 75
  },

  // Slice 2 §4: backtracking. Revisit Hostiles % = original Hostiles % x hostileMult + Heat siteBonus
  revisit: { hostileMult: 0.35 },

  // Slice 2 §5: searching in the location view.
  // Disturbance % = object noise + location Hostiles % / hostilesDiv + Heat siteBonus + perSearchPct x searches already
  //                 made here this visit - stealthPer10 x floor(best Stealth / 10), minimum minPct
  search: {
    hostilesDiv: 10,
    perSearchPct: 1,
    stealthPer10: 1,
    minPct: 1,
    forceNoise: 10,             // forcing a lock / kicking a door adds this much noise
    scavTimePctPer10: 2,        // search time -2% per 10 levels of the best Scavenging
    battleBudgetMult: 0.7,      // a disturbance brings the location's family at budget x0.7 x Heat mult
    doorStashRarityBonus: 0
  },

  // Slice 2 §10: floating "+N XP (Skill)" labels (real time: not sped up by battle 2x/4x)
  xpFloat: {
    enabled: true,
    lifeSec: 1.2, fadeSec: 0.4, risePx: 24,
    mergeSec: 0.5,              // same skill + same source within this window -> one label with the sum
    maxPerSource: 3,            // more than this -> "+N XP (k skills)"
    showDerived: true,          // also show the Body / Character XP that every body-skill gain adds
    color: "#9fe8f5", levelColor: "#ffd84a"
  },

  // §8 checks
  checks: {
    die: 20,
    skillDiv: 4,
    helperMinSkill: 10, helperBonusEach: 1, helperMax: 3,
    critMargin: 10,
    badFailMargin: 6,
    zoneDcBonus: 0
  },

  // §7 battles
  battle: {
    hpMult: 1.5,                // global HP multiplier for every unit (both sides): longer, more readable fights (doc target 20-60 s)
    arenaW: 40, arenaH: 24,     // meters
    pxPerM: 32,                 // 32 px/m: a 32px sprite at texelScale 2 = 64 px = one 2 m grid cell
    gridCell: 2,                // placement grid cell size (m)
    playerZoneCols: 6,          // columns of cells on the left available for placement
    enemyZoneFromX: 26,         // enemies spawn right of this x (m)
    unitRadius: 0.6,
    separationForce: 3,
    kiteRangeFrac: 0.45,        // gunners back off if an enemy is closer than range*frac
    medicHangBackM: 6,
    projectileSpeed: 45,        // m/s visual only; hit is rolled at fire time
    corpseLimit: 60,
    decalLimit: 400,
    gibOverkillPct: 40,         // overkill >= this % of max HP -> gibs
    maxDurationSec: 120,        // safety: draw -> treated as a loss for the side with less HP% (ASSUMPTION)
    speeds: [1, 2, 4],
    slowMoOnKill: 0.35, slowMoSec: 0.25, shakeOnCrit: 4
  },

  // Enemy budgets (§7.3 "enemies build from the same kind of budget, scaled by location tier and Heat")
  enemies: {
    budgetByTier: [0, 1, 2, 3.5, 5],
    budgetPerDepth: 0.3,
    eliteBudgetMult: 1.0
  },

  // ======================= TUTORIAL OVERRIDES =======================
  // Active only while the tutorial runs (the first expedition(s) with the Basic body + 2 Grunts, until the first
  // human body is claimed: state.tutorialDone === false). Every later run uses the normal numbers unchanged.
  // Goal: first-run deaths come from pushing too far, not from the tutorial's own extraction.
  tutorial: {
    enabled: true,
    // per-location extraction overrides, merged over DATA.map.locations[id].extraction
    extraction: {
      ex_truck: { dc: 8, badFail: "stall", failHeat: 3 }   // Piloting DC 12 -> 8; a Bad Fail just stalls (+3 Heat) instead of starting a battle
    },
    enemyBudgetMultByLoc: {
      ex_truck: 0.6,     // fights AT the Rusted Truck: budget x0.6 (1 Raider instead of 2 when Quiet)
      ex_tunnel: 0.6,    // Tunnel Home defense waves x0.6
      ex_rooftop: 0.75   // Rooftop Pickup fights x0.75
    },
    enemyBudgetMult: 0.85,                     // every other tutorial fight x0.85 (target: Deep sweep 35-45% deaths)...
    enemyBudgetMultBelowTier: "Hunted",        // ...but only while heat is below this heat tier (name from heat.thresholds)
    enemyBudgetMultAtOrAbove: 1.0,             // at that tier or higher, other tutorial fights use this instead
    disturbanceMult: 0.5                       // search disturbance chance x0.5 while the tutorial is on (floor search.minPct still applies)
  },
  // ===================================================================

  // Expedition / map
  expedition: {
    distressTriggerAfterMoves: 2,  // a crackling radio object appears in the location you reach after this many moves (while the call is pending)
    distressDetourHeat: 4,         // "detour 2 locations (+Heat)" = 2 moves x 2
    distressExpiresAfterRuns: 1,   // ASSUMPTION: world sim is per-run (§16 Q3 open)
    restockEachRun: true,          // looted/cleared locations reset between runs (aftermath states persist)
    fogPersistsBetweenRuns: true,  // locations you have ever seen stay revealed (dimmed)
    hpPersistsInRun: true,         // ASSUMPTION: HP carries between battles within a run
    fullHealAtOutpost: true,
    medHealPct: 50,                // Use Med Supply out of combat: field heal roll; success heals 50% max HP
    battleLootRolls: 1,            // Slice 2: gear drops per battle; each goes into a killed human enemy's body as that unit's own weapon
    survivorsGiveGrunt: 1          // "Survivors" encounter -> +1 Grunt joins on extraction
  },

  // §3.4 restore. Base per family lives in DATA.bodies.families
  restore: {
    bodyLabMult: 1.0,
    transferencePctPerLevel: 1, transferenceMaxPct: 50
  },

  // §10 loot
  loot: {
    ilvlByTier: [1, 1, 4, 8, 12],
    ilvlPerDepth: 1,
    heatPerIlvl: 20,
    ilvlVariance: 2,
    statScalePerIlvl: 0.06,
    scavengingRarityPerLevel: 0.5,  // +% rarity roll per Scavenging level (ASSUMPTION on magnitude)
    enforceRequirements: false,     // weapon reqs are [PROPOSAL]; shown but not enforced by default
    reqPerIlvl: 0.7
  },

  timers: {
    tickMs: 1000
  }
};
