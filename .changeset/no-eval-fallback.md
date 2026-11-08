---
"@quartz-community/remark-obsidian": patch
---

`dist/index.js` no longer holds an `eval` call. The bundled `format` package's fallback, which
could not run there but read as `eval` to scanners, is removed at build time.
