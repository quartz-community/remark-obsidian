/**
 * Does Live Preview's closing boundary agree with `metadataCache`'s?
 *
 * Live preview is the WRONG parser for this package -- Obsidian has two, they disagree, and
 * every discriminating case sides with reading view, which `metadataCache` reflects. So
 * nothing here may settle a rule. What live preview has that neither existing oracle does is
 * the position of a CLOSING DELIMITER: `sections` is block-granular and the reading-view DOM
 * has no delimiters in it at all, so a construct's closer is a value neither oracle records.
 * That is the category these notes say to expect nothing from the tree for, and it is where
 * every open extent question sits -- the quote-depth `%%` refusals died computing a boundary
 * heuristically, and F4 is blocked verbatim on "needs the container's true extent".
 *
 * This asks the only question that makes the channel usable or useless: WHERE BOTH ORACLES CAN
 * SEE THE SAME BOUNDARY, DO THEY AGREE? A root-level `%%`, `$$` or fence gets a `sections`
 * entry with offsets, and live preview gets a `comment-start`/`comment-end` pair. Agreement on
 * that overlap is what would make live preview's boundary worth probing where `sections` is
 * blind, which is inside containers. Disagreement kills the idea for the cost of this file.
 *
 * The `code` field was adopted exactly this way -- verified as `sections.filter(type ===
 * "code")` on five documents before anything was scored against it.
 *
 *     obsidian must be running with test-vault open and parity-probe enabled
 *     npx tsx --conditions=development test/parity/lp-extent.mts
 */
import { execFileSync } from "node:child_process";

const LOG_LINE = /^\d{4}-\d{2}-\d{2} /u;

