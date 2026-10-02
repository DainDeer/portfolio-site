// Slice 2 §3: zones, Zone B's handcrafted map, and the passage between them. Numbers [DRAFT], names [PLACEHOLDER].
// One expedition = one zone, but a passage can be crossed mid-run (you keep Heat, carry and squad).
window.DATA = window.DATA || {};
DATA.zones = {
  order: ["a", "greyback", "b", "hollis", "scablands"],   // Slice 5 §G (Vixie): new zones get descriptive ids (greyback, hushwood, hollis); a / b keep theirs
  // Slice 5 §G: the order the zone cards show in (discovery / difficulty): Hushwood (a) > Greyback Hills > Drowned Suburbs (b)
  // > Hollis Outskirts > Scablands
  // Open Question 7: does spotting a passage unlock its zone even if you die this run? true = unlock at once.
  passageUnlockOnDeath: true,
  // Slice 5 §G: arena floor per zone id (js/battleview.js BV.arenaBg; Smudge c2c0f9c). Unlisted (b) or unregistered: bg_battle
  battleFloors: { a: "bg_battle_hushwood", greyback: "bg_battle_greyback", scablands: "bg_battle_scablands", hollis: "bg_battle_hollis" },
  list: {
    a: {
      name: "The Hushwood", size: "Medium", tierLabel: "Tier 1–3", familyMix: "Outlaws and Bio-beasts",   // no machines, ever (Vixie, Slice 5 §G)
      startUnlocked: true, generated: true,        // the Slice 1 generated map (DATA.map)
      insertion: "outpost",                        // node id of the insertion point (drawn as insertionName, never the outpost)
      insertionName: "Ranger's Gate", resourceMult: 1, dcBonus: 0,   // Vixie: named after its marker (was "Insertion Point")
      mapBg: "map_bg_hushwood",                   // Slice 5 §G (Smudge 1828231)
      insertionIcon: "loc_ranger_gate",           // the Ranger's Gate (Smudge 8272465; js/mapview.js, default loc_insertion)
      // Vixie: machine-free for good (beasts and raiders). Terminal alarms don't roll here; any other machine fight (the
      // Cryo Ward's "defence system" bad fail) is fought by raiders instead (js/expedition.js X.zoneFamily) [DRAFT]
      noFamilies: ["machines"], familySwap: { machines: "outlaws" }
    },
    // Slice 5 §G (Vixie): The Scablands, the late wasteland (tier 5). Generated like zone a from its own seed salt, ~9 nodes:
    // the six places that left the Hushwood + Rooftop Pickup (moved here) + Tunnel Home (sc_tunnel, the old defense).
    // Reached by the hidden Rail Spur out of the Hushwood's Rail Yard (DATA.zones.passages.rail_spur), which comes up in the
    // Collapsed Transit Tunnel (fixed in row 1). Machines live here (Relay Tower 7, Pylon Field): zone a stays machine-free.
    // Art (Smudge c2c0f9c; each falls back if unregistered): mapBg, the floors / walls byZone keys in data/searchables.js,
    // loc_sc_tunnel / obj_ex_sc_tunnel, obj_passage_rail_spur(_open), bg_battle_scablands (battleFloors).
    scablands: {
      name: "The Scablands", size: "Medium", tierLabel: "Tier 5", familyMix: "Outlaws, machines and Bio-beasts",
      startUnlocked: false, lockedLabel: "??? – find the way in",
      generated: true, insertion: "sc_ins", resourceMult: 1.35, dcBonus: 0, tier: 5,   // [DRAFT] resourceMult (Zone B 1.25, Greyback 1.2)
      mapBg: "map_bg_scablands",                    // Smudge c2c0f9c: scenery only (generated nodes, the spur isn't painted); js/mapview.js falls back to map_bg if unregistered
      // generator block (js/map.js M.genConfig): 4 rows of 2 behind the insertion (row 0), every row tier 5 [DRAFT]
      gen: { salt: 0x5ca61a4d, idPrefix: "sc", rows: [2, 2, 2, 2], rowTier: [0, 5, 5, 5, 5], filler: "fuel_depot",
             fixed: { transit_tunnel: { rows: [1] }, sc_tunnel: { rows: [3, 4] }, ex_rooftop: { rows: [4] } } }
    },
    b: {
      name: "The Drowned Suburbs", size: "Small", tierLabel: "Tier 2", familyMix: "85% Bio-beasts / 15% Outlaws",
      startUnlocked: false, lockedLabel: "??? – find the way in",
      insertion: "b1", mapBg: "map_bg_b", resourceMult: 1.25, dcBonus: 0, tier: 2,
      enemyBudgetMult: 1.08,   // every fight in the zone (Slice 3 §11 lever 2, "Zone B enemy budgets"): fresh-starter deaths 52% at 1, 52.9% at 1.06, 60.0% at 1.1
      // design call (milestone 3): zone-wide events added to every location's pool that has events (weight vs 1 per
      // location event), rolled on the location's Event %
      eventPool: { drone_patrol: 0.5 },
      // handcrafted nodes in the 1000x600 map space. hiddenUntilAdjacent: never shown as an "Unscouted" marker
      nodes: {
        b1: { loc: "b_outfall",  x: 110, y: 300 },
        b2: { loc: "b_culdesac", x: 360, y: 150 },
        b3: { loc: "b_warrens",  x: 360, y: 450 },
        b4: { loc: "b_clinic",   x: 630, y: 170 },
        b5: { loc: "b_cistern",  x: 630, y: 430 },
        b6: { loc: "b_levee",    x: 880, y: 300, hiddenUntilAdjacent: true }
      },
      edges: [["b1", "b2"], ["b1", "b3"], ["b2", "b3"], ["b2", "b4"], ["b3", "b5"], ["b4", "b5"], ["b4", "b6"], ["b5", "b6"]]
    },
    // Slice 5 §G: The Greyback Hills (handcrafted, tier 2). Outlaws + feral goats; long sightlines. Reached by the Deer Trail
    // (Zone A) or up the Spillway Tunnel from the Drowned Suburbs. Node positions: Smudge's greyback_manifest.json.
    greyback: {
      name: "The Greyback Hills", size: "Medium", tierLabel: "Tier 2", familyMix: "Outlaws and feral goats",
      startUnlocked: false, lockedLabel: "??? – find the way in",
      insertion: "gb1", insertionName: "Switchback Road", resourceMult: 1.2, dcBonus: 0, tier: 2,
      enemyBudgetMult: 1.05,
      mapBg: "map_bg_greyback",                     // js/mapview.js (per-zone background; b: map_bg_b)
      // the units a family buys from in this zone (default: DATA.enemies.families[f].units). Goats are Greyback-only.
      familyUnits: { beasts: ["goat", "goat", "hound", "maw"] },
      nodes: {
        gb1:  { loc: "gb_switchback", x: 110, y: 480 },
        gb2:  { loc: "gb_terraces",   x: 260, y: 330 },
        gb3:  { loc: "gb_goat_path",  x: 90,  y: 230 },
        gb4:  { loc: "gb_hermit",     x: 240, y: 130 },
        gb5:  { loc: "gb_quarry",     x: 450, y: 470 },
        gb6:  { loc: "gb_lodge",      x: 500, y: 230 },
        gb7:  { loc: "gb_relay",      x: 720, y: 90 },
        gb8:  { loc: "gb_cable_car",  x: 760, y: 250 },
        gb9:  { loc: "gb_dam",        x: 740, y: 430 },
        gb10: { loc: "gb_crater",     x: 900, y: 120, hiddenUntilAdjacent: true }   // Vixie: secret, like the Levee
      },
      edges: [["gb1", "gb2"], ["gb1", "gb5"], ["gb2", "gb3"], ["gb2", "gb4"], ["gb2", "gb6"], ["gb4", "gb6"], ["gb5", "gb6"], ["gb5", "gb9"],
              ["gb6", "gb8"], ["gb6", "gb7"], ["gb7", "gb10"], ["gb8", "gb9"]]
    },
    // Slice 5 §G (Vixie 06:30): The Hollis Outskirts (handcrafted, tier 4) between the Drowned Suburbs and the Scablands.
    // Reached by the Sunken Underpass out of the Flooded Cul-de-sac (Zone B). Node positions + art: Smudge's
    // hollis_manifest.json (91a7553); room objects hollis_objects_manifest.json (8272465 / c93f2e3). Numbers [DRAFT].
    hollis: {
      name: "The Hollis Outskirts", size: "Medium", tierLabel: "Tier 4", familyMix: "Outlaws, cultists and perimeter machines",
      startUnlocked: false, lockedLabel: "??? – find the way in",
      insertion: "ho1", insertionName: "Overpass Camp", resourceMult: 1.3, dcBonus: 0, tier: 4,   // [DRAFT] resourceMult (B 1.25, Scablands 1.35)
      mapBg: "map_bg_hollis",
      nodes: {
        ho1: { loc: "ho_overpass",    x: 120, y: 430 },
        ho2: { loc: "ho_megamart",    x: 330, y: 250 },
        ho3: { loc: "ho_molar",       x: 250, y: 510 },
        ho4: { loc: "ho_garage",      x: 520, y: 440 },
        ho5: { loc: "ho_church",      x: 500, y: 120 },
        ho6: { loc: "ho_fence",       x: 880, y: 300 },
        ho7: { loc: "ho_rail",        x: 700, y: 520 },
        ho8: { loc: "ho_helipad",     x: 720, y: 170 },
        ho9: { loc: "ho_data_center", x: 660, y: 330, hiddenUntilAdjacent: true }   // the secret data center (behind a fake storefront)
      },
      edges: [["ho1", "ho2"], ["ho1", "ho3"], ["ho3", "ho2"], ["ho2", "ho5"], ["ho2", "ho4"], ["ho3", "ho4"], ["ho5", "ho8"], ["ho4", "ho8"],
              ["ho4", "ho7"], ["ho4", "ho9"], ["ho9", "ho6"], ["ho8", "ho6"], ["ho7", "ho6"]]
    }
  },
  passages: {
    // Slice 5 §G (Vixie 06:40): [PLACEHOLDER] the Sunken Underpass, Flooded Cul-de-sac (Drowned Suburbs) <-> Overpass Camp (Hollis).
    // Smudge's c93f2e3 art: the still + _open, and the drip loop (anim; _drip_open once found; the still under reduced motion).
    sunken_underpass: {
      name: "Sunken Underpass", crossVerb: "wade through", spotText: "[PLACEHOLDER] The flood water runs one way here, hard, into a dark gap under the road.", hiddenWhere: "under the flooded road",
      sprite: "obj_passage_sunken_underpass", anim: "obj_passage_sunken_underpass_drip", mapIcon: "map_passage",
      examine: "[PLACEHOLDER] A road underpass, half full of black water. The other end smells of exhaust and cooking fires.",
      ends: { b: { zone: "b", loc: "b_culdesac" }, hollis: { zone: "hollis", node: "ho1" } },
      hiddenAt: "b",                                     // hidden in the Cul-de-sac until spotted; always visible at the Overpass Camp
      spot: { skills: ["perception", "survival"], dc: 13 },
      crossHeat: 5                                       // [DRAFT] same as the storm drain / spillway
    },
    storm_drain: {
      name: "Storm drain grate", sprite: "obj_grate", examine: "[PLACEHOLDER] A storm drain grate. Cold air breathes up from below.", mapIcon: "map_passage",
      ends: { a: { zone: "a", loc: "rail_yard" }, b: { zone: "b", node: "b1" } },
      hiddenAt: "a",                                     // hidden in the Rail Yard until spotted; always visible at B1
      spot: { skills: ["perception", "survival"], dc: 12 }, // once per visit on entering the Rail Yard, squad's best of either
      crossHeat: 5
    },
    // Slice 5 §G: the Deer Trail starts at the Hushwood's Fire Lookout (fixed in rows 3-4, DATA.map.fixed)
    deer_trail: {
      name: "Deer Trail", crossVerb: "follow", spotText: "[PLACEHOLDER] Fresh hoofprints cut off between the trees, uphill.", hiddenWhere: "behind the lookout", sprite: "obj_passage_deer_trail", examine: "[PLACEHOLDER] A narrow trail of hoofprints climbs into the hills. Something with horns uses it every day.", mapIcon: "map_passage",
      ends: { a: { zone: "a", loc: "fire_lookout" }, greyback: { zone: "greyback", node: "gb1" } },
      hiddenAt: "a",
      spot: { skills: ["perception", "survival"], dc: 12 },
      crossHeat: 4
    },
    // Slice 5 §G (Vixie): the secret rail spur, Rail Yard (Hushwood) <-> Collapsed Transit Tunnel (Scablands). Spot DC 15.
    // Room object: Smudge's overgrown-rail marker obj_passage_rail_spur / _open (c2c0f9c; fallbackSprite only if it's
    // ever unregistered). Map icon (once found): her map_passage_rail_spur (Vixie), generic map_passage as the fallback.
    rail_spur: {
      name: "Rail Spur", crossVerb: "follow", spotText: "[PLACEHOLDER] One set of rails doesn't stop at the buffers. It runs on under the vines, east.", hiddenWhere: "under the vines past the buffers",
      sprite: "obj_passage_rail_spur", fallbackSprite: "obj_passage_deer_trail",   // + _open once found (Smudge c2c0f9c)
      mapIcon: "map_passage_rail_spur",                  // Vixie: its own mark once found (reads as a warning); map_passage if unregistered / the file fails
      examine: "[PLACEHOLDER] A spur line, half-swallowed by growth, running off into the dark. Nothing's used it in years. Something has.",
      ends: { a: { zone: "a", loc: "rail_yard" }, scablands: { zone: "scablands", loc: "transit_tunnel" } },
      hiddenAt: "a",                                     // hidden in the Rail Yard until spotted; always visible in the Transit Tunnel
      spot: { skills: ["perception", "survival"], dc: 15 }, // [DRAFT] Vixie: DC 15, like the Witch's Cottage
      crossHeat: 5                                       // [DRAFT] same as the storm drain
    },
    spillway: {
      name: "Spillway Tunnel", crossVerb: "climb through", spotText: "[PLACEHOLDER] Water trickles out of a crack behind the pumps. It's coming from somewhere higher.", hiddenWhere: "behind the pumps", sprite: "obj_passage_spillway", anim: "obj_passage_spillway_trickle",   // anim (Vixie): the trickle; the still under reduced motion
      examine: "[PLACEHOLDER] A concrete spillway tunnel, dripping. The dam is somewhere above.", mapIcon: "map_passage",
      ends: { greyback: { zone: "greyback", loc: "gb_dam" }, b: { zone: "b", loc: "b_cistern" } },
      hiddenAt: "b",                                     // hidden in the Cistern Pumphouse until spotted; always visible at the dam
      spot: { skills: ["perception", "engineering"], dc: 13 },
      crossHeat: 5
    }
  }
};
