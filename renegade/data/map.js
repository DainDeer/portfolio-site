// Region map. The region is generated ONCE per save from `seed` and persists (§2.3).
// Layout: layered branching graph (forks + merges). Movement is allowed along any edge in both
// directions (ASSUMPTION: it's a region, not a one-way spire). Names are [PLACEHOLDER].
window.DATA = window.DATA || {};
// tag "office" (design, Slice 3): the School's admin area and municipal / commercial buildings; each gets 1 guaranteed
// terminal (DATA.searchables.fixedByTag). Tag "terminal" (Relay Tower, clinics) adds terminals to the random mix instead.
DATA.map = {
  regionName: "The Scablands [PLACEHOLDER]",   // Zone A (see data/zones.js)
  rows: [3, 3, 3, 3, 3],          // locations per row (row 0 = outpost). 15 locations total
  rowTier: [0, 1, 1, 2, 2, 3],    // tier by row index (row 0 = outpost)
  extraEdgeChance: 0.45,          // chance of a second forward edge (creates forks/merges)
  sideEdgeChance: 0.25,           // chance of an edge to a neighbour in the same row
  fogRevealRadius: 1,             // you see locations adjacent to where you've been this run
  // map presentation (art): fog texture over unknown ground, revealed-ground tile around scouted locations
  view: {
    showUnknownRadius: 2,         // nodes this many steps from a visited node show as an unscouted "?" (no name/odds). 1 = off
    revealRadius: 78,             // px (in the 1000x600 map space) cleared around each visible location
    fogAlpha: 0.9,                // fog over never-seen ground
    rememberedFogAlpha: 0.5,      // fog kept over locations remembered from earlier runs
    revealedAlpha: 0.45,          // strength of the revealed-ground tile over the map background
    revealedAlphaByZone: { b: 0, greyback: 0 } // painted backgrounds (zones.list[z].mapBg) show through as-is
  },
  // fixed placements: role -> allowed rows (placed in this order, so the extractions always get their row)
  fixed: {
    ex_truck:         { rows: [2] },       // always a tier-1 extraction reachable in the tutorial ("lightly railroaded", §3.5)
    ex_tunnel:        { rows: [4] },
    ex_rooftop:       { rows: [5] },
    backpack_cache:   { rows: [1] },
    rail_yard:        { rows: [3, 4] },    // Slice 2: hosts the passage to Zone B (storm drain grate)
    hollow_creek:     { rows: [2, 3] },
    pump_station:     { rows: [2, 3] }     // Slice 2: holds the Pump House quest object
  },
  // Slice 4 §B: locations every Zone A map must have. Filled AFTER the normal assignment, and only when the roll left
  // them out: the first non-fixed node in the listed rows (in order) is swapped to it. No rng draws, so maps that
  // already had it are unchanged. cryo_annex holds the pods room of Main 1 (DATA.main.pods).
  guaranteed: {
    cryo_annex:       { rows: [2, 3, 4] }
  },
  // Every location in every zone. `zone` set = not part of Zone A's generator pool (handcrafted, see data/zones.js).
  // odds (independent %): hostiles, event (= "there is an event object in the location view"), survivors (a survivor object).
  // kind (optional): "medical" | "industrial" scales Med Supplies drops (DATA.searchables.medWeightByKind).
  // size: S | M | L (location view template, data/searchables.js). tags: resources found here (a matching tag doubles
  // that resource's weight in every loot table). Slice 1 tags migrated: circuits -> electronics, biomass -> chemicals.
  locations: {
    flooded_mall:    { name: "Flooded Mall",          icon: "loc_mall",      family: "outlaws", size: "L", odds: { hostiles: 55, event: 30, survivors: 10 }, tags: ["scrap", "food", "cloth", "office"], events: ["toll_gate", "cache"] },
    relay_tower:     { name: "Relay Tower 7",         icon: "loc_tower",     family: "machines", size: "M", odds: { hostiles: 35, event: 70, survivors: 5 },  tags: ["electronics", "data", "terminal"], events: ["relay", "ai_perimeter_drone"] },   // Slice 3 §4a: machines
    riverbed_camp:   { name: "Dry Riverbed Camp",     icon: "loc_camp",      family: "outlaws", size: "M", odds: { hostiles: 70, event: 25, survivors: 10 }, tags: ["scrap", "food"], events: ["toll_gate"] },
    brigid_clinic:   { kind: "medical", name: "St. Brigid Clinic",     icon: "loc_hospital",  family: "beasts",  size: "M", odds: { hostiles: 40, event: 45, survivors: 15 }, tags: ["med", "chemicals", "terminal"], events: ["cryo_ward"] },
    rail_yard:       { kind: "industrial", name: "Overgrown Rail Yard",   icon: "loc_overgrown", family: "beasts",  size: "M", odds: { hostiles: 65, event: 20, survivors: 5 },  tags: ["chemicals", "scrap", "biomass"], events: ["tunnel"], passage: "storm_drain" },
    transit_tunnel:  { name: "Collapsed Transit Tunnel", icon: "loc_tunnel", family: "beasts",  size: "M", odds: { hostiles: 40, event: 80, survivors: 0 },  tags: ["scrap"], events: ["tunnel"] },
    fuel_depot:      { kind: "industrial", name: "Fuel Depot 9",          icon: "loc_depot",     family: "outlaws", size: "M", odds: { hostiles: 50, event: 30, survivors: 5 },  tags: ["scrap", "chemicals", "fuel", "office"], events: ["cache", "toll_gate"] },
    pylon_field:     { kind: "industrial", name: "Pylon Field",           icon: "loc_den",       family: "beasts",  size: "M", odds: { hostiles: 70, event: 25, survivors: 0 },  tags: ["chemicals", "biomass"], events: ["relay", "tunnel", "ai_perimeter_drone"] },
    toll_bridge:     { name: "Old Toll Bridge",       icon: "loc_camp",      family: "outlaws", size: "M", odds: { hostiles: 45, event: 75, survivors: 5 },  tags: ["scrap", "fuel", "office"], events: ["toll_gate"] },
    cryo_annex:      { kind: "medical", name: "Cryo Ward Annex",       icon: "loc_bunker",    family: "beasts",  size: "M", odds: { hostiles: 45, event: 75, survivors: 5 },  tags: ["med", "terminal"], events: ["cryo_ward"] },
    renegade_hollow: { name: "Dead Renegade's Hollow",icon: "loc_ruins",     family: "outlaws", size: "M", odds: { hostiles: 40, event: 70, survivors: 0 },  tags: ["electronics"], events: ["cache"] },
    // fixed roles
    backpack_cache:  { kind: "medical", name: "Abandoned School",      icon: "loc_ruins",     family: "beasts",  size: "M", odds: { hostiles: 30, event: 0, survivors: 10 }, tags: ["cloth", "scrap", "office"], events: [],
                       guaranteedLoot: { base: "school_bag", rarity: "white", once: true, object: { name: "School lockers", type: "locker" } } },  // "one backpack pickup"
    pump_station:    { kind: "industrial", name: "Pump Station",          icon: "loc_pump_station", family: "outlaws", size: "M", odds: { hostiles: 45, event: 25, survivors: 5 }, tags: ["water", "scrap", "office"], events: ["toll_gate", "cache"] },
    hollow_creek:    { name: "Hollow Creek",          icon: "loc_settlement",family: "outlaws", size: "M", odds: { hostiles: 0, event: 0, survivors: 50 }, tags: ["food", "water"], events: [], worldEvent: "distress_hollow_creek", passage: "deer_trail",   // Slice 5 §G: the Deer Trail up to Greyback (until Hushwood has its Fire Lookout)
                       
                       worldIcons: { ignored: "loc_distress", fallen: "loc_aftermath", aftermath: "loc_aftermath", aftermath_cleared: "loc_aftermath" },
                       // Distress call, same run: ignoring the radio starts a countdown. Arrive within holdMoves moves -> holdingEvent
                       // (the save-the-town defense). Otherwise the town falls THIS run: scavengers + salvage. The next run still
                       // turns it into the aftermath (or allied, if saved) as before.
                       distress: {
                         holdMoves: 3,
                         holdingEvent: "hollow_creek_holding",
                         fallen: {
                           label: "Fallen: scavengers picking it over",
                           odds: { hostiles: 40, event: 0, survivors: 0 },
                           container: { name: "Town Salvage", type: "crate", bonusItems: 2, rarityBonus: 15 }   // a guaranteed searchable, better than any normal crate
                         }
                       } },
    ex_truck:        { name: "Rusted Truck",          icon: "loc_truck", iconWrecked: "loc_truck_wrecked", iconWreckedAnim: "loc_truck_wrecked_smoke",family: "outlaws", size: "M", odds: { hostiles: 30, event: 0, survivors: 0 }, tags: ["scrap", "fuel"], events: [],
                       extraction: { type: "check", skill: "piloting", dc: 12, failHeat: 5, badFail: "crash", crashHeat: 8 } },  // hotwire (§2.3). Slice 5 §A (Megan): a Bad Fail crashes it (was "battle"); crash numbers: config.extraction.crash
    ex_tunnel:       { name: "Tunnel Home",           icon: "loc_extraction",family: "beasts",  size: "M", odds: { hostiles: 0, event: 0, survivors: 0 }, tags: ["scrap"], events: [],
                       extraction: { type: "defense", surviveSec: 30, waves: 3, waveBudgetMult: 0.6 } },           // countdown defense (Tarkov-like)
    ex_rooftop:      { name: "Rooftop Pickup",        icon: "loc_extraction",family: "outlaws", size: "M", odds: { hostiles: 40, event: 0, survivors: 0 }, tags: [], events: [],
                       extraction: { type: "free" } },
    // ---- Zone B: The Drowned Suburbs (handcrafted, tier 2; nodes + edges in data/zones.js) ----
    b_outfall:       { kind: "industrial", zone: "b", name: "Storm Drain Outfall",  icon: "loc_outfall",      family: "beasts",  size: "S", odds: { hostiles: 30, event: 0,  survivors: 0 },  tags: ["water"], events: [], passage: "storm_drain" },
    b_culdesac:      { zone: "b", enemyBudgetMult: 0.85, floor: "tile_floor_b_wet", name: "Flooded Cul-de-sac",   icon: "loc_culdesac",     family: "beasts",  size: "M", odds: { hostiles: 55, event: 30, survivors: 5 },  tags: ["food", "cloth", "biomass"], events: ["rooftop_survivor"] },
    b_warrens:       { zone: "b", name: "Hound Warrens",        icon: "loc_warrens",      family: "beasts",  size: "M", odds: { hostiles: 75, event: 15, survivors: 0 },  tags: ["chemicals", "biomass"], events: ["cache"],
                       objectWeights: { body: 60 } },    // nest: lots of old bodies
    b_clinic:        { kind: "medical", zone: "b", enemyBudgetMult: 0.8, name: "Harrow Street Clinic", icon: "loc_harrow_clinic",family: "beasts",  size: "M", odds: { hostiles: 50, event: 40, survivors: 10 }, tags: ["med", "chemicals", "terminal"], events: ["cryo_ward"] },
    b_cistern:       { kind: "industrial", zone: "b", name: "Cistern Pumphouse",    icon: "loc_cistern",      family: "outlaws", size: "S", odds: { hostiles: 45, event: 25, survivors: 0 },  tags: ["water", "scrap", "office"], events: ["toll_gate"] },
    b_levee:         { zone: "b", floor: "tile_floor_b_wet", name: "Levee Boat Launch",    icon: "loc_boat_launch",  family: "beasts",  size: "S", odds: { hostiles: 40, event: 0,  survivors: 0 },  tags: [], events: [],
                       extraction: { type: "defense", surviveSec: 20, waves: 3, waveBudgetMult: 0.7 } },           // the zone's only extraction (x0.7 total, via the waves; 20 s so B6 isn't where most runs end)
    // ---- Slice 5 §G: The Greyback Hills (handcrafted, tier 2; nodes + edges in data/zones.js; Smudge's markers aa8b4fd) ----
    // Outlaws + feral goats, long sightlines. [DRAFT] numbers, [PLACEHOLDER] flavor. Not yet built (brainstorm): Quarry
    // blasting charges mid-fight, the Hermit's 50/50 trader / cannibal, Relay storms, the Dam's floodgate lore reveal.
    gb_switchback:   { zone: "greyback", name: "Switchback Road",     icon: "loc_switchback",        family: "outlaws", size: "S", odds: { hostiles: 30, event: 0,  survivors: 5 },  tags: ["fuel", "scrap"], events: [], passage: "deer_trail" },   // a jackknifed fuel tanker
    gb_terraces:     { zone: "greyback", name: "Goatherd Terraces",   icon: "loc_goatherd_terraces", family: "beasts",  size: "M", odds: { hostiles: 70, event: 20, survivors: 5 },  tags: ["food", "cloth"], events: ["cache"], enemyBudgetMult: 0.9 },   // the goats' home (the pet goat drops from goats)
    gb_goat_path:    { zone: "greyback", name: "Goat Path",           icon: "loc_goat_path",         family: "beasts",  size: "S", odds: { hostiles: 35, event: 0,  survivors: 0 },  tags: ["food"], events: [],
                       // slow: every attempt is a long climb (+slowHeat, and a hunter pack gets its move)
                       extraction: { type: "check", skill: "survival", dc: 11, failHeat: 2, slowHeat: 2, slow: true,
                                     okText: "you pick your way down the goat path, one ledge at a time.", failText: "the path ends in a sheer drop. You climb back up." } },
    gb_hermit:       { zone: "greyback", name: "Hermit's Cave",       icon: "loc_hermit_cave",       family: "outlaws", size: "S", odds: { hostiles: 15, event: 40, survivors: 60 }, tags: ["food", "water"], events: ["cache"] },
    gb_quarry:       { kind: "industrial", zone: "greyback", name: "Quarry Pit", icon: "loc_quarry_pit", family: "machines", size: "M", odds: { hostiles: 55, event: 25, survivors: 0 }, tags: ["scrap", "chemicals"], events: ["cache"] },   // old mining machines still on schedule
    gb_lodge:        { zone: "greyback", name: "Pinecrest Ski Lodge", icon: "loc_ski_lodge",         family: "outlaws", size: "L", odds: { hostiles: 60, event: 30, survivors: 10 }, tags: ["cloth", "food", "fuel", "office"], events: ["toll_gate", "cache"] },
    gb_relay:        { zone: "greyback", name: "Relay Summit",        icon: "loc_relay_summit",      family: "machines", size: "S", odds: { hostiles: 40, event: 60, survivors: 0 }, tags: ["electronics", "data", "terminal"], events: ["relay"] },
    gb_cable_car:    { zone: "greyback", name: "Cable Car Station",   icon: "loc_cable_car",         family: "outlaws", size: "M", odds: { hostiles: 35, event: 0,  survivors: 0 },  tags: ["scrap"], events: [],
                       // the brainstorm's "Mechanics" check = Engineering (no Mechanics skill). A Bad Fail stalls the car halfway: a fight on the car (budget x stallBudgetMult); win it and the car rolls on (extracted)
                       extraction: { type: "check", skill: "engineering", dc: 13, failHeat: 4, badFail: "stall", stallBudgetMult: 0.8,
                                     okText: "the motor catches and the car lurches out over the drop.", failText: "the motor coughs and dies.",
                                     stallText: "The car stalls halfway across. Something climbs onto the roof!" } },
    gb_dam:          { kind: "industrial", zone: "greyback", name: "Harlan Dam", icon: "loc_harlan_dam", family: "outlaws", size: "M", odds: { hostiles: 45, event: 35, survivors: 5 }, tags: ["water", "scrap", "office"], events: ["toll_gate", "cache"], passage: "spillway" },
    // SECRET (Vixie): off the map background, never an "Unscouted" marker; shown once adjacent (hiddenUntilAdjacent), then remembered
    gb_crater:       { zone: "greyback", name: "The Crater",          icon: "loc_crater",            family: "hunters", size: "M", odds: { hostiles: 60, event: 0, survivors: 0 },  tags: ["crater", "electronics", "data"], events: [], secret: true,
                       entryHeat: 12 }   // "huge Heat on entry" (first entry each run); the pod (searchables crater_pod): Orange chance
  },
  gruntSpendDeathChance: 30 // §9.2 "Scout ahead": auto-pass Perception/Stealth checks, 30% death
};
