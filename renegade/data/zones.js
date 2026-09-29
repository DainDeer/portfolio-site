// Slice 2 §3: zones, Zone B's handcrafted map, and the passage between them. Numbers [DRAFT], names [PLACEHOLDER].
// One expedition = one zone, but a passage can be crossed mid-run (you keep Heat, carry and squad).
window.DATA = window.DATA || {};
DATA.zones = {
  order: ["a", "b"],
  // Open Question 7: does spotting a passage unlock its zone even if you die this run? true = unlock at once.
  passageUnlockOnDeath: true,
  list: {
    a: {
      name: "The Scablands", size: "Medium", tierLabel: "Tier 1–3", familyMix: "Outlaws and Bio-beasts",
      startUnlocked: true, generated: true,        // the Slice 1 generated map (DATA.map)
      insertion: "outpost",                        // node id of the insertion point (drawn as "Insertion Point", never the outpost)
      insertionName: "Insertion Point", resourceMult: 1, dcBonus: 0
    },
    b: {
      name: "The Drowned Suburbs", size: "Small", tierLabel: "Tier 2", familyMix: "85% Bio-beasts / 15% Outlaws",
      startUnlocked: false, lockedLabel: "??? – find the way in",
      insertion: "b1", resourceMult: 1.25, dcBonus: 0, tier: 2,
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
    }
  },
  passages: {
    storm_drain: {
      name: "Storm drain grate", sprite: "obj_grate", mapIcon: "map_passage",
      ends: { a: { zone: "a", loc: "rail_yard" }, b: { zone: "b", node: "b1" } },
      hiddenAt: "a",                                     // hidden in the Rail Yard until spotted; always visible at B1
      spot: { skills: ["perception", "survival"], dc: 12 }, // once per visit on entering the Rail Yard, squad's best of either
      crossHeat: 5
    }
  }
};
