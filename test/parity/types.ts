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
  /**
   * A `#` was written with nothing after it, as in `[[page#]]`.
   *
   * `metadataCache` indexes the target as the author wrote it, so that one reads
   * `page#` while the rendered link reads `page`. The flag is needed because an
   * empty fragment and an absent one give the same `heading`.
   */
  readonly emptyFragment?: boolean;
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
  /**
   * `strong`/`em` spans as flat `type:text` entries in document order — what
   * separates `***a**` from `*<strong>a</strong>`, which differ only in which side
   * the leftover delimiter lands on. Flat rather than nested because our side is
   * mdast and Obsidian's is the DOM: `wikilink` and `tag` have no hast handler, so
   * a nested projection would diverge on wrapper context alone.
   */
  readonly emphasis: readonly string[];
}

/** Obsidian's `metadataCache` view of a file, an oracle independent of the DOM. */
export interface MetaProjections {
  readonly headings: readonly string[];
  readonly links: readonly string[];
  readonly embeds: readonly string[];
  readonly tags: readonly string[];
  readonly footnotes: readonly string[];
}

/**
 * The same parser's answer about a string rather than a file, with positions.
 *
 * Recorded from the undocumented `metadataCache.computeMetadataAsync`, so it is
 * optional: a build without it records nothing rather than an empty answer that
 * would read as "Obsidian found none of these".
 */
export interface ComputedMeta {
  readonly footnotes: readonly string[];
  readonly footnoteRefs: readonly string[];
  readonly headings: readonly string[];
  readonly sections: readonly string[];
  /**
   * The eight dimensions the answer also carries, recorded ahead of being
   * compared. Optional because our own projection does not produce them yet,
   * and recording is what makes comparing them a day's work rather than a
   * recording run plus a day: the answer is one call either way.
   *
   * `blocks` is the authoritative block-identifier index, which replaces an
   * inferred rule about which characters an identifier accepts.
   * `frontmatterLinks` is a construct class no oracle here has ever looked at.
   */
  readonly links?: readonly string[];
  /**
   * Link *reference* definitions, which no oracle here has ever looked at.
   *
   * `[foo]: /url` is a construct class the rendered DOM cannot show -- a
   * definition renders as nothing -- and one that neither `links` nor `sections`
   * distinguishes from a paragraph. Eight recorded cases turn on how a definition
   * or a reference to one is read, so this is the one unused public field with
   * failing cases waiting for it.
   */
  readonly referenceLinks?: readonly string[];
  readonly embeds?: readonly string[];
  readonly tags?: readonly string[];
  readonly listItems?: readonly string[];
  readonly blocks?: readonly string[];
  readonly frontmatter?: string;
  readonly frontmatterPosition?: string;
  readonly frontmatterLinks?: readonly string[];
}

export type TriageState =
  | "match"
  | "replicate"
  | "report-upstream"
  | "upstream-undecided"
  | "out-of-scope"
  | "accepted"
  | "unreviewed";

/**
 * Our own output, pinned for cases we have deliberately chosen to diverge on.
 * Without this the exception list records *why* we diverge but not *how*, so a
 * deliberate divergence could silently drift into a different wrong answer.
 */
export interface PinnedOurs {
  readonly profile: string;
  readonly projections: Projections;
}

export interface GoldenCase {
  readonly id: string;
  readonly layer: string;
  readonly category: string;
  readonly markdown: string;
  readonly obsidian: {
    readonly html: string;
    readonly projections: Projections;
    readonly meta: MetaProjections;
    readonly compute?: ComputedMeta;
  };
  triage: TriageState;
  note?: string;
  ours?: PinnedOurs;
}

/** Triage states whose divergence is a decision, so our side gets pinned. */
export const PINNED_STATES: ReadonlySet<TriageState> = new Set([
  "report-upstream",
  "upstream-undecided",
  "accepted",
]);

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
  "emphasis",
] as const satisfies ReadonlyArray<keyof Projections>;
