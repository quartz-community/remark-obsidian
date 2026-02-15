import type { Extension } from "mdast-util-from-markdown";

export function wikilinkFromMarkdown(): Extension {
  return {
    enter: {
      wikilink(token) {
        this.enter(
          {
            type: "wikilink",
            value: "",
            embedded: false,
            path: "",
            heading: "",
            alias: "",
          },
          token,
        );
      },
      wikilinkEmbedMarker() {
        const node = this.stack[this.stack.length - 1] as any;
        node.embedded = true;
      },
      wikilinkPath(token) {
        const node = this.stack[this.stack.length - 1] as any;
        node.path = this.sliceSerialize(token);
      },
      wikilinkHeading(token) {
        const node = this.stack[this.stack.length - 1] as any;
        node.heading = this.sliceSerialize(token);
      },
      wikilinkAlias(token) {
        const node = this.stack[this.stack.length - 1] as any;
        node.alias = this.sliceSerialize(token);
      },
    },
    exit: {
      wikilink(token) {
        this.exit(token);
      },
    },
  };
}
