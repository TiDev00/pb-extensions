# SingleMangaTemplate

A template for building Paperback v0.8 extensions that target sites dedicated to **a single manga series**.

## When to use this template

- The site's entire purpose is to serve one specific series (e.g. a colored scan project, a fan translation site)
- There is no catalogue, no pagination, no genre filtering
- URL structure looks like: `https://example.com/manga/my-title/chapter-1`

For multi-title catalogue sites, use `MultiMangaTemplate` instead.

This template folder is a copy-ready starter, not part of the root TypeScript build. It becomes a live source only after you copy it into `src/` and rename the files to match the new source folder.

Maintenance notes:

- The inline request helpers in `SingleMangaTemplate.ts` intentionally mirror `src/shared.ts` so copied sources stay standalone. If you improve one, update the other.
- `parseChapterList()` no longer receives a `mangaId` argument because the template implementation never used it.
- The authoritative metadata lives in the exported `SourceInfo` object inside `SingleMangaTemplate.ts`.

---

## Files

| File                           | Purpose                                           |
| ------------------------------ | ------------------------------------------------- |
| `SingleMangaTemplate.ts`       | Source class — HTTP requests, Paperback interface |
| `SingleMangaTemplateParser.ts` | Cheerio parsing — all HTML scraping logic         |
| `includes/icon.png`            | 512×512 PNG icon _(must be added)_                |

---

## Getting started

```bash
# Copy into src/ and rename files
cp -r templates/SingleMangaTemplate src/MyNewSource
mv src/MyNewSource/SingleMangaTemplate.ts       src/MyNewSource/MyNewSource.ts
mv src/MyNewSource/SingleMangaTemplateParser.ts  src/MyNewSource/MyNewSourceParser.ts
```

---

## Adaptation checklist

- [ ] Rename the folder and `.ts` files to the extension class name
- [ ] Replace `TEMPLATE_NAME` everywhere with the class name (e.g. `MyNewSource`)
- [ ] Replace `TEMPLATE_DOMAIN` with the real domain (e.g. `example.com`)
- [ ] Replace `TEMPLATE_AUTHOR` with the GitHub username
- [ ] Set `MANGA_ID_SLUG` to the URL path of the manga page
- [ ] Update the exported `SourceInfo` object in the main source file
- [ ] Update selectors in `*Parser.ts` — start with `parseMangaDetails` and `parseChapterList`
- [ ] Update the search keywords in `getSearchResults()` to match the title
- [ ] Add `includes/icon.png` (512×512 PNG)
- [ ] Build: `pnpm run build`

---

## Selector quick-reference (Madara/WP-Manga theme)

| Data          | Common selector                      |
| ------------- | ------------------------------------ |
| Cover image   | `div.summary_image img[data-src]`    |
| Title         | `div.post-title h1`                  |
| Description   | `div.summary__content p`             |
| Author        | `div.author-content a`               |
| Status        | `div.post-status .summary-content`   |
| Chapter rows  | `li.wp-manga-chapter`                |
| Chapter link  | `li.wp-manga-chapter a`              |
| Chapter date  | `span.chapter-release-date i`        |
| Reader images | `div.reading-content img[data-src]`  |
| Reader JSON   | `ts_reader.run({...})` in `<script>` |
