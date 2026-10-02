// Slice 4 §D: collectible cards (Series 1) + the binder. Not items: no weight, no slot, never in the stash, never lost.
// Picked up the moment they drop. The list is BUILT FROM DATA (js/cards.js G.Cards.list()), so new content adds cards:
//   every enemy unit (DATA.enemies.units), the rival crews (one card), every quest giver (DATA.quests.givers) + Old
//   Marta, every location in every zone (DATA.map.locations; Slice 5 §G adds Greyback).
// Card id: "<kind>:<id>"  kind = enemy | rival | npc | loc.   Group: creatures | people | places (see groupOf).
// Rarity: common (regular enemies, locations), uncommon (elite-grade units listed below, NPCs), rare (a unit or
//   location with rare: true / secret: true, Hunters, rivals).
// Save: state.cards = { have: { <cardId>: { n, foil, first } }, searched: { <nid>: true }, searchedRun: <runCount the marks belong to>, rs: <card rng state>,
//   sets: { <group>: { at } }, full: { at } | null, wild: <unspent Foil wild cards> } (sets / full / wild: Slice 5 §J). A dev build that
//   wipes the save wipes cards too.
DATA.cards = {
  series: 1,
  foilPct: 5,                       // any drop: 1 in 20 is Foil (tracked separately: have[id].foil counts Foil copies)
  drops: {                          // [DRAFT] percent
    kill: 2,                        // an enemy you kill gives its card
    search: 4,                      // searching a location gives its card (the first search of that location per run only)
    rare: 25,                       // rare beasts, Hunters, rivals (per kill)
    npcQuest: 100                   // finishing that NPC's first quest (Marta: Main 1)
  },
  rarities: {
    common:   { name: "Common",   frame: "card_frame_common" },
    uncommon: { name: "Uncommon", frame: "card_frame_uncommon" },
    rare:     { name: "Rare",     frame: "card_frame_rare" }
  },
  groups: [["creatures", "Creatures"], ["people", "People"], ["places", "Places"]],
  peopleFamilies: ["outlaws", "hunters", "rivals"],   // enemy families that file under People (the rest are Creatures)
  uncommonUnits: ["brute", "maw", "ai_sentry", "ai_warden"],   // "elites": the heavy units (Elite is also an in-run prefix on any unit)
  rareFamilies: ["hunters", "rivals"],
  rareLocations: ["renegade_hollow"],   // "secret locations" (no location carries a secret flag yet; a location with rare: true / secret: true also counts)
  rival: { name: "Renegade Crew", sprite: "enemy_outlaw_gunman" },
  // Slice 5 §J (Vixie [DRAFT]): set-completion rewards, once each per binder (they ride along when you relocate). No
  // combat power. A group = every card in it (Creatures / People / Places): a stockpile snack (res) + that group's frame
  // tint in the binder. The whole Series: a title line on the HUD and the title screen + one Foil wild card (open any
  // card you have in the binder and turn it into a Foil copy). The list grows with content: a group finished once stays
  // rewarded (and tinted) even if a later build adds cards to it.
  sets: {
    group: { res: { food: 10, water: 10 }, tints: { creatures: "#6fbf5a", people: "#e0a040", places: "#58a8e0" } },
    full: { title: "[PLACEHOLDER] Keeper of Series 1", wildFoil: 1 },
    text: {
      group: "{name} complete! +{res} to the stockpile, and the {name} pages get their frame tint.",
      full: "Series 1 complete! New title: {title}. You also get a Foil wild card: open any card in the binder to use it.",
      wild: "Foil wild card ×{n}: open a card you have to make it a Foil copy.",
      wildUse: "Use the Foil wild card on this one",
      wildDone: "{name} is now a Foil copy."
    }
  },   // one card for every rival squad
  // one-line blurbs [PLACEHOLDER] (the flavor pass writes them); missing ones use the group default
  blurbs: {},
  blurbDefault: { creatures: "[PLACEHOLDER] Something out there that wants you dead.", people: "[PLACEHOLDER] Somebody with a story.", places: "[PLACEHOLDER] A place in the wastes." },
  // the pickup pop (corner of the screen): card back, flip, front; "NEW!" on a first copy
  pop: { holdMs: 2600, flipMs: 420, newDelayMs: 200, toastMs: 3500 },   // toastMs: landscape phone battles show a bottom toast instead (js/cardview.js)
  art: { frameSize: [80, 112], window: [8, 8, 64, 64], namePlate: [7, 77, 66, 20], newBadge: [54, -5], foilFrames: 6, foilFps: 8 }
};
