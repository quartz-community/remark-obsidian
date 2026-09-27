import { PROFILES, type ProfileName } from "./chain.js";
import { projectOurs } from "./normalize.js";
import { PROJECTION_KEYS, type GoldenCase, type Projections } from "./types.js";

export interface Divergence {
  readonly key: keyof Projections;
  readonly obsidian: unknown;
  readonly ours: unknown;
}

export interface CaseResult {
  readonly id: string;
  readonly category: string;
  readonly triage: GoldenCase["triage"];
  /** Profile whose output matched, or the closest one when nothing matched. */
  readonly profile: ProfileName;
  readonly matched: boolean;
  readonly divergences: readonly Divergence[];
}

const PROFILE_NAMES = Object.keys(PROFILES) as ProfileName[];

/** Drop `tex` from both sides when the recording Obsidian could not supply it. */
function alignMath(projections: Projections, mathTex: boolean): Projections {
  if (mathTex) return projections;
  return {
    ...projections,
    math: projections.math.map(({ display }) => ({ display })),
  };
}

function diffProjections(
  obsidian: Projections,
  ours: Projections,
  mathTex: boolean,
): Divergence[] {
  const left = alignMath(obsidian, mathTex);
  const right = alignMath(ours, mathTex);
  const out: Divergence[] = [];
  for (const key of PROJECTION_KEYS) {
    const a = JSON.stringify(left[key]);
    const b = JSON.stringify(right[key]);
    if (a !== b) out.push({ key, obsidian: left[key], ours: right[key] });
  }
  return out;
}

/**
 * Compare a golden against every profile. A case passes if any profile reproduces
 * Obsidian, which lets the report distinguish "remark-obsidian cannot do this"
 * from "Quartz's default config happens to disable it".
 */
export function compareCase(golden: GoldenCase, mathTex = false): CaseResult {
  let best: { profile: ProfileName; divergences: Divergence[] } | undefined;

  for (const profile of PROFILE_NAMES) {
    let divergences: Divergence[];
    try {
      const ours = projectOurs(golden.markdown, profile);
      divergences = diffProjections(golden.obsidian.projections, ours, mathTex);
    } catch (error) {
      divergences = [
        {
          key: "text",
          obsidian: golden.obsidian.projections.text,
          ours: `THREW: ${error instanceof Error ? error.message : String(error)}`,
        },
      ];
    }

    if (divergences.length === 0) {
      return {
        id: golden.id,
        category: golden.category,
        triage: golden.triage,
        profile,
        matched: true,
        divergences: [],
      };
    }
    if (!best || divergences.length < best.divergences.length) {
      best = { profile, divergences };
    }
  }

  const resolved = best ?? { profile: PROFILE_NAMES[0]!, divergences: [] };
  return {
    id: golden.id,
    category: golden.category,
    triage: golden.triage,
    profile: resolved.profile,
    matched: false,
    divergences: resolved.divergences,
  };
}

/**
 * A regression gate, not a perfection gate. `match` is the contract: those cases
 * must keep matching. `replicate` is the known backlog, so it may diverge without
 * failing, and `unreviewed` fails to force triage of newly recorded cases.
 */
export function isGateFailure(result: CaseResult): boolean {
  if (result.triage === "unreviewed") return true;
  return !result.matched && result.triage === "match";
}

/** A `replicate` case that now matches: the backlog shrank and needs re-triage. */
export function isStaleTriage(result: CaseResult): boolean {
  return result.matched && result.triage === "replicate";
}

export function formatResult(result: CaseResult): string {
  if (result.matched) return `\u2713 ${result.id} [${result.profile}]`;
  const lines = [
    `\u2717 ${result.id} [${result.profile}] triage=${result.triage}`,
  ];
  for (const d of result.divergences) {
    lines.push(`    ${d.key}`);
    lines.push(`      obsidian: ${JSON.stringify(d.obsidian)}`);
    lines.push(`      ours:     ${JSON.stringify(d.ours)}`);
  }
  return lines.join("\n");
}
