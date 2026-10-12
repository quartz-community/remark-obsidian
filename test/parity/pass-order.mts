/**
 * Audit which of the ~47 transform passes actually depend on their position in the chain.
 *
 * `src/index.ts` carries 29 ordering claims in comments -- "Before the bracket passes",
 * "After the quote passes have settled the block", "Last, so every pass above only has to
 * keep its offsets honest". Each was written from a real failure, and **a stale claim reads
 * exactly like a live one**, so the set was never validated as a set. This validates it.
 *
 *     npx tsx --conditions=development test/parity/pass-order.mts [--adjacent]
 *
 * It rewrites `src/index.ts` in place, hashes every corpus case's tree under both profiles,
 * and restores the file in a `finally`. Default mode moves each pass to BOTH extremes of the
 * chain, which is the stronger test: a pass whose output is byte-identical running first and
 * running last has no positional constraint the corpus can see. `--adjacent` swaps each
 * neighbouring pair instead, which is cheaper and much weaker -- a claim spanning ten passes
 * is invisible to it.
 *
 * **"Position-independent" means "on this corpus".** A pass can be genuinely constrained and
 * still come back free because no recorded case exercises the interaction. That is the same
 * caveat the zero-regression lesson states: a clean measurement against a corpus with no case
 * for the rule has told you nothing. So a free result retires a CLAIM, not the constraint --
 * the right follow-up is a probe that would exercise it.
 *
 * It moves an `if (opts.x)` guard as ONE unit with its body, which is required rather than
 * convenient: moving a guarded pass out of its guard changes WHAT runs, not WHEN. The first
 * version recognised only bare calls, and so its "top" was the first bare call -- below
 * several option-gated blocks that run before it. Every pass it moved to "the top" went to
 * the middle, and it reported 18 of 47 where the complete set reports 20 of 62. An
 * incomplete block set does not fail loudly; it returns a smaller, confidently wrong answer.
 *
 * Needs no Obsidian. Reports and exits; gates nothing.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const index = path.join(root, "src/index.ts");
const hasher = path.join(root, "test/parity/pass-order-hash.mts");

interface Block {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

const count = (text: string, char: string): number =>
  text.split(char).length - 1;

/**
 * Each movable unit, with any comment lines immediately above it.
 *
 * Two shapes, and an option-gated pass needs its GUARD moved with it or the move changes
 * WHAT runs rather than WHEN: a bare `xTransform(...)` at the chain's own indent, and an
 * `if (opts.x)` whose body holds one or more. The 27 passes inside those guards are
 * invisible to a scan for calls alone, which is the limitation the first version carried.
 */
function blocksOf(lines: readonly string[]): Block[] {
  const found: Block[] = [];
  for (const [n, line] of lines.entries()) {
    const call = /^ {4}([A-Za-z][A-Za-z0-9]*)Transform\(/u.exec(line);
    const guard = /^ {4}if \(opts\.([A-Za-z][A-Za-z0-9]*)/u.exec(line);
    if (!call && !guard) continue;
    let start = n;
    while (start > 0 && /^ {4}\/\//u.test(lines[start - 1] ?? "")) start -= 1;
    let end = n;
    const braced = guard !== null && line.includes("{");
    const open = braced ? "{" : "(";
    const close = braced ? "}" : ")";
    let depth = count(line, open) - count(line, close);
    while (depth > 0 && end + 1 < lines.length) {
      end += 1;
      const next = lines[end] ?? "";
      depth += count(next, open) - count(next, close);
    }
    found.push({ name: guard ? `if(${guard[1]!})` : call![1]!, start, end });
  }
  return found;
}

function hash(): string {
  try {
    const out = execFileSync(
      "npx",
      ["tsx", "--conditions=development", hasher],
      { cwd: root, encoding: "utf8", timeout: 600_000 },
    );
    return (
      out.split("\n").find((l) => l.includes("threw=")) ?? "ERROR"
    ).trim();
  } catch {
    return "ERROR";
  }
}

const pristine = fs.readFileSync(index, "utf8");
const lines = pristine.split("\n");
const blocks = blocksOf(lines);
for (const [a, b] of blocks.map((x, i) => [x, blocks[i + 1]] as const)) {
  if (b && a.end >= b.start) throw new Error(`overlapping blocks at ${a.name}`);
}

const write = (next: readonly string[]) =>
  fs.writeFileSync(index, next.join("\n"));
const adjacent = process.argv.includes("--adjacent");
console.log(
  `pass-order: ${blocks.length} passes, ${adjacent ? "adjacent swaps" : "both extremes"}`,
);

const base = hash();
if (base.startsWith("ERROR")) throw new Error("baseline failed to hash");

const free: string[] = [];
const pinned: string[] = [];
try {
  if (adjacent) {
    for (const [i, a] of blocks.entries()) {
      const b = blocks[i + 1];
      if (!b) break;
      write([
        ...lines.slice(0, a.start),
        ...lines.slice(b.start, b.end + 1),
        ...lines.slice(a.end + 1, b.start),
        ...lines.slice(a.start, a.end + 1),
        ...lines.slice(b.end + 1),
      ]);
      const label = `${a.name} <-> ${b.name}`;
      (hash() === base ? free : pinned).push(label);
    }
  } else {
    const top = blocks[0]!.start;
    const bottom = blocks[blocks.length - 1]!.start;
    for (const block of blocks) {
      const body = lines.slice(block.start, block.end + 1);
      const rest = [
        ...lines.slice(0, block.start),
        ...lines.slice(block.end + 1),
      ];
      const at = block.start > bottom ? bottom : bottom - body.length;
      const results: string[] = [];
      for (const where of [top, at]) {
        write([...rest.slice(0, where), ...body, ...rest.slice(where)]);
        results.push(hash());
      }
      const [atTop, atBottom] = results as [string, string];
      if (atTop === base && atBottom === base) free.push(block.name);
      else {
        pinned.push(
          `${block.name}  top=${atTop === base ? "same" : "DIFF"} bottom=${atBottom === base ? "same" : "DIFF"}`,
        );
      }
    }
  }
} finally {
  fs.writeFileSync(index, pristine);
}

const total = free.length + pinned.length;
console.log(
  `  position-independent on this corpus: ${free.length} of ${total}`,
);
for (const name of free) console.log(`      ${name}`);
console.log(`  position-sensitive: ${pinned.length}`);
for (const name of pinned) console.log(`      ${name}`);

const hashNow = crypto.createHash("sha256").update(pristine).digest("hex");
const restored = crypto
  .createHash("sha256")
  .update(fs.readFileSync(index, "utf8"))
  .digest("hex");
console.log(`  src/index.ts restored: ${hashNow === restored}`);
