// Slice 4 §A: tutorial overlay steps + the intro NPC (Old Marta). Copy is [PLACEHOLDER] (Vixie, slice-4.md; the flavor
// pass rewrites it). Engine: js/tutorial.js (state, which step is due; no DOM) + js/tutorialview.js (the overlay).
//
// SEQUENCE fields (DATA.tutorial.sequences.<id>):
//   trigger   screen / moment that can start it (checked after every render and every `pollMs`):
//               "outpost"      town view, no panel open        "deploy"   the embark panel (Prepare to deploy)
//               "map"          run map, nothing queued          "site"     inside a location view, nothing queued
//               "battle"       the first frame of the fight phase (the battle holds at 0 s until the last step closes)
//               "extract_site" standing on an extraction location with nothing queued (its Extract panel is showing)
//   modes     Marta's help choices that get it: "full" ("Show me everything"), "tips" ("Just tips when they come up")
//   when      optional condition name (G.Tut.conds in js/tutorial.js): "tutorialRun" (Basic-body tutorial still on,
//             state.tutorialDone false), "extractCheck" (the extraction you're standing on has a skill check)
//   steps     shown in order, one text box each
// STEP fields:
//   id          one-time flag (state.tut.steps[id]): a step shows once per save. A sequence is "due" while it has an
//               unflagged step that can show now, so a skipped step comes back on its own later.
//   target      CSS selector of what to ring (every match is ringed as one box). null = no ring, text box centred.
//   targetTouch optional selector used instead of `target` on the phone layout (G.Touch.layout(), css/mobile.css)
//   fallback    optional selector tried when `target` matches nothing on screen
//   fallbackTouch  optional selector used instead of `fallback` on the phone layout
//   skipIfMissing  true: if nothing matches, the step is skipped for now (not flagged): T2's extraction beat waits
//               until an extraction is on the map, then shows by itself
//   text        the box text (~40 words max). {key:Space} / {key:B} tokens read "Space" / "B" on desktop and are
//               dropped on phones; {click} reads "Click" / "Tap", {clicking} "clicking" / "tapping".
//   textTouch   optional full replacement text on the phone layout
//   when        optional condition name (as above) for this one step; false = skipped (not flagged)
//   arrow       optional "up" | "down" | "left" | "right" | "none" (default: auto, points from the box at the ring)
window.DATA = window.DATA || {};
DATA.tutorial = {
  enabled: true,      // master switch: false = no overlay steps at all (Marta still talks)
  pollMs: 400,        // how often a due step is looked for (on top of every render)
  dimAlpha: 0.6,      // the dim layer (~60% black)
  ringPadPx: 6,       // padding around the ringed box
  sequences: {
    // T1: first outpost visit, full tutorial only. Shown on the embark panel (its squad, med, carry and Deploy
    // controls live there; the trapdoor opens it).
    t1_outpost: { trigger: "deploy", modes: ["full"], steps: [
      { id: "t1_squad", target: "[data-tut=squad]", text: "This is you, plus two Grunts. They fight for you, and they can die for you." },
      { id: "t1_med",   target: "[data-tut=med]",   text: "Bring 2 Med kits. Heal in or after fights. Out of kits, out of luck." },
      { id: "t1_carry", target: "[data-tut=carry]", text: "Everything you bring and find has weight. Leave room for loot." },
      { id: "t1_embark", target: "[data-act=deploy]", text: "When you're ready, head down. Marta will be here when you get back. Probably." }
    ] },
    // T2: first time the run map opens
    t2_map: { trigger: "map", modes: ["full", "tips"], steps: [
      // phones: the zone map scrolls inside its box (css/mobile.css), so the three nodes don't all fit on a landscape
      // screen; ring where you stand instead (js/touch.js keeps it centred) and say how picking works by touch
      { id: "t2_routes", target: ".map-node.reachable", targetTouch: ".map-node.current", text: "Three ways in from the Ranger's Gate. Each spot shows what lives there and what it might hold. Pick one.",
        textTouch: "You start at the Ranger's Gate. Three ways in. Each spot shows what lives there and what it might hold. Tap one to look, tap it again to go." },
      { id: "t2_heat", target: "[data-tut=heat]", text: "Noise and fighting raise Heat. More Heat means tougher enemies and worse odds." },
      { id: "t2_extract", target: ".map-node.extract", skipIfMissing: true, text: "This is your way out. Get here to keep what you're carrying. Die out there and you lose it." },
      { id: "t2_notimer", target: null, text: "There's no timer. Push deeper for better loot, or leave while you're ahead." }
    ] },
    // T3: first battle start (holds the fight at 0 s, resumes after the last step)
    t3_battle: { trigger: "battle", modes: ["full", "tips"], steps: [
      // phones: ring the on-screen Pause button (the landscape field leaves no room beside it for the box, and the
      // text is about pausing); the slider gets its own ring in the next step
      { id: "t3_auto", target: ".battle-canvas", targetTouch: ".tc-pause", text: "In RENEGADE, your units fight automatically. But you can pause ({key:Space}) or slow down time whenever you want to plan.",
        textTouch: "In RENEGADE, your units fight automatically. But you can tap Pause or slow down time whenever you want to plan." },
      // phones: Pause isn't next to the slider (landscape: top right, portrait: the bottom bar), so the two in one ring
      // covered most of a portrait screen; the slider alone here, Pause was ringed in t3_auto
      { id: "t3_speed", target: ".bh-speeds, .bh-pause", targetTouch: ".bh-speeds", text: "Slide to speed the fight up or slow it down (all the way left stops it). Pause is next to it.",   // [PLACEHOLDER] (the spec only says "ring them"; A2 slider),
        textTouch: "Slide to speed the fight up or slow it down (all the way left stops it). Double-tap the slider for 1x." },
      { id: "t3_abl", target: ".ability-bar .abl-btn:not(.esc-btn)", fallback: ".bh-pause", fallbackTouch: ".tc-pause", text: "While paused, queue abilities and Med kits. They fire the moment you unpause." },
      { id: "t3_break", target: ".esc-btn", targetTouch: ".tc-esc", fallback: ".esc-btn", text: "Losing? Break away ({key:B}) to run for it. Not everyone always makes it." }
    ] },
    // T4: first extraction site on the first (tutorial) run
    t4_extract: { trigger: "extract_site", modes: ["full", "tips"], when: "tutorialRun", steps: [
      { id: "t4_how", target: "[data-act=extract]", text: "Here's how you get out. {click} Extract, then pass the check for your ride." },
      { id: "t4_graded", target: "[data-act=extract]", when: "extractCheck", text: "Better rolls mean a smoother exit. A bad roll has consequences." }
    ] }
  },
  // A1: Old Marta, by the trapdoor. Human, like Dunn and Ilse. Opening the trapdoor before talking to her opens her first.
  marta: {
    name: "Old Marta", title: "keeps the new ones alive", portrait: "npc_marta", townSprite: "town_marta", hotspot: "marta",
    greeting: "Another one out of the pods. I'm Marta. I keep the new ones alive, mostly. How much hand-holding do you want?",   // [PLACEHOLDER] (not in the spec)
    choices: [
      { mode: "full", label: "Show me everything." },
      { mode: "tips", label: "Just tips when they come up." },
      { mode: "none", label: "I've got this." }
    ],
    afterChoice: { full: "Good. Stay close and don't touch anything sharp.", tips: "Fine. I'll shout when it matters.", none: "Suit yourself. The trapdoor's right there." },   // [PLACEHOLDER]
    talkAgain: "Still breathing? Good. Settings has \"Replay tutorial\" if you want me to walk you through it again.",   // [PLACEHOLDER]
    // "I've got this" + back from a successful extraction: one-off line (shown once, in the run result)
    notDeadLine: "Huh. You're not dead. I'm impressed, and a little annoyed."
  }
};
