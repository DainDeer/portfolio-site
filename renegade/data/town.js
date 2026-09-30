// Slice 2 §1: the town view (home screen). Hotspots on a 1000x600 canvas (x, y, w, h in px) [DRAFT layout].
// When data/town_art.js (DATA.townArt, mirrored from the art agent's assets/town/town_hotspots.json) is present, its
// rects, overlay positions and label/badge anchors win over the x/y/w/h here.
// opens: the panel it opens. state: active | locked (tooltip only) | lot (scaffolding, tooltip only).
// Slice 3 §9-10: a hotspot with a building (DATA.outpost.buildings[k].hotspot) shows `tip` in its label until it's built,
// then the built art (DATA.townArt built.*) and the building's name. Doc Ilse's Tent keeps its giver panel (Infirmary inside).
window.DATA = window.DATA || {};
DATA.town = {
  width: 1000, height: 600, background: "town_bg",
  hotspots: [
    { id: "trapdoor",    label: "The Trapdoor",               opens: "zones",     x: 450, y: 470, w: 100, h: 70,  sprite: "town_trapdoor",  state: "active" },
    { id: "vault",       label: "Vault",                      opens: "vault",     x: 90,  y: 250, w: 170, h: 140, sprite: "town_vault",     state: "active" },
    { id: "body_lab",    label: "Body Lab",                   opens: "body_lab",  x: 290, y: 120, w: 170, h: 140, sprite: "town_body_lab",  state: "active" },
    { id: "dunn_stores", label: "Dunn's Stores",              opens: "giver:dunn", x: 560, y: 130, w: 170, h: 130, sprite: "town_dunn_stores", state: "active" },
    { id: "ilse_tent",   label: "Doc Ilse's Tent",            opens: "giver:ilse", x: 760, y: 250, w: 150, h: 120, sprite: "town_ilse_tent", state: "active" },
    { id: "stockpile",   label: "Stockpile",                  opens: "stockpile", x: 600, y: 330, w: 150, h: 100, sprite: "town_stockpile", state: "active" },
    { id: "workshop",    label: "Workshop",                   opens: "workbench", x: 90,  y: 430, w: 150, h: 110, sprite: "town_workshop",  state: "active", tip: "Build the Workbench" },
    { id: "lot_recruit", label: "Recruitment (empty lot)", opens: "recruit", x: 770, y: 440, w: 130, h: 90, sprite: "town_lot_recruit", state: "active", tip: "Hire Grunts for Food + Water" },
    { id: "memorial",    label: "Memorial Wall",              opens: "memorial",  x: 660, y: 64,  w: 130, h: 64,  sprite: "town_memorial",  state: "active", tip: "The fallen, newest first" },
    { id: "lot_comms",   label: "Empty lot (Comms Array)",    opens: "radio", x: 820, y: 60,  w: 120, h: 90,  sprite: "town_lot_comms",       state: "active", tip: "Build the Radio" },
    // Slice 4 §A1: Old Marta by the trapdoor (DATA.tutorial.marta). Placeholder figure until town_marta art lands.
    { id: "marta",       label: "Old Marta",                  opens: "marta", x: 374, y: 452, w: 70,  h: 84,  sprite: "town_marta", state: "active", npc: "marta",
      // Smudge's art (assets/slice4_manifest.json "town/town_marta.png".hotspot): used until town_hotspots.json has her
      art: { rect: [374, 452, 70, 84], sprite: { file: "town/town_marta.png", x: 377, y: 470 }, outline: { file: "town/town_hl_marta.png", x: 373, y: 466 },
             hover: { file: "town/town_hover_marta.png", x: 373, y: 466 }, labelAnchor: [409, 474] } },
    { id: "lot_still",   label: "Empty lot (Water Still)",    opens: "still", x: 460, y: 300, w: 120, h: 80,  sprite: "town_lot_still",       state: "active", tip: "Build the Water Still" }
  ],
  // Floating quest marker over a giver's building while it has a quest you can take now (data/quests.js givers[].hotspot).
  // Placeholder: a CSS "!" until the art (sprite key quest_available, listed in DATA.sprites.pendingArt) is delivered.
  questMarker: { sprite: "quest_available", px: 32, offsetY: -18 },   // 32x32 px on the 1000x600 town canvas; centre 18 px above the labelAnchor
  // top-row buttons (same panels as the hotspots). "zones" = zone select (same as the trapdoor)
  nav: [["town", "Town"], ["vault", "Vault"], ["body_lab", "Body Lab"], ["quests", "Quests"], ["stockpile", "Stockpile"], ["recruit", "Recruit"], ["memorial", "Memorial"], ["zones", "Expedition"]],
  extraNav: [["character", "Character"], ["codex", "Codex"], ["binder", "Binder"]]   // Slice 3 §3: the Character screen replaces Skills
};
