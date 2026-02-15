import { Literal, Parent, Root } from 'mdast';
import { Extension } from 'micromark-util-types';
import { Extension as Extension$1 } from 'mdast-util-from-markdown';

interface Wikilink extends Literal {
    type: "wikilink";
    value: string;
    embedded: boolean;
    path: string;
    heading: string;
    alias: string;
}
interface Highlight extends Parent {
    type: "highlight";
}
interface Comment extends Literal {
    type: "comment";
}
interface Tag extends Literal {
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

declare function wikilinkSyntax(): Extension;

declare function highlightSyntax(): Extension;

declare function commentSyntax(): Extension;

declare function tagSyntax(): Extension;

declare function wikilinkFromMarkdown(): Extension$1;

declare function highlightFromMarkdown(): Extension$1;

declare function commentFromMarkdown(): Extension$1;

declare function tagFromMarkdown(): Extension$1;

declare function customTaskCharTransform(tree: Root): void;

interface RemarkObsidianOptions {
    wikilinks?: boolean;
    highlights?: boolean;
    comments?: boolean;
    tags?: boolean;
    customTaskChars?: boolean;
}
declare function remarkObsidian(userOpts?: RemarkObsidianOptions): undefined | ((tree: Root) => void);

export { type Comment, type Highlight, type RemarkObsidianOptions, type Tag, type Wikilink, commentFromMarkdown, commentSyntax, customTaskCharTransform, remarkObsidian as default, highlightFromMarkdown, highlightSyntax, tagFromMarkdown, tagSyntax, wikilinkFromMarkdown, wikilinkSyntax };
