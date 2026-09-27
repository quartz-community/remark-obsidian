/**
 * Shared shape for the two sides of the comparison. The Obsidian side is built
 * inside the renderer against a real DOM; our side is built from mdast. Keeping
 * one interface is what makes them comparable.
 */

/**
 * `tex` only exists when the recording Obsidian emits `data-latex` on `mjx-math`,
 * which starts at 1.14. On 1.13.x it is unrecoverable (MathJax overwrites the
 * source, the internal renderer bypasses the `renderMath` export, and
 * `MathJax.startup.document.math` is empty), so `GoldenFile.oracle.mathTex`
 * records the capability and the comparison drops `tex` when it is false.
 */
export interface MathItem {
  readonly display: boolean;
  readonly tex?: string;
}

/** Obsidian's own block-level parse, sliced from the source by its byte offsets. */
export interface SectionItem {
  readonly type: string;
  readonly text: string;
}

/** Identity only; no `alias`, since anchor text is ofm's job and belongs in `text`. */
export interface LinkItem {
  readonly path: string;
  readonly heading: string;
  readonly embedded: boolean;
}

export interface TaskItem {
  readonly char: string;
  readonly checked: boolean;
}

export interface Projections {
  readonly text: string;
  readonly sections: readonly SectionItem[];
  readonly math: readonly MathItem[];
  readonly links: readonly LinkItem[];
  readonly tags: readonly string[];
  readonly headings: readonly string[];
  readonly tasks: readonly TaskItem[];
  readonly highlights: readonly string[];
}

/** Obsidian's `metadataCache` view of a file, an oracle independent of the DOM. */
export interface MetaProjections {
  readonly headings: readonly string[];
  readonly links: readonly string[];
  readonly embeds: readonly string[];
  readonly tags: readonly string[];
  readonly footnotes: readonly string[];
}

export type TriageState =
  | "match"
  | "replicate"
  | "report-upstream"
  | "out-of-scope"
  | "accepted"
  | "unreviewed";

export interface GoldenCase {
  readonly id: string;
  readonly layer: string;
  readonly category: string;
  readonly markdown: string;
  readonly obsidian: {
    readonly html: string;
    readonly projections: Projections;
    readonly meta: MetaProjections;
  };
  triage: TriageState;
  note?: string;
}

/** What the recording Obsidian was able to tell us, so the gate can scale its claims. */
export interface OracleCapabilities {
  readonly mathTex: boolean;
}

export interface GoldenFile {
  readonly obsidian: { readonly app: string; readonly installer: string };
  readonly oracle: OracleCapabilities;
  readonly chain: typeof import("./chain.js").CHAIN_MANIFEST;
  readonly recordedAt: string;
  readonly cases: Record<string, GoldenCase>;
}

export const PROJECTION_KEYS = [
  "text",
  "sections",
  "math",
  "links",
  "tags",
  "headings",
  "tasks",
  "highlights",
] as const satisfies ReadonlyArray<keyof Projections>;
