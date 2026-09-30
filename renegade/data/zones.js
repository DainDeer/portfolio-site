// Slice 2 §3: zones, Zone B's handcrafted map, and the passage between them. Numbers [DRAFT], names [PLACEHOLDER].
// One expedition = one zone, but a passage can be crossed mid-run (you keep Heat, carry and squad).
window.DATA = window.DATA || {};
DATA.zones = {
  order: ["a", "greyback", "b"],   // Slice 5 §G (Vixie): new zones get descriptive ids (greyback, hushwood, hollis); a / b keep theirs
  // Slice 5 §G: the order the zone cards show in (discovery / difficulty): Hushwood (a) > Greyback Hills > Drowned Suburbs (b)
  // Open Question 7: does spotting a passage unlock its zone even if you die this run? true = unlock at once.
  passageUnlockOnDeath: true,
  list: {
    a: {
      name: "The Hushwood", size: "Medium", tierLabel: "Tier 1–3", familyMix: "Outlaws and Bio-beasts",
      startUnlocked: true, generated: true,        // the Slice 1 generated map (DATA.map)
      insertion: "outpost",                        // node id of the insertion point (drawn as "Insertion Point", never the outpost)
      insertionName: "Insertion Point", resourceMult: 1, dcBonus: 0,
      mapBg: "map_bg_hushwood",                   // Slice 5 §G (Smudge 1828231)
      insertionIcon: "loc_ranger_gate"            // the Ranger's Gate (Smudge 8272465; js/mapview.js, default loc_insertion)
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
    }
  },
  passages: {
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
