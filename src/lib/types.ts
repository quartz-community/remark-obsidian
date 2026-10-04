import type { Literal, Parent } from "mdast";

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

export interface Comment extends Literal {
  type: "comment";
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

export interface Callout extends Parent {
  type: "callout";
  calloutType: string;
  title: string;
  collapsed: boolean | null;
}

declare module "mdast" {
  interface ListItemData {
    taskChar?: string;
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
    legacyChunkScan: "legacyChunkScan";
  }
}
