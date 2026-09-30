// Slice 2 §8 / Slice 3 §9-10: outpost buildings and the stash limit. Numbers [DRAFT]. Vault L2 Scrap/Cloth 30/10 → 15/5 (design call on dd310c8), Food/Water 15/15 → 8/8 (design call on d843431); tests/vault_cost_sweep.txt.
// L1 Infirmary 10/6/3/10/10 → 8/4/2/7/7, Radio 10/6/2/8/8 → 8/4/1/6/6, Still 12/4/2/6/6 → 8/3/1/4/4 so 3 new buildings land by run 15-18 (tests/slice3_build_sweep.txt).
// Build timers use real timestamps (G.now(): progresses offline, the debug fast-forward moves it).
// startLevel 0 = not built yet (Slice 3: the Workbench, Infirmary, Radio and Water Still are built from the stockpile).
// crews: how many buildings can build / upgrade at the same time across the whole outpost (Slice 3 §9: 1).
// hotspot: the town hotspot the building lives on (data/town.js); its built art comes from DATA.townArt (built.*).
// Dunn's L2 perk (-20% Food and Water) applies to every building cost (G.Quests.upgradeCostMult).
window.DATA = window.DATA || {};
DATA.outpost = {
  stash: { baseCap: 30 },     // ASSUMPTION: gear slots in the Vault stash at L1 (quest items don't count; an ammo stack is 1 slot). Resources have no cap.
  crews: 1,
  productionEnabled: true,    // Slice 3 §10c (open question 3): false hides the Water Still lot and stops production
  buildings: {
    vault: {
      name: "Vault", sprite: "bld_vault", maxLevel: 2, startLevel: 1, hotspot: "vault",
      levels: {
        1: { effects: {} },
        2: { cost: { scrap: 15, cloth: 5, food: 8, water: 8 }, buildSec: 120,
             effects: { pouchSlots: 2, pouchMaxKg: 2, stashBonus: 10 }, desc: "Secure Pouch 1 → 2 slots (max 1 → 2 kg), stash +10" }
      }
    },
    // §9: the locked `workshop` hotspot becomes the Workbench. tier: highest recipe tier; queue: crafting jobs at once
    // (they run one after another); craftIlvl: item level of crafted gear
    workbench: {
      name: "Workbench", sprite: "bld_workbench", maxLevel: 2, startLevel: 0, hotspot: "workshop",
      levels: {
        1: { cost: { scrap: 15, electronics: 3, food: 8, water: 8 }, buildSec: 120, effects: { tier: 1, queue: 1, craftIlvl: 3 }, desc: "Tier 1 recipes, 1 queue slot" },
        2: { cost: { scrap: 25, electronics: 6, fuel: 3, food: 13, water: 13 }, buildSec: 300, effects: { tier: 2, queue: 2, craftIlvl: 6 }, desc: "Tier 2 recipes, 2 queue slots, crafted gear item level 6" }
      }
    },
    // §10a: Doc Ilse's Tent is upgraded. beds: treatments at once; treatSec per injury (costs treatCost);
    // healRuns: untreated injuries heal after this many runs (default DATA.injuries.healRuns); medEverySec / medCap: free Med Supplies
    infirmary: {
      name: "Infirmary", sprite: "bld_infirmary", maxLevel: 2, startLevel: 0, hotspot: "ilse_tent",
      levels: {
        1: { cost: { cloth: 8, chemicals: 4, med: 2, food: 7, water: 7 }, buildSec: 180, effects: { beds: 1, treatSec: 240, treatCost: { med: 1 } }, desc: "1 bed: treat 1 injury for 1 Med Supplies in 4 min" },
        2: { cost: { cloth: 16, chemicals: 10, biomass: 2, med: 5, food: 16, water: 16 }, buildSec: 360,
             effects: { beds: 2, treatSec: 120, treatCost: { med: 1 }, healRuns: 2, produce: { med: { everySec: 1800, cap: 4 } } }, desc: "2 beds, 2 min per treatment, untreated injuries heal after 2 runs, +1 Med Supplies every 30 min (holds 4)" }
      }
    },
    // §10b: the Comms Array lot. bounties: board size; hot: bounties paying Data Shards; fogReveal: extra ring of fog lifted
    // around the insertion point; rivalMark: the rival's location is marked at run start (step 10)
    radio: {
      name: "Radio", sprite: "bld_radio", maxLevel: 2, startLevel: 0, hotspot: "lot_comms",
      levels: {
        1: { cost: { scrap: 8, electronics: 4, fuel: 1, food: 6, water: 6 }, buildSec: 180, effects: { bounties: 3, hot: 0, decode: true, rivalIntel: true }, desc: "Bounty board (3 bounties), rival sightings, decode Data Shards" },
        2: { cost: { scrap: 16, electronics: 10, data_shards: 2, fuel: 3, food: 13, water: 13 }, buildSec: 360,
             effects: { bounties: 4, hot: 1, decode: true, rivalIntel: true, rivalMark: true, fogReveal: 1 }, desc: "4 bounties (1 hot: pays Data Shards), rival location marked at run start, fog reveal +1 around the insertion point" }
      }
    },
    // §10c: the Water Still lot (behind productionEnabled). produce: { res: { everySec, cap } }, collected by clicking
    still: {
      name: "Water Still", sprite: "bld_still", maxLevel: 2, startLevel: 0, hotspot: "lot_still", production: true,
      levels: {
        1: { cost: { scrap: 8, cloth: 3, chemicals: 1, food: 4, water: 4 }, buildSec: 120, effects: { produce: { water: { everySec: 1200, cap: 6 } } }, desc: "+1 Water every 20 min (holds 6, click to collect)" },
        2: { cost: { scrap: 18, cloth: 6, biomass: 4, food: 10, water: 10 }, buildSec: 300, effects: { produce: { water: { everySec: 900, cap: 6 }, food: { everySec: 1800, cap: 6 } } }, desc: "Adds a garden: +1 Water every 15 min and +1 Food every 30 min (holds 6 each)" }
      }
    }
  },
  buildOrder: ["vault", "workbench", "infirmary", "radio", "still"]   // panel / debug order
};
