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

/**
 * Each pass INSIDE a multi-pass guard, as its own removable unit.
 *
 * The guard-as-one-unit rule is right for MOVING a pass and wrong for attributing one. Seven
 * guards hold 29 passes between them and `if(opts.bareFootnoteRefs)` holds THIRTEEN, so the
 * audit's dominant owner was a bag: 923 of 979 diverging referee documents "belonged to"
 * that guard and 387 of them to nothing else, which names the option rather than the pass.
 *
 * Removing an inner call while LEAVING the guard is safe in a way that removing a guarded pass
 * alone is not -- the guard still decides whether the block runs, and only one call goes. So
 * these are a second phase rather than a replacement, and they deliberately overlap the guard
 * blocks of the first.
 */
function innerOf(lines: readonly string[]): {
  readonly units: Block[];
  /** START lines of the guards that were split, so the right blocks are replaced. */
  readonly guards: Set<number>;
} {
  const found: Block[] = [];
  const guards = new Set<number>();
  let at = 0;
  while (at < lines.length) {
    const guard = /^ {4}if \(opts\.([A-Za-z][A-Za-z0-9]*)/u.exec(
      lines[at] ?? "",
    );
    if (!guard || !(lines[at] ?? "").includes("{")) {
      at += 1;
      continue;
    }
    let depth = count(lines[at]!, "{") - count(lines[at]!, "}");
    const inner: Block[] = [];
    let end = at;
    while (depth > 0 && end + 1 < lines.length) {
      end += 1;
      depth += count(lines[end]!, "{") - count(lines[end]!, "}");
      // `{6,}` rather than exactly six: `inlineFootnoteInertTransform` sits at EIGHT inside a
      // nested `if` within `if(opts.bareFootnoteRefs)`, so a fixed indent found 28 of 29 and
      // reported it confidently. Removing a doubly-nested call is still safe -- both guards
      // remain, and only the one call goes.
      const call = /^ {6,}([a-z][A-Za-z0-9]*Transform)\(/u.exec(
        lines[end] ?? "",
      );
      if (!call) continue;
      let tail = end;
      let open = count(lines[end]!, "(") - count(lines[end]!, ")");
      while (open > 0 && tail + 1 < lines.length) {
        tail += 1;
        open += count(lines[tail]!, "(") - count(lines[tail]!, ")");
      }
      let start = end;
      while (
        start > at + 1 &&
        /^ {6,}(?:\/\/|\/\*|\*)/u.test(lines[start - 1]!)
      ) {
        start -= 1;
      }
      inner.push({ name: `${call[1]!} [in ${guard[1]!}]`, start, end: tail });
      end = tail;
    }
    if (inner.length > 1) {
      found.push(...inner);
      guards.add(at);
    }
    at = end + 1;
  }
  return { units: found, guards };
}

/**
 * The CONSTRUCT layer, which `blocksOf` could not see at all.
 *
 * Syntax extensions are registered in a different function and at a different indent --
 * `  if (opts.x) {` with `    data.micromarkExtensions.push(...)` inside -- so a scan anchored
 * on `^ {4}if \(opts\.` skipped every one of them. That omission is exactly the shape of the
 * 94 diverging documents reported as "owned by no pass": they are owned by a CONSTRUCT, and
 * constructs were never in the unit set.
 *
 * The whole guard is the unit, not the single `push`. A guard registers a triple -- the
 * micromark syntax, the mdast extension and the serializer handler -- and removing one while
 * keeping the others leaves an extension listening for tokens that can no longer appear.
 * Removing the guard is "this construct is off", which is a state the option matrix already
 * tests and therefore a state the package is known to survive.
 */
function constructsOf(lines: readonly string[]): Block[] {
  const found: Block[] = [];
  for (let at = 0; at < lines.length; at++) {
    const guard = /^ {2}if \(opts\.([A-Za-z][A-Za-z0-9]*)\) \{/u.exec(
      lines[at] ?? "",
    );
    if (!guard) continue;
    let depth = count(lines[at]!, "{") - count(lines[at]!, "}");
    let end = at;
    let syntax = false;
    while (depth > 0 && end + 1 < lines.length) {
      end += 1;
      depth += count(lines[end]!, "{") - count(lines[end]!, "}");
      if ((lines[end] ?? "").includes("micromarkExtensions.push"))
        syntax = true;
    }
    if (syntax) {
      let start = at;
      while (start > 0 && /^ {2}(?:\/\/|\/\*|\*)/u.test(lines[start - 1]!)) {
        start -= 1;
      }
      found.push({ name: `construct:${guard[1]!}`, start, end });
    }
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

/**
 * `--sets <file>` removes whole OWNER SETS together, prioritised by documents covered.
 *
 * A coupled document -- one several units change -- cannot be attributed by single removals:
 * "removing X moves it" may mean X decides it or that X's removal changes what a later unit
 * sees. Resolving that needs the units removed TOGETHER, and the obvious framing of a
 * 94-squared pairwise sweep is the wrong bound by two orders of magnitude:
 *
 *     naive 94 squared                  8464 runs
 *     pairs that CO-OWN a document       423
 *     ...and co-own a DIVERGING one      325   <- the only ones that matter
 *     DISTINCT owner sets                314   <- one experiment each
 *
 * Only 50 of 92 units appear in any diverging pair and 29 own nothing at all, so most of the
 * square is pairs that never meet. Ordering sets by documents covered then makes the tail
 * optional -- the top set is 78 documents, the top ten are 264 of 769, the top forty are 55%.
 *
 * A set of size TWO is fully resolved by one combined removal: 37 sets covering 261 documents.
 * A larger set is only NARROWED, because the full subset lattice is exponential -- that is a
 * limit of the method, not of this flag.
 */
/**
 * `--against <map.json>` turns a set's combined removal into a VERDICT.
 *
 * On its own, "removing this set moved 6,507 answers" is unreadable: `bareFootnoteRefTransform`
 * alone moves about five thousand, so every set containing it moves at least that. The signal
 * is the comparison against what the members move INDIVIDUALLY, which a prior single-unit map
 * already encodes -- unit U moved key K exactly when U appears in `perCase[K]`.
 *
 *     combined == union   INDEPENDENT -- each member's effect is additive, and the single-unit
 *                         attribution for those documents can be trusted as ownership
 *     combined  > union   SYNERGISTIC -- removing both changes answers neither changed alone,
 *                         so something downstream was absorbing one of them
 *     combined  < union   MASKING -- removing both changes FEWER answers, so one member was
 *                         compensating for the other and neither owns those documents alone
 *
 * Only the first verdict licenses treating a single-unit owner as the owner. That is the
 * question the whole pairwise exercise exists to answer, and it is why the raw counts were
 * never the deliverable.
 */
const againstAt = process.argv.indexOf("--against");
const against: Record<string, string[]> =
  againstAt === -1
    ? {}
    : (
        JSON.parse(
          fs.readFileSync(process.argv[againstAt + 1] ?? "", "utf8"),
        ) as { perCase: Record<string, string[]> }
      ).perCase;

const setsAt = process.argv.indexOf("--sets");
const setList: { owners: string[]; documents: number; docs?: string[] }[] =
  setsAt === -1
    ? []
    : (JSON.parse(fs.readFileSync(process.argv[setsAt + 1] ?? "", "utf8")) as {
        owners: string[];
        documents: number;
        docs?: string[];
      }[]);

const pristine = fs.readFileSync(index, "utf8");
const lines = pristine.split("\n");
const blocks = blocksOf(lines);
for (const [a, b] of blocks.map((x, i) => [x, blocks[i + 1]] as const)) {
  if (b && a.end >= b.start) throw new Error(`overlapping blocks at ${a.name}`);
}

const inner = innerOf(lines);
const constructs = constructsOf(lines);
/**
 * `--deep` REPLACES a multi-pass guard with its inner calls rather than adding to them.
 *
 * Keeping both double-counts every case: the guard's removal and the inner call's removal both
 * change it, so a cleanly-owned case reports two owners. The first `--deep` run made "2 owners"
 * the mode at 4,184 of 13,636 purely from that, which inverts the one number the owner-set
 * histogram exists to give.
 */
const deep = process.argv.includes("--deep");
const withConstructs = process.argv.includes("--constructs");
const units = deep
  ? [
      // BY POSITION, not by name. `opts.comments` guards TWO separate blocks in the chain, so
      // filtering on the name dropped a single-pass block's attribution along with the
      // multi-pass one -- 92 units where 94 was right, which is a silent loss of coverage
      // rather than a loud error.
      // CONTAINMENT, not equality: `blocksOf` walks a block's `start` back over the comment
      // lines above it, so it never equals the `if` line `innerOf` records. Comparing them
      // directly filtered five of the seven split guards and left two counted twice.
      ...blocks.filter(
        (block) =>
          ![...inner.guards].some(
            (line) => line >= block.start && line <= block.end,
          ),
      ),
      ...inner.units,
      ...(withConstructs ? constructs : []),
    ]
  : withConstructs
    ? [...blocks, ...constructs]
    : blocks;

const limitAt = process.argv.indexOf("--limit");
const limit =
  limitAt === -1
    ? setList.length > 0
      ? setList.length
      : units.length
    : Number(process.argv[limitAt + 1] ?? "0");

console.log(
  `pass-owner: ${setList.length > 0 ? `${setList.length} owner sets` : `${units.length} units`} (${blocks.length} top-level, ${inner.units.length} inside guards, ${withConstructs ? constructs.length : 0} constructs), removing ${limit}`,
);

const base = shapes("base", true);
if (Object.keys(base).length === 0) throw new Error("baseline failed to hash");
console.log(`  baseline: ${Object.keys(base).length} case/profile shapes\n`);

/** Case keys each pass changes when removed. */
const owned = new Map<string, string[]>();
try {
  // One job per unit normally, or one per OWNER SET under `--sets`.
  const work =
    setList.length > 0
      ? setList.slice(0, limit).map((entry) => ({
          name: `SET[${entry.documents}] ${entry.owners.map((o) => o.split(" [")[0]).join(" + ")}`,
          wanted: entry.owners.length,
          docs: new Set(entry.docs ?? []),
          members: entry.owners
            .map((owner) => units.find((unit) => unit.name === owner))
            .filter((unit): unit is Block => unit !== undefined),
        }))
      : units.slice(0, limit).map((block) => ({
          name: block.name,
          wanted: 1,
          docs: new Set<string>(),
          members: [block],
        }));

  for (const job of work) {
    if (job.members.length !== job.wanted) {
      console.log(`  ${job.name.padEnd(60)}  SKIPPED: a member is not a unit`);
      continue;
    }
    // DEEPEST FIRST, so each slice is taken against line numbers the earlier cuts have not
    // yet shifted. Removing a set in source order silently deletes the wrong lines once the
    // first member is gone.
    let next = [...lines];
    for (const member of [...job.members].sort((a, b) => b.start - a.start)) {
      next = [...next.slice(0, member.start), ...next.slice(member.end + 1)];
    }
    fs.writeFileSync(index, next.join("\n"));
    const without = shapes("without");
    if (Object.keys(without).length === 0) {
      owned.set(job.name, ["<REMOVAL DOES NOT COMPILE>"]);
      console.log(`  ${job.name.padEnd(60)}  does not compile without it`);
      continue;
    }
    const moved = Object.keys(base).filter((key) => base[key] !== without[key]);
    owned.set(job.name, moved);
    let verdict = "";
    if (setList.length > 0 && Object.keys(against).length > 0) {
      const members = new Set(job.members.map((member) => member.name));
      // SCOPED TO THE SET'S OWN DOCUMENTS. Compared globally, 23 of the top 40 sets report a
      // deviation LARGER than the number of documents that identified them -- one covers five
      // documents and masks 357 -- because removing two units together perturbs answers
      // everywhere, not only where they co-own. A global number cannot certify the specific
      // documents, which is the only thing the verdict is wanted for.
      const scope = (key: string): boolean =>
        job.docs.size === 0 || job.docs.has(key.split("\u0000")[0]!);
      const union = new Set(
        Object.keys(against).filter(
          (key) =>
            scope(key) &&
            (against[key] ?? []).some((owner) => members.has(owner)),
        ),
      );
      const combined = new Set(moved.filter(scope));
      const extra = [...combined].filter((key) => !union.has(key)).length;
      const missing = [...union].filter((key) => !combined.has(key)).length;
      verdict =
        extra === 0 && missing === 0
          ? "  INDEPENDENT"
          : extra > 0 && missing === 0
            ? `  SYNERGISTIC +${String(extra)}`
            : missing > 0 && extra === 0
              ? `  MASKING -${String(missing)}`
              : `  BOTH +${String(extra)}/-${String(missing)}`;
    }
    console.log(
      `  ${job.name.padEnd(58)} ${String(moved.length).padStart(5)}${verdict}`,
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
// HOW MANY PASSES OWN EACH CASE, which separates a clean owner from coupling. `pass-order.mts`
// reports 42 of 62 passes position-sensitive, so "removing X changes Y" can mean X decides Y
// or it can mean X's removal changes what a later pass sees. The two are not distinguishable
// per pair without a pairwise sweep -- 69 squared -- but the SET SIZE is, and it is the number
// that matters for working systematically: a case with exactly one owner can be worked on
// alone, and a case with six cannot.
const sizes = new Map<number, number>();
for (const [, owners] of byCase) {
  const n = new Set(owners).size;
  sizes.set(n, (sizes.get(n) ?? 0) + 1);
}
console.log(`\n  OWNERS PER CASE  (1 = workable alone, many = coupled)`);
for (const [n, count] of [...sizes].sort((a, b) => a[0] - b[0]).slice(0, 8)) {
  console.log(`    ${String(n).padStart(2)} owner(s): ${count}`);
}
const soleOwner = new Map<string, number>();
for (const [, owners] of byCase) {
  const uniq = [...new Set(owners)];
  if (uniq.length === 1) {
    soleOwner.set(uniq[0]!, (soleOwner.get(uniq[0]!) ?? 0) + 1);
  }
}
console.log(`\n  SOLE OWNERSHIP -- cases no other pass touches:`);
for (const [name, n] of [...soleOwner]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)) {
  console.log(`    ${name.padEnd(42)} ${String(n).padStart(5)}`);
}

const unowned = ids.filter((id) =>
  refereeMode
    ? !byCase.has(id)
    : !byCase.has(`${id}\u0000quartz-default`) &&
      !byCase.has(`${id}\u0000all-features`),
);
// FIELD-ANSWERS AND DOCUMENTS ARE DIFFERENT UNITS, and reporting one as the other is how this
// line said "0 diverging and unowned" and then "609" for the same corpus within an hour. A
// document is only unowned when BOTH of its fields are, and that is the number meaning "no
// repair pass can fix this".
const fieldOf = (key: string): string => key.split("\u0000")[0]!;
const unownedDocs = refereeMode
  ? [...new Set(unowned.map(fieldOf))].filter((doc) =>
      ["defs", "refs", "code"].every((field) =>
        unowned.includes(`${doc}\u0000${field}`),
      ),
    )
  : unowned;
console.log(
  `\n  UNOWNED: ${unowned.length} field-answers, ${unownedDocs.length} documents with ALL fields unowned` +
    `, of ${refereeMode ? new Set(ids.map(fieldOf)).size : ids.length}  (stock micromark plus the vendored constructs)`,
);
// THE FIELD SUFFIX HAS TO COME OFF. `agreesBase` is keyed by DOCUMENT and the shapes are now
// keyed by `document\0field`, so looking one up with the other returned `undefined` for every
// entry and reported zero diverging-and-unowned where there are 111. That is the same
// key-shape mismatch fixed an hour earlier between corpus ids and referee ids, reintroduced by
// splitting the hash per field -- a reporting line that reads a key it no longer receives
// fails silently and looks like good news.
const document = (key: string): string => key.split("\u0000")[0]!;
const unownedDiverging = unownedDocs.filter((id) =>
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
