# MultiMangaTemplate

A template for building Paperback v0.8 extensions that target sites with **a full catalogue of manga titles** — search, pagination, genre filtering, and multiple home sections.

## When to use this template

- The site hosts many different titles
- There is a search bar, genre filtering, and/or sorting
- URL structure follows a pattern like:
  - Manga page: `https://example.com/manga/my-title`
  - Chapter page: `https://example.com/manga/my-title/chapter-1`
  - Browse: `https://example.com/manga?page=2`
  - Search: `https://example.com/?s=naruto`

For single-series sites, use `SingleMangaTemplate` instead.

---

## Files

| File                          | Purpose                                            |
| ----------------------------- | -------------------------------------------------- |
| `MultiMangaTemplate.ts`       | Source class — HTTP requests, Paperback interface  |
| `MultiMangaTemplateParser.ts` | Cheerio parsing — all HTML scraping logic          |
| `package.json`                | Per-source manifest (name, version, classes array) |
| `includes/icon.png`           | 512×512 PNG icon _(must be added)_                 |

---

## Getting started

```bash
# Copy into src/ and rename files
cp -r templates/MultiMangaTemplate src/MyNewSource
mv src/MyNewSource/MultiMangaTemplate.ts       src/MyNewSource/MyNewSource.ts
mv src/MyNewSource/MultiMangaTemplateParser.ts  src/MyNewSource/MyNewSourceParser.ts
```

---

## Adaptation checklist

- [ ] Rename the folder and `.ts` files to the extension class name
- [ ] Replace `TEMPLATE_NAME` everywhere with the class name (e.g. `MySite`)
- [ ] Replace `TEMPLATE_DOMAIN` with the real domain (e.g. `example.com`)
- [ ] Replace `TEMPLATE_AUTHOR` with the GitHub username
- [ ] Update `package.json` → `name` and `classes` fields
- [ ] Update URL patterns in `getViewMoreItems()` and `getSearchResults()`
- [ ] Update home section selectors in `parseLatestUpdates()`, `parsePopular()`, `parseNewManga()`
- [ ] Update grid selector in `parseMangaGrid()`
- [ ] Update `hasNextPage()` if the site uses a different pagination pattern
- [ ] Set `longStrip: true` in `parseChapterDetails()` for webtoon/vertical-scroll sites
- [ ] Add `includes/icon.png` (512×512 PNG)
- [ ] Build: `npm run build`

---

## Implemented Paperback v0.8 methods

| Method                              | Description                                          |
| ----------------------------------- | ---------------------------------------------------- |
| `getMangaDetails()`                 | Fetches title, cover, author, status, genres         |
| `getChapters()`                     | Returns the full chapter list with numbers and dates |
| `getChapterDetails()`               | Returns the ordered list of page image URLs          |
| `getHomePageSections()`             | Latest Updates / Popular / New Titles sections       |
| `getViewMoreItems()`                | Paginated continuation of any home section           |
| `getSearchResults()`                | Full-text search with pagination                     |
| `getCloudflareBypassRequestAsync()` | Exposes CF bypass button in source settings          |

---

## Selector quick-reference (Madara/WP-Manga theme)

| Data                   | Common selector                      |
| ---------------------- | ------------------------------------ |
| Cover image            | `div.summary_image img[data-src]`    |
| Title                  | `div.post-title h1`                  |
| Description            | `div.summary__content p`             |
| Author                 | `div.author-content a`               |
| Artist                 | `div.artist-content a`               |
| Status                 | `div.post-status .summary-content`   |
| Genres                 | `div.genres-content a`               |
| Chapter rows           | `li.wp-manga-chapter`                |
| Chapter link           | `li.wp-manga-chapter a`              |
| Chapter date           | `span.chapter-release-date i`        |
| Reader images          | `div.reading-content img[data-src]`  |
| Reader JSON            | `ts_reader.run({...})` in `<script>` |
| Pagination next        | `a.next` / `a[rel="next"]`           |
| Grid items             | `div.page-item-detail`               |
| Grid cover             | `div.c-image-hover img[data-src]`    |
| Grid title             | `div.post-title h3 a`                |
| Latest chapter on tile | `span.chapter`                       |
 