// Battle 3D prototypes: stands in for the few G.State helpers the battle sim reads, so the save code is never loaded.
// Same results as the game's state module for these (gruntItems / gruntTpl / bodySprite); giveXp does nothing (no XP, no save).
(function (root) {
  const G = root.G;
  G.State = {
    proto: true,
    gruntItems: (g) => Object.values((g && g.gear) || {}).filter(Boolean),
    gruntTpl: () => root.DATA.bodies.grunt,
    bodySprite: (b) => (b && b.cls ? root.DATA.bodies.classes[b.cls].sprite : root.DATA.bodies.basicBody.sprite),
    giveXp: () => {}
  };
  G.state = null;   // no save in memory either
})(typeof window !== "undefined" ? window : globalThis);
