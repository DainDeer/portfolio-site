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
    revealedAlphaByZone: { b: 0 } // Zone B: its painted background (map_bg_b) shows through as-is
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
    hollow_creek:    { name: "Hollow Creek",          icon: "loc_settlement",family: "outlaws", size: "M", odds: { hostiles: 0, event: 0, survivors: 50 }, tags: ["food", "water"], events: [], worldEvent: "distress_hollow_creek",
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
                       extraction: { type: "defense", surviveSec: 20, waves: 3, waveBudgetMult: 0.7 } }            // the zone's only extraction (x0.7 total, via the waves; 20 s so B6 isn't where most runs end)
  },
  gruntSpendDeathChance: 30 // §9.2 "Scout ahead": auto-pass Perception/Stealth checks, 30% death
};
