// Maps, Areas & Loot (Notion: "RENEGADE — Maps, Areas & Loot design draft", 5 Oct 2026): the V2 ruleset's data.
// Logic: js/v2.js (state, pools, rewards, Heat, extraction), js/areapath.js (walking). Views: js/areawalk.js,
// js/traversal.js. Everything a playtest may tune lives here, never in UI code.
// Tags: [DRAFT] = a playtest value, fine to change. OPEN (Megan) = one of the draft's founder calls (§2); the value here
// is a labeled placeholder so the build runs end to end, not a decision. [PLACEHOLDER] = copy.
window.DATA = window.DATA || {};
DATA.mapsV2 = {
  // Rollout flag (§13). On: every NEW expedition is created on ruleset 2 and keeps it until it ends (Heat, pools,
  // rewards and extraction never switch mid-run). Off: new expeditions are legacy. Turning it off never reinterprets a
  // run that is already on ruleset 2: its loader stays, so it finishes as it started.
  enabled: true,
  ruleset: 2,
  schema: 1,            // run.v2's shape
  contentVersion: 1,    // the Map / Area definitions below
  modTableVersion: 1,   // the modifier table: part of every modifier roll's seed (a new table = new rolls, never a reroll of a pinned run)

  // §16: the three starting choices are the Hushwood's first-row slots from Ranger's Gate. They are slots, not names:
  // the Abandoned School is always one of them, the other two vary with the seed. Every template that can land in these
  // slots has a definition in `maps` (tests/maps_v2.js checks this across seeds). A slot whose template has no
  // definition keeps the legacy presentation, says so in development, and still obeys the V2 rules.
  starting: { zone: "a", slots: ["n1_0", "n1_1", "n1_2"] },

  // Walking inside an Area (SP-032, draft §6). Pixels are the location view's 1000 x 600 canvas space (the MegaMart
  // demo used meters: 1 m ~ 46 px here, so its 4 m/s is ~185 px/s; this walks a little brisker).
  walk: {
    speedPx: 210,        // [DRAFT] px per second
    rangePx: 58,         // [DRAFT] interaction range: you stop within this distance of an object's centre, then act
    cellPx: 10,          // walk grid cell
    radiusPx: 12,        // the squad token's footprint: walls are grown by this
    arrivalGuardMs: 450, // a new Area ignores input this long, so the click that brought you can't send you back
    hitMinCss: 44        // every tap target is at least this many CSS px (phones)
  },

  // The finite Map enemy pool (SP-033, draft §9). One pool per Map per expedition; Areas only reference groups in it.
  pool: {
    // A legacy Map in a V2 run (its pool adapter, §13): ceil(location Hostiles % / legacyPerGroupPct) groups, at most
    // legacyMax, all unbound (any of its encounters may draw them). Hostiles 0% = no ordinary groups. [DRAFT]
    legacyPerGroupPct: 25, legacyMax: 4,
    // SP-033 "if there are not many groups left then you can loot freely": when this many or fewer of the Map's groups
    // are still available (or none can reach the spot you're in), ordinary searches stop rolling alerts. Combat bodies
    // are always free regardless. [DRAFT]
    freeLootAtOrBelow: 1,
    // A group's fight is built once from the Map's budget x budgetMult and kept (retreat restores exactly it). [DRAFT]
    budgetMult: 1, areaBudgetMult: 0.8
  },

  // Ordinary actions that can alert local enemies (draft §9 allowlist). Never Heat. Chances in %. [DRAFT]
  alert: {
    noiseMult: 0.25,      // ordinary search: object noise x this (a crate 5 -> 1.25%, a locker 8 -> 2%) (SP-025: "barely ever")
    forcedPct: 12,        // forcing a lock or kicking a door (SP-017: may attract enemies in the area)
    stealthPer10: 0.25,   // - this per 10 levels of the squad's best Stealth
    extractFailPct: 50,   // a failed extraction check is loud (the retry's stated cost)
    extractBadFailPct: 100
  },

  // Natural bodies (scenery, never a fight's): searching one can't alert anything unless it carries an authored trap
  // (draft §9). A trap is armed -> detected / disarmed (the check passes) or triggered (it fails): an alarm alerts one
  // eligible group of the Map's pool, once. Only V2 Areas place these (legacy sites keep their old bodies). [DRAFT]
  naturalTraps: {
    body_human: { chance: 12, kind: "alarm", check: { skill: "perception", dc: 12 }, name: "Tripwire",
                  spotText: "A tripwire runs from the body to a string of cans. You cut it.", tripText: "Cans clatter on a wire! Something heard that." },
    body_beast: { chance: 6, kind: "alarm", check: { skill: "perception", dc: 11 }, name: "Snare line",
                  spotText: "Someone strung a snare line off the carcass. You step over it.", tripText: "A snare line yanks a bell somewhere nearby!" }
  },
  // booby_traps (a modifier) arms ordinary containers with this when their type has no trap of its own
  genericTrap: { check: { skill: "perception", dc: 12 }, failDmgPct: 10, badFailDmgPct: 20, name: "Booby trap" },

  // Heat (SP-034, LOCKED 10/3): it comes ONLY from these sources. In a V2 run every other addHeat call adds nothing and
  // is recorded in run.v2.heatBlocked (development log), so a forgotten legacy path can't add Heat quietly.
  heat: {
    sources: { orbital_object: true, loud_fights: true, orbital_chest: true, lower: false },   // lower: reserved for SP-035, inactive
    revealAt: 25,          // OPEN (Megan): Heat stays hidden while low; the meter appears at this much
    // OPEN (Megan): what "getting into lots of loud fights" means. Placeholder: a committed fight (a win or a retreat)
    // with at least minGunShots gunshots is loud; every `every` loud fights add `amount`. Retreating can't earn it twice.
    loud: { minGunShots: 6, every: 3, amount: 10 }
  },

  // Battle loot (draft §8). "Take all that fits" keeps you at or under fitPct of capacity; a single Take may go over it
  // (you're overloaded) but never to the immobile line (config.carry.immobileAtPct).
  loot: { fitPct: 100 },

  // Extraction (draft §11). Classification belongs to the Map; opportunities sit in Areas.
  extraction: {
    names: { peaceful: "Peaceful", contested: "Contested", occupied: "Occupied", legacy: "Legacy extraction rules" },
    blurb: {
      peaceful: "Extract from anywhere on this Map.",
      contested: "One specific way out, opened by clearing the enemies that hold it.",
      occupied: "No normal way out. Only a special item could get you out of here.",
      legacy: "This Map still uses the old extraction rules (development rollout)."
    }
  },

  // Every Map gets a classification (docs/modifiers-and-extraction-design.md §4). A V2 definition keeps its own; every
  // other Map rolls one here, seeded by expedition + zone + Map. Peaceful = a way out ("Extract" from anywhere on it),
  // so the Peaceful share is the extraction-density dial. A legacy Map has no opportunities, so its Contested share
  // falls through to "none" (no classification tag, no way out). [DRAFT] shares.
  classification: {
    shares: { peaceful: 35, contested: 45, occupied: 20 },
    exitWithin: 2,          // every node has a Peaceful Map or a legacy extraction within this many steps, else the nearest eligible Map is promoted to Peaceful
    occupiedMinRow: 2,      // never in the first row, and never next to another Occupied Map
    pool: { peaceful: { max: 2 }, occupied: { plus: 1 } },   // Peaceful Maps are quieter, Occupied ones hold more
    danger: { peaceful: -1, occupied: 1 }                    // baseline danger pips (a Peaceful Map is worth a little less)
  },

  // Danger = loot, as one rule (design §1). A Map's pips = its active hazards' danger + the classification baseline,
  // clamped to [0, max]; always shown as skulls, never explained. Each pip raises rarity rolls on the Map, gives every
  // searchable a chance of an extra resource roll, and (per groupPerPips) adds an unbound group to the pool. [DRAFT]
  danger: { max: 5, rarityPerPip: 6, extraResPctPerPip: 10, groupPerPips: 2 },

  // Map modifiers (SP-039, draft §5; design §1-3). Rolled when a Map is picked, seeded (expedition + Map + table version),
  // never rerolled, locked at the crossing. Every Map rolls 2-4: exactly one HEADLINE (always shown: a readable nudge
  // for a player who can't decide) and the rest HIDDEN, experienced rather than read. A hidden one shows once the
  // squad's best level in its reveal skill reaches reveal.level, or once its effect has been felt (seenOn). A hazard
  // (danger > 0) can be turned off before the crossing, but only once you can see it; its reward goes with it.
  //  cat: enemy | place | loot | people | orbital | silly (weights below; two of one category never roll together)
  //  headline: eligible for the shown slot (headlineWeight: its weight there). weight: within its category, hidden slots.
  //  danger: pips (hazards > 0; a quiet Map may be < 0). reveal: { skill, level }. seenOn: area | fight | object | trap | force | search
  //  excludes: ids that can't roll with it. Effect fields are read by js/v2.js / js/site.js / js/expedition.js:
  //  groups +n, patrol, allFamily, secondFamily, arrivalMult, alertMult, budgetMult, elites, enemyHpMult, leaderDrop,
  //  loudMult, noHunterRolls, walkMult, searchTimeMult, areaEntryDmgPct, forceDmg, lockdown, rivalPack, resMult, foodPct,
  //  trapPct / trappedRarityBonus, object { type | kind, ... locked, guard, addRes, armorPiece, weaponRarity, bonusRes }
  modifiers: {
    countWeights: [45, 40, 15],   // 2, 3 or 4 modifiers [DRAFT]
    catWeights: { enemy: 30, place: 20, loot: 25, people: 10, orbital: 5, silly: 10 },   // hidden slots [DRAFT]
    categories: {
      enemy:   { name: "Enemies",  color: "#ff9a8a" },
      place:   { name: "Place",    color: "#9fd6de" },
      loot:    { name: "Supplies", color: "#9fffc8" },
      people:  { name: "People",   color: "#ffd070" },
      orbital: { name: "Orbital",  color: "#c070ff" },
      silly:   { name: "Silly",    color: "#e8e8e8" }
    },
    // legacy colour names some views still read (the old tier dots): kept as aliases of the categories
    tiers: { white: { name: "White", color: "#e8e8e8" }, green: { name: "Green", color: "#5fd35f" }, blue: { name: "Blue", color: "#6aa0ff" }, purple: { name: "Purple", color: "#c070ff" } },
    list: {
      // ---- Enemies (hazards) ----
      more_enemies:   { cat: "enemy", headline: true, headlineWeight: 2, danger: 2, reveal: { skill: "perception", level: 10 }, seenOn: "fight", excludes: ["light_watch"],
                        name: "Increased enemy presence", effect: "More of them than usual.", reward: "Better pickings for whoever clears it.",
                        groups: 1, arrivalMult: 1.25 },
      patrol:         { cat: "enemy", danger: 2, reveal: { skill: "tactics", level: 10 }, seenOn: "fight",
                        name: "Patrols", effect: "Someone walks these halls: noise anywhere here can bring them.", reward: "Better pickings.",
                        patrol: true, alertMult: 1.5 },
      light_watch:    { cat: "enemy", headline: true, headlineWeight: 2, danger: -1, reveal: { skill: "perception", level: 10 }, seenOn: "fight", excludes: ["more_enemies", "veterans"],
                        name: "Thin on the ground", effect: "Whoever held this left most of their people elsewhere.", reward: "A quiet place, and it pays like one.",
                        groups: -1, arrivalMult: 0.6 },
      veterans:       { cat: "enemy", danger: 2, reveal: { skill: "tactics", level: 15 }, seenOn: "fight",
                        name: "Hardened crew", effect: "These ones have done this before.", reward: "Better pickings.",
                        budgetMult: 1.2, elites: 1 },
      tough_enemies:  { cat: "enemy", danger: 1, reveal: { skill: "perception", level: 15 }, seenOn: "fight",
                        name: "Thick hides", effect: "Every enemy here has 10% more health.", reward: "Better pickings.",
                        enemyHpMult: 1.1 },
      watched:        { cat: "enemy", danger: 1, reveal: { skill: "tactics", level: 20 }, seenOn: "fight",
                        name: "Watched approach", effect: "They see you coming: crossing in is likelier to meet them.", reward: "Better pickings.",
                        arrivalMult: 1.5 },
      sleepers:       { cat: "enemy", danger: 0, reveal: { skill: "stealth", level: 10 }, seenOn: "fight",
                        name: "Sleeping", effect: "Nobody's awake. Crossing in is quiet, but any noise wakes them angry.", reward: "",
                        arrivalMult: 0.5, alertMult: 2 },
      second_family:  { cat: "enemy", headline: true, danger: 1, reveal: { skill: "perception", level: 15 }, seenOn: "fight", excludes: ["beast_nest"],
                        name: "Two crews", effect: "Two kinds of trouble fight over this place.", reward: "Better pickings.",
                        secondFamily: true },
      beast_nest:     { cat: "enemy", headline: true, danger: 2, reveal: { skill: "survival", level: 10 }, seenOn: "fight", excludes: ["second_family"],
                        name: "Nest", effect: "Something is breeding here. Everything you meet is a beast.", reward: "Better pickings.",
                        allFamily: "beasts", groups: 1 },
      elite_leader:   { cat: "enemy", headline: true, danger: 2, reveal: { skill: "tactics", level: 20 }, seenOn: "fight",
                        name: "Named leader", effect: "Somebody in charge, with a name.", reward: "The leader carries a Tuned or better weapon.",
                        elites: 1, leaderDrop: "blue" },
      hunter_interest: { cat: "enemy", danger: 2, reveal: { skill: "lore", level: 20 }, seenOn: "fight", excludes: ["jammer", "clear_skies"],
                        name: "Orbital interest", effect: "The orbitals are watching this Map: loud fights here count for more.", reward: "Better pickings.",
                        loudMult: 1.5 },
      // ---- Place and weather ----
      sleet:          { cat: "place", headline: true, danger: 1, reveal: { skill: "survival", level: 10 }, seenOn: "area",
                        name: "Sleet and wind", effect: "You walk 10% slower here, and crossing in is likelier to meet trouble.", reward: "Searches turn up extra food.",
                        walkMult: 0.9, arrivalMult: 1.25, foodPct: 50 },
      dark:           { cat: "place", danger: 1, reveal: { skill: "survival", level: 10 }, seenOn: "area",
                        name: "Blackout", effect: "No lights inside: searching takes longer.", reward: "Harder to hear you in the dark.",
                        searchTimeMult: 1.25, alertMult: 0.8 },
      flooded:        { cat: "place", danger: 1, reveal: { skill: "survival", level: 15 }, seenOn: "area",
                        name: "Flooded", effect: "Knee-deep water: you walk 20% slower.", reward: "Water everywhere.",
                        walkMult: 0.8, resMult: { water: 2 } },
      unstable:       { cat: "place", danger: 2, reveal: { skill: "engineering", level: 15 }, seenOn: "force",
                        name: "Unstable structure", effect: "The floor doesn't like you: forcing or kicking anything may bring part of it down on you.", reward: "Better pickings.",
                        forceDmg: { pct: 20, dmgPct: 10 } },
      chem_leak:      { cat: "place", headline: true, danger: 2, reveal: { skill: "medicine", level: 10 }, seenOn: "area",
                        name: "Chemical leak", effect: "A sharp smell. Every room you enter here costs you a little health.", reward: "Chemicals and biomass to spare.",
                        areaEntryDmgPct: 3, resMult: { chemicals: 2, biomass: 1.5 } },
      booby_traps:    { cat: "place", danger: 1, reveal: { skill: "perception", level: 15 }, seenOn: "trap",
                        name: "Booby-trapped", effect: "More containers are trapped.", reward: "A trapped container's loot rolls a tier higher.",
                        trapPct: 30, trappedRarityBonus: 25 },
      locked_down:    { cat: "place", headline: true, danger: 1, reveal: { skill: "engineering", level: 10 }, seenOn: "search",
                        name: "Locked down", effect: "Every door is shut and half the containers are locked.", reward: "Nobody got at what's inside.",
                        lockdown: { doors: true, containersPct: 50 } },
      picked_over:    { cat: "place", headline: true, headlineWeight: 2, danger: -1, reveal: { skill: "scavenging", level: 10 }, seenOn: "search", excludes: ["med_stockpile", "food_store", "fuel_dump", "scrapyard", "well", "supply_closet", "pharmacy_safe"],
                        name: "Picked over", effect: "Someone got here first, and left.", reward: "They may have left a pack behind.",
                        groups: -1, rivalPack: 25 },
      // ---- Supplies (boons) ----
      med_stockpile:  { cat: "loot", headline: true, headlineWeight: 2, danger: 0, reveal: { skill: "medicine", level: 10 }, seenOn: "object",
                        name: "Med stockpile", effect: "Increased chance of finding medical supplies.", reward: "Med Supplies turn up far more often, and one crate is full of them.",
                        resMult: { med: 3 }, object: { type: "crate", name: "Med crate", sprite: "obj_crate", addRes: { med: [2, 4] } } },
      food_store:     { cat: "loot", headline: true, headlineWeight: 2, danger: 0, reveal: { skill: "scavenging", level: 10 }, seenOn: "search",
                        name: "Pantry", effect: "Someone stocked up.", reward: "Food turns up far more often.", resMult: { food: 2.5 } },
      fuel_dump:      { cat: "loot", headline: true, danger: 0, reveal: { skill: "scavenging", level: 10 }, seenOn: "object",
                        name: "Fuel dump", effect: "Drums, mostly full.", reward: "Fuel turns up far more often, and there's a vehicle to strip.",
                        resMult: { fuel: 2.5 }, object: { type: "vehicle", name: "Fuel truck", sprite: "obj_truck", bonusRes: 1 } },
      scrapyard:      { cat: "loot", headline: true, danger: 0, reveal: { skill: "scavenging", level: 10 }, seenOn: "search",
                        name: "Scrapyard", effect: "Metal everywhere.", reward: "Scrap turns up twice as often.", resMult: { scrap: 2 } },
      well:           { cat: "loot", headline: true, danger: 0, reveal: { skill: "survival", level: 10 }, seenOn: "search",
                        name: "Working well", effect: "Clean water.", reward: "Water turns up three times as often.", resMult: { water: 3 } },
      pharmacy_safe:  { cat: "loot", danger: 0, weight: 1.5, reveal: { skill: "scavenging", level: 15 }, seenOn: "object",
                        name: "Pharmacy safe", effect: "A safe nobody cracked.", reward: "Med Supplies, and a chance of something good.",
                        object: { type: "safe", name: "Pharmacy safe", sprite: "obj_safe", locked: true, addRes: { med: [4, 6] } } },
      supply_closet:  { cat: "loot", danger: 0, weight: 2, reveal: { skill: "scavenging", level: 10 }, seenOn: "object",
                        name: "Untouched supply closet", effect: "One closet nobody has opened yet.", reward: "Extra scrap, cloth and tape in it.",
                        object: { type: "crate", name: "Untouched supply closet", sprite: "obj_locker", bonusRes: 2 } },
      vending_power:  { cat: "loot", danger: 0, weight: 2, reveal: { skill: "hacking", level: 10 }, seenOn: "object",
                        name: "A vending machine still has power", effect: "One machine still hums.", reward: "It drops a snack or a med item, once.",
                        object: { kind: "mod", use: "vend", name: "Vending machine (powered)", sprite: "obj_terminal", examine: "[PLACEHOLDER] It still lights up. One button isn't sold out." } },
      armory_locker:  { cat: "loot", danger: 0, weight: 1.5, reveal: { skill: "engineering", level: 15 }, seenOn: "object",
                        name: "Armoury locker", effect: "A rack with one thing still on it.", reward: "A piece of armour.",
                        object: { type: "locker", name: "Armoury locker", sprite: "obj_locker", locked: true, lock: { check: { skill: "engineering", dc: 12 }, force: true }, armorPiece: true } },
      weapon_cache:   { cat: "loot", danger: 0, weight: 0.6, reveal: { skill: "scavenging", level: 25 }, seenOn: "object",
                        name: "Rare weapon cache", effect: "Someone stashed a weapon here, and someone else moved in.", reward: "A Tuned or better weapon, locked up and watched.",
                        object: { type: "safe", name: "Weapon cache", sprite: "obj_safe", weaponRarity: "blue", locked: true, guard: true } },
      data_vault:     { cat: "loot", danger: 0, reveal: { skill: "hacking", level: 15 }, seenOn: "object",
                        name: "Data vault", effect: "A terminal that still has its drive.", reward: "Data Shards.",
                        object: { type: "terminal", name: "Archive terminal", sprite: "obj_computer", addRes: { data_shards: [1, 2] } } },
      relic_signal:   { cat: "loot", danger: 0, weight: 0.6, reveal: { skill: "lore", level: 25 }, seenOn: "object",
                        name: "Relic signal", effect: "Something humming under the floor. Digging it out is loud.", reward: "Relic Tech.",
                        object: { type: "crate", name: "Humming floor panel", sprite: "obj_rubble", noise: 12, addRes: { relic: [1, 1] } } },
      hide_rack:      { cat: "loot", danger: 0, reveal: { skill: "survival", level: 15 }, seenOn: "search",
                        name: "Hide rack", effect: "Someone was curing hides.", reward: "Fur and cloth.", resMult: { fur: 3, cloth: 1.5 } },
      // ---- People ----
      distress_signal: { cat: "people", headline: true, headlineWeight: 2, danger: 0, reveal: { skill: "persuasion", level: 10 }, seenOn: "object",
                        name: "Survivor distress signal", effect: "Someone's alive in there and asking for help.", reward: "Bring them home: a recruit who costs nothing.",
                        object: { kind: "survivor", name: "Survivor (distress signal)", sprite: "obj_survivor", guard: true, deep: true, examine: "[PLACEHOLDER] A thin voice on a hand radio, still calling. They've barricaded themselves in." } },
      deserter:       { cat: "people", danger: 0, reveal: { skill: "persuasion", level: 20 }, seenOn: "fight",
                        name: "Deserter", effect: "One of theirs wants out.", reward: "After your first win here, a survivor is left among the bodies.",
                        deserter: true },
      // ---- Orbital and tech ----
      orbital_pod:    { cat: "orbital", danger: 2, reveal: { skill: "lore", level: 20 }, seenOn: "object",
                        name: "Downed pod", effect: "Still warm. Looting it is one of the few things the orbitals notice.", reward: "A pod's worth of good loot, and a chance of a Prototype.",
                        object: { type: "crater_pod", name: "Downed orbital pod", sprite: "obj_cryo_pod" } },
      jammer:         { cat: "orbital", danger: 0, reveal: { skill: "hacking", level: 20 }, seenOn: "area", excludes: ["hunter_interest"],
                        name: "Jammer", effect: "Your Radio is static here. Nothing up there can see this Map either.", reward: "No Hunter pack picks up your trail while you're on it.",
                        noHunterRolls: true },
      clear_skies:    { cat: "orbital", danger: 0, reveal: { skill: "lore", level: 15 }, seenOn: "fight", excludes: ["hunter_interest"],
                        name: "Clear skies", effect: "Nothing up there is looking this way.", reward: "Loud fights on this Map count half toward Heat.",
                        loudMult: 0.5 },
      // ---- Silly (hidden only) ----
      duck_parade:    { cat: "silly", danger: 0, reveal: { skill: "survival", level: 5 }, seenOn: "object",
                        name: "Duck parade", effect: "Ducks follow the squad.", reward: "Boop for quack.",
                        object: { kind: "decor", decorMod: "duck", name: "Duck parade", sprite: "obj_event", examine: "[PLACEHOLDER] Six ducks in a line. They go where you go.", boop: "Quack." } },
      printer:        { cat: "silly", danger: 0, reveal: { skill: "hacking", level: 5 }, seenOn: "object",
                        name: "The printer works", effect: "Somewhere a printer still prints.", reward: "One ancient decree.",
                        object: { kind: "mod", use: "print", name: "Office printer", sprite: "obj_computer", examine: "[PLACEHOLDER] It wakes up when you walk past. It has one page left in it.",
                                  text: "[PLACEHOLDER] MEMO: By order of the Regional Office, all goats are to be addressed as 'Sir' until further notice." } },
      shrine:         { cat: "silly", danger: 0, reveal: { skill: "lore", level: 5 }, seenOn: "object",
                        name: "\"Hang in there\" shrine", effect: "Someone built a shrine to the cat poster.", reward: "Take one small gift.",
                        object: { kind: "mod", use: "gift", name: "\"Hang in there\" shrine", sprite: "obj_event", examine: "[PLACEHOLDER] Candles, a faded poster of a cat on a branch, and offerings." } },
      pinata:         { cat: "silly", danger: 0, reveal: { skill: "perception", level: 5 }, seenOn: "object",
                        name: "Piñata", effect: "Somebody's birthday, a long time ago.", reward: "Whatever's still inside.",
                        object: { type: "crate", name: "Piñata", sprite: "obj_event", noise: 8, addRes: { food: [1, 3], cloth: [1, 2], scrap: [0, 2] }, examine: "[PLACEHOLDER] A papier-mâché donkey hanging from a beam. It rattles." } },
      mannequins:     { cat: "silly", danger: 0, reveal: { skill: "perception", level: 5 }, seenOn: "object",
                        name: "Mannequins", effect: "Someone dressed the mannequins.", reward: "A fright, then a laugh.",
                        object: { kind: "decor", name: "Dressed mannequins", sprite: "obj_survivor", examine: "[PLACEHOLDER] Three shop dummies in winter coats, posed around a table set for dinner.", boop: "It's a mannequin. Your heart rate disagrees." } },
      lost_cat:       { cat: "silly", danger: 0, reveal: { skill: "survival", level: 5 }, seenOn: "object",
                        name: "Lost cat", effect: "A poster. A cat. Not necessarily the same cat.", reward: "Company, briefly.",
                        object: { kind: "decor", name: "Lost cat", sprite: "obj_event", examine: "[PLACEHOLDER] A grey cat sits on the poster asking for a grey cat. It watches you work.", boop: "It permits one pat." } }
    }
  },

  // The V2 Map definitions: one per template that can be a starting choice. All names [PLACEHOLDER].
  //  classification: OPEN (Megan, draft §2.2). Placeholder picks; the School is Peaceful so every seed has one
  //                  clearly reachable early route home (§2.2's recommendation).
  //  areas: { id: { name, size: S | M, entry, exitStyle (the art of the ways in and out), guaranteed (the location's
  //           guaranteedLoot), quest (find-quest objects), pods (Main 1's pods room), events: false (no event objects) } }
  //  links: [[a, b]] two-way Area exits. OPEN (Megan): the connections.
  //  groups: the Map's finite enemy pool for one expedition. area: where it is (its alerts); arrival: it can meet you
  //          on a Map crossing. [DRAFT] counts.
  //  opportunities (Contested): an in-world way out. reveal.groups: these groups' committed defeats reveal (hidden) or
  //          unlock (visibly locked) it. check: then a skill check. OPEN (Megan, §2.1): every opportunity's content.
  //  escape (Occupied): the item-gated special escape. OPEN (Megan, §2.4): no item is chosen, so none is shipped.
  maps: {
    backpack_cache: { classification: "peaceful",
      areas: {
        yard:   { name: "Schoolyard", size: "S", entry: true, exitStyle: "fence" },
        halls:  { name: "Main corridor", size: "M", guaranteed: true, exitStyle: "door" },
        office: { name: "Front office", size: "S", quest: true, exitStyle: "door" },
        gym:    { name: "Gymnasium", size: "S", exitStyle: "door" }
      },
      links: [["yard", "halls"], ["halls", "office"], ["halls", "gym"]],
      groups: [{ id: "g_yard", area: "yard", arrival: true }, { id: "g_gym", area: "gym" }] },
    mossback: { classification: "contested",
      areas: {
        trailhead: { name: "Trailhead lot", size: "S", entry: true, exitStyle: "gate" },
        sites:     { name: "Campsites", size: "M", quest: true, exitStyle: "fence" },
        lodge:     { name: "Ranger lodge", size: "S", exitStyle: "door" },
        dock:      { name: "Boat dock", size: "S", exitStyle: "fence" }
      },
      links: [["trailhead", "sites"], ["sites", "lodge"], ["sites", "dock"]],
      groups: [{ id: "g_lot", area: "trailhead", arrival: true }, { id: "g_camp", area: "sites" }, { id: "g_lodge", area: "lodge" }],
      opportunities: [{ id: "pickup", area: "trailhead", name: "Ranger's pickup", sprite: "obj_truck", wide: 2, hidden: false,
        examine: "[PLACEHOLDER] The rangers' pickup. The campers took the keys up to the campsites.",
        reveal: { groups: ["g_camp"], text: "Clear the campsites (the keys are up there)" }, check: { skill: "piloting", dc: 9 },
        okText: "The engine coughs, then catches. You bounce down the trail toward home." } ] },
    owlfall: { classification: "peaceful",   // Megan (5 Oct): one more Peaceful starting choice (was the Occupied placeholder)
      areas: {
        edge:  { name: "Hollow's edge", size: "S", entry: true, exitStyle: "fence" },
        roost: { name: "Owl roost", size: "M", quest: true, exitStyle: "fence" },
        den:   { name: "Root den", size: "S", exitStyle: "fence" }
      },
      links: [["edge", "roost"], ["roost", "den"]],
      groups: [{ id: "g_edge", area: "edge", arrival: true }, { id: "g_roost", area: "roost" }, { id: "g_den", area: "den" }] },
    lumber_mill: { classification: "contested",
      areas: {
        yard:   { name: "Log yard", size: "M", entry: true, exitStyle: "gate" },
        floor:  { name: "Saw floor", size: "M", quest: true, exitStyle: "door" },
        office: { name: "Foreman's office", size: "S", exitStyle: "stairwell" },
        loft:   { name: "Drying loft", size: "S", exitStyle: "stairwell" }
      },
      links: [["yard", "floor"], ["floor", "office"], ["floor", "loft"]],
      groups: [{ id: "g_gate", area: "yard", arrival: true }, { id: "g_saw", area: "floor" }, { id: "g_loft", area: "loft" }],
      opportunities: [{ id: "log_truck", area: "yard", name: "Log truck", sprite: "obj_logging_truck", wide: 2, hidden: true,
        examine: "[PLACEHOLDER] A logging truck under a tarp. The foreman kept it for himself.",
        reveal: { groups: ["g_saw"], text: "Somewhere in the mill (whoever runs the saw floor knows)" }, check: { skill: "piloting", dc: 10 },
        revealText: "Behind the saw floor's crew you find the foreman's ledger: a log truck under a tarp in the yard.",
        okText: "The log truck grinds out of the yard with you hanging on." } ] },
    stillwater: { classification: "peaceful",
      areas: {
        shore:     { name: "South shore", size: "S", entry: true, exitStyle: "fence" },
        boathouse: { name: "Boathouse", size: "S", quest: true, exitStyle: "door" },
        reeds:     { name: "Reed beds", size: "S", exitStyle: "fence" }
      },
      links: [["shore", "boathouse"], ["shore", "reeds"]],
      groups: [{ id: "g_shore", area: "shore", arrival: true }, { id: "g_reeds", area: "reeds" }] },
    picnic: { classification: "occupied",
      areas: {
        lot:      { name: "Picnic lot", size: "S", entry: true, exitStyle: "gate" },
        tables:   { name: "Picnic tables", size: "M", quest: true, exitStyle: "fence" },
        pavilion: { name: "Pavilion", size: "S", exitStyle: "door" }
      },
      links: [["lot", "tables"], ["tables", "pavilion"]],
      groups: [{ id: "g_lot", area: "lot", arrival: true }, { id: "g_tables", area: "tables" }, { id: "g_pavilion", area: "pavilion" }],
      escape: { tag: "escape_occupied" } },
    riverbed_camp: { classification: "occupied",
      areas: {
        bank:    { name: "Riverbank", size: "S", entry: true, exitStyle: "fence" },
        camp:    { name: "Raider camp", size: "M", quest: true, exitStyle: "gate" },
        culvert: { name: "Old culvert", size: "S", exitStyle: "fence" }
      },
      links: [["bank", "camp"], ["camp", "culvert"]],
      groups: [{ id: "g_bank", area: "bank", arrival: true }, { id: "g_camp1", area: "camp" }, { id: "g_camp2", area: "camp" }, { id: "g_culvert", area: "culvert" }],
      escape: { tag: "escape_occupied" } },
    toll_bridge: { classification: "contested",
      areas: {
        approach:  { name: "Bridge approach", size: "S", entry: true, exitStyle: "gate" },
        booth:     { name: "Toll booth", size: "S", quest: true, exitStyle: "door" },
        span:      { name: "Bridge span", size: "M", exitStyle: "gate" },
        underpass: { name: "Under the bridge", size: "S", exitStyle: "stairwell" }
      },
      links: [["approach", "booth"], ["approach", "span"], ["span", "underpass"]],
      groups: [{ id: "g_booth", area: "booth" }, { id: "g_span", area: "span", arrival: true }, { id: "g_under", area: "underpass" }],
      opportunities: [{ id: "ferry", area: "underpass", name: "Rope ferry", sprite: "obj_ex_boat", wide: 2, hidden: false,
        examine: "[PLACEHOLDER] A flat ferry on a rope across the river. Whoever lives under the bridge runs it.",
        reveal: { groups: ["g_under"], text: "Clear whoever lives under the bridge" }, check: { skill: "athletics", dc: 10 },
        okText: "Hand over hand you haul the ferry across. The far bank is quiet." } ] },
    renegade_hollow: { classification: "peaceful",
      areas: {
        path:  { name: "Overgrown path", size: "S", entry: true, exitStyle: "fence" },
        camp:  { name: "The renegade's camp", size: "M", quest: true, exitStyle: "fence" },
        cache: { name: "Cache pit", size: "S", exitStyle: "fence" }
      },
      links: [["path", "camp"], ["camp", "cache"]],
      groups: [{ id: "g_path", area: "path", arrival: true }, { id: "g_camp", area: "camp" }] },
    cryo_annex: { classification: "occupied",
      areas: {
        lobby: { name: "Annex lobby", size: "S", entry: true, exitStyle: "stairwell" },
        ward:  { name: "Cryo ward", size: "M", pods: true, quest: true, exitStyle: "door" },
        store: { name: "Supply store", size: "S", exitStyle: "door" }
      },
      links: [["lobby", "ward"], ["lobby", "store"]],
      groups: [{ id: "g_lobby", area: "lobby", arrival: true }, { id: "g_ward", area: "ward" }],
      escape: { tag: "escape_occupied" } }
  },

  // The ways between Areas reuse the existing exit art (SP-057: no new art).
  exitStyles: {
    gate:      { sprite: "obj_gate" },
    fence:     { sprite: "obj_exit_fence_hole" },
    stairwell: { sprite: "obj_exit_stairwell" },
    door:      { sprite: "obj_door" }
  },

  // copy [PLACEHOLDER]
  text: {
    backToTraversal: "Back to traversal",
    unknown: "Unknown",
    noGroup: "Whatever was here is already dealt with: nothing comes.",
    pathBlocked: "Path blocked.",
    alreadyEmpty: "Already empty.",
    lootLeave: "Anything you leave stays on the bodies until this expedition ends.",
    finishExtraction: "Finish extraction",
    legacyPresentation: "(development) This Map has no Area layout yet: legacy view.",
    sweep: "Sweep the area",
    sweepHint: "Go looking for whoever's here, on your terms.",
    sweepNone: "Nothing here to flush out.",
    guarded: "Someone was watching it. They come at you first.",
    hiddenMods: "There's more to this place than you can tell from here. Skills reveal it, or you find out the hard way.",
    dangerLabel: "Danger"
  }
};
