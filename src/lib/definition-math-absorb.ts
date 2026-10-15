import type { Root, RootContent } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface Point {
  line: number;
  column: number;
  offset?: number;
}

/**
 * A definition inside a list item absorbs a following UNCLOSED `$$` line.
 *
 * Seven probes against live 1.14.4, three of them the controls that scope it:
 *
 *     - [^a]: Definition / ⟨2sp⟩$$              end 1, ours 0
 *     - [^a]: Definition / $$                   end 1, ours 0   -- column 0 too, lazily
 *     - [^a]: Definition / ⟨4sp⟩$$              end 1, ours 0
 *     - [^a]: Definition / ⟨2sp⟩$$ / x / $$     end 0, ours 0   -- CLOSED, not absorbed
 *     [^a]: Definition   / ⟨2sp⟩$$              end 0, ours 0   -- ROOT def, not absorbed
 *     - [^a]: Definition / ⟨2sp⟩text            end 1, ours 1   -- already right
 *     - [^a]: Definition / ⟨2sp⟩%%              end 1, ours 1   -- already right
 *
 * So specifically an UNCLOSED `$$` inside a list item: text and `%%` are absorbed already, a
 * closed `$$` is its own block on both sides, and at root the definition keeps its own line.
 * Scored at better 29 / worse 10 before being built, the largest single gain available on the
 * referee; narrowing it to openers that END the item scores 22/4, cutting more wins than
 * losses, so the wider form is what ships.
 *
 * `mathListExtentTransform` does not reach this: it walks ROOT children, and here the `math` is
 * a sibling of the definition INSIDE the item.
 *
 * THE EXTENT IS WHY THIS IS A PASS AND NOT A CLAMP. Obsidian ends the definition on the `$$`
 * line, while our `math` node also swallows the blank line below it -- so extending the
 * definition over a sibling would leave OVERLAPPING SPANS, which `invariants.test.ts` gates,
 * and absorbing the node as it stands ends the definition one line late. Both have to happen
 * together: the math is clamped to its own first line, moved inside the definition, and every
 * node on the path down to it is clamped to the same point. That last part is this repo's
 * standing rule -- the descent is the unit of work, so a span is not corrected until every
 * ancestor's is.
 */
export function definitionMathAbsorbTransform(
  tree: Root,
  source: string,
): void {
  if (source === "") return;

  visit(tree, "listItem", (node: Node) => {
    const item = node as unknown as {
      children: RootContent[];
      position?: { start: Point; end: Point };
    };
    if (!Array.isArray(item.children)) return;

    for (let index = item.children.length - 2; index >= 0; index--) {
      const definition = item.children[index];
      const math = item.children[index + 1];
      if (definition?.type !== "footnoteDefinition" || math?.type !== "math") {
        continue;
      }
      const from = math.position?.start?.offset;
      const to = math.position?.end?.offset;
      if (from === undefined || to === undefined) continue;

      // The opener's own line, and nothing past it.
      const lineEnd = source.indexOf("\n", from);
      const bound = lineEnd === -1 ? source.length : lineEnd;
      // UNCLOSED: no further `$$` anywhere below the opener. A closed region is its own block
      // on both sides, which the fourth probe fixes.
      if (source.slice(bound).includes("$$")) continue;
      // Only an opener that reaches past its own line; one already bounded there needs nothing.
      if (to <= bound) continue;
      // NOT narrowed to openers that END the item, though every probe had that shape.
      // Measured on the implementation rather than inherited from the scorer, and it agrees:
      //
      //     as written                      referee +11   21 gained / 10 lost
      //     ...and the line after is blank  referee  +8   15 gained /  7 lost
      //
      // The restriction cuts more wins than losses in both instruments, so the ten remaining
      // losses are carried rather than fitted around. Their shapes are `⟨3sp⟩$$` with
      // `⇥⟨4sp⟩> quoted` under it and `⟨5sp⟩$$` under a `- ` marker, neither explained by
      // anything the probes varied.

      const end: Point = {
        line: math.position!.start.line,
        column: bound - (source.lastIndexOf("\n", bound - 1) + 1) + 1,
        offset: bound,
      };

      math.position!.end = { ...end };
      definition.position!.end = { ...end };
      definition.children.push(math as never);
      item.children.splice(index + 1, 1);

      // Every ancestor on the path, or the item keeps an end its contents no longer reach.
      if (item.position && item.position.end.offset !== undefined) {
        if (item.position.end.offset > bound) item.position.end = { ...end };
      }
      visit(tree, "list", (host: Node) => {
        const list = host as unknown as {
          children: RootContent[];
          position?: { start: Point; end: Point };
        };
        if (!list.children.includes(item as unknown as RootContent)) return;
        if (list.position && (list.position.end.offset ?? 0) > bound) {
          list.position.end = { ...end };
        }
      });
    }
  });
}
