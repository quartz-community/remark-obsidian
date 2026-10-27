/**
 * Does the DETACHED render agree with a REAL Reading View?
 *
 *     obsidian dev:cdp method=Emulation.setFocusEmulationEnabled params='{"enabled":true}'
 *     npx tsx --conditions=development test/parity/proxy-agrees.mts [count]
 *
 * The goldens are captured through `MarkdownRenderer.render()` detached, which is a PROXY for
 * the view a reader actually sees. `oracle.e2e.ts` cross-checks the real one for the SEED
 * LAYER only, because the full sweep costs seven minutes against eighty seconds -- so a new
 * proxy divergence outside that layer has never been caught on an ordinary recording, and
 * these notes record one golden that pinned detached-renderer behaviour Obsidian does not
 * produce, which defeated several attempts to find a parsing rule because there was none.
 *
 * This measures the question directly, per document, at whatever sample size is asked for.
 * It needs CDP focus emulation first: reading mode renders off `requestAnimationFrame`, which
 * Chromium starves for an unfocused window, so without it every capture is empty. That is
 * checked rather than assumed, because an empty capture reads as "Obsidian renders nothing".
 *
 * A MEASUREMENT, not a gate. It needs Obsidian running with this vault open and a CDP
 * command issued, which CI does not have -- the same reason `referee.mts` is not gated.
 */
import fs from "node:fs";
import path from "node:path";

import { askDom, askReadingView } from "./ask-dom.js";
import type { GoldenCase } from "./types.js";

const golden = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, "goldens/obsidian.json"),
    "utf8",
  ),
) as { cases: Record<string, GoldenCase> };

const wanted = Number(process.argv[2] ?? "40");
const all = Object.values(golden.cases).filter(
  (entry) => entry.triage === "match",
);
// Strided rather than the first N, so the sample is not all one layer -- the corpus is
// ordered by layer and the first forty cases are all seeds, which is exactly the population
// the existing cross-check already covers.
const stride = Math.max(1, Math.floor(all.length / wanted));
const sample = all.filter((_, index) => index % stride === 0).slice(0, wanted);

console.log(
  `  ${all.length} match cases, sampling ${sample.length} at stride ${stride}`,
);

const markdowns = sample.map((entry) => entry.markdown);
const detached = askDom(markdowns);
const reading = askReadingView(markdowns);

const KEYS = ["highlights", "emphasis", "strike", "code", "text"] as const;

/**
 * The block-separator convention, which is a CAPTURE artifact and not a parse difference.
 *
 * A real Reading View appends block `div`s with no whitespace between them, so its
 * `textContent` runs them together; the detached render's markup carries newlines, which
 * collapse to a space. Measured here first and already recorded in the parity README, where
 * it is the reason a Reading-View-corrected `text` is only commensurable for a document that
 * reduces to ONE block.
 *
 *     detached "[foo]: /url [foo]"    reading "[foo]: /url[foo]"
 *     detached "text⟨fn⟩ Footnotes"   reading "text⟨fn⟩Footnotes"
 *
 * Removing ALL whitespace before comparing is deliberately blunt: it also hides a genuine
 * whitespace divergence inside a block, which is a real cost. The alternative is worse --
 * leaving it in makes every multi-block document differ and buries the question this script
 * exists to answer, which is whether the two renderers PARSE the same. Both counts are
 * reported so the blunt one never stands alone.
 */
const squashed = (value: unknown): string =>
  JSON.stringify(value).replace(/\s+/gu, "");
let agree = 0;
let separatorOnly = 0;
const differ: string[] = [];
const failed: string[] = [];

for (const [index, entry] of sample.entries()) {
  const a = detached[index]!;
  const b = reading[index]!;
  if (b.error !== undefined) {
    failed.push(`${entry.id}: ${b.error}`);
    continue;
  }
  const exact = KEYS.filter(
    (key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]),
  );
  const mismatched = KEYS.filter(
    (key) => squashed(a[key]) !== squashed(b[key]),
  );
  if (exact.length > 0 && mismatched.length === 0) separatorOnly++;
  if (
    mismatched.length === 0 &&
    JSON.stringify(a.math.map((m) => m.display)) ===
      JSON.stringify(b.math.map((m) => m.display))
  ) {
    agree++;
    continue;
  }
  differ.push(
    `${entry.id}  [${mismatched.join(",")}]\n` +
      `      md       ${JSON.stringify(entry.markdown).slice(0, 72)}\n` +
      mismatched
        .map(
          (key) =>
            `      ${key} detached=${JSON.stringify(a[key]).slice(0, 60)}\n` +
            `      ${key} reading =${JSON.stringify(b[key]).slice(0, 60)}`,
        )
        .join("\n"),
  );
}

console.log(`  agree ${agree} / ${sample.length}`);
console.log(
  `  of those, ${separatorOnly} agreed only after the block separator was normalised`,
);
if (failed.length > 0) console.log(`  failed to render ${failed.length}`);
for (const row of failed.slice(0, 5)) console.log(`      ${row}`);
for (const row of differ.slice(0, 12)) console.log(`    ${row}`);
