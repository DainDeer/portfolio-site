// Slice 3 §10b: the Radio's bounty board, decoding and (step 10) rival intel. [DRAFT] numbers; [PLACEHOLDER] text.
// Bounties: up to maxActive at once (no quest slots, no reputation); the board rerolls its open offers every refreshRuns runs.
// Templates: kill N of a family in a zone (picked from unlocked zones with that family), turn in resources, scout an unvisited
// named location and extract. Rewards: 5-10 of a common resource plus 1 Fuel or 1 Biomass; the hot bounty (Radio L2) pays 2 Data Shards instead.
window.DATA = window.DATA || {};
DATA.radio = {
  voice: "A tired voice on a looping frequency [PLACEHOLDER]",
  maxActive: 2,
  refreshRuns: 2,
  templates: {
    kill_outlaws:   { type: "kill", family: "outlaws",  n: 6, text: "Outlaws are bleeding the roads in {zone}. Put down {n}." },
    kill_beasts:    { type: "kill", family: "beasts",   n: 8, text: "Something's breeding out in {zone}. Thin them out: {n} Bio-beasts." },
    kill_machines:  { type: "kill", family: "machines", n: 4, text: "Old machines woke up in {zone}. Scrap {n} of them." },
    turnin_fuel:    { type: "turnin", res: "fuel",    n: 10, text: "Somebody needs to keep a generator running. Bring {n} Fuel." },
    turnin_biomass: { type: "turnin", res: "biomass", n: 6,  text: "A grower wants feedstock. {n} Biomass, no questions." },
    scout:          { type: "scout", text: "Nobody's been to {loc} ({zone}) in a while. Go look and get back out." }
  },
  reward: { common: ["food", "water", "scrap", "cloth", "electronics", "chemicals"], min: 5, max: 10, extra: ["fuel", "biomass"], extraN: 1, hot: { data_shards: 2 } },
  // Decode (1 Data Shard): the next unread fragment + Lore XP; once all are read, XP only
  decode: { cost: { data_shards: 1 }, loreXp: 300, fragments: ["radio_1", "radio_2", "radio_3", "radio_4", "radio_5", "radio_6"] }
};
// [PLACEHOLDER] lore fragments decoded at the Radio (shown in the Codex)
Object.assign(DATA.lore = DATA.lore || {}, {
  radio_1: "[PLACEHOLDER] Fragment 1: a supply manifest for 'Orbital Relay Seven', every line stamped PRIORITY.",
  radio_2: "[PLACEHOLDER] Fragment 2: a looping weather report from a city that stopped existing years ago.",
  radio_3: "[PLACEHOLDER] Fragment 3: a child's voice counting down, then static, then counting again.",
  radio_4: "[PLACEHOLDER] Fragment 4: coordinates, and the words 'the bodies are not empty'.",
  radio_5: "[PLACEHOLDER] Fragment 5: a man reading names off a list. One of them is yours.",
  radio_6: "[PLACEHOLDER] Fragment 6: 'If you can hear this, the upload worked. Don't trust the Orbitals.'"
});
