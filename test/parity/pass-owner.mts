/**
 * Which pass OWNS each corpus case, derived by removing passes one at a time.
 *
 * WHY THIS EXISTS. Every classification in this harness so far has grouped divergences by
 * SYMPTOM (which field differs) or by INPUT SHAPE (what the line looks like). Both are
 * selectors over things that are not the thing being changed, and this file's own notes record
 * four of them dying -- probes per open case, co-occurrence, construct frequency, line-local
 * prefix -- plus an audit that found two recorded breakdowns describing their selector rather
 * than their population.
 *
 * The axis that is never classified is the ACTIONABLE one: which component decides the answer.
 * Not knowing it is what made the tab-threshold family cost three implementations -- a repair
 * built on a character count, a container-tokenizer change, and a repair built on the right
 * threshold -- each measured only after being written. Ownership is derivable instead of
 * guessable: remove a pass, see which cases move.
 *
 *     npx tsx --conditions=development test/parity/pass-owner.mts [--limit N]
 *
 * It rewrites `src/index.ts` in place and restores it in a `finally`, verifying the restore by
 * hash, exactly as `pass-order.mts` does -- and it reuses that file's `blocksOf`, so an
 * `if (opts.x)` guard is removed as ONE unit with its body. Removing a guarded pass without
 * its guard would change WHAT runs rather than whether it runs, which is the limitation that
 * made the first version of the sibling audit report 18 of 47 where the full set reports
 * 20 of 62.
 *
 * WHAT IT ANSWERS, and the third is the one worth the runtime:
 *
 *   - per PASS: how many cases it changes. A pass that changes NOTHING is dead on this
 *     corpus -- either genuinely unused, or exercised by no recorded case, which is the same
 *     caveat `pass-order.mts` states for a "free" result.
 *   - per CASE: which passes change it, so a divergence arrives with its component already
 *     named instead of being discovered after a wrong-shaped fix.
 *   - CASES OWNED BY NOTHING. A case no pass touches is produced by stock micromark plus the
 *     vendored constructs alone. If such a case DIVERGES, no repair pass can fix it by
 *     construction and the work is in the tokenizer -- which is the question three
 *     implementations of one rule were spent discovering.
 *
 * Needs no Obsidian. Reports and exits; gates nothing.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const index = path.join(root, "src/index.ts");
/**
 * `--referee` attributes the BACKLOG instead of the corpus, which is the mode worth running.
 *
 * The corpus is 99.7% matching, so its "unowned and diverging" set is two documents. The
 * referee holds 1,073 disagreements, and a divergence that arrives with its component already
 * named is the whole point of attributing anything.
 */
const refereeMode = process.argv.includes("--referee");
const hasher = path.join(
  root,
  refereeMode
    ? "test/parity/pass-owner-referee-hash.mts"
    : "test/parity/pass-owner-hash.mts",
);
const goldens = path.join(root, "test/parity/goldens/obsidian.json");

