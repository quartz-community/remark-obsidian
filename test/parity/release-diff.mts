/**
 * Diff the running Obsidian's metadata cache against the committed goldens.
 *
 * The recorder cannot do this for an unreleased build. `wdio-obsidian-service@3.3.0` resolves
 * the app version against its own manifest before it consults `appPath`, and even with a
 * synthesised manifest entry the override is accepted, echoed back, and never used -- the
 * asar's atime does not move across a full recording. So an alpha cannot be recorded, which is
 * exactly when a release diff is wanted.
 *
 * The CLI channel can, because it talks to whatever Obsidian is actually running. This asks it
 * every corpus document and projects the answers through the SAME formatter the recorder uses,
 * so the comparison is against the goldens' own shape rather than a re-derived one. Those two
 * projections living in different files is a real risk and the reason this one carries the
 * recorder's line numbers in a comment rather than paraphrasing it.
 *
 *     nix run ~/obsidian-dev --impure        # or whatever runs the build to characterise
 *     npx tsx --conditions=development test/parity/release-diff.mts
 *
 * Goldens are never written. This reports; a human decides whether a difference is Obsidian
 * moving or us needing to follow.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const GOLDEN = path.resolve(
  process.env.PARITY_GOLDEN ?? "test/parity/goldens/obsidian.json",
);
/** Questions per `obsidian eval`, bounded by the shell argument the batch is encoded into. */
const CHUNK = 150;

interface Point {
  readonly line?: number;
  readonly col?: number;
}
interface Position {
  readonly start?: Point;
  readonly end?: Point;
}

const at = (point: Point | undefined): string =>
  `${point?.line ?? 0}:${point?.col ?? 0}`;
const span = (position: Position | undefined): string =>
  `${at(position?.start)}-${at(position?.end)}`;

/**
 * The recorder's own projection, `oracle.e2e.ts:258-298`, applied outside the browser.
 *
 * Field for field, including the two shapes that are easy to get wrong: `footnoteRefs` and
 * `headings` carry only the START point where everything else carries a span, and `blocks` is
 * an object keyed by identifier rather than an array.
 */
function project(
  answer: Record<string, unknown> | null,
): Record<string, unknown> {
  const list = (key: string): Record<string, never>[] =>
    (answer?.[key] as Record<string, never>[] | undefined) ?? [];
  const reference = (l: Record<string, never>): string =>
    `${String(l.original)}=>${String(l.link)}|${String(l.displayText)}@${span(l.position as Position)}`;
  return {
    referenceLinks: list("referenceLinks").map(
      (l) => `${String(l.link)}@${span(l.position as Position)}`,
    ),
    footnotes: list("footnotes").map(
      (f) => `${String(f.id)}@${span(f.position as Position)}`,
    ),
    footnoteRefs: list("footnoteRefs").map(
      (f) =>
        `${String(f.id)}@${at((f.position as Position | undefined)?.start)}`,
    ),
    headings: list("headings").map(
      (h) =>
        `${String(h.level)}:${String(h.heading)}@${at((h.position as Position | undefined)?.start)}`,
    ),
    sections: list("sections").map(
      (s) => `${String(s.type)}@${span(s.position as Position)}`,
    ),
    links: list("links").map(reference),
    embeds: list("embeds").map(reference),
    tags: list("tags").map(
      (t) => `${String(t.tag)}@${span(t.position as Position)}`,
    ),
    listItems: list("listItems").map(
      (i) =>
        `${i.task === undefined ? "-" : JSON.stringify(i.task)}|parent:${String(i.parent)}@${span(i.position as Position)}`,
    ),
    blocks: Object.values(
      (answer?.blocks as Record<string, Record<string, never>> | undefined) ??
        {},
    ).map((b) => `${String(b.id)}@${span(b.position as Position)}`),
    // NOT `reference`. This one carries the frontmatter KEY and no span, and projecting it
    // with the shared formatter reported both frontmatter wikilink cases as release changes
    // when nothing had moved -- the same phantom-divergence shape these notes record from the
    // `headings` projection, where one side carried `@line:col` and the other did not.
    frontmatterLinks: list("frontmatterLinks").map(
      (l) =>
        `${String(l.key)}:${String(l.original)}=>${String(l.link)}|${String(l.displayText)}`,
    ),
  };
}

const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8")) as {
  obsidian?: { app?: string };
  cases: Record<string, { markdown: string; obsidian?: { compute?: unknown } }>;
};
const pinned = golden.obsidian?.app ?? "?";
const ids = Object.keys(golden.cases).filter(
  (id) =>
    (golden.cases[id]?.obsidian as { compute?: unknown } | undefined)?.compute,
);

const running = /^\s*(\S+)\s*\(installer\s+(\S+)\)/u.exec(
  execFileSync("obsidian", ["version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 120_000,
  }),
)?.[1];
if (running === undefined) {
  console.log(
    "release-diff: `obsidian version` did not answer; is Obsidian running?",
  );
  process.exit(1);
}
console.log(`release-diff: goldens pin ${pinned}, running ${running}`);
if (running === pinned) {
  console.log(
    "  SAME VERSION, so any difference below is a recording flake rather than a release change.",
  );
}
console.log(`  asking ${ids.length} documents in chunks of ${CHUNK}\n`);

const moved: { id: string; fields: string[] }[] = [];
const counts = new Map<string, number>();
let asked = 0;

for (let from = 0; from < ids.length; from += CHUNK) {
  const batch = ids.slice(from, from + CHUNK);
  const file = path.join("/tmp", `release-diff-${String(from)}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(batch.map((id) => golden.cases[id]!.markdown)),
  );
  let answers: { compute: Record<string, unknown> | null }[];
  try {
    answers = JSON.parse(
      execFileSync(
        "npx",
        [
          "tsx",
          "--conditions=development",
          "test/parity/ask.mts",
          "--file",
          file,
        ],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 600_000,
        },
      ),
    ) as { compute: Record<string, unknown> | null }[];
  } finally {
    fs.rmSync(file, { force: true });
  }
  if (answers.length !== batch.length) {
    console.log(
      `  chunk at ${String(from)}: asked ${String(batch.length)}, got ${String(answers.length)} -- skipping`,
    );
    continue;
  }
  for (const [index, id] of batch.entries()) {
    const want = golden.cases[id]!.obsidian!.compute as Record<string, unknown>;
    const have = project(answers[index]!.compute);
    const fields = Object.keys(have).filter(
      (key) =>
        JSON.stringify(want[key] ?? []) !== JSON.stringify(have[key] ?? []),
    );
    asked += 1;
    if (fields.length > 0) {
      moved.push({ id, fields });
      for (const field of fields)
        counts.set(field, (counts.get(field) ?? 0) + 1);
    }
  }
  process.stdout.write(`  asked ${String(asked)}/${String(ids.length)}\r`);
}

console.log(`\n\n  DOCUMENTS WHOSE ANSWER MOVED: ${moved.length} of ${asked}`);
for (const [field, n] of [...counts].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(5)}  ${field}`);
}
for (const { id, fields } of moved.slice(0, 20)) {
  console.log(`      ${id}  ->  ${fields.join(", ")}`);
}
if (moved.length > 20)
  console.log(`      ... and ${String(moved.length - 20)} more`);
fs.writeFileSync("/tmp/release-diff.json", JSON.stringify(moved, null, 2));
console.log(`\n  full list: /tmp/release-diff.json`);
