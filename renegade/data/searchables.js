// Slice 2 §5-6: location views. Searchable object types (time, noise, checks, loot tables), the three size templates
// and the tag-driven props. Numbers [DRAFT]. Formula constants (disturbance, revisit) live in data/config.js.
window.DATA = window.DATA || {};
DATA.searchables = {
  // Loot table entries: [resource id | null (nothing), weight, min, max]. A location tag that matches a resource
  // doubles that entry's weight (tagWeightMult). resRolls = how many times the table is rolled.
  // gearChance: % for one gear roll. gearRolls: guaranteed gear rolls. bonusItems/rarityBonus: extra gear.
  tagWeightMult: 2,
  types: {
    body_human: { name: "Body",          sprite: "corpse_human", searchSec: 2, noise: 3, gear: "unit", resRolls: 1,
                  table: [["food", 40, 1, 2], ["cloth", 35, 1, 2], ["med", 15, 1, 1], [null, 10]] },
    body_beast: { name: "Beast carcass", sprite: "corpse_beast", searchSec: 2, noise: 3, resRolls: 1,
                  table: [["chemicals", 35, 1, 1], ["food", 25, 1, 1], ["cloth", 15, 1, 1], [null, 25]] },
    crate:      { name: "Crate",         sprite: "obj_crate",  searchSec: 3, noise: 5, gearChance: 10, resRolls: 2,   // no Fuel in Slice 2
                  table: [["scrap", 40, 2, 4], ["food", 30, 2, 3], ["water", 30, 2, 3]],
                  heavy: { chance: 20, check: { skill: "hauling", dc: 12 }, bonusItems: 1, name: "Heavy crate" } },  // fail: blocked
    locker:     { name: "Locker",        sprite: "obj_locker", searchSec: 4, noise: 8, gearChance: 35, resRolls: 1,
                  table: [["cloth", 35, 1, 3], ["chemicals", 25, 1, 2], ["med", 20, 1, 1], [null, 20]],
                  trap: { chance: 25, check: { skill: "perception", dc: 12 }, failDmgPct: 15, badFailDmgPct: 30, name: "Trapped locker" } },
    desk:       { name: "Desk",          sprite: "obj_desk",   searchSec: 3, noise: 4, resRolls: 1,
                  table: [["electronics", 60, 1, 2], ["scrap", 25, 1, 1], [null, 15]] },
    safe:       { name: "Safe",          sprite: "obj_safe",   searchSec: 8, noise: 5, gearRolls: 1, bonusItems: 1, rarityBonus: 15, resRolls: 1,  // = the Slice 1 safe
                  table: [["electronics", 50, 1, 2], ["med", 50, 1, 2]],
                  lock: { chance: 100, check: { skill: "engineering", dc: 14 }, force: true } },   // force: +forceNoise, +heat.forceLock
    door:       { name: "Door",          sprite: "obj_door",   searchSec: 3, noise: 10, resRolls: 0, opensRoom: true,
                  stashChance: 10, stashAs: "crate",                                               // one crate roll behind it
                  lock: { chance: 30, check: { skill: "engineering", dc: 12 }, pickSec: 3, kick: { sec: 1 } } }  // kick: +forceNoise, +heat.kickDoor
  },
  // Sizes (Slice 2 §5). Searchable counts include doors (doors = rooms - 1) and generated old bodies; event objects,
  // survivors, quest objects, the passage grate and battle corpses are extra.
  sizes: {
    S: { rooms: [1, 1],  searchables: [3, 6],   template: "S" },
    M: { rooms: [2, 4],  searchables: [6, 12],  template: "M" },
    L: { rooms: [5, 10], searchables: [12, 25], template: "L" }
  },
  // Templates on the 1000x600 view canvas: a grid of rooms; order[i] = [col, row, parentIndex]. A site of n rooms uses
  // the first n entries; each room after the first sits behind a door in the wall it shares with its parent.
  view: { x: 30, y: 30, w: 940, h: 540, wall: 16, slot: 74, objPx: 64, doorPx: 64, markerPx: 32 },   // wall = 8 native x2; objects 32 native x2
  templates: {
    S: { cols: 1, rows: 1, order: [[0, 0, -1]] },
    M: { cols: 2, rows: 2, order: [[0, 1, -1], [1, 1, 0], [0, 0, 0], [1, 0, 1]] },
    L: { cols: 5, rows: 2, order: [[0, 1, -1], [1, 1, 0], [0, 0, 0], [2, 1, 1], [1, 0, 1], [3, 1, 3], [2, 0, 3], [4, 1, 5], [3, 0, 5], [4, 0, 7]] }
  },
  // Which searchable types fill a site (weights). byTag adds to the base; a location can override with objectWeights.
  // "body" becomes body_human or body_beast by the location's family (old corpses).
  objectWeights: {
    base:  { crate: 30, locker: 25, desk: 15, body: 15, safe: 5 },
    byTag: { food: { crate: 15 }, water: { crate: 10 }, scrap: { crate: 10 }, cloth: { locker: 10 }, electronics: { desk: 20 },
             chemicals: { locker: 10 }, med: { locker: 10, desk: 5 } }
  },
  // Decorative props (not clickable), swapped in by the location's tags. perRoom: [min, max].
  props: {
    perRoom: [1, 3],
    byTag: { water: ["prop_puddle", "prop_pipes"], food: ["prop_shelf"], scrap: ["prop_junk"], cloth: ["prop_rack"], electronics: ["prop_console"],
             chemicals: ["prop_barrel"], med: ["prop_bed"] },
    default: ["prop_rubble"],
    byZone: { b: ["prop_growth", "prop_nest", "prop_pod", "prop_bones"] }   // added to the tag pool in that zone
  },
  // Floor tile per location family / tag (first match wins), falls back to tile_floor
  // Floor tile: zone first (Zone B: wet if water-tagged), then tag, then size (S sites are one room or a yard), then
  // the low-priority tags (homes / shops: concrete), else the default deck panels. Walls: fill + face per zone.
  floors: {
    byZone: { b: { byTag: { water: "tile_floor_b_wet" }, default: "tile_floor_b" } },
    byTag: { water: "tile_floor_wet", med: "tile_floor_clinic" },
    bySize: { S: "tile_floor_yard" },
    byTagLow: { food: "tile_floor_concrete", cloth: "tile_floor_concrete" },
    default: "tile_floor"
  },
  walls: { default: { fill: "tile_wall", face: "tile_wall_face" }, byZone: { b: { fill: "tile_wall_b", face: "tile_wall_face_b" } },
           bandsH: ["tile_wall_h", "tile_wall_h", "tile_wall_h_2", "tile_wall_h_3"], bandV: "tile_wall_v", corner: "tile_wall_corner",
           doorwayH: "tile_doorway_h", doorwayV: "tile_doorway_v" },
  // Event objects (§5: "events move onto objects"). Clicking one opens the existing check event.
  eventObjects: {
    default:                { name: "Something odd",      sprite: "obj_event" },
    distress_hollow_creek:  { name: "Crackling radio",    sprite: "obj_radio" },
    relay:                  { name: "Relay terminal",     sprite: "obj_terminal" },
    cryo_ward:              { name: "Cryo pod",           sprite: "obj_cryo_pod" },
    cache:                  { name: "Dead renegade",      sprite: "obj_dead_renegade" },
    toll_gate:              { name: "Toll barricade",     sprite: "obj_barricade" },
    tunnel:                 { name: "Collapsed passage",  sprite: "obj_rubble" },
    rooftop_survivor:       { name: "Survivor on a roof", sprite: "obj_survivor" },
    hollow_creek_holding:   { name: "Town gate",          sprite: "obj_gate" },
    aftermath_hollow_creek: { name: "Raider camp",        sprite: "obj_barricade" },
    allied_hollow_creek:    { name: "Town square",        sprite: "obj_gate" }
  },
  survivorObject: { name: "Survivor", sprite: "obj_survivor" }
};
