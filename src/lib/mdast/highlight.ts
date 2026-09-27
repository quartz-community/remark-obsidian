import type { Extension } from "mdast-util-from-markdown";

export function highlightFromMarkdown(): Extension {
  return {
    // Without this, mdast-util-from-markdown drops line endings inside the node, so
    // `==a\nb==` yields "ab". `mdast-util-gfm-strikethrough` declares the same for
    // `delete`.
    canContainEols: ["highlight"],
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
