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

declare module "mdast" {
  interface ListItemData {
    taskChar?: string;
  }

  interface RootContentMap {
    wikilink: Wikilink;
    highlight: Highlight;
    comment: Comment;
    tag: Tag;
  }

  interface PhrasingContentMap {
    wikilink: Wikilink;
    highlight: Highlight;
    comment: Comment;
    tag: Tag;
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
    comment: "comment";
    commentMarker: "commentMarker";
    commentContent: "commentContent";
    tag: "tag";
    tagMarker: "tagMarker";
    tagContent: "tagContent";
  }
}
