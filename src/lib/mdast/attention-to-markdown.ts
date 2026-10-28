import type { Emphasis, Node, PhrasingContent, Strong } from "mdast";
import { defaultHandlers, type Options } from "mdast-util-to-markdown";

type Handle = typeof defaultHandlers.emphasis | typeof defaultHandlers.strong;
type Attention = (
  node: Emphasis | Strong,
  state: Parameters<typeof defaultHandlers.emphasis.attention>[1],
) => ReturnType<typeof defaultHandlers.emphasis.attention>;

/**
 * Each node's parent, recorded when the root is written: a handler is given its node's parent
 * but not that parent's, which the text writer needs to see what precedes an emphasis.
 */
export const parentOf = new WeakMap<Node, Node>();

function recordParents(node: Node): void {
  for (const child of (node as { children?: Node[] }).children ?? []) {
    parentOf.set(child, node);
    recordParents(child);
  }
}

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

/** Nodes the writer writes verbatim, so a `*` in them stays bare. */
const RAW = new Set([
  "inlineMath",
  "math",
  "inlineCode",
  "code",
  "html",
  "comment",
  "wikilink",
  "footnoteReference",
]);

/**
 * Whether `node` holds a bare `*` once written, below its own markers: a verbatim construct with
 * one in it (`_$a*b$_`, `_![[*em*]]_`, `_[^*em*]_`), or emphasis or strong anywhere inside,
 * even within link text or a highlight (`_[*em*](u)_`, `_==*em*==_`). remark-parse 8 pairs an
 * outer `*` with it.
 */
/** Whether emphasis, strong or a highlight sits anywhere under `node`. */
function holdsAttentionOrHighlight(node: Node): boolean {
  return ((node as { children?: Node[] }).children ?? []).some(
    (child) =>
      child.type === "emphasis" ||
      child.type === "strong" ||
      child.type === "highlight" ||
      (!RAW.has(child.type) && holdsAttentionOrHighlight(child)),
  );
}

/**
 * Whether a `_` marker would not hold around `node`: something verbatim inside holds a `_`, the
 * content ends in one at any depth (`*==under_==*` closed on it, inside the highlight), or a
 * tag stands straight before it and would take the `_` as its own (`#a/b_***em***_`; 4 seeds of
 * a million-seed census). Under `strict`, also content starting with one at any depth
 * (`*==__under_==*`), which remark-parse 8 reads as written.
 */
function underscoreUnsafe(node: Emphasis | Strong, strict: boolean): boolean {
  if (rawHolds(node, "_")) return true;
  let last: Node | undefined = node.children.at(-1);
  while (last && !RAW.has(last.type)) {
    const inner: Node[] | undefined = (last as { children?: Node[] }).children;
    if (!inner?.length) break;
    last = inner.at(-1);
  }
  if (endsInUnderscore(last as PhrasingContent | undefined)) return true;
  let first: Node | undefined = node.children[0];
  while (strict && first && !RAW.has(first.type)) {
    const inner: Node[] | undefined = (first as { children?: Node[] }).children;
    if (!inner?.length) break;
    first = inner[0];
  }
  if (
    strict &&
    first?.type === "text" &&
    (first as unknown as { value: string }).value.startsWith("_")
  ) {
    return true;
  }
  const siblings = (parentOf.get(node) as { children?: Node[] } | undefined)
    ?.children;
  const before = siblings?.[siblings.indexOf(node) - 1];
  return before?.type === "tag";
}

/** Whether `node` is text ending in `_`, which `_` cannot close after, as `*` cannot after `*`. */
function endsInUnderscore(node: PhrasingContent | undefined): boolean {
  return node?.type === "text" && node.value.endsWith("_");
}

/** Whether a verbatim construct under `node` holds `marker`, which no escape can protect. */
function rawHolds(node: Node, marker: string): boolean {
  for (const child of (node as { children?: Node[] }).children ?? []) {
    if (RAW.has(child.type)) {
      const own = child as {
        value?: string;
        label?: string;
        path?: string;
        alias?: string;
      };
      if (
        [own.value, own.label, own.path, own.alias].join("").includes(marker)
      ) {
        return true;
      }
      continue;
    }
    if (rawHolds(child, marker)) return true;
  }
  return false;
}

