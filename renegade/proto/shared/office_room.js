// Prototype room data (Vixie, proto-area-click-to-move.md, Oct 3 2026) [DRAFT]: the MegaMart back office, Hollis Outskirts.
// Shared by proto/area (click-to-move) and, later, proto/battle3d. Plain data, no game code: nothing here reads or writes a save.
// Units are meters. The room is 20 x 12 m; the area page draws it at 50 px/m into a 1000 x 600 logical canvas.
// Rects are [x, y, w, h] from the top-left (x east, y south). The north band (y 0 .. 1.2) is the back wall face.
// Loot ids come from data/resources.js and data/items.js; they are only SHOWN here, never granted.
(function (root) {
  const ICON = "../../assets/";   // shipped icons, read only (relative to proto/area/)
  const res = (id, name, n) => ({ id, name, n, icon: ICON + "icons/res_" + id + ".png" });
  root.PROTO_ROOM = {
    id: "megamart_back_office", name: "MegaMart back office", zone: "hollis",
    w: 20, h: 12, ppm: 50, wallTop: 1.2, wallThick: 0.35,
    start: { x: 2.3, y: 10.7, face: 1 },   // just inside the door, facing east
    door: [1.5, 11.65, 1.6, 0.35],   // the way in (south wall); not usable in the prototype
    // things you can't walk through (the outer walls are added by the page from w / h / wallTop / wallThick)
    blockers: [
      { id: "desk_a",   r: [4.0, 3.2, 2.4, 1.1] },
      { id: "desk_pc",  r: [7.6, 3.2, 2.4, 1.1] },
      { id: "desk_b",   r: [4.0, 6.6, 2.4, 1.1] },
      { id: "desk_c",   r: [7.6, 6.6, 2.4, 1.1] },
      { id: "cabinet",  r: [10.7, 1.2, 1.0, 0.75] },
      { id: "plant",    r: [0.45, 1.3, 0.8, 0.8] },
      { id: "cooler",   r: [15.2, 1.25, 0.65, 0.65] },
      { id: "vending",  r: [17.9, 1.2, 1.7, 0.95] },
      { id: "bin",      r: [6.65, 4.55, 0.5, 0.5] },
      { id: "copier",   r: [0.45, 4.6, 0.9, 1.3] },
      { id: "part_v",   r: [12.4, 6.6, 0.2, 5.05] },   // the manager's glass partition (west side)
      { id: "part_h1",  r: [12.4, 6.6, 1.1, 0.2] },    // its north side, a gap 13.5 .. 15.0 for the door
      { id: "part_h2",  r: [15.0, 6.6, 4.65, 0.2] },
      { id: "desk_mgr", r: [15.6, 8.7, 3.0, 1.2] }
    ],
    // furniture that is only drawn (chairs are tucked under the desks, so only their backs show; papers are on the floor)
    furniture: [
      { kind: "chair", x: 5.2, y: 3.3 }, { kind: "chair", x: 8.8, y: 3.3 }, { kind: "chair", x: 5.2, y: 6.7 },
      { kind: "chair", x: 8.8, y: 6.7 }, { kind: "chair", x: 16.6, y: 8.8 },
      { kind: "papers", x: 9.6, y: 9.4 }, { kind: "papers", x: 3.2, y: 5.4 }, { kind: "papers", x: 13.2, y: 4.2 }
    ],
    // the 11 searchables (placeholder copy, Megan's tone pass later). box = hover / click area (padded on screen to 44 CSS px);
    // stand = where the character stands to search; reveal = the page's reveal animation; sfx = the hook (assets/sfx/<id>.mp3)
    searchables: [
      { id: "desk_a", name: "Desk", action: "Search", box: [4.0, 3.2, 2.4, 1.1], stand: [5.2, 4.75], reveal: "drawer", draw: "desk_drawers",
        examine: "A cheap laminate desk. The drawers stick.", loot: [res("electronics", "Electronics", 1)], sfx: "sfx_search_done",
        line: "The drawer sticks, then slides." },
      { id: "desk_pc", name: "Desk with a computer", action: "Search", box: [7.6, 3.2, 2.4, 1.1], stand: [8.8, 4.75], reveal: "screen", draw: "desk_pc",
        examine: "A beige tower and a dusty monitor. The power light is still on.", loot: [res("data_shards", "Data Shards", 1)], real: true,
        sfx: "sfx_search_done", line: "The screen flickers on, then dies." },
      { id: "cabinet", name: "Filing cabinet", action: "Search", box: [10.7, 1.2, 1.0, 0.75], stand: [11.2, 2.45], reveal: "cabinet", draw: "cabinet",
        examine: "Four drawers of somebody's job.", loot: [res("scrap", "Scrap", 2)], sfx: "sfx_door_heavy",
        line: "The top drawer screeches open. Q3 report. Numbers were down." },
      { id: "plant", name: "Dead office plant", action: "Search", box: [0.45, 1.3, 0.8, 0.8], stand: [1.75, 2.3], reveal: "leaves", draw: "plant",
        examine: "It was a ficus once.", loot: [], sfx: "sfx_ui_click", line: "Died of neglect, not the end of the world." },
      { id: "ceiling", name: "Ceiling tile", action: "Search", box: [10.55, 4.75, 1.0, 0.9], stand: [11.05, 5.95], reveal: "tile", draw: "ceiling_tile",
        examine: "One ceiling tile sits askew. Its shadow is the wrong shape.", loot: [{ id: "ammo_handload", name: "Hand-loads", n: 1, icon: ICON + "items/item_ammo_handload.png" }],
        real: true, sfx: "sfx_bonk_3", line: "The tile drops in a puff of dust. A bundle falls out." },
      { id: "vending", name: "Vending machine", action: "Search", box: [17.9, 1.2, 1.7, 0.95], stand: [18.75, 2.6], reveal: "vending", draw: "vending",
        examine: "One can is stuck halfway out. So close.", loot: [res("food", "Food", 1)], sfx: "sfx_bonk_1", line: "Thunk. The stuck can drops." },
      { id: "cooler", name: "Water cooler", action: "Search", box: [15.2, 1.25, 0.65, 0.65], stand: [15.5, 2.45], reveal: "bubble", draw: "cooler",
        examine: "The jug is a third full. Probably fine.", loot: [res("water", "Water", 1)], sfx: "sfx_ui_click", line: "Glug. A bubble rises." },
      { id: "coat", name: "Coat on a hook", action: "Search", box: [0.35, 8.1, 0.6, 1.1], stand: [1.5, 8.65], reveal: "coat", draw: "coat",
        examine: "A grey raincoat. Somebody left in a hurry.", loot: [{ id: "lucky_boxers", name: "Lucky Boxers", n: 1, icon: ICON + "items/item_lucky_boxers.png" }],
        real: true, sfx: "sfx_search_done", line: "The pockets turn out. A wallet with nothing in it. And... boxers?" },
      { id: "mug", name: "Mug of pens", action: "Search", box: [5.7, 6.75, 0.45, 0.45], stand: [5.95, 8.3], reveal: "pens", draw: "mug",
        examine: "WORLD'S OKAYEST MANAGER.", loot: [], sfx: "sfx_ui_click", line: "The pens scatter. One still works. Wow." },
      { id: "bin", name: "Wastebasket", action: "Search", box: [6.65, 4.55, 0.5, 0.5], stand: [7.35, 5.55], reveal: "bin", draw: "bin",
        examine: "Crumpled paper and a banana peel gone black.", loot: [res("cloth", "Cloth", 1)], sfx: "sfx_bonk_2", line: "It tips over. Crumpled paper rolls out." },
      { id: "mgr_drawer", name: "Locked manager's drawer", action: "Search", box: [17.6, 8.7, 1.0, 1.2], stand: [18.1, 10.5], reveal: "locked", draw: "mgr_drawer",
        examine: "The manager's drawer. A small brass lock.", loot: [], locked: true, sfx: "sfx_wheel_click",
        line: "Locked. Someone handy could pick this." }   // a tease for later (glokk_17 would go here)
    ],
    // examine-only decor (no loot). wall: true = drawn on the back wall face
    decor: [
      { id: "window", name: "Smashed window", box: [12.6, 0.15, 2.3, 0.85], wall: true, draw: "window",
        examine: "Glass on the floor, none in the frame. The wind smells like rain and tyres." },
      { id: "stain", name: "Water stain", box: [6.6, 0.2, 1.5, 0.8], wall: true, draw: "stain",
        examine: "A brown water stain. It looks exactly like a goat." },
      { id: "poster", name: "Motivational poster", box: [2.6, 0.2, 1.0, 0.85], wall: true, draw: "poster",
        examine: "HANG IN THERE. The cat is gone. Just the branch." },
      { id: "pigeon", name: "Hollis pigeon", box: [13.55, 0.95, 0.5, 0.45], draw: "pigeon", action: "Boop",
        examine: "A grey pigeon on the sill. It has seen things.", boop: "Coo.", stand: [13.8, 1.85] }   // critter rule: small, plain, never an enemy
    ]
  };
})(typeof window !== "undefined" ? window : globalThis);
