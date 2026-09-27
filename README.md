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

This plugin aims to match Obsidian's reading-mode behaviour, including its bugs.
A harness renders a generated corpus inside real Obsidian and compares the result
against ours, so that claim is measured rather than asserted.

`npm test` runs the gate against committed goldens and needs no Obsidian.
Re-recording the goldens does — see [`test/parity/README.md`](test/parity/README.md).
