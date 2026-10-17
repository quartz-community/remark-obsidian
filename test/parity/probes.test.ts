import { describe, expect, it } from "vitest";

import { read, same } from "./probe-ledger.js";
import { refereeFacts } from "./referee-facts.js";

/**
 * The probe ledger, asserted on every change.
 *
 * `probe-ledger.mts` records what Obsidian answered for a probe AND what we answered at the
 * time. This asserts the second half, which is the only half that can be checked without the
 * application running -- and it is the half that was missing when two implementations in a row
 * went wrong in ways their own measurements would have caught.
 *
 * The assertion is DRIFT, not agreement. A probe usually records a divergence, so demanding
 * agreement would be red from the first entry; demanding stability means a probe that starts
 * matching fails exactly as loudly as one that stops, and both get looked at. That is the
 * contract `replicate` gives a corpus case, at a probe's price.
 */
describe("probe ledger", () => {
  const entries = read();

  it("has probes to assert", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("every probe carries a note saying why it was taken", () => {
    const silent = entries
      .filter((entry) => entry.note.trim() === "")
      .map((entry) => JSON.stringify(entry.markdown));
    expect(silent, "a probe whose purpose is forgotten gets deleted").toEqual(
      [],
    );
  });

  it("our answer has not drifted since the probe was recorded", () => {
    const drifted: string[] = [];
    for (const entry of entries) {
      const ours = refereeFacts(entry.markdown);
      const stable =
        same(entry.ours.defs, ours.defs) && same(entry.ours.refs, ours.refs);
      if (stable) continue;
      // Which DIRECTION it moved, because the two need opposite responses: toward Obsidian is
      // an improvement to re-record, away from it is a regression to fix.
      const agreesNow =
        same(entry.obsidian.defs, ours.defs) &&
        (!entry.refsTrustworthy || same(entry.obsidian.refs, ours.refs));
      drifted.push(
        `${JSON.stringify(entry.markdown)}\n` +
          `      ${agreesNow ? "NOW AGREES with Obsidian -- re-record to accept" : "moved AWAY from the recorded answer"}\n` +
          `      recorded ours: defs=${JSON.stringify(entry.ours.defs)} refs=${JSON.stringify(entry.ours.refs)}\n` +
          `      current  ours: defs=${JSON.stringify(ours.defs)} refs=${JSON.stringify(ours.refs)}\n` +
          `      obsidian     : defs=${JSON.stringify(entry.obsidian.defs)} refs=${JSON.stringify(entry.obsidian.refs)}`,
      );
    }
    expect(
      drifted,
      `${drifted.length} probe(s) drifted; re-run \`probe-ledger.mts --record\` only after checking each`,
    ).toEqual([]);
  });
});
