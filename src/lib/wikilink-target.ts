/**
 * A wikilink target as Obsidian resolves it: a no-break space as an ordinary one
 * (`![[*\u00a0*]]` embeds the note `* *`), and NFC (`[[cafe\u0301]]` links to `caf\u00e9`;
 * both found by `fuzz/charclass-sweep.ts`).
 */
export function resolveTarget(target: string): string {
  return target.replace(/\u00a0/gu, " ").normalize("NFC");
}

/** A wikilink's parts as the author spelled them, where resolving changed them. */
export interface SpelledTarget {
  spelledPath?: string;
  spelledHeading?: string;
}

/**
 * The spelling to keep beside the resolved parts, or `undefined` when resolving changed
 * nothing. The writer builds a wikilink from its parts, so without it formatting rewrote
 * `[[*\u00a0*]]` as `[[* *]]`: the same target, but another node `value` (about 970 seeds of the
 * million-seed census, under "formatting keeps the tree").
 */
export function spelledTarget(
  path: string,
  heading: string,
  resolved: { readonly path: string; readonly heading: string },
): SpelledTarget | undefined {
  const spelled: SpelledTarget = {};
  if (path !== resolved.path) spelled.spelledPath = path;
  if (heading !== resolved.heading) spelled.spelledHeading = heading;
  return Object.keys(spelled).length > 0 ? spelled : undefined;
}

/**
 * The text to write for a part: the author's spelling while it still resolves to the part
 * (an edited target wins), else the part, with the backslash resolving dropped put back.
 */
export function writtenPart(
  part: string,
  spelled: string | undefined,
  strippedBackslash: boolean,
): string {
  const resolved = strippedBackslash ? `${part}\\` : part;
  return spelled !== undefined && resolveTarget(spelled) === resolved
    ? spelled
    : resolved;
}
