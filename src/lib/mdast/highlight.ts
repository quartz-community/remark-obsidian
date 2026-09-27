import type { Extension } from "mdast-util-from-markdown";

export function highlightFromMarkdown(): Extension {
  return {
    enter: {
      highlight(token) {
        this.enter({ type: "highlight", children: [] } as never, token);
      },
    },
    exit: {
      highlight(token) {
        this.exit(token);
      },
    },
  };
}
