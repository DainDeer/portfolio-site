// Battle 3D prototypes: the game files the sim needs, loaded as classic scripts in this order (an allowlist).
// Data files are plain DATA tables. Logic files are the DOM-free battle sim and what it calls. The save code (G.State and
// the boot / storage files) is never loaded: simshim.js stands in for the four G.State helpers the sim reads.
(function (root) {
  root.PROTO_SIM_FILES = [
    "data/config.js", "data/resources.js", "data/sprites.js", "data/skills.js", "data/bodies.js", "data/items.js", "data/weapons.js",
    "data/sets.js", "data/enemies.js", "data/zones.js", "data/allies.js", "data/perks.js", "data/abilities.js", "data/injuries.js",
    "js/core.js", "proto/shared/3d/simshim.js", "js/skills.js", "js/items.js", "js/allies.js", "js/battle.js", "js/enemyai.js",
    "js/abilities.js", "js/tactical.js", "js/escape.js"
  ];
})(typeof window !== "undefined" ? window : globalThis);
