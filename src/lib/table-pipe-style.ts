import type { Paragraph, PhrasingContent, Root, RootContent } from "mdast";
/**
 * A table's header and delimiter rows must agree on the leading pipe.
 *
 * GFM does not care: it accepts `| a |` over ` | --- |` and builds a table.
 * Obsidian requires the two rows to be written the same way, and it decides
 * that on the row's very first character, so a single leading space means
 * "no pipe" — ` | a |` over `| --- |` is an ordinary paragraph, and so is
 * `| a |` over ` | --- |`.
 *
 * Demoting rebuilds the paragraph a line at a time rather than re-parsing the
 * whole slice, because re-parsing it would simply build the table again. Each
 * line parses alone, where a row of pipes is only text, and the lines are
 * rejoined with the breaks that separated them.
 */
export function tablePipeStyleTransform(
  tree: Root,
  source: string,
  reparse: (markdown: string) => Root,
): void {
  if (source === "") return;

  // Root level only. Inside a container every line but the first carries the
  // container's prefix, and a `> ` or a list indent is indistinguishable here
  // from the leading space that means "no pipe" -- treating them alike
  // demoted `> [!note]` / `> | a |` / `> | --- |`, which Obsidian builds. The
  // rule as measured only has evidence at root, so it only applies there.
  {
    const parent = tree as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = 0; index < parent.children.length; index++) {
      const table = parent.children[index];
      if (table?.type !== "table") continue;

      const from = table.position?.start?.offset;
      const to = table.position?.end?.offset;
      if (from === undefined || to === undefined) continue;

      // From the start of the line, not from the node: remark begins a table
      // after up to three leading spaces, so slicing at the node's own offset
      // throws away the very character the rule is about.
      const lineStart = source.lastIndexOf("\n", from - 1) + 1;
      const lines = source.slice(lineStart, to).split("\n");
      const header = lines[0];
      const delimiter = lines[1];
      if (header === undefined || delimiter === undefined) continue;
      if (piped(header) === piped(delimiter)) continue;

      const children: PhrasingContent[] = [];
      for (const line of lines) {
        if (children.length > 0) children.push({ type: "break" });
        const parsed = reparse(line);
        const block = parsed.children[0];
        if (block?.type === "paragraph") children.push(...block.children);
        else children.push({ type: "text", value: line });
      }

      const paragraph: Paragraph = {
        type: "paragraph",
        children,
        ...(table.position ? { position: table.position } : {}),
      };
      parent.children.splice(index, 1, paragraph);
    }
  }
}

/** The row's very first character, so one leading space already means no pipe. */
function piped(line: string): boolean {
  return line.startsWith("|");
}
