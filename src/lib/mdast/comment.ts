import type { Extension } from "mdast-util-from-markdown";
import type { Comment } from "../types.js";

const MARKER_LENGTH = 2;

export function commentFromMarkdown(): Extension {
  return {
    enter: {
      comment(token) {
        this.enter({ type: "comment", value: "" }, token);
      },
    },
    exit: {
      // Content is emitted as one `commentContent` token per line, separated by
      // `lineEnding` tokens. Those separators cannot be captured here without
      // overriding the core `lineEnding` handler, so the value is recovered
      // from the whole comment span instead.
      comment(token) {
        const node = this.stack[this.stack.length - 1] as Comment;
        const body = this.sliceSerialize(token).slice(MARKER_LENGTH);
        node.value = body.endsWith("%%") ? body.slice(0, -MARKER_LENGTH) : body;
        this.exit(token);
      },
    },
  };
}
