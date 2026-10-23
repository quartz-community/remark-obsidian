/**
 * Documents that produce a STRUCTURALLY IMPOSSIBLE position, vendored so CI can see them.
 *
 * `invariants.test.ts` already asserts this class is EMPTY -- `expect(offenders).toEqual([])`
 * over `end PAST source` and `start AFTER end` -- but it iterates `golden.cases`, which is
 * 3,448 of the 6,818 documents the referee holds. Running the SAME checks over the referee
 * corpus for the first time found 33 violations on these 8 documents, so the project asserts a
 * property it could not back.
 *
 * The referee corpus is not vendored -- it belongs to a sibling project on its own release
 * cycle -- so the sources are copied here instead. That costs 2,387 characters and makes the
 * defect visible without Obsidian, without a recording, and without the sibling checkout.
 *
 * WHY THIS IS NOT PARITY DEBT. A node whose start is after its end, or whose span runs past the
 * source, is wrong whatever Obsidian reports. `legacy` promises exact positions because
 * consumers index by them: `obsidian-linter` splices by offset, so such a node corrupts an edit
 * rather than merely misreporting one. This list should reach zero, unlike a parity ceiling.
 *
 * Recorded as an exact two-way ratchet. Fixing a document fails the test and asks for its entry
 * to be deleted; a new defect fails it too.
 */
export const POSITION_DEFECTS: ReadonlyArray<
  readonly [id: string, markdown: string, kinds: readonly string[]]
> = [
  [
    "broad:20261004-12342",
    "---\n---\n> [!my note]-\n> - [ ] [^#tag]:✅ 🇺🇸 ❤️ 🎉 👨‍👩‍👧.\n>       - item\n>   > quoted\n\n\n[^12]: laborum laborum magna culpa commodo amet nostrud tempor anim amet ipsum velit culpa magna sit magna ex officia lorem lorem magna amet commodo nostrud lorem magna ipsum laborum est lorem officia amet nostrud est nostrud tempor aliqua est ipsum velit tempor aliqua magna sit sit laborum est aliqua officia est amet velit amet amet magna sit laborum ipsum tempor ipsum aliqua velit sit ipsum ipsum officia tempor officia sit velit officia officia commodo ipsum sit lorem dolor ex sit anim lorem dolor la\n    anim ex ipsum lorem lorem anim aliqua laborum laborum est est est ipsum magna aliqua tempor amet ex tempor velit laborum est amet amet nostrud velit amet magna tempor aliqua dolor nostrud ipsum nostrud amet anim culpa laborum sit sit sit culpa officia lorem aliqua officia dolor nostrud lorem sit anim magna magna dolor commodo nostrud magna anim magna ex magna amet commodo officia amet ipsum commodo anim aliqua laborum officia commodo commodo nostrud ex dolor ipsum velit ipsum magna nostrud nostrud ipsum lorem tempor amet aliqua anim dolor laborum anim est\n[^9]: next\nafter [^2]\n\n👨‍👩‍👧 👨‍👩‍👧 ❤️ 👨‍👩‍👧 👨‍👩‍👧 party 🇺🇸[^x-y].\n  ===\n\n\n1. 👩‍💻 🇺🇸 🙂 %%\n  [^src:2]:\t❤️ party 🙂 ❤️ ❤️ 👨‍👩‍👧 [[Some note|alias]] [^注1] 🎉. [^1 ملاحظة]\n  %%\n",
    [
      "start AFTER end: footnoteDefinition",
      "start AFTER end: footnoteReference",
      "start AFTER end: paragraph",
    ],
  ],
  [
    "broad:20261004-4144",
    "Opening [^4] and [^12]\n\n[^یادداشت]: ipsum lorem magna velit officia culpa lorem $$ m [^a$] $$ commodo; **bold**[^ملاحظة]\n\n[^a$]:  done 👩‍💻 👩‍💻 party ✅ 🙂 party done.\n     [^b] more\n%%\n\n> [!info]-\t[^脚注]\n> ***\n> [^ä]:  party 🎉 🇺🇸 🇺🇸 🎉 ✅ 🙂 🙂[^a$]?\n>   party 👩‍💻 🎉 done ✅ 🙂 🎉.\n> [^x-y]: party ❤️ 👩‍💻 👩‍💻 👩‍💻 🎉 party 🎉 party!\n> %%\n> [^🎉]:  🙂 🙂 ❤️ done 🎉 👩‍💻 👩‍💻 🇺🇸 👨‍👩‍👧?\n> [^#tag]:\t🇺🇸 🙂 🇺🇸?\n> > [!tip]+ Title\n> > 🎉 done 🙂 🎉 🙂 👨‍👩‍👧 done 🙂 🙂.\n\n\n",
    [
      "start AFTER end: break",
      "start AFTER end: footnoteReference",
      "start AFTER end: text",
    ],
  ],
  [
    "fuzz:20261003-50",
    "Opening [^ch2*] and [^x-y]\n\n>>\t[^ch2*]: Definition\n>>\t> quoted\n\n\n\n* parent It ^[inline [^x-y]]\n\n\t1.  Some words \\[^Ä]\n\n>[^ch2*]: Morewords\n\n\n> [!tip] Title\n",
    [
      "start AFTER end: blockquote",
      "start AFTER end: paragraph",
      "start AFTER end: text",
    ],
  ],
  [
    "fuzz:20261003-600",
    "Opening [^a] and [^1]\n\nSome words\n\n---\n\n> [!tip]\n>\n\n>\t>\t[^3]: body text\n    ```\n>\t>\n\tProse hereend.[^3]\n\n[^Note]: More %% [^2] %% [^3]",
    ["end PAST source: blockquote", "end PAST source: code"],
  ],
  [
    "fuzz:20261003-1247",
    "  [^a]: def\n\n     Prose here\\[^1]\n%%\n\n- - -\n\n> [!note]\n> [^ä]: Prose here %% [^3] %%\n\n# Text\n\n",
    ["start AFTER end: footnoteReference", "start AFTER end: text"],
  ],
  [
    "probe:g1-in-def",
    "[^9]: x\n    > [!tip]\n    > [^1]: def\n\nuse[^1] use[^2] use[^3]\n",
    [
      "start AFTER end: footnoteDefinition",
      "start AFTER end: paragraph",
      "start AFTER end: text",
    ],
  ],
  [
    "reproducer:c529-def-only-obsidian-x1",
    "  [^a]: def\n%%\n> [^ä]: Prose here %% [^3] %%\n",
    ["start AFTER end: footnoteReference", "start AFTER end: text"],
  ],
  [
    "reproducer:c530-ref-only-plugin-x1",
    "  [^a]: def\n%%\n> [^ä]: Prose here %% [^3] %%\n",
    ["start AFTER end: footnoteReference", "start AFTER end: text"],
  ],
];
