# pb-extensions

Personal [Paperback](https://paperback.moe) extension repository targeting **Paperback v0.8**.

Add this source list URL to the Paperback app to install extensions directly:

```
https://<your-github-username>.github.io/pb-extensions/
```

---

## Available Sources

| Name           | URL                        | Status |
| -------------- | -------------------------- | ------ |
| ReadJJKColored | https://readjjkcolored.com | ✅     |

---

## Repository Structure

```
pb-extensions/
├── src/
│   └── ReadJJKColored/              ← Live extension
├── templates/
│   ├── SingleMangaTemplate/     ← Template for single-title sites
│   └── MultiMangaTemplate/      ← Template for multi-title sites
├── .github/
│   └── workflows/
│       └── deploy.yml               ← Auto-build & gh-pages deploy
├── package.json
├── tsconfig.json
└── README.md
```

---

## Creating a New Extension

### 1. Pick the right template

| Your site has…                        | Use                   |
| ------------------------------------- | --------------------- |
| One manga / one title only            | `SingleMangaTemplate` |
| A full catalogue with search & browse | `MultiMangaTemplate`  |

### 2. Copy the template folder

```bash
cp -r templates/SingleMangaTemplate src/MyNewSource
# or
cp -r templates/MultiMangaTemplate  src/MyNewSource
```

### 3. Rename every occurrence of the placeholder

Search and replace across all files in the new folder:

| Find                          | Replace with                               |
| ----------------------------- | ------------------------------------------ |
| `TEMPLATE_NAME`               | Your source class name, e.g. `MyNewSource` |
| `https://TEMPLATE_DOMAIN.com` | The actual site URL                        |
| `TEMPLATE_AUTHOR`             | Your GitHub username                       |

Also rename the `.ts` files themselves to match your class name:

- `SingleMangaTemplate.ts` → `MyNewSource.ts`
- `SingleMangaTemplateParser.ts` → `MyNewSourceParser.ts`

Update the import in `MyNewSource.ts` to point to the renamed parser file.

### 4. Adjust the Cheerio selectors

Open `*Parser.ts` and update the CSS selectors to match the real site HTML.  
Use your browser DevTools → Inspect to find the right selectors for:

- Cover image
- Title, author, description, status
- Chapter list items (ID, number, volume, date)
- Reader page images

### 5. Update the source's `package.json`

Inside your new source folder, open `package.json` and set:

```json
{
  "name": "MyNewSource",
  "paperback": {
    "name": "MyNewSource",
    "classes": ["MyNewSource"]
  }
}
```

### 6. Add an icon

Create an `includes/` folder inside your source folder and place a `512×512` PNG named `icon.png` inside it:

```
src/MyNewSource/
├── includes/
│   └── icon.png   ← required
├── MyNewSource.ts
└── MyNewSourceParser.ts
```

### 7. Build & test locally

```bash
npm install
npm run build       # compiles all sources
npm run serve       # serves the repo locally for Paperback to connect to
```

Point the Paperback app at `http://<your-local-ip>:8080` to test.

---

## Project Setup (first time)

```bash
# Prerequisites: Node.js >= 16, npm >= 7
git clone https://github.com/<your-username>/pb-extensions
cd pb-extensions
npm install
```

---

## How the CI/CD works

Every push to `master` triggers `.github/workflows/deploy.yml` which:

1. Installs dependencies
2. Runs `npm run build`
3. Pushes the compiled output to the `gh-pages` branch

The `gh-pages` branch is then served at `https://<your-username>.github.io/pb-extensions/` — that URL is what you add to Paperback as a repository.

To enable this:

1. Go to **Settings → Pages** in your GitHub repo
2. Set source to **Deploy from branch → `gh-pages`**
3. Make sure Actions have **read & write** permissions under **Settings → Actions → General**

---

## Key Concepts

### Source lifecycle

```
Paperback App
    │
    ├── getHomePageSections()        ← home screen tiles
    ├── getSearchResults()           ← search bar
    ├── getMangaDetails()            ← tapping a manga
    ├── getChapters()                ← chapter list
    └── getChapterDetails()          ← reading a chapter (page images)
```

### IDs

- **`mangaId`** — the URL path slug of the manga page, e.g. `manga/my-title`
- **`chapterId`** — the URL path slug of the chapter page, e.g. `manga/my-title/chapter-1`

IDs must be **stable** — Paperback stores them in the user's library.

### CloudFlare

If the target site is behind CloudFlare, implement `getCloudflareBypassRequestAsync()` — this exposes a **CF Bypass** button in the source settings so the user can solve the challenge in a WebView.

---

## Dependencies

| Package                | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `@paperback/types`     | Paperback v0.8 type definitions & `App.*` factories |
| `@paperback/toolchain` | `paperback bundle` and `paperback serve` CLI        |
| `cheerio`              | Server-side HTML parsing (jQuery-like)              |
| `typescript`           | Language                                            |

---

## License

MIT
