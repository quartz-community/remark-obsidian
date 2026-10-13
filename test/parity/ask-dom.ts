/**
 * Ask a running Obsidian for the DOM projections `metadataCache` does not carry.
 *
 * The LIBRARY half. `ask-dom.mts` is the CLI; importing a `.mts` is not allowed, which is
 * the same split `overview.ts` and `overview.mts` use.
 *
 * `ask.mts` wraps `computeMetadataAsync` and answers in about a second, and is structurally
 * blind to eight inline constructs: `==hi== *em* **st** ~~del~~ $x$ ` + "`c`" + ` reports
 * NOTHING to the cache. Their only oracle was the full recorder -- Obsidian under Xvfb,
 * seventy seconds, and answers only for documents already in `corpus.ts` -- so every question
 * about emphasis or highlight content cost a commit cycle. That is the loop that made
 * progress taper before `ask.mts` existed, still in place for half the inline surface.
 *
 * This closes it through `test-vault/.obsidian/plugins/parity-probe`, which exposes a
 * detached `MarkdownRenderer` because `obsidian eval` has `require` but no `obsidian` module
 * -- it is injected into plugins at load time. The plugin's projections mirror
 * `oracle.e2e.ts` character for character where it has one, and add `del`/`s` and `code`,
 * which it has no projection for at all.
 *
 * The same four details `ask.mts` records apply, and are not optional:
 *
 * - `2>/dev/null`, or every call is buried in GTK and Electron warnings.
 * - Obsidian must be RUNNING WITH THIS VAULT OPEN. A cold `obsidian eval` returns launcher
 *   logs; with no vault it returns nothing, silently. Both read as "Obsidian found nothing
 *   in this document", so liveness is checked first.
 * - The result window is roughly 5-15 ms, so an awaited value cannot be answered in one
 *   call. Stash onto a global, read it back synchronously.
 * - Markdown goes base64-encoded, because it crosses a shell argument and then a JavaScript
 *   string literal, and quoting it twice is how a probe silently becomes a different
 *   document.
 */
import { execFileSync } from "node:child_process";

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

export interface DomFacts {
  readonly highlights: readonly string[];
  readonly emphasis: readonly string[];
  readonly strike: readonly string[];
  readonly code: readonly string[];
  readonly math: ReadonlyArray<{ display: boolean; tex?: string }>;
  /** RENDERED headings -- a different question from the INDEXED ones `ask.mts` returns. */
  readonly headings: readonly string[];
  /** Target and display kept apart, which the cache's single projection string cannot. */
  readonly links: ReadonlyArray<{ target: string; display: string }>;
  readonly text: string;
}

/**
 * Whether the probe is reachable, with the exact remedy when it is not.
 *
 * The plugin needs community plugins ALLOWED in the vault, which is off by default and was
 * off here -- `app.plugins.isEnabled()` returned false and `enablePlugin` silently did
 * nothing, reporting `ok: true` while loading no plugin. So both halves are checked and the
 * message names the call that fixes each.
 */
export function probeStatus(): string | undefined {
  const raw = evaluate(
    "JSON.stringify({vault: app?.vault?.getName?.() ?? null," +
      " allowed: typeof app?.plugins?.isEnabled === 'function' ? app.plugins.isEnabled() : null," +
      " probe: typeof window.__parityProbe})",
  );
  if (raw === "") {
    return "obsidian eval returned nothing: start Obsidian and open test-vault";
  }
  const state = JSON.parse(raw) as {
    vault: string | null;
    allowed: boolean | null;
    probe: string;
  };
  if (state.vault === null) return "no vault open; open test-vault";
  if (state.probe === "function") return undefined;
  if (state.allowed !== true) {
    return `community plugins are disabled in ${state.vault}; run: obsidian eval code='app.plugins.setEnable(true).then(()=>app.plugins.enablePlugin("parity-probe"))'`;
  }
  return `parity-probe is not loaded in ${state.vault}; run: obsidian eval code='app.plugins.enablePlugin("parity-probe")'`;
}

/**
 * One stash for the whole batch, because the cost is per CALL and not per document.
 *
 * `ask.mts` records thirty questions answered in 1.27 seconds for the same reason. Rendering
 * is slower than computing metadata -- each document waits on MathJax -- so the poll budget
 * is larger, but the batching argument is identical.
 */
