// Addendum A2 (cut-down, Megan Sep 29): scouting reads in the map location tooltip. Logic: js/scouting.js.
// One automatic roll per location per run, the first time it's adjacent (or you're in it): the squad's best Perception
// (d20 + floor(skill / 4), no helpers, no gear) vs DC 12, +2 with the Radio at L2. Pass: every supply type with its amount
// + an enemy line (family: Light / Medium / Heavy vs your squad). Fail: "Unscouted" for all but the top supply.
DATA.scouting = {
  enabled: true,
  skill: "perception", dc: 12,
  radio: { level: 2, bonus: 2 },
  // supply amount = expected units of that resource from a fresh search of every generated searchable
  // (object weights x searchable count x each table's weights and amounts, x zone / resource multipliers),
  // x the restock level (before you go in) or x the unsearched share (once you've been inside this run).
  // Few below `some`, Some below `lots`, Lots at or above `lots`. Supplies under `minShown` aren't listed.
  supply: { minShown: 0.5, some: 3, lots: 8 },
  // strength = the location's enemy budget (tier + depth, x Heat, x the location's mult) / your squad's power
  // (alive units: body 2, Veteran 1.5, Grunt 1, each x its HP share). Light below `medium`, Medium below `heavy`.
  strength: { medium: 0.35, heavy: 0.7, power: { body: 2, veteran: 1.5, grunt: 1 } }
};
