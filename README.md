# pb-extensions

A small collection of Paperback (v0.8) extension sources, templates, and build helpers.

This repository contains source implementations (under `src/`), build output (`bundles/`), starter templates, and test utilities used to produce Paperback extension bundles.

**Live / discovery URL**

Add this repository as a discovery source in Paperback:

https://TiDev00.github.io/pb-extensions/

## Quick start (developer)

Requirements

- Node.js (LTS recommended, >= 18)
- pnpm (this repo uses `pnpm@8+` — see `package.json` → `packageManager`)

Clone, install, build

```bash
git clone https://github.com/TiDev00/pb-extensions.git
cd pb-extensions
pnpm install
pnpm run build    # produces bundles/
pnpm run serve    # starts a local discovery server (default port 8080)
```

Run tests

```bash
pnpm test         # builds then runs tests/SourceTester.js
pnpm run test:local # run SourceTester.js in LOCAL_DEV mode (against a local server)
```

Notes

- The `prebuild` script normalizes `includes/icon.jpg` → `includes/icon.png` for each source.
- The build commands use the `paperback` CLI binary provided by `@paperback/toolchain` (installed as a dependency).

## Scripts (from package.json)

- `prebuild` — convert source icons in `src/*/includes`
- `build` — `paperback bundle` (creates `bundles/`)
- `serve` — `paperback serve` (local dev server)
- `lint` — `eslint --ext .ts src/`
- `test` — `pnpm run build && node tests/SourceTester.js`
- `test:local` — `LOCAL_DEV=1 node tests/SourceTester.js`

## Repository layout

```
.
├── bundles/                # compiled output (produced by `pnpm run build`)
├── src/                    # source implementations (one directory per extension)
│   ├── PunkRecordz/
│   │   └── PunkRecordz.ts
│   └── ReadJJKColored/
├── templates/              # starter templates for single/multi-source implementations
├── tests/                  # integration/test helpers (e.g. SourceTester.js)
├── package.json
├── tsconfig.json
└── README.md
```

Typical source layout

```
src/YourSource/
├── YourSource.ts
├── YourSourceParser.ts
└── includes/
    └── icon.png
```

## Creating a new extension (summary)

1. Copy a template from `templates/SingleMangaTemplate` or `templates/MultiMangaTemplate` into `src/YourSource`.
2. Update class names, `SourceInfo` metadata, and parser selectors to match the target site.
3. Add a 512×512 `includes/icon.png` for the source icon.
4. Run `pnpm run build` and `pnpm run serve` to test locally.

## Testing

- `tests/SourceTester.js` is the integration test runner used by `pnpm test`.
- Use `LOCAL_DEV=1 pnpm run test` to run tests against a running local `pnpm run serve` instance.

## CI / CD (recommended)

Typical CI pipeline:

1. Install dependencies (`pnpm install`)
2. Run lint (`pnpm run lint`)
3. Build (`pnpm run build`)
4. Run tests (`pnpm test`)
5. Publish `bundles/` (e.g., to GitHub Pages or a deployment branch)

Ensure your CI has permissions to push the deployment artifacts if you publish to a branch.

## Contributing

Contributions are welcome. When opening a PR:

- Keep changes focused (one source / template per PR).
- Include a short description and testing steps.
- If adding a new source, include its `includes/icon.png` and update any templates you used.

## Dependencies

See `package.json` for exact versions. Key dependencies:

- `@paperback/toolchain`
- `@paperback/types`
- `cheerio`

## License

MIT
