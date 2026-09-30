// §11 / Slice 2 §7 / Slice 3 §11: the 11 resources. kg per unit [DRAFT]. Carried in the bag at their weight, go to the stockpile
// (state.stash.res) on extraction, lost on death. No cap, no drain, no rot.
// `hidden`: kept in saves but never shown and never dropped (deferred, not deleted).
window.DATA = window.DATA || {};
DATA.resources = {
  // dropMult: multiplies the AMOUNT found per search roll (not the table weight), on top of the zone's resourceMult.
  // Food/Water x2 (design call on ff17090, tuned with tests/tutorial.js SIM_SET sweep, see tests/drop_mult_sweep.txt).
  food:        { name: "Food",         sprite: "res_food",        kgPerUnit: 1, dropMult: 2 },
  water:       { name: "Water",        sprite: "res_water",       kgPerUnit: 1, dropMult: 2 },
  scrap:       { name: "Scrap",        sprite: "res_scrap",       kgPerUnit: 1 },
  cloth:       { name: "Cloth",        sprite: "res_cloth",       kgPerUnit: 0.5 },
  electronics: { name: "Electronics",  sprite: "res_electronics", kgPerUnit: 0.5 },
  chemicals:   { name: "Chemicals",    sprite: "res_chemicals",   kgPerUnit: 0.5 },
  med:         { name: "Med Supplies", sprite: "res_med",         kgPerUnit: 0.3 },
  // Slice 3 §11: four new resources (biomass was a hidden Slice 2 resource, now dropping).
  // tag: the location tag that doubles this resource's loot-table weight (default: the resource id).
  // heatPerMove: extra Heat per move for every unit carried (Relic Tech: the doc says 2, this slice starts at 1).
  fuel:        { name: "Fuel",         sprite: "res_fuel",        kgPerUnit: 2 },
  biomass:     { name: "Biomass",      sprite: "res_biomass",     kgPerUnit: 1 },
  data_shards: { name: "Data Shards",  sprite: "res_data_shards", kgPerUnit: 0.1, tag: "data" },
  relic:       { name: "Relic Tech",   sprite: "res_relic_tech",  kgPerUnit: 2, heatPerMove: 1 },
  // Slice 5 §F animal parts: every beast carcass has them (searchables.types.body_beast.extras). [DRAFT Rivet call] Meat
  // is carried like any resource and turns into Food when you extract (convertOnExtract: 2 Meat = 1 Food, by weight); it never sits in the
  // stockpile (bagOnly). Fur and Teeth go to the stockpile for the Workbench (Cure fur, Tooth hand-loads). Icons: Smudge (2c36080).
  meat:        { name: "Meat",         sprite: "item_meat",       kgPerUnit: 0.5, bagOnly: true, convertOnExtract: { to: "food", per: 0.5 } },
  fur:         { name: "Fur",          sprite: "item_fur",        kgPerUnit: 0.5 },
  teeth:       { name: "Teeth",        sprite: "item_teeth",      kgPerUnit: 0.1 }
};
// Slice 1 save migration: resource ids that were renamed
DATA.resourceRenames = { circuits: "electronics" };
