// Adapter for the neutral Hushwood pack. Existing Areas and their quest/encounter ownership stay intact.
(function (root) {
  const G = root.G, H = G.Hushwood = {}, scale = 50;
  H.layout = site => DATA.hushwood.layouts[site.art];
  H.key = file => 'hw_' + file.replace(/\.png$/, '').replace('/', '_');
  H.generate = function (node, area) {
    const A = DATA.hushwood.layouts[area.def.art];
    const site = { nid: node.id, loc: node.loc, zone: node.zone || 'a', size: 'S', area: area.id,
      key: G.V2.key(node.id, area.id), name: area.def.name, art: area.def.art, entryArea: false, questArea: false,
      rooms: [{i:0,col:0,row:0,open:true,x:0,y:0,w:1000,h:600,free:[]}], objects:[], props:[], decals:[],
      visits:0,visitSearches:0,searches:0,nextId:1,pickedOver:false,restock:0,
      navRadius: A.navigation.agentRadiusM * scale, blockers: A.navigation.blockers.map(b => b.rectM.map(v => v * scale)) };
    // Existing search types retain their authoritative loot/noise/lock rules. Art does not invent loot tables.
    for (const p of A.interactables) {
      const type = /desk|drawer|workbench|terminal|panel/.test(p.asset) ? 'desk' : /locker|cabinet|cupboard/.test(p.asset) ? 'locker' : 'crate';
      const T = DATA.searchables.types[type];
      G.Exp._mk(site, {type, name:p.label, examine:p.context, sprite:T.sprite, room:0,
        artId:p.id, artAsset:p.asset, artBox:p.positionM.concat(p.sizeM).map(v => v*scale), sortY:p.sortYM*scale,
        x:(p.positionM[0]+p.pivotM[0])*scale, y:(p.positionM[1]+p.pivotM[1])*scale,
        stand:{x:p.standM[0]*scale,y:p.standM[1]*scale}, locked:!!(T.lock && G.rng.chance(T.lock.chance)) });
    }
    return site;
  };
  // Dynamic bodies / modifier objects use reachable floor space, never a random point inside furniture.
  H.place = function (site, o, rng) {
    const grid = G.AreaPath.grid(site), start = {x:500,y:540}, comp = G.AreaPath.compOf(grid,start), candidates = [];
    for (let i=0; i<grid.walk.length; i++) {
      if (!grid.walk[i] || grid.comp[i] !== comp) continue;
      const p = {x:(i%grid.cols+.5)*grid.c,y:(Math.floor(i/grid.cols)+.5)*grid.c};
      if (site.objects.some(q => q !== o && Math.hypot((q.stand || q).x-p.x,(q.stand || q).y-p.y)<65)) continue;
      if (Math.hypot(p.x-start.x,p.y-start.y)<80) continue;
      candidates.push(p);
    }
    // Dense corpse piles may share floor space but must never fall inside a blocker.
    const p = candidates.length ? rng.pick(candidates) : start;
    Object.assign(o,p,{room:0}); return o;
  };
})(typeof window !== 'undefined' ? window : globalThis);
