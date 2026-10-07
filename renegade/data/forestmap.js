// SP-131 · the 3D forest map screen (Megan picked SP-129 style C: a live low-poly forest with drifting fog). Traversal on
// a V2 run draws the zone as Smudge's baked forest (js/b3d/map3d.js, fed by js/forestmap.js); the DOM chrome (map names,
// feature pins, the notoriety token, the Map card) stays HTML. No Enemy Attention bar here (it lives inside a Map, SP-128).
// No WebGL, Graphics: Low, a zone not listed below, or the scene failing to load: the 2D map (js/mapview.js) as before.
window.DATA = window.DATA || {};
DATA.forestMap = {
  enabled: true,
  noModToggle: true,           // Megan (Oct 7, SP-039): negative Map modifiers can't be disabled by the player: the Map card has no toggle
  zones: ["a"],                 // the Hushwood (the forest). Other zones keep the 2D map until they get a scene.
  // render settings (BUILD_NOTES §5: bake once, 0.5x target, 8 fog cards on desktop / 5 on a phone; never device DPR)
  dpr: 0.5, fogCards: 8, fogCardsPhone: 5,
  fit: "maps",                  // frame what you know of the zone (closer), not the whole 1000 x 600 board
  world: { w: 1000, h: 600 },   // the zone map's own space (data/map.js node x / y)
  revealR: 120,                 // fog cleared round a visible Map (map space); a remembered one is thin fog
  thinR: 70,                    // an unscouted neighbour: thin fog, name hidden
  nodeR: 46,                    // the clearing round a Map
  modRing: 74,                  // features sit this far from their Map, spread round it
  // the Map's landmark recipe (js/b3d/map3d.js LANDMARKS) by location id; anything else: a plain clearing
  landmarks: { insertion: "gate", mossback: "camp", picnic: "camp", riverbed_camp: "camp", renegade_hollow: "camp", owlfall: "snag",
               fire_lookout: "snag", witch_cottage: "snag", stillwater: "pond", lumber_mill: "mill", ex_truck: "truck", toll_bridge: "gate" },
  // modifier id (data/mapsv2.js) -> feature recipe (js/b3d/map3d.js FEATURES). Unlisted ids get the waymark cairn
  // (BUILD_NOTES §3: props for the rest are still to be made).
  features: { beast_nest: "rats", dark: "power_out", vending_power: "power_out", weapon_cache: "cache", armory_locker: "cache",
              supply_closet: "cache", tough_enemies: "skull_camp", elite_leader: "skull_camp", veterans: "skull_camp",
              more_enemies: "skull_camp", duck_parade: "ducks" },
  // Beacon colour: Megan's six-colour rarity ladder (Oct 7), ascending. Hexes are the game's own: the item rarities
  // (data/items.js) for white / blue / yellow / purple / orange, the legacy modifier tier green (data/mapsv2.js).
  ladder: ["white", "green", "blue", "yellow", "purple", "orange"],
  colors: { white: "#e8e8e8", green: "#5fd35f", blue: "#4a8cff", yellow: "#ffd84a", purple: "#b060ff", orange: "#ff8a30", unknown: "#8c8c86" },
  // Which rung a modifier gets. Audit (Oct 7): data/mapsv2.js modifiers have NO rarity tier field (only a category
  // colour and danger pips). A modifier's own `tier` (a ladder key) wins when one is added; until then the rung comes
  // from its danger pips. PLACEHOLDER (open question for Megan / Vixie: what should drive a modifier's rarity).
  tierByDanger: { "-1": "white", "0": "white", "1": "green", "2": "blue", "3": "yellow", "4": "purple", "5": "orange" },
  // pin icon by modifier category (data/mapsv2.js categories); the category stays data, never read by the scene
  icons: { enemy: { file: "ui/forest/ic_skull.png" }, place: { file: "ui/forest/ic_hazard.png" }, loot: { file: "ui/forest/ic_chest.png" },
           people: { file: "ui/forest/ic_boon.png" }, orbital: { file: "ui/forest/ic_twist.png" }, silly: { file: "ui/forest/ic_silly.png" },
           unknown: { file: "ui/forest/ic_eye.png" } },
  // Notoriety (SP-133: per Map, +1 level every 3 Attention fights): a small evolving token by the Map's name, no number.
  // stageAt[i] = the lowest level showing stage i + 1 (Smudge's noto_1..4: Noticed, Known, Hunted, Infamous). PLACEHOLDER
  notoriety: { stageAt: [1, 2, 3, 4], names: ["Noticed", "Known", "Hunted", "Infamous"],
               files: [{ file: "ui/noto/noto_1.png" }, { file: "ui/noto/noto_2.png" }, { file: "ui/noto/noto_3.png" }, { file: "ui/noto/noto_4.png" }] },
  text: { loading: "The forest is waking up...", hint: "Tap a map or a glowing marker", hintDesktop: "Click a map, or a glowing marker in the forest",
          here: "You are here", unscouted: "Unscouted", notoriety: "Notoriety" }
};
