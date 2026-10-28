import type { Options, State, Info } from "mdast-util-to-markdown";
import { defaultHandlers } from "mdast-util-to-markdown";
import type { ListItem, Parents } from "mdast";

export function taskCharToMarkdown(
  options: { readonly legacy?: boolean } = {},
): Options {
  return {
    unsafe: [{ atBreak: true, character: "-", after: "[:|-]" }],
    handlers: {
      listItem(
        node: ListItem,
        parent: Parents | undefined,
        state: State,
        info: Info,
      ) {
        const taskChar =
          (node.data as { taskChar?: string } | undefined)?.taskChar ??
          (typeof node.checked === "boolean"
            ? node.checked
              ? "x"
              : " "
            : null);

        // `legacy`: an item whose definition holds more than one block is written with a 4-column
        // content indent. remark-parse 8 strips an item's content as if its marker were 4 wide,
        // so the definition's later blocks, written at 3 + 4 columns, fell out of it
        // (`1. [^1]: def` / blank / `       x`; about 30 corpus documents).
        const wide =
          options.legacy === true &&
          node.children.some(
            (child) =>
              (child.type as string) === "footnoteDefinition" &&
              (child as { children: unknown[] }).children.length > 1,
          );
        const indent = state.options.listItemIndent;
        if (wide) state.options.listItemIndent = "tab";
        try {
          return writeItem();
        } finally {
          state.options.listItemIndent = indent;
        }

        function writeItem(): string {
          const head = node.children[0];
          // Not only over a paragraph: a label straight after a task box is a definition inside
          // the item, and without the box `- [>] [^b]: x` was written `* [^b]: x`, losing the task
          // (found by the stricter round-trip check, "formatting keeps the tree").
          // Any block, under `legacy`: `- [ ]⇥~~~` is a task holding a code block, and a table
          // too. `strict` builds a task only over a paragraph, as GFM does, so it never asks.
          // And over nothing: remark-parse 8 reads `- [ ] ` as an empty task item, which was
          // written `*` (about 780 seeds of the million-seed census).
          const isTask = taskChar !== null;

          if (!isTask) {
            return defaultHandlers.listItem(node, parent, state, info);
          }

          const checkbox = `[${taskChar}] `;
          const tracker = state.createTracker(info);
          tracker.move(checkbox);

          // Clear `checked` so the default handler does not interfere,
          // then restore it after serialization.
          const savedChecked = node.checked;
          delete node.checked;

          let value = defaultHandlers.listItem(node, parent, state, {
            ...info,
            ...tracker.current(),
          });

          node.checked = savedChecked;

          // An empty item is its marker alone; the box needs the space after it.
          if (head === undefined) return `${value.trimEnd()} ${checkbox}`;

          // Inject checkbox after the bullet marker on the first line.
          value = value.replace(
            /^([*+-]|\d+\.)([\r\n]| {1,3})/,
            (match: string) => match + checkbox,
          );

          return value;
        }
      },
    },
  };
}
