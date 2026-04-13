# MangaDex source

This folder contains a MangaDex extension adapted from the multi-title template shape. It is kept alongside the template-based sources so the runtime structure stays consistent across live implementations.

Quick test:

```bash
pnpm test -- MangaDex
```

Full workflow:

```bash
pnpm install
pnpm run build
pnpm test -- MangaDex
```

Relevant files:

- `MangaDex.ts` — source entrypoint and request orchestration
- `MangaDexParser.ts` — DOM parsing and section mapping
- `package.json` — local workspace manifest and source metadata snapshot

Notes:

- The root build only compiles folders under `src/` whose main file matches the folder name.
- The folder-level `README.md` is for maintainers; it is not required by the Paperback toolchain.
