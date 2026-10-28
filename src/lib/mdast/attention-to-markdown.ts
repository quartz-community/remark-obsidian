import type { Emphasis, Node, PhrasingContent, Strong } from "mdast";
import { defaultHandlers, type Options } from "mdast-util-to-markdown";

type Handle = typeof defaultHandlers.emphasis | typeof defaultHandlers.strong;
type Attention = (
  node: Emphasis | Strong,
  state: Parameters<typeof defaultHandlers.emphasis.attention>[1],
) => ReturnType<typeof defaultHandlers.emphasis.attention>;

/** The last node an attention span's content ends in, through nested attention. */
function lastLeaf(node: Emphasis | Strong): PhrasingContent | undefined {
  let last = node.children.at(-1);
  while (last && (last.type === "emphasis" || last.type === "strong")) {
    last = last.children.at(-1);
  }
  return last;
}

/** Whether `node` is written ending in a `*`: text that ends in one, or `*`-delimited attention. */
function endsInStar(node: PhrasingContent | undefined): boolean {
  if (!node) return false;
  if (node.type === "text") return node.value.endsWith("*");
  return node.type === "emphasis" || node.type === "strong";
}

/** Whether a footnote label under `node` holds a `*`, which the writer leaves bare. */
function labelHoldsStar(node: Node): boolean {
  if (node.type === "footnoteReference") {
    return String((node as { label?: string }).label ?? "").includes("*");
  }
  const children = (node as { children?: Node[] }).children ?? [];
  return children.some(labelHoldsStar);
}

/**
 * Which marker emphasis and strong are written with, where the writer's CommonMark choice reads
 * back otherwise. Only the order of the markers changes: the writer still checks each pairing as
 * micromark would and moves on when one fails. Each case was found by `fuzz/invariant-sweep.ts`.
 *
 * - **A tag at the end** (both presets): a tag takes `_`, so `__#a/b__` lost its closer to the
 *   tag. Only `*` is offered.
 * - **`legacy`, emphasis ending in `*`:** remark-parse 8 does not close `*\*em\**`, so `_`
 *   comes first, also when nested attention ends it.
 * - **`legacy`, attention straight before more:** `*u***strong**` reads `*u` and a strong
 *   holding `*strong`; `_u_**strong**` reads as written.
 * - **`legacy`, a footnote label holding `*`:** `*[^*em*]*` closed on the label's `*`.
 * - **`legacy`, emphasis alone in a strong:** remark-parse 8 reads `***x***` as exactly that,
 *   where CommonMark reads emphasis around strong and the writer chose `___*x*___`, which
 *   remark-parse 8 reads otherwise. Both are pinned to `*`.
 */
export function attentionToMarkdown(options: {
  readonly legacy: boolean;
}): Options {
  /** Emphasis that is a strong's only child, written `***x***` under `legacy`. */
  const pinned = new WeakSet<Node>();
  /** Attention straight before more attention, marked when the root is written. */
  const beforeAttention = new WeakSet<Node>();
  const isAttention = (node: Node | undefined): boolean =>
    node?.type === "emphasis" || node?.type === "strong";
  const markAdjacent = (node: Node): void => {
    const children = (node as { children?: Node[] }).children ?? [];
    children.forEach((child, index) => {
      if (isAttention(child) && isAttention(children[index + 1])) {
        beforeAttention.add(child);
      }
      markAdjacent(child);
    });
  };
  const wrap = <H extends Handle>(base: H): H => {
    const handle = ((...args: Parameters<H>) =>
      (base as (...a: Parameters<H>) => string)(...args)) as unknown as H;
    const own = handle as unknown as { peek: unknown; attention: Attention };
    own.peek = (base as unknown as { peek: unknown }).peek;
    own.attention = (node, state) => {
      const result = (base as unknown as { attention: Attention }).attention(
        node,
        state,
      );
      if (lastLeaf(node)?.type === "tag") return { ...result, markers: ["*"] };
      if (!options.legacy) return result;
      const only = node.children.length === 1 ? node.children[0] : undefined;
      if (pinned.has(node)) return { ...result, markers: ["*"] };
      if (node.type === "strong" && only?.type === "emphasis") {
        pinned.add(only);
        return { ...result, markers: ["*"] };
      }
      if (
        (node.type === "emphasis" && endsInStar(node.children.at(-1))) ||
        labelHoldsStar(node) ||
        beforeAttention.has(node)
      ) {
        return { ...result, markers: ["_", "*"] };
      }
      return result;
    };
    return handle;
  };
  const root = ((...args: Parameters<typeof defaultHandlers.root>) => {
    if (options.legacy) markAdjacent(args[0]);
    return defaultHandlers.root(...args);
  }) as typeof defaultHandlers.root;
  return {
    handlers: {
      root,
      emphasis: wrap(defaultHandlers.emphasis),
      strong: wrap(defaultHandlers.strong),
    },
  };
}
