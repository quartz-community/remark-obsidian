/**
 * Parity gate. Reads committed goldens and never launches Obsidian, so it can run
 * on every pull request while the expensive oracle run stays scheduled.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHAIN_MANIFEST } from "./chain.js";
import {
  compareCase,
  PROFILE_NAMES,
  formatPinDrift,
  formatResult,
  isGateFailure,
  isStaleTriage,
  pinDrift,
  type CaseResult,
} from "./compare.js";
import { buildCorpus } from "./corpus.js";
import type { GoldenCase } from "./types.js";

const GOLDEN_PATH = path.resolve("test/parity/goldens/obsidian.json");

interface GoldenFileShape {
  obsidian: { app: string; installer: string };
  oracle?: { mathTex: boolean };
  chain: unknown;
  recordedAt: string;
  cases: Record<string, GoldenCase>;
}

const goldens: GoldenFileShape | undefined = fs.existsSync(GOLDEN_PATH)
  ? (JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8")) as GoldenFileShape)
  : undefined;

describe.skipIf(!goldens)("Obsidian parity", () => {
  const file = goldens!;
  const cases = Object.values(file.cases);
  const mathTex = file.oracle?.mathTex ?? false;

  it("goldens were recorded against the pinned chain", () => {
    expect(file.chain).toEqual(JSON.parse(JSON.stringify(CHAIN_MANIFEST)));
  });

  /**
   * Ids must be unique, and the failure mode is why this is its own test.
   * `buildCorpus` deduplicates by markdown, so a collision leaves the case
   * count looking right while the recorder -- which keys its output by id --
   * silently overwrites one case with another. A harvest that restarted its
   * numbering cost 174 cases their identity and their triage exactly that way.
   */
  it("gives every corpus case a unique id", () => {
    const ids = buildCorpus().map((c) => c.id);
    const seen = new Set<string>();
    const collided = ids.filter((id) => !seen.add(id) || false);
    expect(collided).toEqual([]);
  });

  it("goldens cover the current corpus", () => {
    const corpusIds = buildCorpus().map((c) => c.id);
    const missing = corpusIds.filter((id) => !(id in file.cases));
    expect(
      missing,
      `re-run \`npm run parity:record\`; missing: ${missing.slice(0, 8)}`,
    ).toEqual([]);
  });

  it("every case is triaged", () => {
    const untriaged = cases
      .filter((c) => c.triage === "unreviewed")
      .map((c) => c.id);
    expect(
      untriaged,
      `${untriaged.length} case(s) need a triage state in goldens/obsidian.json`,
    ).toEqual([]);
  });

  it(`matches Obsidian ${file.obsidian.app} on every case marked match`, () => {
    const results: CaseResult[] = cases.map((c) => compareCase(c, mathTex));

    const failures = results.filter(isGateFailure);
    const matched = results.filter((r) => r.matched).length;
    const byTriage: Record<string, number> = {};
    for (const r of results) byTriage[r.triage] = (byTriage[r.triage] ?? 0) + 1;

    const summary = [
      "",
      `Obsidian ${file.obsidian.app} (installer ${file.obsidian.installer}), recorded ${file.recordedAt}`,
      `matched ${matched}/${results.length}  mathTex=${mathTex}  ${JSON.stringify(byTriage)}`,
    ];
    if (failures.length > 0) summary.push("", ...failures.map(formatResult));

    expect(
      failures.map((f) => f.id),
      summary.join("\n"),
    ).toEqual([]);
  });

  it("masks no case behind the non-shipping profile but the recorded four", () => {
    // `compareCase` returns on the FIRST profile with zero divergences, and
    // `quartz-default` -- the options Quartz actually passes -- is tried first. So a matched
    // case reporting any other profile DIVERGES under the shipping configuration and passes
    // only because a second configuration was tried.
    //
    // That is deliberate: the either-profile rule is what distinguishes "this package cannot
    // do it" from "Quartz's default config disables it". But it masks SILENTLY, and nothing
    // reported the masked set, so a future divergence under the profile Quartz ships would
    // have been invisible behind a green gate. It is a property of iteration order, which is
    // no way to learn where parity stands.
    //
    // All four are one family: `enableCheckbox` is false upstream, so custom task characters
    // are off in Quartz and these cases cannot match there by construction.
    const MASKED = [
      "task/custom-char",
      "task/ordered-custom-status",
      "task/quote-callout-status",
      "task/status-alphabet",
    ];
    const shipping = PROFILE_NAMES[0]!;
    const masked = cases
      .map((c) => compareCase(c, mathTex))
      .filter((r) => r.matched && r.profile !== shipping)
      .map((r) => r.id)
      .sort();
    expect(masked, `shipping profile is ${shipping}`).toEqual(MASKED);
  });

  it("deliberate divergences still produce their pinned output", () => {
    const drift = cases.flatMap((c) => pinDrift(c, mathTex));
    const pinned = cases.filter((c) => c.ours).length;
    expect(
      drift.map((d) => `${d.id}:${d.key}`),
      [
        "",
        `${pinned} deliberate divergence(s) are pinned; ${drift.length} drifted.`,
        "A pinned case changed behaviour. If the change is intended, re-record;",
        "otherwise this is a regression in a case we chose to diverge on.",
        "",
        ...drift.map(formatPinDrift),
      ].join("\n"),
    ).toEqual([]);
  });

  it("has no stale replicate entries that now match", () => {
    const stale = cases
      .map((c) => compareCase(c, mathTex))
      .filter(isStaleTriage)
      .map((r) => r.id);
    expect(
      stale,
      `these now match Obsidian; re-triage them to "match" in goldens/obsidian.json`,
    ).toEqual([]);
  });
});