function holdsStar(node: Node): boolean {
  for (const child of (node as { children?: Node[] }).children ?? []) {
    if (child.type === "emphasis" || child.type === "strong") return true;
    if (RAW.has(child.type)) {
      const own = child as {
        value?: string;
        label?: string;
        path?: string;
        alias?: string;
      };
      const raw = [own.value, own.label, own.path, own.alias].join("");
      if (raw.includes("*")) return true;
      // Written verbatim, so only its own text counts: a comment's parsed children are not
      // what is written (`*%%_under_%%*` took `_` from the emphasis inside, 12 seeds).
      continue;
    }
    if (holdsStar(child)) return true;
  }
  return false;
}

/**
 * Which marker emphasis and strong are written with, where the writer's CommonMark choice reads
 * back otherwise. Only the order of the markers changes: the writer still checks each pairing as
 * micromark would and moves on when one fails. Each case was found by `fuzz/invariant-sweep.ts`.
 *
 * - **A tag at the end** (both presets): a tag takes `_`, so `__#a/b__` lost its closer to the
 *   tag. Only `*` is offered.
 * - **`legacy`, emphasis ending in `*`:** remark-parse 8 does not close `*\*em\**`, so `_`
 *   comes first, also when nested attention ends it -- or starts it, since `***[^1]**…*`
 *   paired its opening run otherwise.
 * - **`legacy`, attention straight before more:** `*u***strong**` reads `*u` and a strong
 *   holding `*strong`; `_u_**strong**` reads as written.
 * - **`legacy`, a bare `*` inside:** `*[^*em*]*` closed on the label's `*`, and so did a formula,
 *   code, a wikilink or nested emphasis holding one -- about 280 seeds of the million-seed
 *   census.
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
      if (lastLeaf(node)?.type === "tag") {
        // Emphasis whose only child is emphasis takes `_` outside, or the two `*` runs read as
        // strong: `*_#tag_*` came back `**#tag**` (about 40 seeds of the million-seed census,
        // under "formatting keeps the tree"). `_*#tag*_` reads as written under both presets.
        const only = node.children.length === 1 ? node.children[0] : undefined;
        return {
          ...result,
          markers:
            node.type === "emphasis" && only?.type === "emphasis"
              ? ["_", "*"]
              : ["*"],
        };
      }
      if (!options.legacy) {
        // `strict`: emphasis holding emphasis or strong at any depth, or a highlight, takes `_`
        // outside. `*~~*em*~~*` and `*==\*\*strong==*` paired otherwise once strikethrough and
        // highlights were read (about 125 seeds of the million-seed census); `_~~*em*~~_` reads
        // as written. Not where a `_` inside, verbatim or at the end, would close it.
        if (
          node.type === "emphasis" &&
          holdsAttentionOrHighlight(node) &&
          !underscoreUnsafe(node, true)
        ) {
          return { ...result, markers: ["_", "*"] };
        }
        return result;
      }
      const only = node.children.length === 1 ? node.children[0] : undefined;
      if (pinned.has(node)) return { ...result, markers: ["*"] };
      if (node.type === "strong" && only?.type === "emphasis") {
        pinned.add(only);
        return { ...result, markers: ["*"] };
      }
      if (
        (node.type === "emphasis" &&
          (endsInStar(node.children.at(-1)) ||
            isAttention(node.children[0]))) ||
        // Not when something verbatim inside holds a `_` too: `_` would close on it as
        // `*` would on a `*` (`*em` / `![[_under_]]` / `_under_. *`).
        (holdsStar(node) && !underscoreUnsafe(node, false)) ||
        beforeAttention.has(node)
      ) {
        return { ...result, markers: ["_", "*"] };
      }
      return result;
    };
    return handle;
  };
  const root = ((...args: Parameters<typeof defaultHandlers.root>) => {
    recordParents(args[0]);
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
