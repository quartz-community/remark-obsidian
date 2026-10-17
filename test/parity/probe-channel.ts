/**
 * The file-driven channel to a running Obsidian, in the referee's own answer format.
 *
 * `ask.mts` talks to the app through `obsidian eval`, which MEASURABLY LOSES THE FOOTNOTE
 * FIELDS: asked `use[^1]` / blank / `[^1]: def` three times it returns `["sections"]` every
 * time, where this channel returns `["footnoteRefs", "footnotes", "sections"]`. So the CLI is
 * not a thinner version of this one, it is a lossy one, and nothing that needs footnote facts
 * should use it. See `README.md`.
 *
 * The `parity-probe` plugin serves a request file and writes a response file, so a batch costs
 * about a second with no size ceiling, no base64, and no polling an eval's 5-15ms result
 * window.
 *
 * TWO THINGS THIS DELIBERATELY REFUSES TO PAPER OVER:
 *
 * A `null` cache THROWS. Obsidian returns nothing when its metadata worker is wedged, and
 * reading that as an empty answer means "Obsidian indexes nothing in this document" -- the
 * failure shape these notes carry three instances of. A caller that wants to tolerate it has
 * to say so.
 *
 * `footnoteRefs` is DEFINITION-GATED: it lists only references whose name has a definition, and
 * omits the key entirely when none do. So references are read from an AUGMENTED copy of each
 * document -- one synthesised definition per referenced name, which is the trick `ask.mts
 * --synth` exists for -- while definitions are read from the document as written. Both copies
 * ride in the same batch, because a batch with no ceiling makes the doubling free.
 */
import fs from "node:fs";
import path from "node:path";

const DIR = "/tmp/parity-probe";
const REQUEST = path.join(DIR, "request.json");
const RESPONSE = path.join(DIR, "response.json");

/** `[name, startLine, startColumn, lastLine]`, zero-based, as the referee records it. */
export type Def = readonly [string, number, number, number];
/** `[name, line, column]`, zero-based. */
export type Ref = readonly [string, number, number];

export interface Answer {
  readonly defs: readonly Def[];
  readonly refs: readonly Ref[];
  /**
   * Whether the augmentation that makes `refs` readable actually took effect.
   *
   * Appending `[^x]: synthesised` fails on a document that SWALLOWS its tail. An unclosed `%%`
   * is the measured case: `%% x` / blank / `[^1]: def` / blank / `use[^1] use[^2] use[^3]` has
   * the comment eat every appended definition, so no name is defined, so the definition-gated
   * `footnoteRefs` comes back EMPTY -- which reads as "Obsidian indexes no reference here" when
   * it means "the probe never fired". Two of forty documents in the channel's validation sweep,
   * both unclosed comments, and the referee has four references recorded for each.
   *
   * So `refs` is only an answer when this is true. It is computed by checking that every name
   * the augmentation synthesised actually appears in the augmented copy's `footnotes`, rather
   * than by pattern-matching the source for constructs that might swallow a tail.
   */
  readonly refsTrustworthy: boolean;
}

interface Point {
  readonly line: number;
  readonly col: number;
  readonly offset: number;
}
interface Positioned {
  readonly id?: string;
  readonly position?: { readonly start: Point; readonly end: Point };
}
export interface Cache {
  readonly footnotes?: readonly Positioned[];
  readonly footnoteRefs?: readonly Positioned[];
}
interface Reply {
  readonly id: string;
  readonly cache: Cache | null;
  readonly threw?: string;
}

const REFERENCE = /\[\^([^\]\s]+)\]/gu;

/**
 * A definition for EVERY referenced name, not only the textually-undefined ones.
 *
 * Copied in behaviour from `ask.mts`, including the reason it does not skip names that look
 * defined: `> %%` / `[^3]: Text` carries a label and Obsidian defines NOTHING, because the
 * unclosed comment buries it, so a scan that skips those augments exactly the document that
 * needed it least usefully. A duplicate definition is harmless -- the first wins.
 */
export function referencedNames(markdown: string): string[] {
  const names: string[] = [];
  for (const hit of markdown.matchAll(REFERENCE)) {
    if (!names.includes(hit[1]!)) names.push(hit[1]!);
  }
  return names;
}

export function augment(markdown: string): string {
  const names = referencedNames(markdown);
  if (names.length === 0) return markdown;
  const tail = names.map((name) => `[^${name}]: synthesised`).join("\n\n");
  return `${markdown.endsWith("\n") ? markdown : `${markdown}\n`}\n${tail}\n`;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** One round trip. Stale responses are removed FIRST, or a previous batch answers this one. */
async function exchange(
  markdowns: readonly string[],
  timeoutMs: number,
): Promise<Reply[]> {
  fs.mkdirSync(DIR, { recursive: true });
  fs.rmSync(RESPONSE, { force: true });
  fs.rmSync(`${RESPONSE}.part`, { force: true });
  fs.writeFileSync(
    REQUEST,
    JSON.stringify(
      markdowns.map((markdown, at) => ({ id: String(at), markdown })),
    ),
  );

  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    await sleep(120);
    if (!fs.existsSync(RESPONSE)) continue;
    const read: unknown = JSON.parse(fs.readFileSync(RESPONSE, "utf8"));
    if (!Array.isArray(read)) {
      throw new Error(`probe-channel: plugin reported ${JSON.stringify(read)}`);
    }
    return read as Reply[];
  }
  throw new Error(
    `probe-channel: no response in ${timeoutMs}ms. Is Obsidian running with parity-probe enabled?`,
  );
}

