// Slice 3 §10a: injuries. [DRAFT] Sources: your body downed and the run continues (A2), a Critical ally stabilized
// (1 Med Supplies) instead of healed, a carried Critical ally making it home. Each gives 1 random injury; a unit holds at
// most maxPerUnit, never 2 of a kind. They last until treated at the Infirmary, or heal by themselves after healRuns runs
// (Infirmary L2: its effects.healRuns). mods: hpPct (Max HP %), acc (Accuracy), movePct (Move Speed %), jam (Jam rating), asPct (Attack Speed %).
window.DATA = window.DATA || {};
DATA.injuries = {
  maxPerUnit: 2,
  healRuns: 3,
  sources: { downed: true, stabilized: true, carried: true },
  list: {
    cracked_ribs:   { name: "Cracked Ribs",   desc: "-15% Max HP",                        mods: { hpPct: -15 } },
    concussion:     { name: "Concussion",     desc: "-10 Accuracy",                       mods: { acc: -10 } },
    torn_muscle:    { name: "Torn Muscle",    desc: "-15% Move Speed",                    mods: { movePct: -15 } },
    sprained_wrist: { name: "Sprained Wrist", desc: "+6 Jam rating, -10% Attack Speed",   mods: { jam: 6, asPct: -10 } }
  }
};
