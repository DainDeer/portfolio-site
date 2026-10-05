// SP-010 (Megan, Oct 2 playtest): units talk over their heads mid-battle ("REALOADING", "fucker hit me"), drawn as yellow
// text like classic RuneScape chat. Logic: js/barks.js; the views draw it (js/battleview.js, js/b3d/view.js).
// The sim reports what happened (b.fx { t: "bark", i: unit index, ev }); whether anyone speaks and which line is picked
// with the view's own random numbers, never the fight's, so barks never change a battle.
// Lines are [DRAFT] (Claude for Vixie: Megan's tone, swearing welcome). Numbers are [DRAFT] tuning.
window.DATA = window.DATA || {};
DATA.barks = {
  enabled: true,
  color: "#ffff00",       // the RuneScape yellow, with a black drop shadow
  holdSec: 2.6,           // how long a line stays up (real seconds, any battle speed)
  unitCooldownSec: 6,     // a unit says at most one line per this many real seconds
  maxOnScreen: 3,         // lines up at once (an event with `priority` still gets through)
  // per event: chance a line is said (after the cooldown and the cap); speaker "self" = the unit it happened to,
  // "ally" = a random standing unit on its side (not the one that went down)
  events: {
    start:     { chance: 0.3,  speaker: "self" },   // the fight starts (each unit rolls)
    reload:    { chance: 0.35, speaker: "self" },
    jam:       { chance: 0.9,  speaker: "self", priority: true },
    hurt:      { chance: 0.35, speaker: "self", minPct: 12 },   // a direct hit for at least minPct% of max HP
    low:       { chance: 0.85, speaker: "self", belowPct: 25 },  // first drop under belowPct% HP this fight
    kill:      { chance: 0.5,  speaker: "self" },
    ally_down: { chance: 0.8,  speaker: "ally", priority: true },
    healed:    { chance: 0.7,  speaker: "self" }                 // a Med kit landed
  },
  // voices: your squad, pets, and each enemy family (rivals and Hunters fall back to outlaws for anything missing)
  lines: {
    squad: {
      start: ["Let's fucking go!", "Here they come!", "Stay sharp.", "Light 'em up!", "Nobody die, okay?", "Ugh. Fine. Fight time."],
      reload: ["RELOADING!", "Reloading!", "Cover me, reloading!", "Changing mags!", "Hang on, reloading!"],
      jam: ["Shit, it's jammed!", "Come ON, you piece of junk!", "JAMMED! Of course!", "Why now?!"],
      hurt: ["Fucker hit me!", "Ow! OW!", "I'm hit!", "Son of a—!", "That's gonna leave a mark.", "Okay, ow."],
      low: ["I'm bleeding out here!", "Need a medic!", "Not looking good...", "Somebody heal me?!"],
      kill: ["Got one!", "Stay down.", "Next!", "Sit down.", "Eat dirt!", "Scratch one."],
      ally_down: ["Man down!", "No no no!", "They got one of ours!", "Shit! Cover them!", "MEDIC!"],
      healed: ["Ahh, that's better.", "Patched up!", "Good as new. Ish.", "Thanks, doc."]
    },
    pet: {
      start: ["Woof!", "*growl*"], hurt: ["*yelp*", "Awoo?!"], low: ["*whimper*"], kill: ["*happy bark*", "*chomp*"],
      ally_down: ["*howl*"], healed: ["*tail wag*"]
    },
    outlaws: {
      start: ["Fresh meat!", "Get 'em, boys!", "Nice boots. Mine now.", "Kill 'em all!"],
      reload: ["Reloading!", "Cover me!"],
      jam: ["Piece of junk!", "Damn thing's jammed!"],
      hurt: ["Argh!", "Lucky shot!", "You'll pay for that!", "Fuck!"],
      low: ["I'm out, I'm out!", "Not worth it!"],
      kill: ["Ha! Got 'em!", "Who's next?", "Easy."],
      ally_down: ["They got Dez!", "Man down!", "Bastards!"],
      healed: ["Better."]
    },
    hunters: {
      start: ["Contact.", "Target sighted.", "Move in."],
      reload: ["Reloading.", "Changing mags."],
      hurt: ["Taking fire!", "I'm hit."],
      low: ["Need support!"],
      kill: ["Target down.", "Confirmed."],
      ally_down: ["Hunter down!", "We lost one."]
    },
    beasts: {
      start: ["*snarl*", "GRRRAAH!", "*hiss*"], hurt: ["*yelp*", "SKREE!"], low: ["*whimper*"], kill: ["*crunch*", "*howl*"],
      ally_down: ["*howl*", "*shriek*"]
    },
    machines: {
      start: ["HOSTILES DETECTED.", "ENGAGING.", "YOU ARE TRESPASSING."],
      reload: ["RECALIBRATING."],
      hurt: ["DAMAGE SUSTAINED.", "WARNING."],
      low: ["CRITICAL DAMAGE.", "SYSTEM FAILURE IMMINENT."],
      kill: ["TARGET NEUTRALIZED.", "THREAT REMOVED."],
      ally_down: ["UNIT LOST.", "REROUTING."]
    }
  }
};
