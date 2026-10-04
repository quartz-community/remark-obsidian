import { PROFILES, type ProfileName } from "./chain.js";
import { metaOurs, projectOurs } from "./normalize.js";
import { applyTextTransform, parseOurs } from "./chain.js";
import {
  STRUCTURE_KEYS,
  structureFromHtml,
  structureFromMdast,
  type Structure,
} from "./structure.js";
import {
  PINNED_STATES,
  PROJECTION_KEYS,
  type GoldenCase,
  type MetaProjections,
  type Projections,
} from "./types.js";

/** `metadataCache` fields are namespaced, so a report says which oracle spoke. */
export type DivergenceKey =
  | keyof Projections
  | `meta.${keyof MetaProjections}`
  | `html.${keyof Structure}`;

export interface Divergence {
  readonly key: DivergenceKey;
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
  /** Our parser threw. Never an acceptable divergence, whatever the triage says. */
  readonly crash?: string;
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

/**
 * Drop the zero-length `text`/`element` sections Obsidian appends for its rendered
 * footnote list. They carry no source span, so no source-derived projection can
 * produce them, and leaving them in reports a divergence for every document that
 * resolves a footnote reference. Only trailing empty ones go: a `text` section with
 * real source behind it is a genuine block.
 */
function alignSections(projections: Projections): Projections {
  const sections = [...projections.sections];
  while (sections.length > 0) {
    const last = sections[sections.length - 1]!;
    const rendered =
      (last.type === "text" || last.type === "element") && last.text === "";
    if (!rendered) break;
    sections.pop();
  }
  return sections.length === projections.sections.length
    ? projections
    : { ...projections, sections };
}

const META_KEYS = [
  "headings",
  "links",
  "embeds",
  "tags",
  "footnotes",
] as const satisfies ReadonlyArray<keyof MetaProjections>;

/**
 * `metadataCache` is a second oracle, built by Obsidian from its own parse
 * rather than read off the rendered DOM, so it sees what the renderer discards
 * -- a link inside an unreferenced footnote definition, a heading the view
 * never paints. It was recorded into every golden from the start and compared
 * by nothing.
 */
function diffMeta(
  obsidian: MetaProjections,
  ours: MetaProjections,
): Divergence[] {
  const out: Divergence[] = [];
  for (const key of META_KEYS) {
    const a = JSON.stringify(obsidian[key] ?? []);
    const b = JSON.stringify(ours[key] ?? []);
    if (a !== b) {
      out.push({
        key: `meta.${key}`,
        obsidian: obsidian[key],
        ours: ours[key],
      });
    }
  }
  return out;
}

/**
 * Block attributes no projection reads: a table's alignment, a fence's
 * language, a list's starting number. Obsidian's side is recovered from the
 * HTML already stored in every golden, so this needs no re-recording.
 */
function diffStructure(obsidian: Structure, ours: Structure): Divergence[] {
  const out: Divergence[] = [];
  for (const key of STRUCTURE_KEYS) {
    const a = JSON.stringify(obsidian[key]);
    const b = JSON.stringify(ours[key]);
    if (a !== b) {
      out.push({
        key: `html.${key}`,
        obsidian: obsidian[key],
        ours: ours[key],
      });
    }
  }
  return out;
}

function diffProjections(
  obsidian: Projections,
  ours: Projections,
  mathTex: boolean,
): Divergence[] {
  const left = alignSections(alignMath(obsidian, mathTex));
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
      const tree = parseOurs(golden.markdown, profile);
      if (golden.obsidian.meta) {
        divergences = divergences.concat(
          diffMeta(
            golden.obsidian.meta,
            metaOurs(tree, applyTextTransform(golden.markdown)),
          ),
        );
      }
      if (typeof golden.obsidian.html === "string") {
        divergences = divergences.concat(
          diffStructure(
            structureFromHtml(golden.obsidian.html),
            structureFromMdast(tree),
          ),
        );
      }
    } catch (error) {
      return {
        id: golden.id,
        category: golden.category,
        triage: golden.triage,
        profile,
        matched: false,
        divergences: [],
        crash: error instanceof Error ? error.message : String(error),
      };
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
 * failing. `report-upstream`, `upstream-undecided`, `out-of-scope` and `accepted`
 * are likewise expected to diverge. Only `unreviewed` fails, to force triage of
 * newly recorded cases.
 */
export function isGateFailure(result: CaseResult): boolean {
  if (result.crash) return true;
  if (result.triage === "unreviewed") return true;
  return !result.matched && result.triage === "match";
}

/** A `replicate` case that now matches: the backlog shrank and needs re-triage. */
export function isStaleTriage(result: CaseResult): boolean {
  return result.matched && result.triage === "replicate";
}

export interface PinDrift {
  readonly id: string;
  readonly triage: GoldenCase["triage"];
  readonly key: keyof Projections;
  readonly pinned: unknown;
  readonly now: unknown;
}

/**
 * For a deliberate divergence, check our own output still matches what was pinned.
 * `isGateFailure` only guards `match` cases, so without this the exception ledger
 * documents intent while leaving the actual behaviour unprotected.
 */
export function pinDrift(golden: GoldenCase, mathTex: boolean): PinDrift[] {
  if (!golden.ours || !PINNED_STATES.has(golden.triage)) return [];
  const profile = (
    PROFILE_NAMES.includes(golden.ours.profile as ProfileName)
      ? golden.ours.profile
      : PROFILE_NAMES[0]
  ) as ProfileName;

  let current: Projections;
  try {
    current = projectOurs(golden.markdown, profile);
  } catch (error) {
    return [
      {
        id: golden.id,
        triage: golden.triage,
        key: "text",
        pinned: golden.ours.projections.text,
        now: `THREW: ${error instanceof Error ? error.message : String(error)}`,
      },
    ];
  }

  const pinned = alignMath(golden.ours.projections, mathTex);
  const now = alignMath(current, mathTex);
  const out: PinDrift[] = [];
  for (const key of PROJECTION_KEYS) {
    if (JSON.stringify(pinned[key]) !== JSON.stringify(now[key])) {
      out.push({
        id: golden.id,
        triage: golden.triage,
        key,
        pinned: pinned[key],
        now: now[key],
      });
    }
  }
  return out;
}

export function formatPinDrift(d: PinDrift): string {
  return [
    `\u2717 ${d.id} [${d.triage}] ${d.key}`,
    `      pinned: ${JSON.stringify(d.pinned)}`,
    `      now:    ${JSON.stringify(d.now)}`,
  ].join("\n");
}

export function formatResult(result: CaseResult): string {
  if (result.crash) {
    return `\u2717 ${result.id} [${result.profile}] CRASHED: ${result.crash}`;
  }
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
