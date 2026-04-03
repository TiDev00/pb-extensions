// ─────────────────────────────────────────────────────────────────────────────
// SINGLE-MANGA TEMPLATE — Parser
//
// All CSS selectors are annotated with what they target.
// Update each selector block to match your site's real HTML.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Chapter,
  ChapterDetails,
  PartialSourceManga,
  SourceManga,
  TagSection,
} from "@paperback/types";
import { CheerioAPI } from "cheerio";

export class SingleMangaTemplateParser {
  /** Called by getMangaDetails(). */
  parseMangaDetails($: CheerioAPI, mangaId: string): SourceManga {
    // ── Cover image ───────────────────────────────────────────────────────
    const image =
      $("div.summary_image img").attr("data-src") ??
      $("div.summary_image img").attr("src") ??
      $("img.img-responsive").attr("src") ??
      $('meta[property="og:image"]').attr("content") ??
      "";

    // ── Title ─────────────────────────────────────────────────────────────
    const title =
      $("div.post-title h1").text().trim() ||
      $("h1.entry-title").text().trim() ||
      $("h1").first().text().trim() ||
      "Unknown Title";

    // ── Description ───────────────────────────────────────────────────────
    const description =
      $("div.summary__content p").first().text().trim() ||
      $("div.manga-excerpt").text().trim() ||
      "";

    // ── Author ────────────────────────────────────────────────────────────
    const author =
      $("div.author-content a").first().text().trim() ||
      $('div.summary-heading:contains("Author")')
        .next()
        .find("a")
        .text()
        .trim() ||
      "Unknown";

    // ── Status ────────────────────────────────────────────────────────────
    const statusRaw =
      $("div.post-status .summary-content").text().trim().toLowerCase() ||
      $('div.summary-heading:contains("Status")')
        .next()
        .find("a")
        .text()
        .trim()
        .toLowerCase();

    const status = statusRaw.includes("ongoing") ? "Ongoing" : "Completed";

    // ── Genres / Tags ─────────────────────────────────────────────────────
    const tagSections: TagSection[] = [
      App.createTagSection({
        id: "genres",
        label: "Genres",
        tags: $("div.genres-content a")
          .toArray()
          .map((el) => {
            const label = $(el).text().trim();
            const id =
              $(el)
                .attr("href")
                ?.replace(/.*\/tag\//, "")
                .replace(/\/$/, "") ?? label.toLowerCase();
            return App.createTag({ id, label });
          }),
      }),
    ];

    return App.createSourceManga({
      id: mangaId,
      mangaInfo: App.createMangaInfo({
        titles: [title],
        image,
        author,
        artist: author,
        desc: description,
        status,
        hentai: false,
        tags: tagSections,
      }),
    });
  }

  /** Called by getChapters(). */
  parseChapterList($: CheerioAPI, mangaId: string): Chapter[] {
    const chapters: Chapter[] = [];

    // WordPress Madara:  li.wp-manga-chapter
    // Generic list:      ul.main li  /  div.chapter-list li
    const rows = $(
      "li.wp-manga-chapter, ul.main li, div.chapter-list li, .chapter-item",
    ).toArray();

    for (const el of rows) {
      const anchor = $("a", el).first();
      const href = anchor.attr("href") ?? "";

      const chapterId = href
        .replace(/^https?:\/\/[^/]+/, "")
        .replace(/^\//, "")
        .replace(/\/$/, "");

      if (!chapterId) continue;

      const rawName = anchor.text().trim();

      const chapNumMatch =
        rawName.match(/ch(?:apter)?[\s.]*([\d.]+)/i) ??
        rawName.match(/([\d.]+)\s*$/);
      const chapNum = chapNumMatch ? parseFloat(chapNumMatch[1] ?? "0") : 0;

      const volMatch = rawName.match(/vol(?:ume)?[\s.]*([\d.]+)/i);
      const volume = volMatch ? parseFloat(volMatch[1] ?? "0") : undefined;

      const dateText =
        $("span.chapter-release-date i", el).text().trim() ||
        $("span.chapter-release-date", el).text().trim() ||
        $("span.date", el).text().trim() ||
        "";
      const time = dateText ? new Date(dateText) : new Date();

      chapters.push(
        App.createChapter({
          id: chapterId,
          chapNum,
          name: rawName || `Chapter ${chapNum}`,
          langCode: "en",
          volume,
          time,
        }),
      );
    }

    return chapters;
  }

  /** Parses page image URLs for a chapter. Called by getChapterDetails(). */
  parseChapterDetails(
    $: CheerioAPI,
    mangaId: string,
    chapterId: string,
  ): ChapterDetails {
    const pages: string[] = [];

    // Strategy 1 — direct <img> tags in the reader container
    $("div.reading-content img, div.page-break img, div#readerarea img").each(
      (_i, el) => {
        const src =
          $(el).attr("data-src")?.trim() ??
          $(el).attr("data-lazy-src")?.trim() ??
          $(el).attr("src")?.trim() ??
          "";
        if (src && !src.startsWith("data:")) pages.push(src);
      },
    );

    // Strategy 2 — ts_reader.run({...}) JSON payload in <script>
    if (pages.length === 0) {
      $("script").each((_i, el) => {
        const content = $(el).html() ?? "";

        const tsMatch = content.match(/ts_reader\.run\((\{[\s\S]*?\})\)/);
        if (tsMatch?.[1]) {
          try {
            const data = JSON.parse(tsMatch[1]) as {
              sources?: Array<{ images?: string[] }>;
            };
            const imgs: string[] = data?.sources?.[0]?.images ?? [];
            imgs.forEach((img) => img && pages.push(img));
          } catch {
            /* ignore */
          }
        }

        if (pages.length === 0) {
          const varMatch = content.match(/var\s+pages\s*=\s*(\[[\s\S]*?\])/);
          if (varMatch?.[1]) {
            try {
              const imgs = JSON.parse(varMatch[1]) as string[];
              imgs.forEach((img) => img && pages.push(img));
            } catch {
              /* ignore */
            }
          }
        }
      });
    }

    return App.createChapterDetails({ id: chapterId, mangaId, pages });
  }

  /** Used by home sections and search for the single title tile. */
  parseMangaTile($: CheerioAPI, mangaId: string): PartialSourceManga {
    const image =
      $("div.summary_image img").attr("data-src") ??
      $("div.summary_image img").attr("src") ??
      $("img.img-responsive").attr("src") ??
      $('meta[property="og:image"]').attr("content") ??
      "";

    const title =
      $("div.post-title h1").text().trim() ||
      $("h1").first().text().trim() ||
      mangaId;

    const subtitle = $(
      "li.wp-manga-chapter a, ul.main li a, div.chapter-list li a",
    )
      .first()
      .text()
      .trim();

    return App.createPartialSourceManga({ mangaId, image, title, subtitle });
  }

  /** Returns true if the site has a newer chapter than `time`. */
  hasUpdateSince($: CheerioAPI, time: Date): boolean {
    const dateText =
      $("li.wp-manga-chapter span.chapter-release-date i")
        .first()
        .text()
        .trim() ||
      $("li.wp-manga-chapter span.chapter-release-date")
        .first()
        .text()
        .trim() ||
      "";

    if (!dateText) return false;
    const latestDate = new Date(dateText);
    return !isNaN(latestDate.getTime()) && latestDate > time;
  }
}
