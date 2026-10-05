// Core tuning numbers. Everything here is live-editable from the debug panel (` or F1).
// Tags follow the design doc: most numbers are [DRAFT] (design doc v0.4, Slice 2).
window.DATA = window.DATA || {};
DATA.config = {
  version: 5,               // save format. 5 (Megan, 10/3/26): the difficulties were renamed (Casual -> Standard, Standard -> Hardcore, Hardcore -> Ragnarök); version 4 saves and scenarios are migrated on load (js/state.js St.migrate5), keeping their rules. 4 (Slice 5 §G, Vixie): The Scablands' map + the moved Rooftop Pickup, so version 1-3 saves are set aside (new game); St.migrate / St.migrate3 still exist for the tests
  saveKey: "renegade_slice1_save",      // same key as Slice 1 so an existing save is found and migrated
  overridesKey: "renegade_slice1_tuning",
  // Megan, for now: a new build (window.BUILD_ID from js/build_id.js, the commit hash in packaged builds) wipes the saved
  // progression once, so every build starts at the introduction. Set resetOnNewBuild: false to keep saves across builds.
  // BUILD_ID "dev" (running from the repo) never resets.
  save: { resetOnNewBuild: true, buildIdKey: "renegade_build_id" },
  // Slice 3 §2 / §8: player settings (Settings panel, saved with the game). Audio defaults are in data/audio.js.
  // aimMode: "slowmo" (the battle runs at abilities.aimTimeScale while you aim) | "pause" (open question 1: both work)
  settings: { aimMode: "slowmo", showDice: true },   // showDice: Slice 5 §B "Show dice rolls" (off: outcomes show at once, no die, no dice sounds)
  // Slice 3 §12: world restocking (replaces expedition.restockEachRun). Sites persist between runs in state.world.sites.
  // A site is picked over once you search an object there or win a battle there (restock level 0). The level rises one
  // step per run (any run, any zone): runsBySize runs to 100%. First entry of a later run: each searched object refills
  // with chance = level (rolled once per run, shown in the log); Hostiles % = original x (hostileFloor + (1 - hostileFloor) x level).
  // At 100% everything refills and oldBodies [min, max] new old bodies are placed (ASSUMPTION: the spec gives no count).
  world: { restock: { runsBySize: { S: 1, M: 2, L: 3 }, hostileFloor: 0.35, oldBodies: [1, 2] } },

  // §7.3 Deployment score by progression stage. Tutorial = Basic body(1) + 2 Grunts.
  deploy: {
    tutorialScore: 3,
    earlyScore: 8,            // ASSUMPTION: after the tutorial (first human body) score jumps to doc's "Early 8-12" low end
    gruntCost: 1,
    startingGrunts: 2,
    tutorialReissueStarterGear: true, // ASSUMPTION: the lost starter pistol (Zip Gun, DATA.items.startingGear) is re-issued while still in the tutorial
    // Vixie (Slice 4): no more free Pipe Rifle for an unarmed deploy. A unit with no weapon fights with bare fists
    // (DATA.config.unarmed); the deploy button asks first ("<Name> is unarmed. Deploy anyway?").
    // Megan's playtest: every run starts with a basic backpack. No backpack picked -> a School Bag from the stash is
    // put on if you have one (no duplicates), otherwise the outpost issues this one free. Kept if you extract.
    freeBackpack: { base: "school_bag", rarity: "white", ilvl: 1 }
  },
  // Grunt recruiting (design call on b00ebee, replaces the old free refill; v0.4 §9.1/§11.3: recruits cost Food + Water).
  // During the tutorial the roster is topped up to deploy.startingGrunts for free. After it, dead Grunts are gone until
  // you recruit more at the Recruitment lot (town view) for recruitCost from the stockpile, up to rosterCap Grunts.
  // Vixie (Slice 4): bare fists, what a unit with no weapon fights with (DATA.items.bases.nat_fists takes these; not an
  // item: never dropped, looted or stashed). [DRAFT] weak on purpose: was dmg 4 / 0.7 s / acc 65 (~5.7 dps), now ~3.8 dps
  // (the Shiv, a Grunt's innate weapon, is 10).
  unarmed: { dmg: 3, interval: 0.8, range: 1.0, acc: 60 },
  // Slice 4 §H (Megan): difficulty, picked on the start screen for a new save and locked for it. Combat, weapons,
  // enemies, loot and Heat are the same in all three; only the death rules change. Old saves are Hardcore.
  difficulty: {
    order: ["standard", "hardcore", "ragnarok"],
    default: "hardcore",   // saves from before §H, and a new game made without the start screen (?notitle, tests)
    list: {
      standard: { name: "Standard", keepEquipped: true, foundLossPct: 50, foundResLossPct: 50, retries: -1,
        // keepEquipped: the body's equipped items always come home (leftover ammo packs too). foundLossPct: each item found
        // that run (the bag) is lost on its own roll. foundResLossPct (Vixie): each UNIT of each found resource rolls on
        // its own, so a stack comes home at about half.
        // retries: "Retry fight" on the defeat screen restarts that battle from its start (-1 = unlimited).
        desc: "Standard: death keeps your equipped gear. Each thing you found that run has a 50% chance to be lost. Retry a lost fight as often as you like." },
      hardcore: { name: "Hardcore", desc: "Hardcore: death loses everything you carried and wore. A body that dies goes on its restore timer." },
      ragnarok: { name: "Ragnarök", permadeath: true,
        // permadeath: a human body that dies is gone for good (no restore timer, its stats with it; state.fallenBodies).
        // You go on in another body. The Basic body is never reset (Vixie): it dies as in Hardcore and keeps its levels.
        desc: "Ragnarök: a human body that dies is gone for good, stats and all. The Basic body comes back as in Hardcore." }
    },
    pickHint: "Pick a difficulty. It is locked for this save."
  },
  // Slice 5 §K: retry tokens [DRAFT Vixie]. Earned only (no shop): +perExtract on a successful extraction at Heat >= minHeat,
  // at most cap held (state.retryTokens). Spend 1 on the defeat screen to retry that fight from its start (the Standard
  // snapshot). Only on the listed difficulties (Standard already retries for free). Never on Ragnarök when the fight would
  // cost a human body (that loss is final); the Basic body there may use one.
  retryTokens: {
    on: true, minHeat: 40, perExtract: 1, cap: 3, difficulties: ["hardcore", "ragnarok"],
    name: "Retry token",
    earnText: "Retry token earned for a hot extraction",
    defeatHint: "Spend a retry token to fight this battle again from its start. Continue accepts the defeat.",
    ragnarokBlocked: "Ragnarök: a retry token can't undo the loss of a human body."
  },
  // Slice 5 §K: a future premium hook (Megan). Nothing is sold: no UI reads this, and null means no product.
  premium: { retryTokenSku: null },
  grunts: {
    recruitCost: { food: 3, water: 3 },
    rosterCap: 5,
    // Slice 4 §F: every Grunt has the body's 4 slots (was Megan's playtest weapon + one gear slot), equipped from the Vault
    // stash at the outpost through the paper doll. Gear on a Grunt that dies in battle stays on its body in the location.
    slots: { weapon: ["weapon"], offhand: ["weapon", "shield"], head: ["head"], body: ["body"], pack: ["backpack"] },   // Slice 5 §E: + the off hand (Main set only: no backup for Grunts)
    innateWeapon: "nat_shiv",        // §F: what a Grunt fights with when its weapon slot is empty (new recruits: just a shiv)
    // §F starting kit: the new game's Grunts (and the tutorial's free top-ups) get these equipped, by roster position
    // (Vixie: fixed, no randomness; both wear a white Patched Tunic). Recruits get nothing (mannequin + the innate shiv).
    startKit: [{ weapon: { base: "pipe_rifle", rarity: "white", ilvl: 1 }, body: { base: "patched_tunic", rarity: "white", ilvl: 1 } },
               { weapon: { base: "rust_machete", rarity: "white", ilvl: 1 }, body: { base: "patched_tunic", rarity: "white", ilvl: 1 } }],
    gearCountsTowardCarry: false,    // [JUDGMENT] today's rule kept: a Grunt's gear isn't in your carried kg (its pack adds capacity)
    nameMaxLen: 28           // "First Last" (Slice 3 §1; the nickname is shown separately)
  },

  // §2.4 carry weight
  carry: {
    baseKg: 20,
    kgPerHaulingLevel: 0.5,
    speedPenaltyPerPctOver: 1,  // -1% Move Speed for each 1% over capacity
    immobileAtPct: 150,         // at 150% you cannot move on the map
    equippedCountsTowardCarry: true, // ASSUMPTION
    pouchSlots: 1,              // Vault L1 (Vault upgrades override these, data/outpost.js)
    pouchMaxKg: 1,
    // Slice 5 §C [DRAFT Vixie call]: every living (standing) teammate on the run adds this toward squad capacity (on top
    // of any pack it wears). Early generosity: the School Bag went 8 -> 10 kg (data/items.js), the body base stays 20.
    // SP-019 [DRAFT] (Megan, 10/2 and 10/5 playtests: "2-3x starting carry"; her pick A): ~3x the starting squad's capacity,
    // mostly from teammates, so a teammate's death really bites. Body + 2 Grunts + School Bag: 20 + 10 + 2 x 45 = 120 kg (was 42)
    perTeammateKg: 45,
    // A teammate who dies in a location (killed in battle, or a Critical left behind) drops its body there holding its
    // equipped gear + its share of the run bag: the share is its part of the squad's capacity (its kg / capacity before
    // it died) of every resource stack and of the bag's item weight (newest pickups first; quest items stay with you).
    // Searchable once. Move to another location without emptying it and it's gone.
    deadBag: { examine: "Their pack's still on them, full of what they were hauling for the squad.", vanishOnLeave: true }
  },

  // §12 Heat. Megan's Slice 2 playtest: Heat is rarer but comes in bigger chunks. Searching gives none, battles a
  // little (+2, +4 if long), and most of it comes from the big-reward choices: answering a distress call, risky
  // skill-check options (option-level `heat` in data/events.js, shown in the option text) and completing a quest
  // objective in the field (DATA.quests.objectiveHeat). Thresholds and tier effects unchanged.
  heat: {
    max: 100,
    perMove: 1,                 // every move, including to a revisited location (design answer on Part A: was 2)
    passageCross: 5,            // crossing a passage into another zone (Slice 2 §3)
    kickDoor: 0,                // searching gives no Heat (was 3)
    forceLock: 0,               // (was 5)
    perBattle: 2,               // (was 5)
    longBattleExtra: 2,         // (was 3) -> a battle gives +2, or +4 if it runs past longBattleSeconds
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
    phoneFloatPx: { word: 10, num: 8, halo: 1 },   // phone layout only: floating combat text at least this many CSS px (words like CHARGE! / KNOCKDOWN, numbers), with a solid black halo of `halo` CSS px; desktop draws 13 / 18 canvas px as before
    gridCell: 2,                // placement grid cell size (m)
    playerZoneCols: 6,          // columns of cells on the left available for placement
    enemyZoneFromX: 26,         // enemies spawn right of this x (m)
    unitRadius: 0.6,
    separationForce: 3,
    kiteRangeFrac: 0.45,        // gunners back off if an enemy is closer than range*frac
    flank: { enabled: true, extraDeg: 30 },   // design call (milestone 3): your units attacking a shielded unit (Warden) from inside its front arc move to its side (arc/2 + extraDeg off its facing)
    medicHangBackM: 6,
    projectileSpeed: 45,        // m/s visual only; hit is rolled at fire time
    corpseLimit: 60,
    decalLimit: 400,
    gibOverkillPct: 40,         // overkill >= this % of max HP -> gibs
    maxDurationSec: 120,
    // Megan's playtest: your body doesn't die at 0 HP in battle. It goes DOWNED (enemies ignore it, AoE skips it)
    // while the others fight on. Win -> the run continues at downedReviveHp HP. No ally left standing -> normal death.
    downedEnabled: true,
    downedReviveHp: 10,        // safety: draw -> treated as a loss for the side with less HP% (ASSUMPTION)
    // Slice 4 §A2 combat speed slider (replaces the 1x / 2x / 4x buttons). Slider position p in 0..1 -> speed =
    // max x p^curve (curve 2: the slow end gets more travel; the middle of the track = 1x), rounded to `step`, and a
    // position within `snapPos` of a snap's position snaps to it. 0x = the sim doesn't advance (not the tactical pause:
    // Space still does that). Double-click / double-tap resets to 1x. A 0x speed resets to 1x when the next battle mounts.
    speedSlider: { min: 0, max: 4, step: 0.05, snaps: [0.25, 1, 2, 4], snapPos: 0.025, curve: 2 },
    slowMoOnKill: 0.35, slowMoSec: 0.25, shakeOnCrit: 4,
    // Tactical pause (Megan, Sep 29): Space / the Pause button freezes the fight. While paused you aim abilities and use
    // carried Med kits on your units; they queue and run in queue order when you resume. Each item use channels for
    // channelSec once the fight runs again (the unit does nothing else meanwhile; the item is spent when queued,
    // refunded if you cancel while paused). Med kit: the field heal roll (Medicine) at the end of the channel.
    tacticalPause: { enabled: true, key: " ", channelSec: { med: 1.5 },   // TODO: special-ammo swaps dropped from the pause (milestone 5)
      // Megan (milestone 5): after a Med kit is used on a unit, that unit can't take another for
      // max(minSec, baseSec - perMedicine x the user's Medicine level) seconds of combat time (the user = your body)
      medCooldown: { baseSec: 20, perMedicine: 1, minSec: 8 } },
    // Break away (Megan, milestone 5): a repeatable escape check in battle (button / B, or queued in the tactical pause).
    // channelSec on your body (cancelled if it goes down; not usable while it's downed), then the best Acrobatics of your
    // standing units: d20 + floor(skill / 4) vs dc + perEnemy per living enemy beyond freeEnemies, + hunterPack if a
    // Marked / Manhunt pack is there, + machines vs machines. Nat 20 passes, nat 1 fails.
    // Success: every standing unit leaves, downed allies are left behind and die ("Left behind at X"), no loot, +heat Heat
    // (instead of the battle's own), back to the location you came from; the enemies stay there (this run).
    // Fail: stumbleSec of free attacks for the enemy (your units don't act), then the cooldown (combat time) starts.
    // Slice 5 §E [DRAFT Vixie calls]: weapon sets. Your body has a Main and a Backup set (gear weapon + offhand,
    // weapon2 + offhand2); a set is one 2H weapon, two 1H weapons (dual wield) or 1H + shield. Grunts: Main set only.
    // dual: attacks alternate hands, each at intervalMult x the weapon's interval; untrained -accPenalty Hit and
    // +fumblePenalty points fumble on both, shrinking to 0 at Dual Wielding penaltyZeroAt; xpPerAttack (levels fast).
    // shield: blocks a hit from the front (blockArcDeg around its facing) at the shield's blockPct; Brawling XP per block.
    // swap: baseSec (/ Attack Speed) + a Handling roll (the incoming weapon's fumble chance: + rolls.fumblePenaltySec);
    // the class AI swaps (aiSwap) instead of reloading when the backup is loaded and faster, or for range
    // (a gun set with a foe inside meleeSwapM and a melee backup / a melee set with the target rangeSwapM past reach).
    weaponSets: {
      dual: { accPenalty: 25, fumblePenalty: 15, penaltyZeroAt: 20, intervalMult: 0.6, xpPerAttack: 30 },
      shield: { blockArcDeg: 120, xpPerBlock: 15 },
      swap: { baseSec: 1.0, cooldownSec: 4, key: "q", aiSwap: true, meleeSwapM: 2.0, rangeSwapM: 4 }
    },
    breakAway: { enabled: true, key: "b", skill: "acrobatics", channelSec: 1.0, dc: 12, freeEnemies: 2, perEnemy: 1,
                 hunterPack: 3, hunterPacks: ["Marked", "Manhunt"], machines: 2, cooldownSec: 12, stumbleSec: 2, heat: 5 }
  },

  // Enemy budgets (§7.3 "enemies build from the same kind of budget, scaled by location tier and Heat")
  enemies: {
    budgetByTier: [0, 1, 2, 3.5, 5, 6.5],   // [5]: The Scablands (Slice 5 §G) [DRAFT], +1.5 like 3 -> 4 (was the "|| 3" fallback)
    budgetPerDepth: 0.3,
    eliteBudgetMult: 1.0,
    // Slice 3 §11 (geared lever): bigger squads meet bigger groups. Budget x (1 + perExtra x (squad size - base)), squad
    // size = body + Grunts deployed this run (fixed at the start; allies lost mid-run don't shrink it). Off in the tutorial,
    // only in `zones` (Zone B: in Zone A it made the econ bot die and re-recruit, Vault L2 median run 7 -> 9).
    squadScale: { base: 3, perExtra: 0.55, maxMult: 2.0, zones: ["b", "greyback", "hollis", "scablands"] }   // follow-up (Vixie): never more than x2.0 in total   // 0.55: geared deaths 8% -> ~22-25% (target 20-25%)
  },

  // Slice 5 §A (Megan, Vixie's [DRAFT] call): an extraction check with badFail: "crash" (the Rusted Truck) is wrecked by a
  // Bad Fail: +crashHeat (in the extraction's data), a heavy crash sound, a short on-screen line, and that extraction is
  // closed for the rest of the run (no re-roll): reach a different exit. A plain Fail keeps its softer failHeat stall.
  extraction: {
    crash: {
      sfx: "sfx_truck_crash_1",      // Smudge d41333a (sfx_truck_crash_2 is the registered spare take)
      line: "The truck's wrecked.",  // [PLACEHOLDER] the flash line
      lineMs: 2600,
      log: "The engine screams, the truck lurches into a tree and dies for good. The whole wood heard that."   // [PLACEHOLDER]
    }
  },

  // Slice 5 §B (Megan): every graded skill check we show rolls a physically simulated d20 (chunky low-poly, into a dark
  // box, a small panel top-left); the same roll math as before (js/checks.js), this is presentation. The face that
  // lands is the rolled number. Consumers: where the die is shown (the extraction check first, per the spec).
  dice: {
    enabled: true,
    // Vixie (Sep 30): every out-of-combat check the player starts shows the die; never the per-hit rolls in a battle.
    // extract, search (lock / heavy / trap), event options, rival choices, Hunter hide, passage spotting, scouting and
    // Break away (the one check inside a fight: the fight holds while the die rolls). Not "craft" (the Workbench's
    // quality roll lands on a timer, not at a click). The player can turn them off: settings.showDice.
    consumers: ["extract", "search", "event", "rival", "hunter", "spot", "scout", "breakaway"],
    queue: { speed: 2, holdMs: 500, noHold: ["scout"], dockMin: 2 },   // noHold kinds never hold the screen (no shield: scouting rolls itself as you move); a batch of them (a new neighbourhood) plays x2 after the first, holds 0.5 s, thunk without the stinger; only such a batch (dockMin+ queued together) uses the docked die, a lone one the big panel
    // sounds (data/audio.js): a random tumble per wall bounce (up to maxBounces), then the thunk + Snare's stinger on the landing frame
    sfx: { bounce: ["sfx_dice_bounce_1", "sfx_dice_bounce_2", "sfx_dice_bounce_3"], maxBounces: 3, bounceMinSpeed: 0.5, land: "sfx_dice_land", stinger: "stinger_roll" },
    // Smudge 7ddb42d (assets/ui/dice/dice_manifest.json): the mesh + numbering, box, lantern, camera and light are in the
    // scene json (fetched: packaged through this "file"); the panel art below is placed from these numbers (native px).
    scene: { file: "ui/dice/d20_scene.json" },
    art: {
      panel: { file: "ui/dice/dice_panel.png", size: [152, 120], window: [12, 12, 128, 96] },
      plaque: { file: "ui/dice/dice_plaque.png", at: [54, 106], size: [44, 24], field: [38, 18] },   // hangs 10 px below the frame
      still: { file: "ui/dice/dice_box_still.png" },                                                // no WebGL / reduced motion
      atlas: { ember: { file: "ui/dice/d20_bone_ember.png" }, gold: { file: "ui/dice/d20_bone_gold.png" }, ash: { file: "ui/dice/d20_bone_ash.png" }, blood: { file: "ui/dice/d20_bone_blood.png" } },
      rest: { ember: { file: "ui/dice/d20_rest_ember.png" }, gold: { file: "ui/dice/d20_rest_gold.png" }, ash: { file: "ui/dice/d20_rest_ash.png" }, blood: { file: "ui/dice/d20_rest_blood.png" }, frame: [40, 41], offset: [59, 23] },
      digits: { ember: { file: "ui/dice/dice_digits_ember.png" }, gold: { file: "ui/dice/dice_digits_gold.png" }, ash: { file: "ui/dice/dice_digits_ash.png" }, blood: { file: "ui/dice/dice_digits_blood.png" }, cell: [13, 17] },
      box: { floor: { file: "ui/dice/box_floor.png" }, wall: { file: "ui/dice/box_wall.png" }, rim: { file: "ui/dice/box_rim.png" } },
      // Vixie (Sep 30): the docked batch die (scouting batches; js/dice.js Dc.showMini), size = its 64 CSS px box, drawn
      // pixelated at a whole-number scale only. body = the die inside that box [x0, y0, x1, y1]: only it takes a tap (the
      // rest lets map taps through). tumble = a looping strip while it rolls (none: it cycles the rest frames).
      // Smudge's 64 px d20 (b7e795a, assets/ui/dice/dice64_manifest.json): rest.<tint> = 20 frames of 64x64 (frame n - 1 =
      // face n up, same tints as the big die), offset [0, 0] (the frame is the die), tumble = the 8-frame ember loop at
      // 12 fps. If these fail to load, the big die's 40x41 resting strips (art.rest) stand in at 1x, centred.
      mini: {
        size: 64,
        rest: { ember: { file: "ui/dice/d20_rest_64_ember.png" }, gold: { file: "ui/dice/d20_rest_64_gold.png" }, ash: { file: "ui/dice/d20_rest_64_ash.png" }, blood: { file: "ui/dice/d20_rest_64_blood.png" }, frame: [64, 64], offset: [0, 0] },
        tumble: { file: "ui/dice/d20_tumble_64_ember.png", frames: 8, fps: 12 },
        body: [4, 1, 58, 60]
      }
    },
    tints: { rolling: "ember", crit: "gold", success: "ember", fail: "ash", badFail: "blood" },   // the die + plaque digits on landing
    scale: 2,                                   // native pixels shown x2, nearest (phones too: x1.5 blurs this art)
    maxSimSec: 3.2, phoneSpeed: 1.5,            // phones play the same roll faster ("shorter roll")
    holdMs: 1300,                               // the landed number stays this long before the outcome shows (tap skips)
    lidY: 3,                                    // the invisible lid (scene box notes)
    throw: { speed: [6.5, 8], spin: [9, 15], height: [1.5, 1.9] },   // hard enough to reach the far wall (most rolls clatter)
    physics: { gravity: -24, restitution: 0.34, friction: 0.5, inertia: 0.36, angDamp: 3, restV: 0.12, restW: 0.35, restSec: 0.2 }
  },


  // ======================= TUTORIAL OVERRIDES =======================
  // Active only while the tutorial runs (the first expedition(s) with the Basic body + 2 Grunts, until the first
  // human body is claimed: state.tutorialDone === false). Every later run uses the normal numbers unchanged.
  // Goal: first-run deaths come from pushing too far, not from the tutorial's own extraction.
  tutorial: {
    enabled: true,
    // per-location extraction overrides, merged over DATA.map.locations[id].extraction
    extraction: {
      ex_truck: { dc: 8, badFail: "crash", failHeat: 3, crashHeat: 8 }   // Piloting DC 12 -> 8; a Fail stalls (+3 Heat). Slice 5 §A: a Bad Fail crashes it (+8 Heat [DRAFT], was a +3 stall)
    },
    enemyBudgetMultByLoc: {
      ex_truck: 0.6,     // fights AT the Rusted Truck: budget x0.6 (1 Raider instead of 2 when Quiet)
      ex_tunnel: 0.6,    // Tunnel Home defense waves x0.6
      ex_rooftop: 0.75   // Rooftop Pickup fights x0.75
    },
    enemyBudgetMult: 0.9,                      // every other tutorial fight x0.9 (was 0.85; Slice 3 §11: with Break away and battle Med kits the deep sweep fell to 35%, target 42-48; 0.95 slowed the econ Vault)...
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
    ilvlByTier: [1, 1, 4, 8, 12, 16],   // [5]: The Scablands (Slice 5 §G) [DRAFT] (was the "|| 1" fallback)
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
