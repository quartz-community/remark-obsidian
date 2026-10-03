/**
 * Asserts math *content*, which the main gate cannot.
 *
 * MathJax overwrites the LaTeX source on 1.13 and earlier, so `goldens/obsidian.json`
 * records `oracle.mathTex: false` and the comparison drops `tex` from both sides.
 * That left seven wrong delimitations sitting behind a green gate, visible only in
 * the `display` flag they happened to agree on.
 *
 * 1.14 keeps the source in `data-latex`. It is not yet `latest`, so a full golden
 * recorded from it would make the weekly drift job fire — hence this separate,
 * separately-stamped file holding only the math projection. Re-record it with:
 *
 *   OBSIDIAN_APP_PATH=<1.14 asar> PARITY_GOLDEN_PATH=/tmp/g.json npm run parity:record
 *
 * then regenerate this file from that recording.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { projectOurs } from "./normalize.js";
import type { MathItem } from "./types.js";

interface MathCase {
  readonly markdown: string;
  readonly math: readonly MathItem[];
  readonly status: "match" | "divergent";
  readonly note?: string;
}

interface MathContentFile {
  readonly obsidian: { readonly app: string; readonly installer: string };
  readonly recordedAt: string;
  readonly cases: Record<string, MathCase>;
}

const golden = JSON.parse(
  readFileSync(new URL("./goldens/math-content.json", import.meta.url), "utf8"),
) as MathContentFile;

const entries = Object.entries(golden.cases);
const ours = (markdown: string): readonly MathItem[] =>
  projectOurs(markdown, "quartz-default").math;
const agrees = (c: MathCase): boolean =>
  JSON.stringify(ours(c.markdown)) === JSON.stringify(c.math);

describe(`math content against Obsidian ${golden.obsidian.app}`, () => {
  it("was recorded from a build that exposes the LaTeX source", () => {
    const [major, minor] = golden.obsidian.app.split(".").map(Number);
    expect((major ?? 0) * 1000 + (minor ?? 0)).toBeGreaterThanOrEqual(1014);
  });

  it("covers every math case in the corpus", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [id, c] of entries) {
      expect(c.math.length, `${id} has no math on either side`).toBeGreaterThan(
        0,
      );
    }
  });

  const matching = entries.filter(([, c]) => c.status === "match");
  it.each(matching)("reproduces %s", (id, c) => {
    expect(ours(c.markdown), `${id}: ${JSON.stringify(c.markdown)}`).toEqual(
      c.math,
    );
  });

  /**
   * The same policy the main gate applies to `replicate`: a known divergence that
   * starts agreeing must fail, or the backlog rots silently and the note goes stale.
   */
  const divergent = entries.filter(([, c]) => c.status === "divergent");
  it.each(divergent)("still diverges on %s, as recorded", (id, c) => {
    expect(
      c.note,
      `${id} is divergent but carries no explanation`,
    ).toBeTruthy();
    if (agrees(c)) {
      throw new Error(
        `${id} now matches Obsidian. Re-triage it to "match" in goldens/math-content.json.`,
      );
    }
  });
});
