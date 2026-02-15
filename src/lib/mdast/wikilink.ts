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
        node.path = this.sliceSerialize(token).replace(/\\([#\[\]])/g, "$1");
      },
      wikilinkHeading(token) {
        const node = this.stack[this.stack.length - 1] as any;
        node.heading = this.sliceSerialize(token).replace(/\\([#\[\]])/g, "$1");
      },
      wikilinkAlias(token) {
        const node = this.stack[this.stack.length - 1] as any;
        node.alias = this.sliceSerialize(token);
      },
    },
    exit: {
      wikilink(token) {
        const node = this.stack[this.stack.length - 1] as any;
        if (node.alias) {
          if (node.path.endsWith("\\")) node.path = node.path.slice(0, -1);
          if (node.heading.endsWith("\\"))
            node.heading = node.heading.slice(0, -1);
        }
        this.exit(token);
      },
    },
  };
}
