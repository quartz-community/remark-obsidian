import { compareCase } from "../compare.js";
import { recordBatch } from "./record.js";
import { generate } from "./generate.js";

/**
 * Every way of making a document smaller, largest reduction first.
 *
 * Deleting a block, deleting a line, halving a line. Halving matters: it finds
 * the offending span of a long line in logarithmically many rounds, where
 * deleting one character at a time would take hundreds.
 */
export function candidates(markdown: string): string[] {
  const out = new Set<string>();
  const blocks = markdown.split("\n\n");
  const lines = markdown.replace(/\n$/u, "").split("\n");

  if (blocks.length > 1) {
    for (let i = 0; i < blocks.length; i++) {
      out.add(blocks.filter((_, j) => j !== i).join("\n\n"));
    }
  }
  for (let i = 0; i < lines.length; i++) {
    out.add(lines.filter((_, j) => j !== i).join("\n"));
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.length < 8) continue;
    const half = Math.floor(line.length / 2);
    for (const shorter of [line.slice(0, half), line.slice(half)]) {
      out.add(lines.map((l, j) => (j === i ? shorter : l)).join("\n"));
    }
  }

  return [...out]
    .map((text) => (text.endsWith("\n") ? text : `${text}\n`))
    .filter((text) => text.trim() !== "" && text.length < markdown.length)
    .sort((a, b) => a.length - b.length);
}

/**
 * Shrink many failing documents at once.
 *
 * Each round pools the candidates of every document still shrinking into a
 * single recording, so the clock scales with the number of rounds rather than
 * the number of failures: shrinking fifty documents costs about what
 * shrinking one did.
 *
 * It stops when a round finds nothing smaller, and the round cap is generous
 * because stopping early leaves compound documents behind -- a four-round cap
 * was still shrinking sixteen of twenty documents when it ran out, and those
 * unreduced leftovers are exactly what fails to deduplicate.
 *
 * This is what makes a wide sweep readable. Raw failures do not group — a
 * generated document carries six to eight constructs, so its feature
 * signature is nearly unique, and ninety-four failures came out as ninety
 * distinct "classes". Reduced to minimal form they collapse onto each other,
 * and the report becomes a list of causes rather than a list of seeds.
 */
export function shrinkAll(
  documents: ReadonlyMap<string, string>,
  options: { rounds?: number; perDocument?: number } = {},
): Map<string, string> {
  const rounds = options.rounds ?? 12;
  const perDocument = options.perDocument ?? 12;
  const current = new Map(documents);

  for (let round = 1; round <= rounds; round++) {
    const batch: Array<{ id: string; markdown: string; owner: string }> = [];
    for (const [owner, markdown] of current) {
      const reductions = candidates(markdown).slice(0, perDocument);
      for (const [index, candidate] of reductions.entries()) {
        batch.push({
          id: `fuzz/${owner.replace(/\W+/gu, "-")}-r${round}c${index}`,
          markdown: candidate,
          owner,
        });
      }
    }
    if (batch.length === 0) break;

    const { cases, mathTex } = recordBatch(
      batch.map(({ id, markdown }) => ({ id, markdown })),
    );

    const taken = new Set<string>();
    for (const entry of batch) {
      if (taken.has(entry.owner)) continue;
      const golden = cases[entry.id];
      if (!golden || compareCase(golden, mathTex).matched) continue;
      current.set(entry.owner, entry.markdown);
      taken.add(entry.owner);
    }
    process.stderr.write(
      `  round ${round}: ${taken.size} of ${current.size} shrank\n`,
    );
    if (taken.size === 0) break;
  }

  return current;
}

/** Single-seed shrinking, for looking at one failure by hand. */
if (process.argv[1]?.endsWith("shrink.ts")) {
  const seed = process.argv[2];
  if (!seed) {
    console.error("usage: shrink <seed>");
    process.exit(2);
  }
  const start = generate(Number(seed));
  console.log(`seed ${seed}, ${start.length} chars`);
  const result = shrinkAll(new Map([[`seed-${seed}`, start]]));
  console.log("\nminimal failing document:");
  console.log(JSON.stringify([...result.values()][0]));
}
