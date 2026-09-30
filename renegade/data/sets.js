// Slice 3 §5 Item sets. A piece is a normal base (data/items.js, `set: <id>`) that rolls rarity as usual. Bonuses count the
// pieces equipped on the same unit (a Grunt reaches 2, a Veteran or your body 3) and stack (3 pieces = the 2- and 3-piece bonus).
// Bonus stats use the affix stat names (G.Items.statSum): armor, evasion, accuracy, carry_kg, move_speed_pct, jam_pct,
// check_skill (+ skill), search_pct (your body only: search time); flags: firstAttackCrit, hunterSlowEvery (step 8).
window.DATA = window.DATA || {};
DATA.sets = {
  list: {
    scav:    { name: "Scav Kit", pieces: ["scav_hood", "scav_poncho", "scav_satchel"],
               bonuses: { 2: { text: "+8 kg carry", stats: { carry_kg: 8 } },
                          3: { text: "+5% Move Speed, and searches are 15% faster", stats: { move_speed_pct: 5, search_pct: 15 } } } },
    militia: { name: "Militia Issue", pieces: ["militia_helmet", "militia_vest", "militia_carbine"],
               bonuses: { 2: { text: "+3 Armor", stats: { armor: 3 } },
                          3: { text: "-40% jam chance, +10 Accuracy", stats: { jam_pct: 40, accuracy: 10 } } } },
    hunter:  { name: "Hunter's Garb", pieces: ["hunter_mask", "hunter_coat", "hunter_longrifle"],
               bonuses: { 2: { text: "+8 Evasion, +5 Stealth (checks)", stats: { evasion: 8 }, checks: { stealth: 5 } },
                          3: { text: "Your first attack each battle is a guaranteed crit, and Hunter packs move only every 2nd move", flags: { firstAttackCrit: true, hunterSlowEvery: 2 } } } }
  },
  gunmanMult: { militia: 2 }    // Militia pieces x2 weight in Outlaw Gunman bodies
  // Hunter's Garb: Hunter bodies only, DATA.enemies.hunters.loot.garbPct (12%) per body
};