function evaluate(code: string): string {
  return execFileSync("obsidian", ["eval", `code=${code}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 120_000,
  })
    .split("\n")
    .filter((line) => !LOG_LINE.test(line) && line.trim() !== "")
    .map((line) => line.replace(/^=> /u, ""))
    .join("\n")
    .trim();
}

const encode = (documents: readonly string[]): string =>
  JSON.stringify(
    documents.map((text) => Buffer.from(text, "utf8").toString("base64")),
  );

/** Stash, then poll: the `obsidian eval` result window is 5-15ms, so an await cannot answer. */
function stashed(global: string, body: string): string {
  evaluate(`window.${global}='pending';${body}`);
  let raw = "pending";
  for (let attempt = 0; attempt < 400 && raw === "pending"; attempt++) {
    raw = evaluate(`window.${global}`);
  }
  if (raw === "pending") throw new Error(`Obsidian did not finish (${global})`);
  return raw;
}

interface LpAnswer {
  readonly docLength?: number;
  readonly nodes?: [string, number, number][];
  readonly error?: string;
}

function askLivePreview(documents: readonly string[]): LpAnswer[] {
  const raw = stashed(
    "__lp",
    `(async()=>{try{const qs=${encode(documents)};` +
      `const md=qs.map(q=>new TextDecoder().decode(Uint8Array.from(atob(q),c=>c.charCodeAt(0))));` +
      `window.__lp=JSON.stringify(await window.__parityLivePreview(md))}` +
      `catch(e){window.__lp=JSON.stringify([{error:String(e&&e.message||e).slice(0,200)}])}})()`,
  );
  return JSON.parse(raw) as LpAnswer[];
}

interface Section {
  readonly type: string;
  readonly position: {
    readonly start: { readonly offset: number };
    readonly end: { readonly offset: number };
  };
}

function askSections(documents: readonly string[]): Section[][] {
  const raw = stashed(
    "__sec",
    `(async()=>{const qs=${encode(documents)};const out=[];` +
      `for(const q of qs){const b=Uint8Array.from(atob(q),c=>c.charCodeAt(0)).buffer;` +
      `const a=await app.metadataCache.computeMetadataAsync(b);out.push(a&&a.sections||[])}` +
      `window.__sec=JSON.stringify(out)})()`,
  );
  return JSON.parse(raw) as Section[][];
}

/**
 * The constructs where BOTH oracles see a boundary. Deliberately ASCII: cache offsets are
 * BYTE offsets -- the recorder feeds `TextEncoder().encode(markdown).buffer` -- while Lezer
 * counts UTF-16 units, so a multibyte document would compare two different units and read as
 * disagreement. Testing that separately is a later question; mixing it into this one would
 * make the answer unreadable.
 */
/**
 * The two oracles NAME THE SAME CONSTRUCT DIFFERENTLY, so each case carries both. One field
 * doing double duty reported every fence as invisible to the cache, which read as "no overlap
 * here" when the cache sees fences perfectly well and calls them `code`.
 */
const CASES: readonly {
  readonly what: string;
  readonly md: string;
  readonly cacheType: string;
  readonly lpNode: string;
  readonly mustDiffer?: boolean;
}[] = [
  {
    what: "closed comment",
    md: "%%c%%",
    cacheType: "comment",
    lpNode: "comment",
  },
  {
    what: "comment, multi-line",
    md: "%%\nbody\n%%",
    cacheType: "comment",
    lpNode: "comment",
  },
  {
    what: "unclosed comment",
    md: "%%\ntail",
    cacheType: "comment",
    lpNode: "comment",
  },
  // A BLANK LINE, which the first version of this set had no case for at all -- every other
  // probe here is blank-line-free, so the agreements said nothing about one. AT ROOT the two
  // agree and both run to the end of the document, which is what the committed golden already
  // pins for a top-level unclosed `%%`.
  //
  // THE DIVERGENCE IS CONTAINER-OPENED, and this axis cannot express it: the cache reports no
  // `comment` SECTION for a `%%` opened inside a quote, which is precisely why `sections` is
  // blind there and why live preview was wanted. Measured through the footnote projection
  // instead -- `> > %%` / blank / `[^note]: Definition` is `comment@16-27` of 27 characters to
  // live preview, so buried, while the cache reports the footnote as DEFINED. So live
  // preview's extent is right at root and too long inside a container, and it cannot supply
  // that boundary unqualified.
  {
    what: "unclosed, past a blank",
    md: "%%\n\ntail",
    cacheType: "comment",
    lpNode: "comment",
  },
  {
    what: "comment after text",
    md: "x\n\n%%c%%",
    cacheType: "comment",
    lpNode: "comment",
  },
  { what: "display math", md: "$$\nx\n$$", cacheType: "math", lpNode: "math" },
  {
    what: "display math inline",
    md: "$$x$$",
    cacheType: "math",
    lpNode: "math",
  },
  {
    what: "fence",
    md: "```\ncode\n```",
    cacheType: "code",
    lpNode: "HyperMD-codeblock",
  },
  {
    what: "fence, unclosed",
    md: "```\ncode",
    cacheType: "code",
    lpNode: "HyperMD-codeblock",
  },
  {
    what: "fence with info",
    md: "```js\ncode\n```",
    cacheType: "code",
    lpNode: "HyperMD-codeblock",
  },
  {
    what: "indented code",
    md: "    code",
    cacheType: "code",
    lpNode: "hmd-indented-code",
  },
  { what: "quote", md: "> q", cacheType: "blockquote", lpNode: "quote" },
  {
    what: "comment in a quote",
    md: "> %%\n> body",
    cacheType: "blockquote",
    lpNode: "comment",
  },
  // CONTROL. The cache's `comment` ends at 10 and live preview's codeblock at 21, so these
  // two numbers CANNOT be equal. Nine agreements out of nine look identical whether the
  // comparison is live or inert, and this file has already had FIVE bugs of that shape: one
  // name field serving both oracles hid every fence, a span comparison read a token
  // convention as disagreement, a node filter matched nothing, a trailing newline shifted
  // every end by one, and the first version of this very control was never inserted because
  // a scripted replace missed prettier's reformatting and reported success anyway.
  {
    what: "CONTROL (must differ)",
    md: "%%\nbody\n%%\n\n```\nx\n```",
    cacheType: "comment",
    lpNode: "HyperMD-codeblock",
    mustDiffer: true,
  },
];

const alive = evaluate("typeof window.__parityLivePreview");
if (alive !== "function") {
  console.log(
    `lp-extent: __parityLivePreview is ${alive}; reload parity-probe:`,
  );
  console.log(
    `  obsidian eval code='app.plugins.disablePlugin("parity-probe").then(()=>app.plugins.enablePlugin("parity-probe"))'`,
  );
  process.exit(1);
}

const documents = CASES.map((c) => c.md);
const lp = askLivePreview(documents);
const sections = askSections(documents);

console.log(
  `lp-extent: ${String(CASES.length)} constructs both oracles can see\n`,
);
let agree = 0;
let seen = 0;
let controlHeld = false;
for (const [index, probe] of CASES.entries()) {
  const answer = lp[index];
  const theirs = (sections[index] ?? []).filter(
    (s) => s.type === probe.cacheType,
  );
  const nodes = (answer?.nodes ?? []).filter(([name]) =>
    name.split("_").some((part) => part === probe.lpNode),
  );
  // THE END OFFSET, not the span. Live preview marks TOKENS and the cache marks BLOCKS, so
  // their unions differ by inter-token whitespace and by a leading indent -- `⟨4sp⟩code` is
  // `4-8` to live preview and `0-8` to the cache, which is two answers to two questions
  // rather than a disagreement. The CLOSING BOUNDARY is the thing neither oracle records
  // elsewhere and the only thing this channel is wanted for, so it is the thing compared.
  // Probe documents carry no trailing newline: the cache includes it in a block and live
  // preview does not, and removing the confound beats normalising around it.
  const cacheEnd =
    theirs.length === 0
      ? null
      : Math.max(...theirs.map((s) => s.position.end.offset));
  const lpEnd =
    nodes.length === 0 ? null : Math.max(...nodes.map(([, , to]) => to));
  const cacheSpan = cacheEnd === null ? "none" : String(cacheEnd);
  const lpSpan = lpEnd === null ? "none" : String(lpEnd);
  const comparable = cacheEnd !== null && lpEnd !== null;
  if (comparable && probe.mustDiffer !== true) {
    seen += 1;
    if (cacheEnd === lpEnd) agree += 1;
  }
  if (probe.mustDiffer === true) {
    controlHeld = comparable && cacheEnd !== lpEnd;
  }
  const verdict = !comparable ? "—" : cacheEnd === lpEnd ? "AGREE" : "DIFFER";
  console.log(
    `  ${probe.what.padEnd(20)} ${JSON.stringify(probe.md).padEnd(22)} cacheEnd=${cacheSpan.padEnd(6)} lpEnd=${lpSpan.padEnd(6)} ${verdict}`,
  );
  if (comparable && cacheSpan !== lpSpan) {
    for (const [name, from, to] of nodes) {
      console.log(`      lp node  ${name}@${String(from)}-${String(to)}`);
    }
  }
  if (answer?.error !== undefined)
    console.log(`      lp error: ${answer.error}`);
}
console.log(
  `\n  COMPARABLE: ${String(seen)} of ${String(CASES.length)}   AGREE: ${String(agree)} of ${String(seen)}`,
);
console.log(
  `  CONTROL (two ends that cannot match): ${controlHeld ? "DIFFER, as required" : "FAILED -- the comparison is inert and the agreement above means nothing"}`,
);
console.log(
  !controlHeld
    ? "  NO EVIDENCE: the control did not differ, so no verdict can be read from this run."
    : seen === 0
      ? "  NO EVIDENCE: no construct was visible to both oracles, so this says nothing."
      : agree === seen
        ? "  Live preview's boundary matches the cache wherever both can see it."
        : "  Live preview DIVERGES from the cache on the overlap; it cannot stand in for it.",
);
