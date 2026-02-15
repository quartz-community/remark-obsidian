import type { Extension } from "mdast-util-from-markdown";

export function commentFromMarkdown(): Extension {
  return {
    enter: {
      comment(token) {
        this.enter({ type: "comment", value: "" }, token);
      },
    },
    exit: {
      commentContent(token) {
        const node = this.stack[this.stack.length - 1] as any;
        node.value = this.sliceSerialize(token);
      },
      comment(token) {
        this.exit(token);
      },
    },
  };
}
