import type { Extension } from "mdast-util-from-markdown";

const arrowMap: Record<string, string> = {
  "->": "&rarr;",
  "-->": "&rArr;",
  "=>": "&rArr;",
  "==>": "&rArr;",
  "<-": "&larr;",
  "<--": "&lArr;",
  "<=": "&lArr;",
  "<==": "&lArr;",
};

export function arrowFromMarkdown(): Extension {
  return {
    enter: {
      arrow(token) {
        this.enter({ type: "arrow", value: "" }, token);
      },
    },
    exit: {
      arrow(token) {
        const node = this.stack[this.stack.length - 1] as any;
        const raw = this.sliceSerialize(token);
        node.value = arrowMap[raw] ?? raw;
        this.exit(token);
      },
    },
  };
}
