// SP-133 · Enemy Attention, slice 1: the core loop (DEC-92 Confirmed; parent SP-128). Logic: js/v2.js ("Enemy
// Attention" section). View: js/ui.js (the bar + notoriety icon in the Map's header, Flee on the battle intro).
// EVERY number in this file is a PLACEHOLDER, to be tuned in SP-132. Nothing here is Heat: Attention is a per-Map local
// alertedness meter, expedition-scoped, and never shares UI or numbers with Heat (Heat stays orbital-only, SP-034).
// Not in this slice: travel toll, per-Map bar reduction, notoriety start (SP-134); closet hide, power shutoff, Map
// modifiers on Attention, the Scouting reveal (SP-135).
window.DATA = window.DATA || {};
DATA.attention = {
  enabled: true,              // off: every Map plays by the old V2 encounter rules (the rolls below come back too)
  barMax: 100,                // PLACEHOLDER (SP-132) the bar; reaching it pulls the party straight into battle prep

  // Attention per interaction (no flat per-click spawn chance). An ordinary search adds actions.search + the object's
  // own noise x noiseMult (data/searchables.js noise: a crate 5 -> 23, a locker 8 -> 26, a desk 4 -> 22), so a pull
  // comes every 4-5 loots. types: an absolute value for searching that object type instead.
  // Never an interaction: looting the bodies of a completed battle and the post-victory reward pickup (the spoils /
  // loot panel) add 0 and make no encounter roll.
  actions: { search: 18, pick: 12, force: 30, kick: 30, train: 15 },   // PLACEHOLDER (SP-132)
  noiseMult: 1,                                                       // PLACEHOLDER (SP-132)
  types: { door: 8, body_human: 8, body_beast: 8 },                   // PLACEHOLDER (SP-132) door / a scenery body (never a fight's)
  failedCheck: 10,            // PLACEHOLDER (SP-132) a flagged interactable check that fails (a lock, a heavy lid, a trap) adds this too
                              // (flat, after the Stealth check below: a jammed lock is loud however quiet you are)

  // Stealth check on every container loot (Megan via Vixie, Oct 7): any search / pick / force / kick of a lootable object
  // (not a door, not training) that adds Attention rolls d20 + the acting body's Stealth (the standard check math,
  // js/checks.js: d20 + floor(Stealth / 4) + gear, no helpers) vs dc. The tooltip shows the base value; the roll scales
  // it: a natural 1 x nat1 (the only result above the tooltip), an ordinary fail x fail, a pass by 0-4 / 5-9 / 10+ x the
  // pass bands, a natural 20 x nat20 (free). failedCheck is added after, unscaled. The die shows briefly (dice kind
  // "stealth", non-holding, data/config.js dice).
  stealth: {
    enabled: true,
    skill: "stealth",         // the existing Stealth skill (data/skills.js)
    dc: 12,                   // PLACEHOLDER (SP-132)
    nat1: 1.5,                // PLACEHOLDER (SP-132)
    fail: 1,                  // PLACEHOLDER (SP-132)
    pass: [{ by: 10, mult: 0.25 }, { by: 5, mult: 0.5 }, { by: 0, mult: 0.75 }],   // PLACEHOLDER (SP-132) margin >= by (first match)
    nat20: 0                  // PLACEHOLDER (SP-132)
  },

  // The patrol a full bar pulls: the Area's own group if it's still there, else a fresh one (Maps never
  // run out). Its size scales with the Map's notoriety level: extra units on top of the Map's normal budget, by level
  // (index = level after this fill; past the end: the last entry).
  // Notoriety (Megan, Oct 7): a separate level per Map, +1 every fightsPerNotoriety Attention fights (bar fills) on that
  // Map; it never goes down unless something specifically modifies it; a new expedition resets it.
  fightsPerNotoriety: 3,      // PLACEHOLDER (SP-132)
  patrol: { budgetMult: 1, extraUnitsByNotoriety: [0, 0, 1, 1, 2, 2, 3] },   // PLACEHOLDER (SP-132)

  // After an Attention fight is won: the bar goes back to 0 and the NEXT battle on that Map shows its escalation.
  escalation: { units: 1 },   // PLACEHOLDER (SP-132) +1 unit by default (the escalation catalog is OPEN: design pass with Megan)

  // Flee from a max-Attention pull (only that pull: every other flee keeps its rules, SP-044 / SP-001 / SP-034).
  // Standard: always free (no Heat, no penalty). Hardcore / Ragnarök: an Athletics check; a fail has no downside (you
  // fight), except a natural 1: your units are stunned for nat1StunSec at battle start. A successful flee ejects the
  // party from the Map (travel on or extract); entering it again starts the owed fight.
  flee: { free: ["standard"], check: { skill: "athletics", dc: 12 }, nat1StunSec: 1 },   // PLACEHOLDER (SP-132) dc

  // Peaceful (explicit flag): extract from anywhere on it (data/mapsV2 classification rules). With peacefulClearable
  // it would also have no bar and a finite, clearable pool; every other Map has effectively infinite enemies. maps: the authored V2 Maps by location (template) id, true =
  // Peaceful (it applies to a Map built from that V2 definition). Any other Map falls back to its Maps V2
  // classification (data/mapsv2.js, rolled per expedition for maps without a V2 definition): the classifications
  // listed here count as Peaceful. Defaults = the current Maps V2 classification:
  // the four V2 Peaceful starting Maps (School, Owlfall Hollow, Stillwater, Renegade's Hollow) are Peaceful; the
  // Contested and Occupied ones are not.
  // Megan (Oct 7, overrides the ticket's "Peaceful can be cleared"): for now Peaceful Maps ALSO run Attention and keep
  // producing enemies (no clearing, no finite pool anywhere: the game got boring when an Area ran dry). The only
  // Peaceful difference is the existing extract-anywhere. true: Peaceful Maps go back to no bar + finite, clearable pool.
  peacefulClearable: false,   // PLACEHOLDER (SP-132)
  peaceful: {
    classifications: ["peaceful"],
    maps: { backpack_cache: true, owlfall: true, stillwater: true, renegade_hollow: true,
            mossback: false, lumber_mill: false, toll_bridge: false, picnic: false, riverbed_camp: false, cryo_annex: false }
  },

  // The old V2 encounter rolls that would double up with Attention. Switched off ONLY on Maps where Attention runs
  // (every Map while peacefulClearable is false). Set any to false to bring that roll back (reversible).
  disableOld: {
    entryRoll: true,          // mapsV2.alert.entryPct: the 50% roll on first entering an Area that holds a group
    searchAlert: true,        // the per-search alert roll (object noise + mapsV2.alert.perSearchPct 3% per search ramp)
    roam: true,               // mapsV2.pool.roam: the unbound "whoever's walking around" group
    defeatedBudget: true      // mapsV2.pool.defeatedBudgetPct: +15% enemy budget per group beaten on the Map (V2's old escalation; Attention's escalation + notoriety patrols replace it)
  },

  heat: { attentionFightsLoud: false },   // an Attention fight never counts toward "loud fights" Heat (orbital units / a locked source still do)
  tutorial: true,             // Attention runs while the tutorial is on too (false: off until the tutorial ends)...
  tutorialMult: 1,            // ...at this x every interaction's value. Megan (Oct 7): standard rate throughout, tutorial included (was x0.5)

  // copy [PLACEHOLDER]
  text: {
    label: "Attention",
    notoriety: "Notoriety",
    notorietyTip: "How known you are on this Map this expedition: it rises every 3 patrols that come for you here. Their patrols grow with it.",
    stealth: "Stealth",
    stealthNat1: "Nat 1! Loud",
    stealthNat20: "Nat 20! Silent",
    peaceful: "Peaceful: nobody's hunting you here.",
    pullWhy: "They heard enough. A patrol comes for you!",
    owedWhy: "They were waiting for you to come back.",
    escalation: "They heard the last fight: +{n} more this time.",
    owed: "You ran from a patrol here: going back in means that fight.",
    flee: "Flee",
    fleeFree: "Flee (free): leave this Map, travel on or extract.",
    fleeCheck: "Flee: {check}. A fail has no downside, except a natural 1 (stunned 1 s at battle start).",
    fled: "You slip away from the patrol and out of this Map. Travel on, or extract.",
    fleeFail: "You can't shake them. Fight!",
    fleeNat1: "You stumble! Your squad starts the fight stunned."
  }
};
