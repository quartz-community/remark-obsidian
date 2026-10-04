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
        node.path = this.sliceSerialize(token)
          .replace(/\\([#\[\]])/g, "$1")
          .trim();
      },
      wikilinkHeading(token) {
        const node = this.stack[this.stack.length - 1] as any;
        node.heading = this.sliceSerialize(token)
          .replace(/\\([#\[\]])/g, "$1")
          .trim();
      },
      wikilinkAlias(token) {
        const node = this.stack[this.stack.length - 1] as any;
        node.alias = this.sliceSerialize(token);
      },
    },
    exit: {
      wikilink(token) {
        const node = this.stack[this.stack.length - 1] as any;
        const written = node.path;

        // A trailing backslash is not part of the target: Obsidian resolves
        // `[[target\]]` to `target` while still displaying the backslash. The
        // two therefore have to be carried separately — `path` is what a
        // consumer resolves, `value` is what it should render.
        if (node.path.endsWith("\\")) node.path = node.path.slice(0, -1);
        if (node.heading.endsWith("\\")) {
          node.heading = node.heading.slice(0, -1);
        }

        node.value = node.embedded
          ? node.path
          : node.alias || [written, node.heading].filter(Boolean).join(" > ");
        this.exit(token);
      },
    },
  };
}
