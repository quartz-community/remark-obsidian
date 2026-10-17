import fs from "node:fs";
import path from "node:path";

import type { Def, Ref } from "./referee-facts.js";

/**
 * The probe ledger's data half, separate from the recorder's CLI.
 *
 * `probe-ledger.mts` parses argv and writes files at module scope, so a test importing it would
 * run the recorder. Splitting the types and readers out is the same shape `referee-facts.ts`
 * already has for `referee.mts` and `referee-shrink.mts`.
 */
export interface LedgerEntry {
  readonly markdown: string;
  /** Why this probe was taken. A probe whose purpose is forgotten gets deleted. */
  readonly note: string;
  readonly obsidian: {
    readonly defs: readonly Def[];
    readonly refs: readonly Ref[];
  };
  /** Our answer AT RECORD TIME. The test compares against this, never against Obsidian. */
  readonly ours: {
    readonly defs: readonly Def[];
    readonly refs: readonly Ref[];
  };
  /** Whether `refs` is adjudicable: the augmentation can be swallowed by an unclosed `%%`. */
  readonly refsTrustworthy: boolean;
  readonly recordedAt: string;
  readonly obsidianVersion: string;
}

export const LEDGER = path.join(import.meta.dirname, "goldens/probes.json");

export function read(): LedgerEntry[] {
  if (!fs.existsSync(LEDGER)) return [];
  return JSON.parse(fs.readFileSync(LEDGER, "utf8")) as LedgerEntry[];
}

/** Agreement, by the referee's rule: empty names excluded, ORDER-SENSITIVE. */
export const same = (
  a: readonly (readonly unknown[])[],
  b: readonly (readonly unknown[])[],
): boolean =>
  JSON.stringify(a.filter((row) => row[0] !== "")) ===
  JSON.stringify(b.filter((row) => row[0] !== ""));