/**
 * Whether a real Reading View will actually render, and the one command that makes it.
 *
 * Reading mode drives rendering off `requestAnimationFrame`, which Chromium starves for an
 * UNFOCUSED window -- visible is not enough. Instrumented before this was built: the view
 * opens with `mode: "preview"` and 4369 bytes of chrome, and `sectionKids` stays 0 while
 * `document.hasFocus()` is false.
 *
 * The fix is focus EMULATION over the Chrome DevTools Protocol, which the Obsidian CLI
 * exposes. It makes the page report itself focused without taking focus from the desktop, so
 * nothing is stolen from whoever is using the machine:
 *
 *     obsidian dev:cdp method=Emulation.setFocusEmulationEnabled params='{"enabled":true}'
 *
 * With that in place a real Reading View renders and agrees with the detached render
 * byte-for-byte. Without it every capture comes back empty, which reads as "Obsidian renders
 * nothing here" -- the silent failure mode this file's own docstring warns about, so it is
 * checked rather than assumed.
 */
export function readingViewReady(): string | undefined {
  const problem = probeStatus();
  if (problem !== undefined) return problem;
  const raw = evaluate(
    "JSON.stringify({focus: document.hasFocus(), reading: typeof window.__parityReadingView})",
  );
  if (raw === "") return "obsidian eval returned nothing";
  const state = JSON.parse(raw) as { focus: boolean; reading: string };
  if (state.reading !== "function") {
    return "parity-probe is loaded without __parityReadingView; reload the plugin";
  }
  if (!state.focus) {
    return (
      "the window is not focused, so reading mode will render nothing. Run:\n" +
      "  obsidian dev:cdp method=Emulation.setFocusEmulationEnabled params='{\"enabled\":true}'"
    );
  }
  return undefined;
}

/**
 * The same projections from a REAL Reading View, one document per call.
 *
 * Not batched, unlike `askDom`: each document is written to the vault, opened in a leaf and
 * torn down, so the cost is dominated by the view lifecycle rather than by the eval
 * round-trip. Batching would only hide which document hung.
 */
export function askReadingView(
  documents: readonly string[],
): Array<DomFacts & { sections?: number; error?: string }> {
  const problem = readingViewReady();
  if (problem !== undefined) throw new Error(problem);

  const out: Array<DomFacts & { sections?: number; error?: string }> = [];
  for (const text of documents) {
    const encoded = JSON.stringify(
      Buffer.from(text, "utf8").toString("base64"),
    );
    evaluate(
      `window.__rv='pending';(async()=>{try{` +
        `const md=new TextDecoder().decode(Uint8Array.from(atob(${encoded}),c=>c.charCodeAt(0)));` +
        `window.__rv=JSON.stringify(await window.__parityReadingView(md))}` +
        `catch(e){window.__rv=JSON.stringify({error:String(e&&e.message||e).slice(0,200)})}})()`,
    );
    let raw = "pending";
    for (let attempt = 0; attempt < 240 && raw === "pending"; attempt++) {
      raw = evaluate("window.__rv");
    }
    if (raw === "pending") throw new Error("reading view did not finish");
    out.push(JSON.parse(raw) as DomFacts & { sections?: number });
  }
  return out;
}

export function askDom(documents: readonly string[]): DomFacts[] {
  const problem = probeStatus();
  if (problem !== undefined) throw new Error(problem);

  // Batched, because one eval carrying every document overruns the argument and the call
  // comes back EMPTY -- 663 base64 documents in a single stash returned nothing and read as
  // "Obsidian found nothing", the silent failure mode this file's own docstring warns about.
  // Forty keeps the argument small while still paying the per-call cost only sixteen times
  // over the whole golden.
  const BATCH = 40;
  if (documents.length > BATCH) {
    const out: DomFacts[] = [];
    for (let at = 0; at < documents.length; at += BATCH) {
      out.push(...askBatch(documents.slice(at, at + BATCH)));
    }
    return out;
  }
  return askBatch(documents);
}

function askBatch(documents: readonly string[]): DomFacts[] {
  const encoded = JSON.stringify(
    documents.map((text) => Buffer.from(text, "utf8").toString("base64")),
  );
  evaluate(
    `window.__dom='pending';(async()=>{const qs=${encoded};const out=[];` +
      `for(const q of qs){const md=new TextDecoder().decode(Uint8Array.from(atob(q),c=>c.charCodeAt(0)));` +
      `out.push(await window.__parityProbe(md))}` +
      `window.__dom=JSON.stringify(out)})()`,
  );
  let raw = "pending";
  for (let attempt = 0; attempt < 240 && raw === "pending"; attempt++) {
    raw = evaluate("window.__dom");
  }
  if (raw === "pending") throw new Error("Obsidian did not finish rendering");
  return JSON.parse(raw) as DomFacts[];
}
