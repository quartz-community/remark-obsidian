import type { Extension } from "mdast-util-from-markdown";

export function highlightFromMarkdown(): Extension {
  return {
    enter: {
      highlight(token) {
        this.enter({ type: "highlight", children: [] }, token);
      },
    },
    exit: {
      highlightContent(token) {
        const node = this.stack[this.stack.length - 1] as any;
        node.children = [{ type: "text", value: this.sliceSerialize(token) }];
      },
      highlight(token) {
        this.exit(token);
      },
    },
  };
}
