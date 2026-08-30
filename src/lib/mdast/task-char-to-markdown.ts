import type { Options, State, Info } from "mdast-util-to-markdown";
import { defaultHandlers } from "mdast-util-to-markdown";
import type { ListItem, Parents } from "mdast";

export function taskCharToMarkdown(): Options {
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

        const head = node.children[0];
        const isTask = taskChar !== null && head?.type === "paragraph";

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

        // Inject checkbox after the bullet marker on the first line.
        value = value.replace(
          /^([*+-]|\d+\.)([\r\n]| {1,3})/,
          (match: string) => match + checkbox,
        );

        return value;
      },
    },
  };
}
