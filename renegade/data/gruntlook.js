// Slice 4 §F: the Grunt paper doll (Smudge's assets/grunt_options/, grunt_options.json + slice4_manifest.json).
// A Grunt's look = the mannequin base (skin, hair, beard: picked from its uid, cosmetic) + one art part per equipped
// slot, composited at runtime (js/gruntlook.js) in layerOrder. Paths are relative to assets/grunt_options/.
//   parts.head[id]     { headwear, hidesHair }          parts.body[id] { legwear, footwear, torso, belt, sleeves{armVariant} }
//   parts.backpack[id] { pack_back, pack_straps }        parts.weapon[id] { weapon, armVariant (one_hand | two_hand | two_hand_rifle) }
//   A part whose id IS the item's base key wins, so Smudge's own layers for an item take over as soon as they're in
//   grunt_options.json (js/gruntgear.js merges its "gear" at load; a gear entry's "items" list maps too). Else
//   items.<slot>[itemBase] = part id (a stand-in); else fallback.<slot>; a weapon falls back to wtype_<wtype>.
// Empty slots: head / pack nothing, body the mannequin undershirt + shorts (barefoot), weapon the Grunt's own (innate) weapon.
window.DATA = window.DATA || {};
DATA.gruntLook = {
  enabled: true,           // false: Grunts use the old unit_grunt sprite
  base: "grunt_options/",
  frameSize: 32, frames: ["stand", "walkA", "walkB"],   // every layer file is a 96x32 strip: stand | walkA | walkB
  layerOrder: ["pack_back", "stowed", "body", "underwear", "face", "legwear", "footwear", "torso", "pack_straps", "belt", "weapon", "offhand", "arms", "sleeves", "shield", "hair", "facial_hair", "headwear"],
  looks: { skins: ["light", "medium", "dark"], hair: ["crop", "shag", "tied"], hairColours: ["brown", "ginger", "black", "blond", "grey"], beardPct: 30 },
  basePaths: { body: "base/body_{skin}.png", underwear: "base/underwear.png", face: "base/face_{skin}.png",
    arms: { one_hand: "base/arms_{skin}.png", two_hand: "base/arms_{skin}_two_hand.png", two_hand_rifle: "base/arms_{skin}_two_hand_rifle.png",
      one_hand_shield: "base/arms_{skin}_one_hand_shield.png" },   // Slice 5 §E (fbafb0b): weapon arm as one_hand, off arm braced behind the shield
    hair: "base/hair_{hair}_{hairColour}.png", facial_hair: "base/facial_hair_beard_{hairColour}.png" },
  empty: { legwear: "gear/empty_body/05_legwear.png", torso: "gear/empty_body/07_torso.png",
    sleeves: { one_hand: "gear/empty_body/13_sleeves.png", two_hand: "gear/empty_body/13_sleeves_two_hand.png", two_hand_rifle: "gear/empty_body/13_sleeves_two_hand_rifle.png",
      one_hand_shield: "gear/empty_body/13_sleeves_one_hand_shield.png" } },
  parts: {
    head: {
      militia_helmet: { headwear: "gear/head/militia_helmet/16_headwear.png", hidesHair: false },
      woodsman_beanie: { headwear: "gear/head/woodsman_beanie/16_headwear.png", hidesHair: false },
      scav_hood: { headwear: "gear/head/scav_hood/16_headwear.png", hidesHair: true },
      starter_wrap: { headwear: "gear/head/starter_wrap/16_headwear.png", hidesHair: false }
    },
    body: {
      militia_tabard: { legwear: "gear/body/militia_tabard/05_legwear.png", footwear: "gear/body/militia_tabard/06_footwear.png", torso: "gear/body/militia_tabard/07_torso.png", belt: "gear/body/militia_tabard/09_belt.png", sleeves: {"one_hand": "gear/body/militia_tabard/13_sleeves.png", "two_hand": "gear/body/militia_tabard/13_sleeves_two_hand.png", "two_hand_rifle": "gear/body/militia_tabard/13_sleeves_two_hand_rifle.png", "one_hand_shield": "gear/body/militia_tabard/13_sleeves_one_hand_shield.png"} },
      quilted_jacket: { legwear: "gear/body/quilted_jacket/05_legwear.png", footwear: "gear/body/quilted_jacket/06_footwear.png", torso: "gear/body/quilted_jacket/07_torso.png", belt: "gear/body/quilted_jacket/09_belt.png", sleeves: {"one_hand": "gear/body/quilted_jacket/13_sleeves.png", "two_hand": "gear/body/quilted_jacket/13_sleeves_two_hand.png", "two_hand_rifle": "gear/body/quilted_jacket/13_sleeves_two_hand_rifle.png", "one_hand_shield": "gear/body/quilted_jacket/13_sleeves_one_hand_shield.png"} },
      scav_coat: { legwear: "gear/body/scav_coat/05_legwear.png", footwear: "gear/body/scav_coat/06_footwear.png", torso: "gear/body/scav_coat/07_torso.png", belt: "gear/body/scav_coat/09_belt.png", sleeves: {"one_hand": "gear/body/scav_coat/13_sleeves.png", "two_hand": "gear/body/scav_coat/13_sleeves_two_hand.png", "two_hand_rifle": "gear/body/scav_coat/13_sleeves_two_hand_rifle.png", "one_hand_shield": "gear/body/scav_coat/13_sleeves_one_hand_shield.png"} },
      starter_poncho: { legwear: "gear/body/starter_poncho/05_legwear.png", footwear: "gear/body/starter_poncho/06_footwear.png", torso: "gear/body/starter_poncho/07_torso.png", belt: "gear/body/starter_poncho/09_belt.png", sleeves: {"one_hand": "gear/body/starter_poncho/13_sleeves.png", "two_hand": "gear/body/starter_poncho/13_sleeves_two_hand.png", "two_hand_rifle": "gear/body/starter_poncho/13_sleeves_two_hand_rifle.png", "one_hand_shield": "gear/body/starter_poncho/13_sleeves_one_hand_shield.png"} }
    },
    backpack: {
      military_ruck: { pack_back: "gear/backpack/military_ruck/00_pack_back.png", pack_straps: "gear/backpack/military_ruck/08_pack_straps.png" },
      school_bag: { pack_back: "gear/backpack/school_bag/00_pack_back.png", pack_straps: "gear/backpack/school_bag/08_pack_straps.png" }
    },
    weapon: {
      militia_carbine: { weapon: "gear/weapon/militia_carbine/10_weapon.png", armVariant: "two_hand_rifle" },
      pipe_rifle: { weapon: "gear/weapon/pipe_rifle/10_weapon.png", armVariant: "two_hand_rifle" },
      felling_axe: { weapon: "gear/weapon/felling_axe/10_weapon.png", armVariant: "two_hand" },
      recruit_spear: { weapon: "gear/weapon/recruit_spear/10_weapon.png", armVariant: "one_hand" },
      scav_hatchet: { weapon: "gear/weapon/scav_hatchet/10_weapon.png", armVariant: "one_hand" },
      nat_shiv: { weapon: "gear/weapon/nat_shiv/10_weapon.png", armVariant: "one_hand" },
      bass_guitar: { weapon: "gear/weapon/bass_guitar/10_weapon.png", armVariant: "two_hand" },
      wtype_auto: { weapon: "gear/weapon/wtype_auto/10_weapon.png", armVariant: "two_hand_rifle" },
      wtype_blade: { weapon: "gear/weapon/wtype_blade/10_weapon.png", armVariant: "one_hand" },
      wtype_bow: { weapon: "gear/weapon/wtype_bow/10_weapon.png", armVariant: "two_hand_rifle" },
      wtype_club: { weapon: "gear/weapon/wtype_club/10_weapon.png", armVariant: "one_hand" },
      wtype_crossbow: { weapon: "gear/weapon/wtype_crossbow/10_weapon.png", armVariant: "two_hand_rifle" },
      wtype_improvised: { weapon: "gear/weapon/wtype_improvised/10_weapon.png", armVariant: "one_hand" },
      wtype_pistol: { weapon: "gear/weapon/wtype_pistol/10_weapon.png", armVariant: "one_hand" },
      wtype_rifle: { weapon: "gear/weapon/wtype_rifle/10_weapon.png", armVariant: "two_hand_rifle" },
      wtype_shotgun: { weapon: "gear/weapon/wtype_shotgun/10_weapon.png", armVariant: "two_hand_rifle" }
    },
    // Slice 5 §E (Smudge's fbafb0b): the shield layer draws right after sleeves (a braced shield is in front of its arm;
    // the reserved "offhand" layer is under the arms: kept for off-hand weapons). Rides handR, centred ~20.2,19.2.
    offhand: {
      wood_round_shield: { shield: "gear/offhand/wood_round_shield/13b_shield.png", armVariant: "one_hand_shield" },
      riot_shield: { shield: "gear/offhand/riot_shield/13b_shield.png", armVariant: "one_hand_shield" },
      scrap_lid_shield: { shield: "gear/offhand/scrap_lid_shield/13b_shield.png", armVariant: "one_hand_shield" }
    }
  },
  // item base -> part id. [JUDGMENT] items without their own art borrow the closest set (Scrap Helmet -> the militia
  // helmet, Hunter's Mask -> the hood, Padded Vest -> the quilted jacket, Hunter's Coat -> the scav coat, Scav Satchel ->
  // the school bag); the woodsman beanie / quilted jacket / starter wrap + poncho have art but no item yet.
  items: {
    // Vixie's starter / basic items (patched_tunic, hide_vest, wool_cap) need no entry: Smudge's layers (26801b2) are in
    // grunt_options.json under the item's own key, merged at load.
    head: { militia_helmet: "militia_helmet", scav_hood: "scav_hood", scrap_helmet: "militia_helmet", hunter_mask: "scav_hood" },   // Slice 5 §H outfits: Smudge's layers (25aa602) under the item keys
    body: { militia_vest: "militia_tabard", scav_poncho: "scav_coat", padded_vest: "quilted_jacket", hunter_coat: "scav_coat" },
    backpack: { school_bag: "school_bag", military_ruck: "military_ruck", scav_satchel: "school_bag" },
    weapon: { pipe_rifle: "pipe_rifle", militia_carbine: "militia_carbine", nat_shiv: "nat_shiv", bass_guitar: "bass_guitar" }
  },
  fallback: { head: "militia_helmet", body: "starter_poncho", backpack: "school_bag", weapon: null },
  // Slice 5 §H cosmetics (Vixie's [DRAFT] single-player rule): equipping an item once unlocks its look for good
  // (state.cosmetics.unlocked); the doll's Outfit row then lets a Grunt wear any unlocked look over its real gear (stats
  // unchanged; g.cosmetic = { head, body }). Looks: the silly outfits below + every head / body gear look ("look_<part>",
  // from an item with its own or a mapped part; the fallback doesn't count). Head "none" = bare head. Grunts only:
  // your body and Veterans keep their sprites. No bind / trade rules (parked for the MMO).
  //   outfits[id]: { name, slot, item (the item that unlocks it), underwear (body: nothing over the mannequin's underwear) }
  //   The look is the item's own part (Smudge's layers in grunt_options.json under the item key, 25aa602); an outfit
  //   without art falls back to a stand-in (items map above) and cosList() marks it pending. Vixie's calls: the horse
  //   mask hides hair + beard (hides_facial_hair) and draws in the normal order; the witch hat keeps the hair; the maid
  //   headband (the body part's extra headwear) draws only while the head draws nothing; outfits never hide packs.
  cosmetics: {
    outfits: {
      witch_hat:    { name: "Witch hat",          slot: "head", item: "witch_hat" },
      horse_mask:   { name: "Horse mask",         slot: "head", item: "horse_mask" },
      wizard_robes: { name: "Wizard robes",       slot: "body", item: "wizard_robes" },
      maid_outfit:  { name: "Maid outfit",        slot: "body", item: "maid_outfit" },
      lucky_boxers: { name: "Lucky boxers",       slot: "body", item: "lucky_boxers" }   // Vixie: its own boxers art (was underwear: true, the bare mannequin)
    }
  },
  dollScale: 5             // the paper doll draws the stand frame at 5x
};
