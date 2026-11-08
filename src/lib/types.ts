import type { Data, Literal, Parent, RootContent } from "mdast";
import type { Point, Position } from "unist";

export interface Wikilink extends Literal {
  type: "wikilink";
  value: string;
  embedded: boolean;
  path: string;
  heading: string;
  alias: string;
}

export interface Highlight extends Parent {
  type: "highlight";
}

/**
 * A `%%` comment. `value` is the body as written; `children` is that same body
 * parsed, when the `parseComments` option is on.
 *
 * Both, rather than one or the other. `value` is what the serialiser writes
 * back, so it stays the source of truth for round-tripping -- and a comment is
 * the one construct whose body Obsidian *indexes without rendering*, so a
 * reference written inside one is live to `metadataCache` while nothing in the
 * document shows it. A consumer that has to find such a reference, and place an
 * edit on it, needs real nodes with real positions rather than a string it
 * would have to re-scan.
 *
 * The children are block content for a comment that stands alone and phrasing
 * for one inside a paragraph, matching the position the comment itself holds --
 * a `comment` is registered in both content maps.
 */
export interface Comment extends Literal {
  type: "comment";
  children?: RootContent[];
}

export interface Tag extends Literal {
  type: "tag";
}

/**
 * Obsidian's `^[body]`. `footnote` is the historical mdast type and the one
 * `remark-footnotes` emits, which is what Obsidian parses with; `@types/mdast` v4
 * dropped it when GFM footnotes landed, so it is declared here.
 */
export interface InlineFootnote extends Parent {
  type: "footnote";
}

/**
 * `> [!type] Title`. `collapsed` is `null` when no fold marker is present, `true`
 * for `-`, `false` for `+`. `title` is as written and may be empty; Obsidian then
 * displays the capitalised type.
 */
export interface CalloutTitle extends Parent {
  type: "calloutTitle";
}

/**
 * Where a callout's marker and title line sit. Offsets count as every position does: a leading
 * byte order mark is left out, as Obsidian's cache leaves it out.
 */
export interface CalloutData extends Data {
  /** The marker as written, `[!type]` and its fold character. */
  marker?: Position;
  /** Where the marker's line ends. A title and any block on that line lie before it. */
  lineEnd?: Point;
}

export interface Callout extends Parent {
  type: "callout";
  calloutType: string;
  title: string;
  collapsed: boolean | null;
  data?: CalloutData;
}

declare module "mdast" {
  interface ListItemData {
    taskChar?: string;
  }

  interface FootnoteReferenceData {
    /** `true` on a reference `inertFootnoteRefs` kept inside an inline footnote: it refers to nothing. */
    inert?: true;
  }

  interface LinkReferenceData {
    /** `false` on a reference `keepUndefinedReferences` kept: this parse found no definition. */
    defined?: false;
  }

  interface ImageReferenceData {
    /** `false` on a reference `keepUndefinedReferences` kept: this parse found no definition. */
    defined?: false;
  }

  interface RootContentMap {
    wikilink: Wikilink;
    highlight: Highlight;
    comment: Comment;
    tag: Tag;
    footnote: InlineFootnote;
    callout: Callout;
    calloutTitle: CalloutTitle;
  }

  interface RootData {
    /**
     * Characters consumed by containers on each line, keyed by one-based line
     * number -- `remark-parse@8`'s `offset` table, which Obsidian's parser
     * still keeps.
     *
     * A line no container owns is absent rather than zero, as it was there.
     * Only present when the `lineOffsets` option is on.
     */
    lineOffsets?: Record<number, number>;
    /**
     * Whether a top-level link definition would read differently with more lines after the end
     * of this text. Only present when the `readsPastEnd` option is on, under `legacy`.
     */
    readsPastEnd?: boolean;
  }

  interface PhrasingContentMap {
    wikilink: Wikilink;
    highlight: Highlight;
    comment: Comment;
    tag: Tag;
    footnote: InlineFootnote;
  }
}

declare module "micromark-util-types" {
  interface TokenTypeMap {
    wikilink: "wikilink";
    wikilinkMarker: "wikilinkMarker";
    wikilinkEmbedMarker: "wikilinkEmbedMarker";
    wikilinkPath: "wikilinkPath";
    wikilinkHeadingMarker: "wikilinkHeadingMarker";
    wikilinkHeading: "wikilinkHeading";
    wikilinkAliasMarker: "wikilinkAliasMarker";
    wikilinkAlias: "wikilinkAlias";
    wikilinkCloserCheck: "wikilinkCloserCheck";
    highlight: "highlight";
    highlightMarker: "highlightMarker";
    highlightContent: "highlightContent";
    highlightSequence: "highlightSequence";
    highlightSequenceTemporary: "highlightSequenceTemporary";
    highlightText: "highlightText";
    comment: "comment";
    commentMarker: "commentMarker";
    commentContent: "commentContent";
    tag: "tag";
    tagMarker: "tagMarker";
    tagContent: "tagContent";
    inlineFootnote: "inlineFootnote";
    inlineFootnoteMarker: "inlineFootnoteMarker";
    inlineFootnoteContent: "inlineFootnoteContent";
    legacyQuotedCloserAhead: "legacyQuotedCloserAhead";
    legacyChunkScan: "legacyChunkScan";
    legacyBacktickScan: "legacyBacktickScan";
  }
}
