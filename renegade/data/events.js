// §8 Events with D&D-style checks. Text is [PLACEHOLDER].
// Option: { label, check:{skill,dc}, gruntSpendable, outcomes:{crit,success,fail,badFail} } or { label, effects:[...] }
// Option-level `heat: N` (Megan's playtest: Heat comes in big chunks from big-reward choices) is added the moment you
// pick the option, whatever the roll, and the UI appends "(+N Heat)" to the label. Risky skill checks = a check whose
// success pays out (loot, a hidden stash, a body, a recruit) and whose failure can hurt or start a fight: +15.
// Effects: heat, loot{rolls,rarityBonus}, res{...}, battle{family,budgetMult}, lore, damagePct, revealFog, payKg,
//          claimBody, gruntsJoin, hiddenContainer (Slice 2: adds a crate to the location view), text, setWorld{key:value},
//          distressCountdown: locId (start that location's same-run distress countdown, see DATA.map.locations[locId].distress)
window.DATA = window.DATA || {};
DATA.events = {
  tunnel: {
    title: "Collapsed Transit Tunnel",
    text: "The tunnel roof has come down in a slope of concrete and rebar. Something glints under the rubble.",
    options: [
      { label: "Climb over", check: { skill: "athletics", dc: 14 }, outcomes: {
          crit:    [{ text: "You scramble over and spot a cache on the far side." }, { loot: { rolls: 1 } }],
          success: [{ text: "You climb over cleanly." }],
          fail:    [{ text: "You slip and gash your leg on rebar." }, { damagePct: 10 }],
          badFail: [{ text: "The slope shifts and buries you for a moment. The noise carries." }, { damagePct: 25 }, { heat: 5 }] } },
      { label: "Shore it up and dig", heat: 15, check: { skill: "engineering", dc: 16 }, outcomes: {
          success: [{ text: "You brace the roof and uncover a hidden container." }, { hiddenContainer: true }],
          fail:    [{ text: "It won't hold. Wasted time." }, { heat: 3 }],
          badFail: [{ text: "Part of the roof collapses on you." }, { damagePct: 20 }, { heat: 3 }] } },
      { label: "Detour around", check: { skill: "survival", dc: 12 }, outcomes: {
          success: [{ text: "You find a service passage. No time lost." }],
          fail:    [{ text: "The long way round. (+1 location worth of travel, +3 Heat)" }, { heat: 5 }] } },
      { label: "Walk away", effects: [{ text: "You leave it." }] }
    ]
  },
  relay: {
    title: "Orbital Propaganda Relay",
    text: "A mast blares looped orbital propaganda across the wastes. A maintenance panel hangs open.",
    options: [
      { label: "Reroute the signal", check: { skill: "hacking", dc: 18 }, outcomes: {
          success: [{ text: "The loop cuts out. Local war-bands lose your trail." }, { heat: -15 }],
          fail:    [{ text: "The panel sparks. Nothing happens." }],
          badFail: [{ text: "An alarm tone replaces the loop." }, { heat: 8 }] } },
      { label: "Destroy it (battle, then loot, +20 Heat)", effects: [{ heat: 20 }, { battle: { family: "outlaws", budgetMult: 1.2 } }, { loot: { rolls: 2 } }] },
      { label: "Decode it", check: { skill: "lore", dc: 15 }, outcomes: {
          success: [{ text: "Buried in the loop: coordinates and a name." }, { lore: "relay_decoded" }],
          fail:    [{ text: "Just noise to you." }] } },
      { label: "Walk away", effects: [{ text: "You leave the mast screaming." }] }
    ]
  },
  cryo_ward: {
    title: "Cryo Ward",
    text: "Rows of frosted pods. One still hums, its occupant perfectly preserved.",
    options: [
      { label: "Claim the dormant body", heat: 15, check: { skill: "transference", dc: 16 }, outcomes: {
          success: [{ text: "You imprint the sleeper. Their body will wait for you at the Body Lab if you extract." }, { claimBody: true }],
          fail:    [{ text: "The link won't take." }],
          badFail: [{ text: "The pod's defence system wakes up!" }, { battle: { family: "machines", budgetMult: 0.8 } }] } },  // Slice 3 §4a: the defence drones are machines now
      { label: "Scavenge supplies", heat: 15, check: { skill: "scavenging", dc: 12 }, outcomes: {
          crit:    [{ text: "A full trauma kit." }, { res: { med: 3 } }],
          success: [{ text: "You find Med Supplies." }, { res: { med: 2 } }],
          fail:    [{ text: "Mostly expired. One usable pack." }, { res: { med: 1 } }],
          badFail: [{ text: "The pod's defence system wakes up!" }, { battle: { family: "machines", budgetMult: 0.8 } }] } },
      { label: "Walk away", effects: [{ text: "You leave them sleeping." }] }
    ]
  },
  // design call (milestone 3): machines in Zone B. Text [PLACEHOLDER]. In Zone B's event pool (DATA.zones.list.b.eventPool)
  drone_patrol: {
    title: "Drone Patrol",
    text: "Two old patrol drones drift down the flooded street, humming, lights sweeping the water. They haven't found you yet.",
    options: [
      { label: "Lie low", check: { skill: "stealth", dc: 14 }, outcomes: {
          success: [{ text: "You sink into the reeds until the hum fades." }],
          fail:    [{ text: "A light swings onto you. The drones whistle for backup." }, { battle: { family: "machines", budgetMult: 0.8 } }] } },
      { label: "Shoot them down (battle, +15 Heat)", heat: 15, effects: [{ battle: { family: "machines", budgetMult: 1.0 } }, { text: "You pull the drones out of the water." }, { res: { electronics: 2, data_shards: 1 } }, { loot: { rolls: 1, rarityBonus: 10 } }] },
      { label: "Back off", effects: [{ text: "You let them pass." }] }
    ]
  },
  // Slice 3 §4a (doc §8.3 #5), text [PLACEHOLDER]. Relay Tower 7 + Pylon Field pools.
  ai_perimeter_drone: {
    title: "Perimeter Drone",
    text: "A pre-fall security drone hangs over the road, sweeping a red beam across the rubble. It hasn't seen you yet.",
    options: [
      { label: "Slip past", check: { skill: "stealth", dc: 15 }, outcomes: {
          success: [{ text: "You wait for the beam to pass and slip by." }],
          fail:    [{ text: "The beam catches you. It whistles for friends." }, { battle: { family: "machines", budgetMult: 1.0 } }] } },
      { label: "Signal peace", check: { skill: "persuasion", dc: 18 }, outcomes: {
          success: [{ text: "You flash the old maintenance code. The drone dips, and shares its map." }, { revealFog: 3 }],
          fail:    [{ text: "It doesn't understand. It keeps its distance and watches." }, { heat: 3 }] } },
      { label: "Take it down (battle, +15 Heat)", heat: 15, effects: [{ battle: { family: "machines", budgetMult: 1.2 } }, { text: "You strip the wreck." }, { res: { data_shards: 2 } }, { loot: { rolls: 1, rarityBonus: 10 } }] },
      { label: "Walk away", effects: [{ text: "You back off the road and let it pass." }] }
    ]
  },
  toll_gate: {
    title: "Outlaw Toll Gate",
    text: "A barricade of cars and tyres. \"Toll's ten kilos, renegade. Pick the good stuff.\"",
    options: [
      { label: "Talk them down (pay half)", check: { skill: "persuasion", dc: 13 }, outcomes: {
          crit:    [{ text: "They wave you through for free." }],
          success: [{ text: "They settle for half." }, { payKg: 5 }],
          fail:    [{ text: "They want the full toll." }, { payKg: 10 }],
          badFail: [{ text: "They take offence. Guns come up." }, { battle: { family: "outlaws", budgetMult: 1.0 } }] } },
      { label: "Hide the good stuff", check: { skill: "hauling", dc: 15 }, outcomes: {
          success: [{ text: "They take a bag of junk and let you pass." }],
          fail:    [{ text: "They find some of it." }, { payKg: 10 }],
          badFail: [{ text: "They find all of it, and they're angry." }, { battle: { family: "outlaws", budgetMult: 1.0 } }] } },
      { label: "Fight", effects: [{ battle: { family: "outlaws", budgetMult: 1.0 } }] },
      { label: "Pay 10 kg of loot", effects: [{ payKg: 10 }] }
    ]
  },
  cache: {
    title: "Dead Renegade's Cache",
    text: "A shell of a renegade like you, slumped against a footlocker. Their neural jack still blinks.",
    options: [
      { label: "Read their memory", check: { skill: "transference", dc: 20 }, outcomes: {
          success: [{ text: "Fragments of another life flood in." }, { lore: "renegade_memory" }],
          fail:    [{ text: "Static." }],
          badFail: [{ text: "Feedback. Your head splits." }, { damagePct: 15 }] } },
      { label: "Loot it properly", heat: 15, check: { skill: "scavenging", dc: 12 }, outcomes: {
          crit:    [{ text: "A false bottom!" }, { loot: { rolls: 2, rarityBonus: 20 } }],
          success: [{ text: "You go through it carefully." }, { loot: { rolls: 1, rarityBonus: 10 } }],
          fail:    [{ text: "You grab what's on top." }, { loot: { rolls: 1 } }],
          badFail: [{ text: "Booby-trapped!" }, { damagePct: 20 }] } },
      { label: "Check for traps first", heat: 15, check: { skill: "perception", dc: 14 }, gruntSpendable: true, outcomes: {
          success: [{ text: "You disarm a tripwire and loot at leisure." }, { loot: { rolls: 2 } }],
          fail:    [{ text: "You can't tell. You leave it." }],
          badFail: [{ text: "Click." }, { damagePct: 25 }] } }
    ]
  },
  // Zone B, Flooded Cul-de-sac: "a survivor on a roof" (Slice 2 §3). Text [PLACEHOLDER]; uses existing effects only.
  rooftop_survivor: {
    title: "Survivor on a Roof",
    text: "Someone waves a rag from a half-sunk roof. The water around the house is moving.",
    options: [
      { label: "Wade out and help them down", heat: 15, check: { skill: "athletics", dc: 12 }, outcomes: {
          success: [{ text: "You get them down. They want to come with you." }, { gruntsJoin: 1 }],
          fail:    [{ text: "The current drags you under a fence before you reach them." }, { damagePct: 10 }],
          badFail: [{ text: "You go under, and the splashing draws the hounds." }, { damagePct: 10 }, { battle: { family: "beasts", budgetMult: 0.8 } }] } },
      { label: "Talk them into swimming to you", check: { skill: "persuasion", dc: 13 }, outcomes: {
          success: [{ text: "They make it across. (+1 recruit if you extract)" }, { gruntsJoin: 1 }],
          fail:    [{ text: "They won't leave the roof." }] } },
      { label: "Leave them", effects: [{ text: "You leave them waving." }] }
    ]
  },
  // ---- world event (radio, timed): the crackling radio object in a location view ----
  distress_hollow_creek: {
    icon: "loc_distress",
    title: "Distress Call: Hollow Creek",
    radio: true,
    text: "*crackle* \"Raiders at the wall, anyone out there? Hollow Creek, anyone!\"",
    options: [
      { label: "Go now (detour, defense battle)", heat: 20, effects: [ { travelTo: "hollow_creek" }, { battle: { family: "outlaws", budgetMult: 1.3, defense: true } }, { setWorld: { hollow_creek: "saved" } }, { gruntsJoin: 2 }, { loot: { rolls: 1, rarityBonus: 10 } }, { text: "Hollow Creek holds. Two of their people want to join your outpost." }] },
      { label: "Find a shortcut, then go (+15 Heat, +25 if it fails)", check: { skill: "survival", dc: 14 }, outcomes: {
          success: [{ text: "You know a dry gully. Less noise on the way." }, { heat: 15 }, { travelTo: "hollow_creek" }, { battle: { family: "outlaws", budgetMult: 1.3, defense: true } }, { setWorld: { hollow_creek: "saved" } }, { gruntsJoin: 2 }, { loot: { rolls: 1, rarityBonus: 10 } }],
          fail:    [{ text: "No shortcut. You take the long way." }, { heat: 25 }, { travelTo: "hollow_creek" }, { battle: { family: "outlaws", budgetMult: 1.3, defense: true } }, { setWorld: { hollow_creek: "saved" } }, { gruntsJoin: 2 }, { loot: { rolls: 1, rarityBonus: 10 } }] } },
      { label: "Ignore it (they can hold a few more moves)", effects: [{ text: "The radio goes quiet. Hollow Creek won't hold for long." }, { setWorld: { hollow_creek: "ignored" } }, { distressCountdown: "hollow_creek" }] }
    ]
  },
  // arriving at Hollow Creek while its distress countdown is still running (same run, after ignoring the radio)
  hollow_creek_holding: {
    icon: "loc_distress",
    title: "Hollow Creek: still holding",
    text: "Smoke over the wall, but the gate is still shut. Raiders are regrouping for another push.",
    options: [
      { label: "Defend the town (defense battle)", heat: 20, effects: [{ battle: { family: "outlaws", budgetMult: 1.5, defense: true } }, { setWorld: { hollow_creek: "saved" } }, { gruntsJoin: 2 }, { loot: { rolls: 1, rarityBonus: 10 } }, { text: "Hollow Creek holds. Two of their people want to join your outpost." }] },
      { label: "Slip away", effects: [{ text: "You leave them to it." }] }
    ]
  },
  aftermath_hollow_creek: {
    title: "Hollow Creek (Aftermath)",
    text: "Burned walls. A raider camp squats in the ruins. A few survivors watch you from a cellar door. They remember who didn't come.",
    options: [
      { label: "Clear the raider camp", effects: [{ battle: { family: "outlaws", budgetMult: 1.2 } }, { loot: { rolls: 2, rarityBonus: 10 } }, { lore: "hollow_creek_aftermath" }, { setWorld: { hollow_creek: "aftermath_cleared" } }] },
      { label: "Search the ruins quietly", heat: 15, check: { skill: "stealth", dc: 14 }, gruntSpendable: true, outcomes: {
          success: [{ text: "You slip in and out." }, { loot: { rolls: 1 } }, { lore: "hollow_creek_aftermath" }],
          fail:    [{ text: "Spotted!" }, { battle: { family: "outlaws", budgetMult: 1.2 } }] } },
      { label: "Leave", effects: [{ text: "You leave the survivors to their cellar." }] }
    ]
  },
  allied_hollow_creek: {
    title: "Hollow Creek (Allied)",
    text: "The wall is patched. People wave. Someone presses supplies into your hands.",
    options: [ { label: "Thank them", effects: [{ res: { med: 1, scrap: 5 } }, { setWorld: { hollow_creek: "allied_visited" } }] } ]
  }
};
DATA.lore = { // [PLACEHOLDER] lore strings live in one place (§15.4)
  relay_decoded: "RELAY LOG [PLACEHOLDER]: 'Sector 9 is abandoned. Orbital tithe suspended.'",
  renegade_memory: "MEMORY [PLACEHOLDER]: a white city behind glass, and a door that never opened.",
  hollow_creek_aftermath: "GRAFFITI [PLACEHOLDER]: 'WE CALLED. NOBODY CAME.'",
  ilse_ledger: "ILSE'S LEDGER [PLACEHOLDER]: 'Harrow Street, week 40. Eleven admitted, nine discharged. The water keeps rising. The hounds come at night now.'"
};
