# pb-extensions

Lightweight collection of Paperback (v0.8) extensions and templates.

This repository contains source code and templates used to build Paperback extension bundles.

## Quick links

- Add as a repository in Paperback:

```
https://tidev00.github.io/pb-extensions/
```

## Quick start (developer)

Prerequisites

- Node.js (LTS recommended, >= 18)
- pnpm (uses `pnpm` as the package manager)

Install and build

```bash
git clone https://github.com/TiDev00/pb-extensions
cd pb-extensions
pnpm install
pnpm run build    # runs the local `paperback` toolchain to produce bundles/
pnpm run serve    # serve bundles locally for testing
```

Run tests (integration)

```bash
pnpm test         # build then run tests/SourceTester.js
pnpm run test:local # run SourceTester.js in LOCAL_DEV mode
```

Notes

- `pnpm run build` uses `paperback bundle` provided by `@paperback/toolchain`.
- `pnpm run serve` uses `paperback serve` to host a local discovery URL (default port 8080).

## Available scripts (from `package.json`)

- **prebuild**: small helper to normalize icons (`.jpg` → `.png`) in `src/*/includes`
- **build**: `paperback bundle` (produces `bundles/`)
- **serve**: `paperback serve` (local dev server)
- **lint**: `eslint --ext .ts src/`
- **test**: `pnpm run build && node tests/SourceTester.js`
- **test:local**: `LOCAL_DEV=1 node tests/SourceTester.js`

## Repo layout

```
.
├── bundles/                # compiled output (built by CI or `pnpm run build`)
├── src/                    # extension implementations (one folder per source)
├── templates/              # starter templates for building new sources
├── tests/                  # integration / test utilities (e.g. SourceTester.js)
├── package.json
├── tsconfig.json
└── README.md
```

Typical source layout

```
src/MySource/
├── MySource.ts
├── MySourceParser.ts
└── includes/
    └── icon.png
```

## Creating a new extension (summary)

1. Copy a template from `templates/SingleMangaTemplate` or `templates/MultiMangaTemplate` into `src/YourSource`.
2. Replace template placeholders (class name, domain, author) and update `SourceInfo` metadata.
3. Update parser selectors in `*Parser.ts` to match the target site's HTML.
4. Add a 512×512 `includes/icon.png` for the source icon.
5. `pnpm run build` and `pnpm run serve` to test locally.

## Testing

- `tests/SourceTester.js` is the integration test runner used by `pnpm test`.
- Use `LOCAL_DEV=1 pnpm test` to run tests against a locally served repo (useful behind proxies).

## CI / CD

Typical CI will:

1. Install dependencies
2. Run `pnpm run build`
3. Run `pnpm test`
4. Publish `bundles/` to the deployment branch or GitHub Pages

Adjust your repository's Actions workflow permissions so the deploy job can push to the deployment branch.

## Dependencies

- `@paperback/toolchain` — bundle + serve CLI
- `@paperback/types` — type definitions and runtime helpers
- `cheerio` — HTML parsing

See `package.json` for exact versions.

## License

MIT
