# remark-obsidian

Quartz's remark plugin for Obsidian.

## Development

```bash
npm test          # unit tests and the Obsidian parity gate
npm run typecheck # both tsconfig projects
npm run format    # prettier check
npm run build
```

### Obsidian parity

This plugin targets the **reading-mode and `metadataCache` semantics of a specific
public Obsidian release**, with a small set of documented, deliberate divergences
where Obsidian has an acknowledged defect. A harness renders a generated corpus
inside real Obsidian and compares the result against ours, so the claim is measured
rather than asserted — including the divergences, which are enumerated rather than
implied.

`npm test` runs the gate against committed goldens and needs no Obsidian.
Re-recording the goldens does — see [`test/parity/README.md`](test/parity/README.md).
