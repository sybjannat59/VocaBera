/** Lightweight English morphology: common Latin/Greek affixes and roots with glosses. */

const PREFIXES: [string, string][] = [
  ["counter", "against"], ["contra", "against"], ["circum", "around"], ["extra", "beyond"], ["hyper", "over"], ["inter", "between"],
  ["intra", "within"], ["intro", "inward"], ["macro", "large"], ["micro", "small"], ["multi", "many"], ["over", "too much"],
  ["retro", "backward"], ["super", "above"], ["trans", "across"], ["ultra", "beyond"], ["under", "below"], ["mal", "bad"],
  ["male", "bad"], ["bene", "well"], ["anti", "against"], ["auto", "self"], ["hypo", "under"], ["mono", "one"], ["poly", "many"],
  ["post", "after"], ["semi", "half"], ["tele", "far"], ["omni", "all"], ["pseudo", "false"], ["caco", "bad"], ["eu", "good"],
  ["mis", "wrongly"], ["non", "not"], ["pre", "before"], ["pro", "forward"], ["sub", "under"], ["sym", "together"], ["syn", "together"],
  ["com", "together"], ["con", "together"], ["col", "together"], ["cor", "together"], ["dis", "apart / not"], ["dys", "bad"],
  ["epi", "upon"], ["ambi", "both"], ["amphi", "both"], ["ante", "before"], ["peri", "around"], ["para", "beside"], ["per", "through"],
  ["ab", "away"], ["ad", "to"], ["de", "down / away"], ["ex", "out"], ["e", "out"], ["il", "not"], ["im", "not / into"],
  ["in", "not / into"], ["ir", "not"], ["ob", "against"], ["re", "again / back"], ["se", "apart"], ["un", "not"], ["a", "not / to"],
];

const SUFFIXES: [string, string][] = [
  ["ification", "making"], ["ization", "process of"], ["ously", "in a … manner"], ["iveness", "quality of"], ["ousness", "quality of"],
  ["acious", "inclined to"], ["itious", "having the quality of"], ["ical", "relating to"], ["ology", "study of"], ["ment", "result / act"],
  ["ness", "state of"], ["able", "able to be"], ["ible", "able to be"], ["tion", "act / state"], ["sion", "act / state"],
  ["ious", "full of"], ["eous", "full of"], ["ous", "full of"], ["ful", "full of"], ["less", "without"], ["ship", "state of"],
  ["hood", "state of"], ["ance", "state of"], ["ence", "state of"], ["ancy", "state of"], ["ency", "state of"], ["ant", "one who / -ing"],
  ["ent", "having the quality of"], ["ist", "one who"], ["ism", "belief / practice"], ["ity", "state of"], ["ive", "tending to"],
  ["ize", "to make"], ["ise", "to make"], ["ify", "to make"], ["ate", "to make / having"], ["ary", "relating to"], ["ory", "relating to"],
  ["ic", "relating to"], ["al", "relating to"], ["ial", "relating to"], ["ian", "relating to"], ["ly", "in a … way"], ["er", "one who"],
  ["or", "one who"], ["ure", "act / result"], ["ile", "capable of"], ["id", "having the quality of"], ["ude", "state of"], ["y", "full of"],
];

