// Slice 5 §I: relocating the settlement (prestige). Megan: Diablo-style acts, you start over in a new home with a small
// bonus. Vixie's [DRAFT] call: keep the consciousness meta-progress (card binder, unlocked cosmetics, a small bonus
// table), reset the rest (zone maps + fog, stockpile back to the starting seed, body roster back to the starter body,
// Grunts, buildings, quests, the main quest), and carry ONE item out with you, Purple at most. Logic: js/prestige.js.
//
// gate: when the Journal offers it. main: that main quest done (Main 1, the pods body: Main 2 is the placeholder),
//   minExtractions: successful extractions in this act.
// acts: one per home, in order; relocating moves you to the next act (no relocation from the last one yet).
//   home: the town art set (DATA.townArtHomes[home], tools/sync-town-art.js from Smudge's assets/town_<home>/). null
//   = the current outpost art (DATA.townArt). artReady: false keeps the current art until that set is committed.
// bonus: per relocation, stacking. xpPct: + % to every XP gain (State.giveXp). No combat power (Vixie: no power creep).
window.DATA = window.DATA || {};
DATA.prestige = {
  enabled: true,
  gate: { main: "m1", minExtractions: 5 },             // [DRAFT]
  acts: [
    { id: 1, label: "Act I",  homeName: "The Outpost", home: "forest", tint: null },      // Megan: Act I home = the forest camp (Hushwood tone)
    { id: 2, label: "Act II", homeName: "Shelter 7",   home: "bunker", tint: "bunker" }   // [PLACEHOLDER] name from Smudge's town_bunker.json notes
  ],
  // Smudge's town_forest / town_bunker sets are on disk but not committed yet: until they are, every act draws the
  // current outpost art (+ the act's CSS tint, so the move still shows). Flip to true once the files are in the repo.
  artReady: { forest: true, bunker: false },   // SP-066 (Megan, Oct 2): the forest camp is Act I's home from the first save; the bunker waits for its overlays
  bonus: { xpPct: 5 },                                  // [DRAFT] per relocation
  keep: { items: 1, maxRarity: "purple" },              // [DRAFT] one item, Purple at most (no quest items, no pets)
  text: {
    title: "Relocate the settlement",
    offer: "[PLACEHOLDER] Marta's been talking about a place further out. Somewhere with walls. You could pack up and start over there.",
    locked: "Finish {main} and extract {n} times to be able to move the settlement ({have}/{n}).",
    keepsLine: "You keep: your card binder, every unlocked look, +{xp}% XP for good, and one item (Purple at most).",
    resetsLine: "You start over: new zone maps, the stockpile back to the start, the starter body, new Grunts, no buildings, quests reset.",
    confirm: "Pack up and move",
    done: "[PLACEHOLDER] You move the settlement to {home}. New walls, same you."
  }
};
