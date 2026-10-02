// Slice 2 §5-6: location views. Searchable object types (time, noise, checks, loot tables), the three size templates
// and the tag-driven props. Numbers [DRAFT]. Formula constants (disturbance, revisit) live in data/config.js.
window.DATA = window.DATA || {};
DATA.searchables = {
  // Loot table entries: [resource id | null (nothing), weight, min, max]. A location tag that matches a resource
  // doubles that entry's weight (tagWeightMult). resRolls = how many times the table is rolled.
  // gearChance: % for one gear roll. gearRolls: guaranteed gear rolls. bonusItems/rarityBonus: extra gear.
  tagWeightMult: 2,
  // Megan's playtest: Med Supplies drops by location kind (DATA.map.locations[id].kind). Multiplies the med entry's
  // weight in every loot table there (on top of the med tag). School (nurse's office) and clinics: much more; industrial: rare.
  medWeightByKind: { medical: 4, industrial: 0.2 },
  // Slice 3 §11: Elites killed at Marked+ Heat carry Relic Tech (15%) on their body
  eliteExtras: [{ res: "relic", n: 1, chance: 15, minTier: "Marked" }],
  types: {
    body_human: { name: "Body", examine: "[PLACEHOLDER] Somebody who ran out of luck. Their pockets might not have.",          sprite: "corpse_human", searchSec: 2, noise: 3, gear: "unit", resRolls: 1,
                  table: [["food", 40, 1, 2], ["cloth", 35, 1, 2], ["med", 15, 1, 1], [null, 10]] },
    body_beast: { name: "Beast carcass", examine: "[PLACEHOLDER] Still warm. Something useful under the hide, maybe.", sprite: "corpse_beast", searchSec: 2, noise: 3, resRolls: 1,
                  table: [["chemicals", 35, 1, 1], ["food", 25, 1, 1], ["cloth", 15, 1, 1], ["biomass", 45, 1, 2], [null, 25]],
                  extras: [{ res: "biomass", n: 1, chance: 70 },   // Slice 3 §11 tuning (milestone 5): Biomass 20 x1 -> 45 x1-2 + a 70% extra (target 1-3 per extracted run)
                           { res: "meat", n: 1, chance: 100 }, { res: "fur", n: 1, chance: 30 }, { res: "teeth", n: 1, chance: 30 }] },   // Slice 5 §F animal parts [DRAFT]: meat always, fur / teeth uncommon
    crate:      { name: "Crate", examine: "[PLACEHOLDER] A battered crate. The lid's been pried at before.",         sprite: "obj_crate",  searchSec: 3, noise: 5, gearChance: 10, resRolls: 2,   // Slice 3 §11 tuning: Fuel 10 x1 -> 30 x1-2 + a 45% extra (target 2-4 per extracted run)
                  table: [["scrap", 40, 2, 4], ["food", 30, 2, 3], ["water", 30, 2, 3], ["fuel", 30, 1, 2]],
                  extras: [{ res: "fuel", n: 1, chance: 45 }],
                  heavy: { chance: 20, check: { skill: "hauling", dc: 12 }, bonusItems: 1, name: "Heavy crate" } },  // fail: blocked
    locker:     { name: "Locker", examine: "[PLACEHOLDER] A dented locker. Hinges gone orange with rust.",        sprite: "obj_locker", searchSec: 4, noise: 8, gearChance: 35, resRolls: 1,
                  table: [["cloth", 35, 1, 3], ["chemicals", 25, 1, 2], ["med", 20, 1, 1], [null, 20]],
                  extras: [{ res: "biomass", n: 1, chance: 20 }],   // Slice 3 §11 tuning: samples jars (Biomass)
                  trap: { chance: 25, check: { skill: "perception", dc: 12 }, failDmgPct: 15, badFailDmgPct: 30, name: "Trapped locker" } },
    desk:       { name: "Desk", examine: "[PLACEHOLDER] An old desk. The drawers stick.",          sprite: "obj_desk",   searchSec: 3, noise: 4, resRolls: 1,
                  table: [["electronics", 60, 1, 2], ["scrap", 25, 1, 1], [null, 15]],
                  extras: [{ res: "data_shards", n: 1, chance: 3 }] },   // Slice 3 (design): Data Shards only a rare extra here (terminals are the source)
    safe:       { name: "Safe", examine: "[PLACEHOLDER] A squat steel safe. Somebody thought this was worth locking up.",          sprite: "obj_safe",   searchSec: 8, noise: 5, gearRolls: 1, bonusItems: 1, rarityBonus: 15, resRolls: 1,  // = the Slice 1 safe
                  table: [["electronics", 50, 1, 2], ["med", 50, 1, 2]],
                  extras: [{ res: "data_shards", n: 1, chance: 8 }, { res: "relic", n: 1, chance: 5, minTier: "Marked" }],   // Slice 3: Data Shards a rare extra (design), Relic Tech 5% at Marked+
                  lock: { chance: 100, check: { skill: "engineering", dc: 14 }, force: true } },   // force: +forceNoise, +heat.forceLock
    // Slice 3 (design, after milestone 1): the Terminal is the main Data Shards source. Offices, the Relay Tower and clinics
    // (map tag "terminal"). Longer search. alarm: after a search, chance % that a drone answers -> a machine fight at
    // budgetMult (only once the `family` exists: machines land in Part B step 8; until then the alarm is off).
    terminal:   { name: "Old terminal", examine: "[PLACEHOLDER] A dead screen over a live hum. It still takes input.",      sprite: "obj_computer", searchSec: 6, noise: 4, resRolls: 1,
                  table: [["data_shards", 60, 1, 2], ["electronics", 30, 1, 1], [null, 10]],
                  alarm: { chance: 8, family: "machines", budgetMult: 0.6, why: "The terminal trips an alarm. A drone answers!" } },
    // Slice 3 §11 new searchables. extras: independent bonus rolls [{ res, n, chance %, minTier (Heat tier name) }]
    vehicle:    { name: "Wrecked car", examine: "[PLACEHOLDER] A burnt-out car on its rims. The trunk is still shut.",   sprite: "obj_vehicle",  searchSec: 4, noise: 6, resRolls: 2, wide: 2,   // wide: takes 2 side-by-side slots, drawn 2x objPx wide (art 64x32 native)
                  table: [["fuel", 45, 1, 2], ["scrap", 35, 2, 3], ["electronics", 20, 1, 1]] },
    growth:     { name: "Growth cluster", examine: "[PLACEHOLDER] Wet, glossy growth, pulsing faintly. Don't touch it bare-handed.", sprite: "obj_growth",  searchSec: 3, noise: 4, resRolls: 1,
                  table: [["biomass", 70, 1, 2], ["chemicals", 20, 1, 1], [null, 10]] },
    // Slice 5 §G (Smudge): the retired red Rusted Truck art (Slice 5 §D) comes back as Scablands wreck scenery
    // (objectWeights.byZone.scablands). Same 2-slot footprint as the old extract truck.
    rusted_truck: { name: "Rusted truck", examine: "[PLACEHOLDER] A red pickup rusting where it stopped. The cab's still shut.", sprite: "obj_truck", searchSec: 4, noise: 6, resRolls: 2, wide: 2,
                  table: [["fuel", 40, 1, 2], ["scrap", 45, 2, 3], ["electronics", 15, 1, 1]] },
    truck_wreck:  { name: "Burnt-out truck", examine: "[PLACEHOLDER] What's left of a pickup, nose-down in the dirt. Still smouldering, somehow.", sprite: "obj_truck_wrecked", searchSec: 3, noise: 5, resRolls: 1, wide: 2,
                  table: [["scrap", 70, 1, 3], ["fuel", 20, 1, 1], [null, 10]] },
    // Slice 5 §G (Vixie 07:14): the Level 4 Garage's car alarms, a noise trap on the existing trap check: spot it (Perception)
    // and you cut the wire; miss it and it blares: + Heat (fail / bad fail), no damage. The blaring loop shows once tripped.
    car_alarm:  { name: "Parked car", examine: "[PLACEHOLDER] A car parked neatly in its bay. A little red light blinks on the dash.", sprite: "obj_car_alarm", trippedAnim: "obj_car_alarm_blaring", searchSec: 4, noise: 6, resRolls: 2, wide: 2,
                  table: [["fuel", 45, 1, 2], ["scrap", 35, 2, 3], ["electronics", 20, 1, 1]],
                  trap: { chance: 60, check: { skill: "perception", dc: 13 }, failHeat: 6, badFailHeat: 10, name: "Alarmed car",   // [DRAFT] numbers
                          spotText: "You spot the blinking alarm and cut the wire before you touch anything.", tripText: "The car alarm goes off! Every head in the Garage turns." } },
    body_machine: { name: "Machine wreck", examine: "[PLACEHOLDER] A dead machine, leaking something dark.", sprite: "corpse_machine", searchSec: 3, noise: 5, resRolls: 1,   // every killed machine (Part B step 8)
                  table: [["electronics", 40, 1, 2], ["scrap", 35, 1, 3], ["fuel", 10, 1, 1], ["data_shards", 7, 1, 1], [null, 8]] },
    // design call (milestone 3): dormant machine wrecks in Zone B (objectWeights.byZone.b). Same table as a fresh wreck;
    // alarm = the chance it reactivates when you finish searching it (a small machine fight at budgetMult)
    machine_dormant: { name: "Dormant machine", examine: "[PLACEHOLDER] A machine powered down. Probably.", sprite: "corpse_ai_sentry", searchSec: 4, noise: 5, resRolls: 1,
                  table: [["electronics", 40, 1, 2], ["scrap", 35, 1, 3], ["fuel", 10, 1, 1], ["data_shards", 7, 1, 1], [null, 8]],
                  alarm: { chance: 12, family: "machines", budgetMult: 0.7, why: "The wreck twitches. Its optics light up red!" } },
    rival_pack: { name: "Rival's pack", examine: "[PLACEHOLDER] A pack left behind by another crew.",  sprite: "obj_rival_bag", searchSec: 3, noise: 3, resRolls: 2, gearRolls: 1, rarityBonus: 15,   // beaten rivals only (step 10)
                  table: [["scrap", 40, 2, 4], ["food", 30, 2, 3], ["water", 30, 2, 3], ["fuel", 10, 1, 1]],
                  extras: [{ res: "data_shards", n: 1, chance: 30 }, { res: "relic", n: 1, chance: 20 }] },
    // Slice 5 §F training spots: action "train" (no loot): searchSec, then train.xp to train.skill (your body; mind skills
    // to you), + train.heat, and the usual disturbance roll at `noise`. Once per run each (o.trainedRun). Where: training.
    // Art: Smudge's obj_chop_stump / obj_fishing_spot (2c36080; the pond is in the sprite, wide 2); terminals keep obj_computer.
    train_chop:     { name: "Chopping stump",   examine: "[PLACEHOLDER] A stump, an axe, a pile of rounds nobody split.", sprite: "obj_chop_stump", searchSec: 8, noise: 6,
                      train: { skill: "hauling", xp: 400, heat: 1, label: "Chop wood", line: "[PLACEHOLDER] You split the pile. Your back will remember it." } },
    train_fish:     { name: "Still water",      examine: "[PLACEHOLDER] Flat water, a rod on a forked stick. Something's biting.", sprite: "obj_fishing_spot", searchSec: 10, noise: 2, wide: 2,
                      train: { skill: "survival", xp: 600, heat: 0, label: "Fish", line: "[PLACEHOLDER] You sit still long enough to learn the water." } },
    train_terminal: { name: "Working terminal", examine: "[PLACEHOLDER] This one still boots. The login screen blinks at you.", sprite: "obj_computer", searchSec: 8, noise: 4,
                      train: { skill: "hacking", xp: 600, heat: 1, label: "Practise", line: "[PLACEHOLDER] You poke at it until it stops fighting you." } },
    // Slice 5 §G: the Crater's pod (tag "crater": fixedByTag). orangePct: its own chance of one Orange (Prototype) item,
    // past the item-level cap (Orange needs iLvl 6; Greyback is tier 2). heat: added when you finish searching it.
    crater_pod: { name: "Glowing pod", examine: "[PLACEHOLDER] A scorched orbital pod, still warm, still humming. The hatch is ajar.", sprite: "obj_cryo_pod", searchSec: 10, noise: 12, gearRolls: 1, bonusItems: 1, rarityBonus: 60, resRolls: 2,
                  orangePct: 12, searchHeat: 6,
                  table: [["electronics", 40, 1, 3], ["data_shards", 35, 1, 2], ["relic", 25, 1, 1]] },
    door:       { name: "Door", examine: "[PLACEHOLDER] A door. What's behind it is anyone's guess.",          sprite: "obj_door",   searchSec: 3, noise: 10, resRolls: 0, opensRoom: true,
                  stashChance: 10, stashAs: "crate",                                               // one crate roll behind it
                  lock: { chance: 30, check: { skill: "engineering", dc: 12 }, pickSec: 3, kick: { sec: 1 } } }  // kick: +forceNoise, +heat.kickDoor
  },
  // Slice 5 §F: where training spots are (one of each listed type, a fixed searchable): by location id or tag. [DRAFT]
  // No Lumber Mill yet (Hushwood, part G): the chop is in the woodsy Zone A sites until then.
  training: {
    train_chop:     { locs: ["riverbed_camp", "rail_yard", "renegade_hollow", "gb_lodge", "lumber_mill", "mossback"] },   // gb_lodge: the woodpile (Slice 5 §G)
    train_fish:     { locs: ["toll_bridge", "pump_station", "b_culdesac", "b_outfall", "gb_dam", "stillwater"] },
    train_terminal: { tags: ["terminal"] }
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
  view: { x: 30, y: 30, w: 940, h: 540, wall: 16, slot: 74, objPx: 64, doorPx: 64, markerPx: 32, propHitPx: 26 },   // wall = 8 native x2; objects 32 native x2
  templates: {
    S: { cols: 1, rows: 1, order: [[0, 0, -1]] },
    M: { cols: 2, rows: 2, order: [[0, 1, -1], [1, 1, 0], [0, 0, 0], [1, 0, 1]] },
    L: { cols: 5, rows: 2, order: [[0, 1, -1], [1, 1, 0], [0, 0, 0], [2, 1, 1], [1, 0, 1], [3, 1, 3], [2, 0, 3], [4, 1, 5], [3, 0, 5], [4, 0, 7]] }
  },
  // Which searchable types fill a site (weights). byTag adds to the base; a location can override with objectWeights.
  // "body" becomes body_human or body_beast by the location's family (old corpses).
  objectWeights: {
    base:  { crate: 30, locker: 25, desk: 15, body: 15, safe: 5, vehicle: 10 },   // vehicle 4 -> 10 (Slice 3 §11 Fuel tuning; 14 filled every site with cars and the fuel tag stopped mattering)
    byZone: { b: { vehicle: 10, machine_dormant: 8 }, scablands: { rusted_truck: 8, truck_wreck: 8, machine_dormant: 8 } },   // scablands: Slice 5 §G [DRAFT]   // machine_dormant: design call (milestone 3), machines in Zone B
    // added once if the location has any of `tags` OR is in any of `zones` (Growth cluster: biomass places and Zone B only)
    anyOf: { growth: { weight: 35, tags: ["biomass", "chemicals", "med"], zones: ["b"] }, terminal: { weight: 15, tags: ["terminal"] } },   // growth 15 -> 35, also chemicals / med places (Biomass tuning)
    // guaranteed objects by location tag (they take generated slots): 1 terminal in every office (design)
    fixedByTag: { office: ["terminal"], crater: ["crater_pod"] },   // + a location's own fixedObjects (Slice 5 §G: the Garage's alarmed car)
    byTag: { fuel: { vehicle: 25 }, food: { crate: 15 }, water: { crate: 10 }, scrap: { crate: 10 }, cloth: { locker: 10 }, electronics: { desk: 20 },
             chemicals: { locker: 10 }, med: { locker: 10, desk: 5 } }
  },
  // Decorative props (not clickable), swapped in by the location's tags. perRoom: [min, max].
  props: {
    perRoom: [1, 3],
    byTag: { water: ["prop_puddle", "prop_pipes"], food: ["prop_shelf"], scrap: ["prop_junk"], cloth: ["prop_rack"], electronics: ["prop_console"],
             chemicals: ["prop_barrel"], med: ["prop_bed"] },
    default: ["prop_rubble"],
    byZone: { b: ["prop_growth", "prop_nest", "prop_pod", "prop_bones"] }   // added to the tag pool in that zone
    // + a location's own props (DATA.map.locations[id].props, e.g. the MegaMart's shopping carts), added to the pool too
  },
  // Slice 5 §G (Hollis): fixed scenery objects a location names (DATA.map.locations[id].decor): one each, examine only, no
  // search. anim: a loop (frame 0 = the still, shown under reduced motion). Smudge's c93f2e3 art.
  decor: {
    molar_chair:        { name: "Dental chair", sprite: "obj_molar_chair", anim: "obj_molar_chair_hum", examine: "[PLACEHOLDER] A cream vinyl dental chair. It's still humming. Nobody has paid the power bill in years." },
    church_loudspeaker: { name: "Loudspeaker",  sprite: "obj_church_loudspeaker", examine: "[PLACEHOLDER] A loudspeaker on a pole, crackling. A calm voice reads out the orbits." }
  },
  // Floor tile per location family / tag (first match wins), falls back to tile_floor
  // Floor tile: zone first (Zone B: wet if water-tagged), then tag, then size (S sites are one room or a yard), then
  // the low-priority tags (homes / shops: concrete), else the default deck panels. Walls: fill + face per zone.
  floors: {
    byZone: { a: { byTag: { water: "tile_floor_hushwood_wet", med: "tile_floor_clinic" }, default: "tile_floor_hushwood" },   // Slice 5 §G the Hushwood (Smudge 1828231); med: the School / Cryo Annex keep the clinic floor
              b: { byTag: { water: "tile_floor_b_wet" }, default: "tile_floor_b" },
              greyback: { byTag: { water: "tile_floor_greyback_wet" }, default: "tile_floor_greyback" },
              // Slice 5 §G (Smudge c2c0f9c); js/site.js floorFor falls through to the generic floors if a key isn't registered
              scablands: { byTag: { water: "tile_floor_scablands_wet", med: "tile_floor_clinic" }, default: "tile_floor_scablands" },   // Slice 5 §G (Smudge, aa8b4fd)
              hollis: { byTag: { water: "tile_floor_hollis_wet" }, default: "tile_floor_hollis" } },   // Slice 5 §G (Smudge 91a7553)
    byTag: { water: "tile_floor_wet", med: "tile_floor_clinic" },
    bySize: { S: "tile_floor_yard" },
    byTagLow: { food: "tile_floor_concrete", cloth: "tile_floor_concrete" },
    default: "tile_floor"
  },
  walls: { default: { fill: "tile_wall", face: "tile_wall_face" }, byZone: { a: { fill: "tile_wall_hushwood", face: "tile_wall_face_hushwood" }, b: { fill: "tile_wall_b", face: "tile_wall_face_b" }, greyback: { fill: "tile_wall_greyback", face: "tile_wall_face_greyback" },
                                                       scablands: { fill: "tile_wall_scablands", face: "tile_wall_face_scablands" },
                                                       hollis: { fill: "tile_wall_hollis", face: "tile_wall_face_hollis" } },   // Smudge 91a7553   // Smudge c2c0f9c (js/siteview.js keeps tile_wall / tile_wall_face if unregistered)
           bandsH: ["tile_wall_h", "tile_wall_h", "tile_wall_h_2", "tile_wall_h_3"], bandV: "tile_wall_v", corner: "tile_wall_corner",
           doorwayH: "tile_doorway_h", doorwayV: "tile_doorway_v" },
  // Event objects (§5: "events move onto objects"). Clicking one opens the existing check event.
  eventObjects: {
    default:                { name: "Something odd", examine: "[PLACEHOLDER] Something here doesn't fit.",      sprite: "obj_event" },
    distress_hollow_creek:  { name: "Crackling radio", examine: "[PLACEHOLDER] A radio spitting static and a voice under it.",    sprite: "obj_radio" },
    relay:                  { name: "Relay terminal", examine: "[PLACEHOLDER] A relay terminal, lights still blinking.",     sprite: "obj_terminal" },
    cryo_ward:              { name: "Cryo pod", examine: "[PLACEHOLDER] A cryo pod, frosted over from the inside.",           sprite: "obj_cryo_pod" },
    cache:                  { name: "Dead renegade", examine: "[PLACEHOLDER] A renegade who didn't make it out. Their stash might have.",      sprite: "obj_dead_renegade" },
    toll_gate:              { name: "Toll barricade", examine: "[PLACEHOLDER] A barricade of junk and wire. Somebody wants a toll.",     sprite: "obj_barricade" },
    tunnel:                 { name: "Collapsed passage", examine: "[PLACEHOLDER] A passage half-buried in rubble.",  sprite: "obj_rubble" },
    rooftop_survivor:       { name: "Survivor on a roof", examine: "[PLACEHOLDER] Someone waving from the roof.", sprite: "obj_survivor" },
    drone_patrol:           { name: "Drone patrol", examine: "[PLACEHOLDER] A drone sweeping the area on a lazy loop.",       sprite: "enemy_ai_drone" },
    hollow_creek_holding:   { name: "Town gate", examine: "[PLACEHOLDER] The town gate, barred and watched.",          sprite: "obj_gate" },
    aftermath_hollow_creek: { name: "Raider camp", examine: "[PLACEHOLDER] What the raiders left of the camp.",        sprite: "obj_barricade" },
    allied_hollow_creek:    { name: "Town square", examine: "[PLACEHOLDER] The town square, busier than it has any right to be.",        sprite: "obj_gate" }
  },
  // Slice 5 §D (Megan): every location's own way in / out, and its extraction point, are clickable objects in the
  // location view. exit: one per site on the outer (bottom) wall of the first room; you arrive there, and clicking it
  // leaves to the zone map. Style: byLoc, then the location's kind, then its tags, else default. extract: the
  // extraction point as a hotspot (click -> the same extract flow as the panel button, d20 included for a check).
  // Art: Smudge's truck (4cf6717) and exits / tunnel / boat (fd1b93d); the gate style keeps obj_gate and the Rooftop
  // keeps the radio (a pickup radio wired to a flare: Vixie). wreckedSprite / wreckedAnim: after a crash.
  access: {
    exit: {
      styles: {
        gate:      { name: "Gate",              sprite: "obj_gate",      examine: "[PLACEHOLDER] The way you came in. Back out to the zone map." },
        stairwell: { name: "Stairwell",         sprite: "obj_exit_stairwell", examine: "[PLACEHOLDER] The stairwell you came up. Back out to the zone map." },
        fence:     { name: "Hole in the fence", sprite: "obj_exit_fence_hole", examine: "[PLACEHOLDER] The gap in the fence you squeezed through. Back out to the zone map." }
      },
      byKind: { industrial: "fence", medical: "stairwell" },
      byTag: { office: "stairwell", terminal: "stairwell" },
      byLoc: {},
      default: "gate",
      label: "EXIT"   // the small tag under it, so borrowed art still reads as the way out
    },
    extract: {
      default:    { name: "Extraction point", sprite: "obj_radio", examine: "[PLACEHOLDER] Your way home." },
      byLoc: {
        ex_truck:   { name: "Logging Truck",  sprite: "obj_logging_truck", wide: 2, wreckedSprite: "obj_logging_truck_wrecked", wreckedAnim: "obj_logging_truck_wrecked_smoke",   // Slice 5 §G (Smudge 1828231; Vixie: the red Rusted Truck art is retired from zone a, asset kept)
                      examine: "[DRAFT] [PLACEHOLDER] The logging truck. Keys in it, if it'll start.", examineWrecked: "[DRAFT] [PLACEHOLDER] Wrecked. It's not going anywhere." },   // Smudge's suggested lines (truck_props_manifest.json)
        ex_tunnel:  { name: "Culvert mouth",  sprite: "obj_ex_creek_culvert", examine: "[PLACEHOLDER] The creek runs out through a culvert under the road, toward home. Something always follows you into it." },   // Slice 5 §G: the Creek Culvert (Smudge 1828231)
        sc_tunnel:  { name: "Tunnel mouth",   sprite: "obj_ex_sc_tunnel", fallback: "obj_ex_tunnel_mouth", examine: "[PLACEHOLDER] A service tunnel, pointed home. Something always follows you into it." },   // Slice 5 §G: Tunnel Home (hook: obj_ex_sc_tunnel; meanwhile the old tunnel mouth)
        ex_rooftop: { name: "Pickup radio",   sprite: "obj_radio",      examine: "[PLACEHOLDER] A radio wired to a flare. Call the pickup and it comes." },
        b_levee:    { name: "Boat launch",    sprite: "obj_ex_boat", wide: 2, examine: "[PLACEHOLDER] The boat comes when you call. Hold the ramp till it does." },
        // Slice 5 §G: Smudge's 7a9a20d room objects
        gb_cable_car: { name: "Cable car",    sprite: "obj_ex_cable_car", wide: 2, examine: "[PLACEHOLDER] A rusted gondola on a sagging cable. The motor box has a crank." },
        // Slice 5 §G: Hollis (Smudge 8272465). The helipad has the truck's wreck keys (its Bad Fail crashes it); the handcar none
        ho_rail:    { name: "Handcar",        sprite: "obj_ex_handcar", wide: 2, examine: "[PLACEHOLDER] A rail handcar on the commuter line. Pump fast enough and nothing catches you." },
        ho_helipad: { name: "Helicopter",     sprite: "obj_ex_helipad", wide: 2, wreckedSprite: "obj_ex_helipad_wrecked", wreckedAnim: "obj_ex_helipad_wrecked_smoke",
                      examine: "[PLACEHOLDER] A small helicopter on the roof pad. Fuel in it, if you can fly it.", examineWrecked: "[PLACEHOLDER] What's left of the helicopter. It's not flying anywhere." },
        gb_goat_path: { name: "Goat path",    sprite: "obj_ex_goat_path", examine: "[PLACEHOLDER] A path only a goat would call a path. It goes down, eventually." }
      }
    }
  },
  survivorObject: { name: "Survivor", sprite: "obj_survivor", examine: "[PLACEHOLDER] A survivor, eyeing you over a raised weapon." },
  // Slice 4 §E: examine text (hover, tap on phones), RuneScape style. [PLACEHOLDER] strings; the flavor pass writes the
  // real ones. Searchables / event objects / the survivor carry an examine field above (an object's own o.examine wins);
  // scenery props (canvas decor, by sprite key) take theirs from propInfo; anything without one uses examineDefault.
  examineDefault: "[PLACEHOLDER] Nothing special.",
  propInfo: {
    prop_puddle:  { name: "Puddle",        examine: "[PLACEHOLDER] Standing water with a rainbow sheen." },
    prop_pipes:   { name: "Pipes",         examine: "[PLACEHOLDER] Old pipes, still dripping somewhere." },
    prop_shelf:   { name: "Shelf",         examine: "[PLACEHOLDER] Empty shelves. Someone got here first." },
    prop_junk:    { name: "Junk",          examine: "[PLACEHOLDER] A heap of scrap too bent to use." },
    prop_rack:    { name: "Clothes rack",  examine: "[PLACEHOLDER] A rack of rags that used to be clothes." },
    prop_console: { name: "Console",       examine: "[PLACEHOLDER] A smashed console. The wires were pulled." },
    prop_barrel:  { name: "Barrel",        examine: "[PLACEHOLDER] A barrel with a faded hazard mark." },
    prop_bed:     { name: "Cot",           examine: "[PLACEHOLDER] A stained cot. Nobody's slept here in a while." },
    prop_rubble:  { name: "Rubble",        examine: "[PLACEHOLDER] Broken concrete and rebar." },
    prop_growth:  { name: "Growth",        examine: "[PLACEHOLDER] Something grew here. It's still growing." },
    prop_nest:    { name: "Nest",          examine: "[PLACEHOLDER] A nest of wire and bone. Empty, for now." },
    prop_pod:     { name: "Pod",           examine: "[PLACEHOLDER] A husk, split open from the inside." },
    prop_bones:   { name: "Bones",         examine: "[PLACEHOLDER] Picked clean." },
    prop_shopping_cart: { name: "Shopping cart", examine: "[PLACEHOLDER] A shopping cart with one bad wheel. Good cover, if you crouch." }
  }
};
