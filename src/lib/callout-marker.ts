import type { Root } from "mdast";

import { MARKER } from "./callout.js";
import { pointAt } from "./normalize-points.js";
import type { Callout } from "./types.js";

/** The quote marker a callout's span starts with, and the one space that binds the `[!`. */
const QUOTE_PREFIX = /^[ \t]*> ?/u;

function placeMarker(callout: Callout, source: string): void {
  const from = callout.position?.start.offset;
  if (from === undefined) return;
  let end = from;
  while (end < source.length && source[end] !== "\n" && source[end] !== "\r")
    end++;
  const line = source.slice(from, end);
  const prefix = QUOTE_PREFIX.exec(line);
  if (!prefix) return;
  const marker = MARKER.exec(line.slice(prefix[0].length));
  if (!marker) return;
  const start = from + prefix[0].length;
  // Not `marker[0]`, which also takes the one space or tab that starts the title.
  const width = "[!]".length + marker[1]!.length + marker[2]!.length;
  callout.data = {
    ...callout.data,
    marker: {
      start: pointAt(source, start),
      end: pointAt(source, start + width),
    },
    lineEnd: pointAt(source, end),
  };
}

/**
 * Where each callout's marker sits, on `data.marker` and `data.lineEnd`.
 *
 * The title node cannot say. `> [!note]` has none, a title's span covers its text only, and
 * `> [!note] [^1]: def` has a zero-width one, its block moved out into the body. So a consumer
 * had to read the source to find the marker.
 *
 * Reads the final spans, so it runs after every pass that can move a callout, and only on the
 * document: a fragment's positions are placed back later.
 */
export function calloutMarkerTransform(tree: Root, source: string): void {
  if (!source.includes("[!")) return;
  const walk = (node: { type: string; children?: unknown }): void => {
    if (node.type === "callout") placeMarker(node as Callout, source);
    if (!Array.isArray(node.children)) return;
    for (const child of node.children) walk(child);
  };
  walk(tree);
}
