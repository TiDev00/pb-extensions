# pb-extensions

A [Paperback](https://paperback.moe) extension repository targeting **Paperback v0.8**.

---

## Using this repository in Paperback

Add the following URL as a repository in the Paperback app:

```
https://tidev00.github.io/pb-extensions/
```

> **Steps:** Settings → Extensions → Edit → + → paste the URL above → Done.

---

## Available Extensions

| Extension      | Site                       | Description                                 |
| -------------- | -------------------------- | ------------------------------------------- |
| ReadJJKColored | https://readjjkcolored.com | Jujutsu Kaisen — full AI-colorized HD scans |

---

## For Developers

### Prerequisites

- Node.js ≥ 20
- npm ≥ 7

### Getting started

```bash
git clone https://github.com/thierno-cisse/pb-extensions
cd pb-extensions
npm install
```

### Build & test locally

```bash
npm run build       # compile all extensions
npm run serve       # serve the repo locally (default: port 8080)
```

Point the Paperback app at `http://<your-local-ip>:8080` to test against a local build.

### Repository structure

```
pb-extensions/
├── src/
│   └── ReadJJKColored/          ← extension source
│       ├── ReadJJKColored.ts
│       ├── includes/
│       └── package.json
├── templates/
│   ├── SingleMangaTemplate/     ← starting point for single-title sites
│   └── MultiMangaTemplate/      ← starting point for full-catalogue sites
├── bundles/                     ← compiled output (git-ignored, built by CI)
├── .github/workflows/
│   └── deploy.yml               ← CI: build → test → deploy to deployment branch
├── package.json
├── tsconfig.json
└── README.md
```

### Creating a new extension

#### 1. Pick a template

| Site type                           | Template              |
| ----------------------------------- | --------------------- |
| One manga / one series only         | `SingleMangaTemplate` |
| Full catalogue with search & browse | `MultiMangaTemplate`  |

See each template's `README.md` for a full adaptation checklist.

#### 2. Copy the template

```bash
cp -r templates/SingleMangaTemplate src/MyNewSource
# or
cp -r templates/MultiMangaTemplate  src/MyNewSource
```

#### 3. Replace placeholders

Search and replace across all files inside the new folder:

| Placeholder                   | Replace with                        |
| ----------------------------- | ----------------------------------- |
| `TEMPLATE_NAME`               | Extension class name, e.g. `MySite` |
| `https://TEMPLATE_DOMAIN.com` | The actual site URL                 |
| `TEMPLATE_AUTHOR`             | GitHub username                     |

Rename the `.ts` files to match the class name, and update the import path inside the main source file.

#### 4. Update selectors

Open `*Parser.ts` and update the CSS selectors to match the target site's HTML structure. Use browser DevTools to inspect the relevant elements:

- Cover image, title, author, description, status
- Chapter list rows, chapter links, release dates
- Reader page image URLs

#### 5. Update `package.json`

Inside the new source folder:

```json
{
  "name": "MyNewSource",
  "paperback": {
    "name": "MyNewSource",
    "classes": ["MyNewSource"]
  }
}
```

#### 6. Add an icon

Place a 512×512 PNG named `icon.png` inside an `includes/` subfolder:

```
src/MyNewSource/
├── includes/
│   └── icon.png
├── MyNewSource.ts
└── MyNewSourceParser.ts
```

---

## CI / CD

Every push to `master` triggers `.github/workflows/deploy.yml`, which:

1. Installs dependencies
2. Builds all extensions (`npm run build`)
3. Runs integration tests (`node tests/SourceTester.js`)
4. Deploys the compiled `bundles/` directory to the `deployment` branch

The `deployment` branch root is served via `raw.githubusercontent.com` and is the URL Paperback fetches to discover and install extensions.

**Required GitHub repository settings:**

- **Settings → Actions → General → Workflow permissions** → set to _Read and write_

---

## Key concepts

### Source interface

```
Paperback App
    │
    ├── getHomePageSections()     ← home screen tiles
    ├── getSearchResults()        ← search bar
    ├── getMangaDetails()         ← manga info page
    ├── getChapters()             ← chapter list
    └── getChapterDetails()       ← page images for a chapter
```

### IDs

- **`mangaId`** — URL slug of the manga page, e.g. `manga/my-title`
- **`chapterId`** — URL slug of the chapter page, e.g. `manga/my-title/chapter-1`

IDs must be **stable** — Paperback persists them in the user's library.

### CloudFlare

Sites behind CloudFlare require implementing `getCloudflareBypassRequestAsync()`, which surfaces a **CF Bypass** button in the extension settings so users can solve the challenge in a WebView.

---

## Dependencies

| Package                | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `@paperback/types`     | Paperback v0.8 type definitions & `App.*` factories |
| `@paperback/toolchain` | `paperback bundle` and `paperback serve` CLI        |
| `cheerio`              | Server-side HTML parsing (jQuery-like API)          |
| `typescript`           | Language                                            |

---

## License

MIT
 