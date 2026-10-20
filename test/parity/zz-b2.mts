import { ask } from "./probe-channel.js";
import { refereeFactsWithTree } from "./referee-facts.js";
// B2: "<marker>item" / blank / "<N spaces>[^1]: def"  -- outside / inside / code
const MARKERS: [string, string][] = [
  ["- ", "- "], ["*  ", "* "], ["+ ", "+ "], ["- TAB", "- \t"], ["- 5sp", "-     "],
  ["-  ", "-  "], ["1) ", "1) "], ["1. ", "1. "],
  ["-   ", "-   "], ["1.  ", "1.  "], ["10. ", "10. "], ["-TAB", "-\t"],
  ["-TABTAB", "-\t\t"], ["10.TAB", "10.\t"],
  ["-    ", "    ".replace(/^/, "-")], ["100. ", "100. "],
];
const docs: string[] = [];
for (const [, m] of MARKERS) for (let n = 1; n <= 9; n++) docs.push(`${m}item\n\n${" ".repeat(n)}[^1]: def\n`);
const answers = await ask(docs);
let at = 0, bad = 0;
console.log("  marker      " + Array.from({ length: 9 }, (_, i) => String(i + 1).padStart(5)).join(""));
for (const [name] of MARKERS) {
  const row: string[] = [];
  for (let n = 1; n <= 9; n++) {
    const a = answers[at]!;
    const o = refereeFactsWithTree(docs[at]!).defs;
    const t = a.defs[0] ? String(a.defs[0][2]) : "-";
    const m = o[0] ? String(o[0][2]) : "-";
    row.push((t === m ? t : `X${t}/${m}`).padStart(5));
    if (t !== m) bad++;
    at++;
  }
  console.log(`  ${name.padEnd(11)}` + row.join(""));
}
console.log(`\n  ${bad} of ${docs.length} cells diverge   (value = definition column, "-" = none/code)`);