/**
 * The RAW caches, synchronously, for callers whose shape predates this channel.
 *
 * `compose.mts` projects the cache itself through `theirs()` rather than reading footnote facts,
 * and its `askBatch` is synchronous three call-frames down. It also DIED on the CLI channel: 256
 * sequences in one `code=` argument is about 6KB and `execFileSync` fails outright, which is the
 * batch ceiling this transport exists to remove -- so a sweep that once caught a same-day
 * regression was simply unrunnable.
 *
 * The sleep is `Atomics.wait` on a SharedArrayBuffer, which is the only true blocking sleep in
 * Node. Spinning on `Date.now()` would peg a core for the whole exchange, and making the chain
 * async would rewrite three functions to change a transport.
 */
export function askRawSync(
  markdowns: readonly string[],
  timeoutMs = 300_000,
): (Cache | null)[] {
  if (markdowns.length === 0) return [];
  fs.mkdirSync(DIR, { recursive: true });
  fs.rmSync(RESPONSE, { force: true });
  fs.rmSync(`${RESPONSE}.part`, { force: true });
  fs.writeFileSync(
    REQUEST,
    JSON.stringify(
      markdowns.map((markdown, at) => ({ id: String(at), markdown })),
    ),
  );

  const gate = new Int32Array(new SharedArrayBuffer(4));
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    Atomics.wait(gate, 0, 0, 120);
    if (!fs.existsSync(RESPONSE)) continue;
    const read: unknown = JSON.parse(fs.readFileSync(RESPONSE, "utf8"));
    if (!Array.isArray(read)) {
      throw new Error(`probe-channel: plugin reported ${JSON.stringify(read)}`);
    }
    const replies = read as Reply[];
    if (replies.length !== markdowns.length) {
      throw new Error(
        `probe-channel: asked ${markdowns.length} and got ${replies.length}`,
      );
    }
    const byId = new Map(replies.map((reply) => [reply.id, reply]));
    return markdowns.map((_, at) => byId.get(String(at))?.cache ?? null);
  }
  throw new Error(
    `probe-channel: no response in ${timeoutMs}ms. Is Obsidian running with parity-probe enabled?`,
  );
}

/**
 * Ask Obsidian about each document, as `{defs, refs}`.
 *
 * Definitions come from the document as written and references from its augmented copy, for the
 * gating reason in the module docstring. Both halves of every pair must come back or this
 * throws: a short reply means the plugin answered a different batch.
 */
export async function ask(
  markdowns: readonly string[],
  timeoutMs = 300_000,
): Promise<Answer[]> {
  if (markdowns.length === 0) return [];
  const paired = markdowns.flatMap((markdown) => [markdown, augment(markdown)]);
  const replies = await exchange(paired, timeoutMs);
  if (replies.length !== paired.length) {
    throw new Error(
      `probe-channel: asked ${paired.length} and got ${replies.length}`,
    );
  }

  const byId = new Map(replies.map((reply) => [reply.id, reply]));
  const out: Answer[] = [];
  for (let at = 0; at < markdowns.length; at++) {
    const plain = byId.get(String(at * 2));
    const synth = byId.get(String(at * 2 + 1));
    for (const [which, reply] of [
      ["plain", plain],
      ["augmented", synth],
    ] as const) {
      if (!reply) throw new Error(`probe-channel: no ${which} reply for ${at}`);
      if (reply.cache === null) {
        throw new Error(
          `probe-channel: NULL cache for the ${which} copy of document ${at}` +
            `${reply.threw ? ` (threw: ${reply.threw})` : ""}. Obsidian declined; ` +
            `clear app.metadataCache.workerResolve and retry.`,
        );
      }
    }
    const wanted = referencedNames(markdowns[at]!);
    const defined = new Set(
      (synth!.cache!.footnotes ?? []).map((entry) => entry.id?.toLowerCase()),
    );
    out.push({
      defs: (plain!.cache!.footnotes ?? []).flatMap((entry): Def[] =>
        entry.id === undefined || !entry.position
          ? []
          : [
              [
                entry.id,
                entry.position.start.line,
                entry.position.start.col,
                entry.position.end.line,
              ],
            ],
      ),
      refs: (synth!.cache!.footnoteRefs ?? []).flatMap((entry): Ref[] =>
        entry.id === undefined || !entry.position
          ? []
          : [[entry.id, entry.position.start.line, entry.position.start.col]],
      ),
      refsTrustworthy: wanted.every((name) => defined.has(name.toLowerCase())),
    });
  }
  return out;
}
