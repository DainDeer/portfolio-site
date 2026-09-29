// Slice 2 §1: the town view (home screen). Hotspots on a 1000x600 canvas (x, y, w, h in px) [DRAFT layout].
// When data/town_art.js (DATA.townArt, mirrored from the art agent's assets/town/town_hotspots.json) is present, its
// rects, overlay positions and label/badge anchors win over the x/y/w/h here.
// opens: the panel it opens. state: active | locked (tooltip only) | lot (scaffolding, tooltip only).
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
    { id: "workshop",    label: "Workshop",                   x: 90,  y: 430, w: 150, h: 110, sprite: "town_workshop",  state: "locked", tip: "Coming in a later slice" },
    { id: "lot_recruit", label: "Recruitment (empty lot)", opens: "recruit", x: 770, y: 440, w: 130, h: 90, sprite: "town_lot_recruit", state: "active", tip: "Hire Grunts for Food + Water" },
    { id: "lot_comms",   label: "Empty lot (Comms Array)",    x: 820, y: 60,  w: 120, h: 90,  sprite: "town_lot_comms",       state: "lot",    tip: "Not built yet" }
  ],
  // top-row buttons (same panels as the hotspots). "zones" = zone select (same as the trapdoor)
  nav: [["town", "Town"], ["vault", "Vault"], ["body_lab", "Body Lab"], ["quests", "Quests"], ["stockpile", "Stockpile"], ["recruit", "Recruit"], ["zones", "Expedition"]],
  extraNav: [["skills", "Skills"], ["codex", "Codex"]]
};
