// Slice 2 §8: the one outpost upgrade (Vault L2) and the stash limit. Numbers [DRAFT]. Vault L2 Scrap/Cloth 30/10 → 15/5 (design call on dd310c8), Food/Water 15/15 → 8/8 (design call on d843431); tests/vault_cost_sweep.txt.
// Build timers use real timestamps (G.now(): progresses offline, the debug fast-forward moves it).
window.DATA = window.DATA || {};
DATA.outpost = {
  stash: { baseCap: 30 },     // ASSUMPTION: gear slots in the Vault stash at L1 (quest items don't count). Resources have no cap.
  buildings: {
    vault: {
      name: "Vault", sprite: "bld_vault", maxLevel: 2,
      levels: {
        1: { effects: {} },
        2: { cost: { scrap: 15, cloth: 5, food: 8, water: 8 }, buildSec: 120,
             effects: { pouchSlots: 2, pouchMaxKg: 2, stashBonus: 10 }, desc: "Secure Pouch 1 → 2 slots (max 1 → 2 kg), stash +10" }
      }
    }
  }
};
