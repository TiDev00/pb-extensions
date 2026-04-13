# ReadJJKColored source

This folder contains the live ReadJJKColored Paperback source. Unlike the HTML-scraping templates, it reads a site-side `config.js` and derives chapter metadata from that structured payload.

Quick test:

```bash
pnpm test -- ReadJJKColored
```

Relevant files:

- `ReadJJKColored.ts` — source entrypoint and config-driven data mapping
- `package.json` — local workspace manifest and source metadata snapshot
- `includes/icon.png` — bundled Paperback icon asset

Notes:

- The root build only compiles folders under `src/` whose main file matches the folder name.
- The folder-level `README.md` is for maintainers; it is not required by the Paperback toolchain.
