/**
 * Sweep SEQUENCES of block constructs against a running Obsidian.
 *
 *     npx tsx --conditions=development test/parity/compose.mts [--triples]
 *
 * The corpus tests a construct in isolation, a construct inside a container, and what
 * follows an inline delimiter. It does not test one block construct FOLLOWED BY another, and
 * that is where this package's recent defects have lived without exception:
 *
 * - `- a` / `lazy` / `[^1]: def` parsed correctly while `list` / `code` / `definition` did
 *   not -- the same rule, broken by one intervening block, worth 43 referee documents.
 * - The comment fold needed three changes at once; any one or two measured as NO CHANGE.
 * - The math demotion looked like one defect with four symptoms and was three defects
 *   needing three separate fixes.
 * - The tab rule is correct in isolation and wrong in documents carrying six constructs.
 * - `pass-order.mts` reports 42 of 62 passes position-sensitive, which is the same fact
 *   stated about the pipeline rather than about the input.
 *
 * So the missing axis is composition, and it is cheap now: `ask.mts`'s cost is per CALL, not
 * per document -- thirty documents answer in 1.3 seconds -- so every ordered pair of a dozen
 * block constructs is one batch.
 *
 * Each case is `A` then `B` with NO blank line between them, which is the interesting case
 * because a blank line ends almost everything, followed by a blank line and `use[^1]` so the
 * footnote projections have something to report. Divergences are printed with both answers;
 * anything this finds is a lead to probe and then promote into `corpus.ts`, exactly like a
 * sweep finding.
 *
 * Obsidian must be running with a vault open. See `ask.mts` for the channel's four gotchas.
 */
import { execFileSync } from "node:child_process";

import { applyTextTransform, parseOurs } from "./chain.js";
import { computeOurs } from "./normalize.js";

/** One line of block syntax each, chosen so every pair is a legal document. */
const BLOCKS: ReadonlyArray<readonly [string, string]> = [
  ["bullet", "- item"],
  ["ordered", "1. item"],
  ["quote", "> quote"],
  ["callout", "> [!note] title"],
  ["heading", "# heading"],
  ["setext", "title\n==="],
  ["indented", "    code"],
  ["fence", "```"],
  ["comment", "%%"],
  ["thematic", "---"],
  ["table", "| a | b |\n| --- | --- |"],
  ["math", "$$"],
  ["footnote", "[^1]: def"],
  ["linkdef", "[ref]: /url"],
  ["html", "<div>"],
  ["paragraph", "text"],
];

const LOG_LINE = /^\d{4}-\d{2}-\d{2} /u;