const ROOTS: [string, string][] = [
  ["bene", "good"], ["vol", "wish"], ["dict", "say"], ["duc", "lead"], ["duct", "lead"], ["spec", "look"], ["spect", "look"],
  ["scrib", "write"], ["script", "write"], ["port", "carry"], ["mit", "send"], ["miss", "send"], ["ject", "throw"], ["tract", "pull"],
  ["vert", "turn"], ["vers", "turn"], ["cred", "believe"], ["fid", "faith"], ["loqu", "speak"], ["locu", "speak"], ["luc", "light"],
  ["lum", "light"], ["path", "feeling"], ["phil", "love"], ["phob", "fear"], ["graph", "write"], ["gram", "written"], ["log", "word / study"],
  ["chron", "time"], ["tempor", "time"], ["viv", "live"], ["vit", "life"], ["bio", "life"], ["mort", "death"], ["voc", "voice / call"],
  ["vok", "call"], ["pel", "drive"], ["puls", "drive"], ["cede", "go"], ["ceed", "go"], ["cess", "go"], ["greg", "flock"],
  ["ten", "hold"], ["tain", "hold"], ["fer", "carry"], ["pac", "peace"], ["amor", "love"], ["am", "love"], ["anim", "mind / life"],
  ["ann", "year"], ["enn", "year"], ["aud", "hear"], ["cap", "take"], ["capt", "take"], ["cept", "take"], ["cid", "kill / cut"],
  ["cis", "cut"], ["clud", "close"], ["clus", "close"], ["corp", "body"], ["crat", "rule"], ["crac", "rule"], ["dem", "people"],
  ["dog", "belief"], ["dox", "belief"], ["equ", "equal"], ["fac", "make"], ["fect", "make"], ["fic", "make"], ["flect", "bend"],
  ["flex", "bend"], ["fort", "strong"], ["fract", "break"], ["frag", "break"], ["gen", "birth / kind"], ["jud", "judge"],
  ["jur", "law / swear"], ["lect", "choose"], ["leg", "law / choose"], ["liber", "free"], ["man", "hand"], ["mand", "order"],
  ["mis", "send"], ["mob", "move"], ["mot", "move"], ["mov", "move"], ["nov", "new"], ["pend", "hang / weigh"], ["pens", "hang / weigh"],
  ["plic", "fold"], ["ply", "fold"], ["pon", "place"], ["pos", "place"], ["rupt", "break"], ["sci", "know"], ["sent", "feel"],
  ["sens", "feel"], ["sequ", "follow"], ["secu", "follow"], ["solv", "loosen"], ["solu", "loosen"], ["son", "sound"], ["struct", "build"],
  ["tang", "touch"], ["tact", "touch"], ["term", "end"], ["therm", "heat"], ["tort", "twist"], ["vac", "empty"], ["ven", "come"],
  ["vent", "come"], ["ver", "true"], ["vid", "see"], ["vis", "see"], ["vinc", "conquer"], ["vict", "conquer"], ["hemer", "day"],
  ["nostos", "return home"], ["alg", "pain"], ["mitis", "mild"], ["sol", "alone / sun"], ["pug", "fight"], ["cur", "care"],
  ["mut", "change"], ["nomin", "name"], ["nym", "name"], ["onym", "name"], ["phon", "sound"], ["morph", "shape"], ["opt", "choose / eye"],
];

export interface Morphology {
  prefix: string;
  root: string;
  suffix: string;
}

const fmt = (part: string, gloss: string, kind: "prefix" | "suffix" | "root") =>
  `${kind === "suffix" ? "-" : ""}${part}${kind === "prefix" ? "-" : ""} (${gloss})`;

/** Guess prefix/root/suffix. Conservative: only returns parts that leave a plausible stem. */
export function analyzeMorphology(input: string): Morphology {
  const w = input.toLowerCase().trim();
  const out: Morphology = { prefix: "", root: "", suffix: "" };
  if (!/^[a-z]+$/.test(w) || w.length < 6) return out;
  let start = 0;
  let end = w.length;

  for (const [p, g] of PREFIXES) {
    if (w.startsWith(p) && w.length - p.length >= 4 && (p.length >= 2 || /^[a][a-z]/.test(w))) {
      if (p.length === 1 && !/^(a[bcdgmnpst]|e[lmnrvx])/.test(w)) continue;
      out.prefix = fmt(p, g, "prefix");
      start = p.length;
      break;
    }
  }
  for (const [s, g] of SUFFIXES) {
    if (w.endsWith(s) && w.length - s.length - start >= 3) {
      out.suffix = fmt(s, g, "suffix");
      end = w.length - s.length;
      break;
    }
  }
  const stem = w.slice(start, end);
  let best: [string, string] | null = null;
  for (const r of ROOTS) {
    if (stem.includes(r[0]) && r[0].length >= 3 && (!best || r[0].length > best[0].length)) best = r;
  }
  if (best) out.root = fmt(best[0], best[1], "root");
  if (!out.root && !out.prefix && !out.suffix) return out;
  // Avoid nonsense: require at least two recognised parts, or a root.
  const parts = [out.prefix, out.root, out.suffix].filter(Boolean).length;
  if (parts < 2 && !out.root) return { prefix: "", root: "", suffix: "" };
  return out;
}

const core = (v: string) => v.split("(")[0].toLowerCase().replace(/[^a-z]/g, "");

/** Checks that an AI-suggested affix actually appears where it should in the word. */
export function validateAffix(word: string, part: string, kind: "prefix" | "root" | "suffix") {
  const w = word.toLowerCase();
  const c = core(part);
  if (!part.trim()) return "";
  if (!c || c.length > w.length) return "";
  if (kind === "prefix") return w.startsWith(c) || (c.length >= 3 && w.startsWith(c.slice(0, -1))) ? part.trim() : "";
  if (kind === "suffix") return w.endsWith(c) || (c.length >= 3 && w.endsWith(c.slice(1))) ? part.trim() : "";
  // Roots are often Latin/Greek citation forms (e.g. "volo"), so allow a 3-letter overlap.
  const probe = c.slice(0, Math.min(4, c.length));
  return w.includes(probe) || (probe.length >= 3 && w.includes(probe.slice(0, 3))) ? part.trim() : "";
}
