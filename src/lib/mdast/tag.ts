import type { Extension } from "mdast-util-from-markdown";

export function tagFromMarkdown(): Extension {
  return {
    enter: {
      tag(token) {
        this.enter({ type: "tag", value: "" }, token);
      },
      tagContent(token) {
        const node = this.stack[this.stack.length - 1] as any;
        if (node.type === "tag") node.value = this.sliceSerialize(token);
      },
    },
    exit: {
      tag(token) {
        this.exit(token);
      },
    },
  };
}
