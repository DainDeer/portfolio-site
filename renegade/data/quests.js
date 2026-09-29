// Slice 2 §9: 2 quest givers, 6 quests, reputation L1-L2. Text and names [PLACEHOLDER], numbers [DRAFT].
// Objective types: turnin { res, n } (paid from the stockpile) · find { item, zone, loc, object } · kill { zone, n, family | units }
window.DATA = window.DATA || {};
DATA.quests = {
  maxActive: 5,
  repLevels: [0, 2],          // rep needed for L1, L2 (reputation above L2 is deferred)
  repPerQuest: 1,
  givers: {
    dunn: { name: "Dunn", title: "the Quartermaster", hotspot: "dunn_stores", portrait: "npc_dunn",
            perks: { 2: { type: "upgradeCostMult", res: ["food", "water"], mult: 0.8, desc: "Upgrades cost 20% less Food and Water." } } },
    ilse: { name: "Doc Ilse", title: "runs the Infirmary", hotspot: "ilse_tent", portrait: "npc_ilse", journal: true,
            perks: { 2: { type: "medicNextPick", desc: "A Medic is guaranteed in your next human body pick (one-shot)." } } }
  },
  list: {
    dunn_dry_stores:  { giver: "dunn", name: "Dry Stores", type: "turnin", objective: { res: "food", n: 15 },
                        hint: "Homes and markets usually have some.", text: "The stores are running thin. Bring me food.",
                        reward: { res: { scrap: 10 } } },
    dunn_pump_house:  { giver: "dunn", name: "Pump House", type: "find",
                        objective: { item: "quest_pump_valve", zone: "a", loc: "pump_station",
                                     object: { name: "Pump machinery", type: "locker", sprite: "obj_pump_machinery", searchSec: 4, noise: 8 } },
                        hint: "In the pump machinery at the Pump Station (The Scablands).", text: "Our pump's valve cracked. The old Pump Station has one.",
                        reward: { item: { base: "military_ruck", rarity: "blue", ilvl: 3 } } },
    dunn_toll:        { giver: "dunn", name: "Toll Collectors", type: "kill", objective: { zone: "a", family: "outlaws", n: 6 },
                        hint: "Any Outlaws in The Scablands.", text: "Raiders keep taxing our runners. Thin them out.",
                        reward: { res: { water: 10 } } },
    ilse_clean_hands: { giver: "ilse", name: "Clean Hands", type: "turnin", objective: { res: "chemicals", n: 8 },
                        hint: "Garages and labs.", text: "I need chemicals to keep the instruments clean.",
                        reward: { res: { med: 3 } } },
    ilse_ledger:      { giver: "ilse", name: "The Clinic Ledger", type: "find",
                        objective: { item: "quest_ilse_ledger", zone: "b", loc: "b_clinic",
                                     object: { name: "Doc's desk", type: "desk", searchSec: 3 } },
                        hint: "Doc's desk at Harrow Street Clinic (The Drowned Suburbs, needs the passage).", text: "My old ledger is still in my desk at the Harrow Street Clinic.",
                        reward: { lore: "ilse_ledger" } },
    ilse_glands:      { giver: "ilse", name: "Hound Glands", type: "kill", objective: { zone: "b", units: ["hound", "spitter", "maw"], n: 8 },
                        hint: "Bio-beasts (hound, spitter, maw) in The Drowned Suburbs.", text: "Beast glands make good reagents. Bring down eight.",
                        reward: { res: { chemicals: 6 } } }
  }
};