interface Block {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

const count = (text: string, char: string): number =>
  text.split(char).length - 1;

/**
 * Each removable unit, with any comment lines immediately above it.
 *
 * Copied from `pass-order.mts` rather than imported, because that file executes its audit at
 * module scope and importing it would run the whole thing. The duplication is a liability and
 * is why both carry the same `if (opts.x)` note: if one learns a new block shape, so must the
 * other.
 */
function blocksOf(lines: readonly string[]): Block[] {
  const found: Block[] = [];
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at]!;
    const call = /^ {4}([a-z][A-Za-z0-9]*Transform)\(/u.exec(line);
    const guard = /^ {4}if \(opts\.([A-Za-z][A-Za-z0-9]*)/u.exec(line);
    if (!call && !guard) continue;

    let end = at;
    const braced = guard !== null && line.includes("{");
    if (braced) {
      let depth = count(line, "{") - count(line, "}");
      while (depth > 0 && end + 1 < lines.length) {
        end += 1;
        depth += count(lines[end]!, "{") - count(lines[end]!, "}");
      }
    } else {
      let depth = count(line, "(") - count(line, ")");
      while (depth > 0 && end + 1 < lines.length) {
        end += 1;
        depth += count(lines[end]!, "(") - count(lines[end]!, ")");
      }
    }

    let start = at;
    while (start > 0 && /^ {4}(?:\/\/|\/\*|\*)/u.test(lines[start - 1]!)) {
      start -= 1;
    }
    found.push({
      name: guard ? `if(${guard[1]!})` : call![1]!,
      start,
      end,
    });
    at = end;
  }
  return found;
}

type Shapes = Record<string, string>;
/** Agreement per document, referee mode only, so a removal's effect can be SIGNED. */
let agreesBase: Record<string, boolean> = {};

function shapes(label: string, keepAgrees = false): Shapes {
  const out = path.join(os.tmpdir(), `pass-owner-${label}.json`);
  try {
    execFileSync("npx", ["tsx", "--conditions=development", hasher, out], {
      cwd: root,
      encoding: "utf8",
      timeout: 900_000,
    });
    // The referee hasher emits `{shapes, agrees}` and the corpus one a bare map. Narrowed on
    // the VALUE's type rather than on key presence, because a bare `Shapes` could legally
    // hold a "shapes" key and `in` cannot tell those apart.
    const read: unknown = JSON.parse(fs.readFileSync(out, "utf8"));
    const wrapped = read as { shapes?: unknown; agrees?: unknown };
    if (typeof wrapped.shapes === "object" && wrapped.shapes !== null) {
      if (keepAgrees && typeof wrapped.agrees === "object") {
        agreesBase = wrapped.agrees as Record<string, boolean>;
      }
      return wrapped.shapes as Shapes;
    }
    return read as Shapes;
  } catch {
    return {};
  } finally {
    fs.rmSync(out, { force: true });
  }
}

const pristine = fs.readFileSync(index, "utf8");
const lines = pristine.split("\n");
const blocks = blocksOf(lines);
for (const [a, b] of blocks.map((x, i) => [x, blocks[i + 1]] as const)) {
  if (b && a.end >= b.start) throw new Error(`overlapping blocks at ${a.name}`);
}

const limitAt = process.argv.indexOf("--limit");
const limit =
  limitAt === -1 ? blocks.length : Number(process.argv[limitAt + 1] ?? "0");

console.log(`pass-owner: ${blocks.length} passes, removing ${limit}`);

const base = shapes("base", true);
if (Object.keys(base).length === 0) throw new Error("baseline failed to hash");
console.log(`  baseline: ${Object.keys(base).length} case/profile shapes\n`);

/** Case keys each pass changes when removed. */
const owned = new Map<string, string[]>();
try {
  for (const block of blocks.slice(0, limit)) {
    fs.writeFileSync(
      index,
      [...lines.slice(0, block.start), ...lines.slice(block.end + 1)].join(
        "\n",
      ),
    );
    const without = shapes("without");
    if (Object.keys(without).length === 0) {
      owned.set(block.name, ["<REMOVAL DOES NOT COMPILE>"]);
      console.log(`  ${block.name.padEnd(42)}  does not compile without it`);
      continue;
    }
    const moved = Object.keys(base).filter((key) => base[key] !== without[key]);
    owned.set(block.name, moved);
    console.log(
      `  ${block.name.padEnd(42)}  ${String(moved.length).padStart(5)} case/profiles`,
    );
  }
} finally {
  fs.writeFileSync(index, pristine);
}

const restored =
  crypto.createHash("sha256").update(pristine).digest("hex") ===
  crypto
    .createHash("sha256")
    .update(fs.readFileSync(index, "utf8"))
    .digest("hex");
console.log(`\n  src/index.ts restored: ${restored}`);

const dead = [...owned].filter(([, keys]) => keys.length === 0);
console.log(`\n  PASSES OWNING NOTHING on this corpus: ${dead.length}`);
for (const [name] of dead) console.log(`      ${name}`);

const byCase = new Map<string, string[]>();
for (const [name, keys] of owned) {
  for (const key of keys) {
    byCase.set(key, [...(byCase.get(key) ?? []), name]);
  }
}
// THE TWO MODES KEY THEIR CASES DIFFERENTLY, and conflating them is silently wrong rather
// than loud: the corpus hasher emits `id\0profile` and the referee hasher a bare document id,
// so reading the golden's ids in referee mode reported every one of 3,439 as untouched while
// the shapes held 6,818 referee keys. Divergence comes from the golden's triage for the corpus
// and from the referee's own agreement for the referee.
const ids = refereeMode
  ? Object.keys(base)
  : Object.keys(
      (
        JSON.parse(fs.readFileSync(goldens, "utf8")) as {
          cases: Record<string, { triage: string }>;
        }
      ).cases,
    );
const triage = refereeMode
  ? undefined
  : (
      JSON.parse(fs.readFileSync(goldens, "utf8")) as {
        cases: Record<string, { triage: string }>;
      }
    ).cases;
const unowned = ids.filter((id) =>
  refereeMode
    ? !byCase.has(id)
    : !byCase.has(`${id}\u0000quartz-default`) &&
      !byCase.has(`${id}\u0000all-features`),
);
console.log(
  `\n  CASES NO PASS TOUCHES: ${unowned.length} of ${ids.length}  (stock micromark plus the vendored constructs)`,
);
const unownedDiverging = unowned.filter((id) =>
  refereeMode ? agreesBase[id] === false : triage![id]!.triage !== "match",
);
console.log(
  `    of those, NOT triaged \`match\`: ${unownedDiverging.length}  <- no repair pass can fix these`,
);
for (const id of unownedDiverging.slice(0, 20)) console.log(`      ${id}`);

fs.writeFileSync(
  path.join(os.tmpdir(), "pass-owner.json"),
  JSON.stringify(
    {
      perPass: Object.fromEntries([...owned].map(([k, v]) => [k, v.length])),
      perCase: Object.fromEntries(
        [...byCase].map(([k, v]) => [k, [...new Set(v)]]),
      ),
      unowned,
    },
    null,
    2,
  ),
);
console.log(`\n  full map: ${path.join(os.tmpdir(), "pass-owner.json")}`);
