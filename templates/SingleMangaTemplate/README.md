# SingleMangaTemplate

Use this template when the target site hosts **only one manga title**.

## When to use this template

- The site's entire purpose is to serve one specific series (e.g. a colored scan project)
- There is no catalogue, no pagination, no genre filtering
- The URL structure looks like: `https://example.com/manga/my-title/chapter-1`

## Files

| File                           | Purpose                                            |
| ------------------------------ | -------------------------------------------------- |
| `SingleMangaTemplate.ts`       | Source class — HTTP requests, Paperback interface  |
| `SingleMangaTemplateParser.ts` | Cheerio parsing — all HTML scraping logic          |
| `package.json`                 | Per-source manifest (name, version, classes array) |
| `includes/icon.png`            | _(you must add this)_ 512×512 PNG icon             |

## How to create a new extension

```bash
# 1. Copy this folder into src/
cp -r templates/SingleMangaTemplate src/MyNewSource

# 2. Rename the .ts files to match your source name
mv src/MyNewSource/SingleMangaTemplate.ts       src/MyNewSource/MyNewSource.ts
mv src/MyNewSource/SingleMangaTemplateParser.ts  src/MyNewSource/MyNewSourceParser.ts
```

## Adaptation checklist

- [ ] Rename the folder and files to your source name
- [ ] Replace `TEMPLATE_NAME` everywhere with your class name (e.g. `MyNewSource`)
- [ ] Replace `TEMPLATE_DOMAIN` with the real domain (e.g. `example.com`)
- [ ] Replace `TEMPLATE_AUTHOR` with your GitHub username
- [ ] Set `MANGA_ID_SLUG` to the URL path of the manga page
- [ ] Update `package.json` → set `name` and `classes` to your class name
- [ ] Update selectors in `*Parser.ts` — start with `parseMangaDetails` and `parseChapterList`
- [ ] Update the search keywords in `getSearchResults()` to match your title
- [ ] Add `includes/icon.png` (512×512 PNG)
- [ ] Build: `npm run build`

## Selector quick-reference

| Data          | Common selector (Madara/WP)          |
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
