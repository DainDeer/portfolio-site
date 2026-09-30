// Slice 4 §B: the main questline + the cryo pods puzzle. Tuning lives here; logic is js/mainquest.js (G.Main).
//
// quests.<id>: { name, giver, objective (Journal line), where (optional: shown once the location is scouted, i.e. the
//   node has been seen on a map), placeholder (no objective logic yet), next (unlocks when this one completes) }
// State (save): state.main = { quests: { <id>: "locked" | "active" | "done" }, pods: { sol: [w0, w1, w2] } }.
//   Main 1 goes active when you finish talking to Old Marta (any tutorial choice) and completes when you claim the
//   body in the pods room. Old saves with tutorialDone already set start with Main 1 done.
//
// pods: the location holding the working pod (Zone A). The map guarantees it (DATA.map.guaranteed). Room 1 is the
//   location as generated; the room behind its first door becomes the sealed pods room. The door opens when the
//   three wheels match the mural (random per save, 4^3 = 64 combos, stored in the save). No fail state, no noise,
//   +0 Heat. Wheel positions: 0 = up, 1 = right, 2 = down, 3 = left (clockwise).
DATA.main = {
  order: ["m1", "m2"],
  quests: {
    m1: { name: "A Body of Your Own", giver: "marta", objective: "Recover a body from the cryo pods.", where: "cryo_annex", next: "m2" },
    m2: { name: "[CONTACT]", giver: "marta", objective: "Find [CONTACT] in the next zone.", placeholder: true }   // [PLACEHOLDER] Slice 4 §B: no logic yet
  },
  martaHint: "The pods are behind a door with three wheels. Somebody painted the answer on the wall, because of course they did.",
  pods: {
    loc: "cryo_annex", zone: "a",
    wheels: 3, positions: 4,
    arrows: ["↑", "→", "↓", "←"],
    wheel: { name: "Wall wheel", px: 56 },
    door: { name: "Sealed door", sprite: "obj_door_locked", blocked: "Sealed. The three wheels beside it must be set just right." },
    mural: { name: "Faded mural", examine: "A faded mural of three wheels, each with its arrow painted in: {sol}." },
    pod: { name: "Working cryo pod", sprite: "obj_cryo_pod", claimed: "Empty. You already took this one." },
    openText: "Something heavy clunks behind the wall. The sealed door grinds open.",
    claimText: "The one pod still humming hisses open. The body inside is warm."
  }
};