function evaluate(code: string): string {
  return execFileSync("obsidian", ["eval", `code=${code}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 180_000,
  })
    .split("\n")
    .filter((line) => !LOG_LINE.test(line) && line.trim() !== "")
    .map((line) => line.replace(/^=> /u, ""))
    .join("\n")
    .trim();
}

function askBatch(documents: readonly string[]): unknown[] {
  const encoded = JSON.stringify(
    documents.map((text) => Buffer.from(text, "utf8").toString("base64")),
  );
  evaluate(
    `window.__cmp='pending';(async()=>{const qs=${encoded};const out=[];` +
      `for(const q of qs){const b=Uint8Array.from(atob(q),c=>c.charCodeAt(0)).buffer;` +
      `out.push(await app.metadataCache.computeMetadataAsync(b))}` +
      `window.__cmp=JSON.stringify(out)})()`,
  );
  let raw = "pending";
  for (let attempt = 0; attempt < 80 && raw === "pending"; attempt++) {
    raw = evaluate("window.__cmp");
  }
  if (raw === "pending") throw new Error("Obsidian did not finish");
  return JSON.parse(raw) as unknown[];
}

interface Facts {
  readonly defs: readonly string[];
  readonly sections: readonly string[];
  // Compared as well as `sections`, because a container can swallow a construct without
  // moving any root section: `normalize.ts` records that Obsidian RENDERS a heading inside a
  // container and does not INDEX it, so our projection drops one our tree keeps, and only a
  // second oracle can tell "both report none" from "neither was asked". These notes carry
  // five instances of a family read as clean because one projection was never compared.
  readonly headings: readonly string[];
}

function theirs(answer: unknown): Facts {
  const compute = (answer ?? {}) as {
    footnotes?: Array<{
      id: string;
      position: { start: { line: number; col: number }; end: { line: number } };
    }>;
    sections?: Array<{ type: string; position: { start: { line: number } } }>;
    headings?: Array<{
      heading: string;
      level: number;
      position: { start: { line: number; col: number } };
    }>;
  };
  return {
    defs: (compute.footnotes ?? []).map(
      (f) =>
        `${f.id}@${f.position.start.line}:${f.position.start.col}-${f.position.end.line}`,
    ),
    sections: (compute.sections ?? [])
      .map((s) => `${s.type}@${s.position.start.line}`)
      .filter((s) => !/^(?:text|element)@/u.test(s)),
    // `level:name@line:col`, which is what `normalize.ts` builds for the compute oracle.
    // Dropping the position reported 52 divergences that were purely the two sides being
    // formatted differently -- the goldmark `tasks` trap inverted, where a mismatched
    // projection reads as total disagreement rather than as agreement.
    headings: (compute.headings ?? []).map(
      (h) =>
        `${h.level}:${h.heading}@${h.position.start.line}:${h.position.start.col}`,
    ),
  };
}

function ours(text: string): Facts {
  const source = applyTextTransform(text);
  const computed = computeOurs(parseOurs(source, "all-features"), source) as {
    footnotes?: readonly string[];
    sections?: readonly string[];
    headings?: readonly string[];
  };
  return {
    defs: (computed.footnotes ?? []).map((entry) =>
      entry.replace(/-(\d+):\d+$/u, "-$1"),
    ),
    sections: (computed.sections ?? [])
      .map((entry) => {
        const [type, rest] = entry.split("@");
        return `${type}@${(rest ?? "").split(":")[0]}`;
      })
      .filter((entry) => !/^(?:text|element)@/u.test(entry)),
    headings: computed.headings ?? [],
  };
}

/**
 * The discriminating experiment, rather than the full cross-product.
 *
 * Every diverging pair is `container > absorbable`, and the containers contribute nothing of
 * their own: the absorbables are `comment`, `math`, indented code and `thematic`. Seven
 * constructs -- heading, setext, fence, table, footnote, html, paragraph -- appear in ZERO
 * diverging pairs across all 32 of their compositions, so they are safe to use as a SPACER.
 *
 * Putting a known-good construct between a container and an absorbable asks the one question
 * the pairs cannot: does the interaction need ADJACENCY, or does it reach across a block? An
 * adjacency rule stops diverging once something clean sits between; a container-state rule
 * keeps diverging. That is the same ambiguity that cost four attempts on the comment fold.
 *
 * 5 containers x 7 spacers x 4 absorbables is 140 sequences, against 4,096 for the full
 * triple cross-product, and it answers the question the full sweep would bury.
 */
const CONTAINERS = ["bullet", "ordered", "quote", "callout", "linkdef"];
const SPACERS = [
  "heading",
  "setext",
  "fence",
  "table",
  "footnote",
  "html",
  "paragraph",
];
const ABSORBABLES = ["comment", "math", "indented", "thematic"];

/**
 * `--matrix` reports the RULE in every container/follower cell, not just the divergences.
 *
 * The pair and isolate sweeps answer "where are we wrong", which is what a backlog needs and
 * not what a MAP needs. "A list absorbs an unclosed `$$` and a quote does not" is the useful
 * unit, and the only reason it is known is that one cell was chased by hand -- the sweeps
 * print a divergence either way and never state what Obsidian actually did.
 *
 * So this derives one bit per cell from `sections`, for BOTH sides: does the follower appear
 * as its own ROOT section, or has the container swallowed it? `sections` is root-level, so a
 * follower starting on the container's next line is absorbed exactly when no section starts
 * at that line. Printing the cells we AGREE on matters as much as the others -- an agreeing
 * cell is a rule this package already encodes, which is evidence rather than absence, and it
 * is what makes a guard list auditable against the application instead of against a backlog.
 */
/**
 * The inner prefix each container gives its own content.
 *
 * A quote marker takes one following space, and a list item's content column is its marker
 * plus one -- which is why the bullet and ordered prefixes differ by a column. `linkdef` has
 * no inside at all, and the matrix above measures it absorbing nothing, so it is not a
 * container here either.
 */
const INNER: ReadonlyArray<readonly [string, string]> = [
  ["bullet", "  "],
  ["ordered", "   "],
  ["quote", "> "],
  ["callout", "> "],
];

/**
 * `--inside` maps the OTHER axis: what each block does INSIDE each container.
 *
 * `--matrix` maps adjacency -- a container, then a block at column 0 -- and that axis is now
 * four cells from clean. This is its complement, and the corpus samples it without ever
 * tabulating it: `CONTEXTS` in `corpus.ts` splices constructs into containers, but by
 * construct rather than as a complete table, so a cell nobody thought to sample is
 * indistinguishable from one that works.
 *
 * There is no absorption bit to derive here, because a block inside a quote is not a root
 * section at all -- so the comparison is the full `sections` and `defs` equality the pair
 * sweep uses, and the map is the set of cells that disagree.
 */
const inside = process.argv.includes("--inside");
const matrix = process.argv.includes("--matrix");
const isolate = process.argv.includes("--isolate");
const triples = process.argv.includes("--triples");
const cases: Array<{ name: string; text: string; followerLine?: number }> = [];
const syntaxOf = new Map(BLOCKS);
if (inside) {
  for (const [container, prefix] of INNER) {
    const head = syntaxOf.get(container)!;
    for (const [innerName, innerSyntax] of BLOCKS) {
      const body = innerSyntax
        .split("\n")
        .map((line) => `${prefix}${line}`)
        .join("\n");
      cases.push({
        name: `${container} [ ${innerName} ]`,
        text: `${head}\n${body}\n\nuse[^1]\n`,
      });
    }
  }
}
if (matrix) {
  for (const container of CONTAINERS) {
    const head = syntaxOf.get(container)!;
    for (const [followerName, follower] of BLOCKS) {
      cases.push({
        name: `${container} > ${followerName}`,
        text: `${head}\n${follower}\n\nuse[^1]\n`,
        followerLine: head.split("\n").length,
      });
    }
  }
}
if (isolate) {
  for (const container of CONTAINERS) {
    for (const spacer of SPACERS) {
      for (const absorbable of ABSORBABLES) {
        cases.push({
          name: `${container} > ${spacer} > ${absorbable}`,
          text:
            `${syntaxOf.get(container)!}\n${syntaxOf.get(spacer)!}\n` +
            `${syntaxOf.get(absorbable)!}\n\nuse[^1]\n`,
        });
      }
    }
  }
}
for (const [firstName, first] of isolate || matrix || inside ? [] : BLOCKS) {
  for (const [secondName, second] of BLOCKS) {
    if (triples) {
      for (const [thirdName, third] of BLOCKS) {
        cases.push({
          name: `${firstName} > ${secondName} > ${thirdName}`,
          text: `${first}\n${second}\n${third}\n\nuse[^1]\n`,
        });
      }
    } else {
      cases.push({
        name: `${firstName} > ${secondName}`,
        text: `${first}\n${second}\n\nuse[^1]\n`,
      });
    }
  }
}

console.log(`compose: ${cases.length} sequences\n`);
const diverged: string[] = [];
const rules = new Map<string, { obs: boolean; us: boolean }>();

/**
 * Whether the container swallowed a follower starting on `line`.
 *
 * `sections` is root-level, so the follower is absorbed exactly when no root section starts
 * on its line. The string is `${type}@${startLine}`, built in this file with one `@` and a
 * numeric tail -- so unlike the LINK projection, which these notes record as not
 * round-trippable because `a|b|c` cannot be split back into target and display, this one has
 * an unambiguous delimiter and may be read.
 */
const absorbed = (facts: Facts, line: number): boolean =>
  !facts.sections.some(
    (section) => Number(section.slice(section.lastIndexOf("@") + 1)) === line,
  );
const BATCH = 60;
for (let at = 0; at < cases.length; at += BATCH) {
  const slice = cases.slice(at, at + BATCH);
  const answers = askBatch(slice.map((entry) => entry.text));
  for (const [index, entry] of slice.entries()) {
    const want = theirs(answers[index]);
    let got: Facts;
    try {
      got = ours(entry.text);
    } catch (error) {
      diverged.push(`${entry.name}  THREW ${String(error).slice(0, 60)}`);
      continue;
    }
    if (entry.followerLine !== undefined) {
      rules.set(entry.name, {
        obs: absorbed(want, entry.followerLine),
        us: absorbed(got, entry.followerLine),
      });
    }
    const same =
      JSON.stringify(want.defs) === JSON.stringify(got.defs) &&
      JSON.stringify(want.sections) === JSON.stringify(got.sections) &&
      JSON.stringify(want.headings) === JSON.stringify(got.headings);
    if (same) continue;
    diverged.push(
      `${entry.name}\n      md   ${JSON.stringify(entry.text)}\n` +
        `      obs  defs=${JSON.stringify(want.defs)} sections=${JSON.stringify(want.sections)} h=${JSON.stringify(want.headings)}\n` +
        `      ours defs=${JSON.stringify(got.defs)} sections=${JSON.stringify(got.sections)} h=${JSON.stringify(got.headings)}`,
    );
  }
}

if (matrix) {
  const width = Math.max(...BLOCKS.map(([name]) => name.length));
  const head = CONTAINERS.map((c) => c.slice(0, 7).padStart(8)).join("");
  console.log(
    `  absorbed by the container?  A = absorbed, R = own root section`,
  );
  console.log(`  a cell is "obs/ours", and a disagreeing cell is marked *\n`);
  console.log(`  ${"follower".padEnd(width)}${head}`);
  for (const [followerName] of BLOCKS) {
    const cells = CONTAINERS.map((container) => {
      const rule = rules.get(`${container} > ${followerName}`);
      if (!rule) return "     -  ";
      const pair = `${rule.obs ? "A" : "R"}/${rule.us ? "A" : "R"}`;
      return `${rule.obs === rule.us ? " " : "*"}${pair}`.padStart(8);
    }).join("");
    console.log(`  ${followerName.padEnd(width)}${cells}`);
  }
  console.log("");
}

console.log(`  ${diverged.length} of ${cases.length} diverge\n`);
for (const entry of diverged.slice(0, 200)) console.log(`  ${entry}`);
if (diverged.length > 200) {
  console.log(`  ... and ${diverged.length - 200} more`);
}
