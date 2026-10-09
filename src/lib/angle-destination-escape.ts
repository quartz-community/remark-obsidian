import type { Link, Root, RootContent, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface AngleLink {
  readonly at: number;
  readonly end: number;
  readonly label: string;
  readonly url: string;
}

/**
 * The first `[label](<dest>)` in a run, found by scanning.
 *
 * Scanned rather than matched: `\[([^\]]*)\]\(<([^>]*)>\)` is two quantifiers either
 * side of a literal, and the ReDoS lint reads it as a second-degree polynomial. The
 * destination runs to the **first** `>`, which is what makes `<foo\>` a complete
 * destination of `foo\` rather than an unterminated one.
 */
function findAngleLink(raw: string): AngleLink | undefined {
  const marker = raw.indexOf("](<");
  if (marker < 1) return undefined;

  // Back to the label's own opener, with nothing closing in between.
  let open = -1;
  for (let scan = marker - 1; scan >= 0; scan--) {
    const character = raw[scan];
    if (character === "]") return undefined;
    if (character === "[") {
      open = scan;
      break;
    }
  }
  if (open === -1) return undefined;

  const start = marker + 3;
  const close = raw.indexOf(">", start);
  if (close === -1 || raw[close + 1] !== ")") return undefined;

  return {
    at: open,
    end: close + 2,
    label: raw.slice(open + 1, marker),
    url: raw.slice(start, close),
  };
}

/**
 * A backslash is an ordinary character inside an angle-wrapped destination.
 *
 * `[link](<foo\>)` is a link whose path is `foo\` to Obsidian and to the arbiter: the
 * backslash is literal and the `>` closes the destination. micromark reads `\>` as an
 * escape, so the destination never terminates, the link never forms, and the whole run
 * is left as text -- `[link](<foo>)` with the escape resolved and nothing linked.
 *
 * Reachable as a repair because the run arrives as a single text node, which the
 * recorded note had wrong: it said no link node forms so there is nothing for a repair
 * to correct, and concluded this needed the `<...>` destination scan inside `labelEnd`.
 * There is no link node, but the characters are all there in one place.
 *
 * Held to a destination that actually holds a backslash, which is what keeps it off the
 * seventeen matching `](<` cases -- `[link](<>)`, `[link](</my uri>)`, `[a](<b)c>)`,
 * `[link](<foo(and(bar)>)` and the rest all parse correctly today and none contains one.
 */
export function angleDestinationEscapeTransform(
  tree: Root,
  source: string,
): void {
  if (source === "") return;

  visit(tree, (node: Node) => {
    const parent = node as Partial<{ children: RootContent[] }>;
    if (!Array.isArray(parent.children)) return;

    for (let index = parent.children.length - 1; index >= 0; index--) {
      const child = parent.children[index];
      if (child?.type !== "text") continue;

      const from = child.position?.start?.offset;
      const to = child.position?.end?.offset;
      if (from === undefined || to === undefined) continue;

      // Read from the source, because the value has already lost the backslash.
      const raw = source.slice(from, to);
      const found = findAngleLink(raw);
      if (!found || !found.url.includes("\\")) continue;
      const { label, url } = found;

      const at = from + found.at;
      const end = from + found.end;
      const labelAt = at + 1;

      const link = {
        type: "link",
        url,
        title: null,
        children: [
          {
            type: "text",
            value: label,
            position: {
              start: { line: 0, column: 1, offset: labelAt },
              end: { line: 0, column: 1, offset: labelAt + label.length },
            },
          } as Text,
        ],
        position: {
          start: { line: 0, column: 1, offset: at },
          end: { line: 0, column: 1, offset: end },
        },
      } as unknown as Link;

      const replacement: RootContent[] = [];
      if (at > from) {
        replacement.push({
          type: "text",
          value: source.slice(from, at),
          position: {
            start: { ...child.position!.start },
            end: { line: 0, column: 1, offset: at },
          },
        } as Text);
      }
      replacement.push(link as unknown as RootContent);
      if (end < to) {
        replacement.push({
          type: "text",
          value: source.slice(end, to),
          position: {
            start: { line: 0, column: 1, offset: end },
            end: { ...child.position!.end },
          },
        } as Text);
      }
      parent.children.splice(index, 1, ...replacement);
    }
  });
}
