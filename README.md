# pb-extensions

A collection of Paperback (v0.8) extension sources, templates, and build helpers.

## Overview

This repository provides source implementations (under src/), prebuilt extension bundles (bundles/), starter templates, and test utilities used to build and publish Paperback extension bundles. Add this repository as a discovery source in Paperback to use prebuilt extensions.

## Quick start (developer)

Requirements

- Node.js (LTS recommended, >= 18)
- pnpm (this repo uses `pnpm` as the package manager)

Clone, install, build

```bash
git clone https://github.com/TiDev00/pb-extensions.git
cd pb-extensions
pnpm install
pnpm run build    # runs the local `paperback` toolchain to produce bundles/
pnpm run serve    # starts a local discovery server
```

Development & verification

TypeScript type-check (no emit):

```bash
npx tsc --noEmit -p tsconfig.json
```

Lint:

```bash
pnpm run lint
```

Run the integration tester:

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

<!-- ## Repository layout

```
.
├── bundles/                # compiled output (produced by `pnpm run build`)
├── src/
│   ├── shared.ts           # shared helpers used by sources
│   ├── PunkRecordz/
│   │   ├── PunkRecordz.ts
│   │   └── PunkRecordzParser.ts
│   └── ReadJJKColored/
│       ├── ReadJJKColored.ts
│       └── ReadJJKColoredParser.ts
├── templates/              # starter templates (self-contained helpers)
├── tests/                  # integration/test helpers (e.g. SourceTester.js)
├── package.json
├── tsconfig.json
└── README.md
``` -->

## Creating a new extension (recommended workflow)

1. Copy a template from `templates/SingleMangaTemplate` or `templates/MultiMangaTemplate` into `src/YourSource`.
2. Implement parsing logic in `YourSourceParser.ts` (parsers focus on HTML → domain objects).
3. Keep the Source implementation thin: network requests, caching, and orchestration belong in `YourSource.ts` and should delegate parsing to the parser class.
4. Reuse helpers from [src/shared.ts](src/shared.ts) (createSourceRequestManager, createGetRequest, createCloudflareBypassRequest, throwIfCloudflareBlocked, getPageNumber).
5. Add a 512×512 `includes/icon.png` and let the `prebuild` script normalize icons.
6. Run `pnpm run build`, `npx tsc --noEmit -p tsconfig.json`, and `pnpm run test` to verify.

Bundles & publishing

- `pnpm run build` produces extension bundles in `bundles/`.
- Publish the `bundles/` directory (for example, to GitHub Pages or a deployment branch) to expose a discovery URL to Paperback.

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

## Contributing & PR checklist

- Keep PRs focused (one source or extension per PR).
- Include testing steps and verification commands in the PR description.
- Add the source icon and verify `prebuild` behaviour.

## Dependencies

- `@paperback/toolchain` — bundle + serve CLI
- `@paperback/types` — type definitions and runtime helpers
- `cheerio` — HTML parsing

See `package.json` for exact versions.

## License

[MIT](LICENSE)
