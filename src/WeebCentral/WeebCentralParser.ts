import {
  Chapter,
  ChapterDetails,
  PagedResults,
  PartialSourceManga,
  SourceManga,
} from "@paperback/types";
import { CheerioAPI } from "cheerio";

// ── Constants ────────────────────────────────────────────────────────────────

const COVER_BASE = "https://temp.compsci88.com/cover/fallback";

// ── Parser class ─────────────────────────────────────────────────────────────

export class WeebCentralParser {
  parseHomeSections($: CheerioAPI): PartialSourceManga[] {
    const seen = new Set<string>();
    const results: PartialSourceManga[] = [];

    $("article[data-tip]").each((_, el) => {
      // Mobile articles have the series link; desktop articles only have the
      // latest-chapter link as the first anchor.
      const seriesAnchor = $(el).find("a[href*='/series/']").first();
      if (!seriesAnchor.length) return;

      const href = seriesAnchor.attr("href") ?? "";
      const mangaId = this.extractMangaId(href);
      if (!mangaId) return;

      const seriesId = mangaId.split("/")[0];
      if (seen.has(seriesId)) return;
      seen.add(seriesId);

      const title = ($(el).attr("data-tip") ?? "").trim();
      const image = `${COVER_BASE}/${seriesId}.jpg`;

      results.push(App.createPartialSourceManga({ mangaId, title, image }));
    });

    return results;
  }

  parseMangaDetails($: CheerioAPI, mangaId: string): SourceManga {
    const seriesId = mangaId.split("/")[0];

    const title = $("h1").first().text().trim();
    const image = `${COVER_BASE}/${seriesId}.jpg`;
    const desc = $("p.whitespace-pre-wrap").first().text().trim();

    let author = "";
    let status = "";
    const tagLabels: string[] = [];

    $("ul li").each((_, li) => {
      const strongText = $(li).find("strong").first().text();
      if (strongText.includes("Author")) {
        author = $(li).find("a").first().text().trim();
      } else if (strongText.includes("Status")) {
        status = $(li).find("a").first().text().trim();
      } else if (strongText.includes("Tag")) {
        $(li)
          .find("a")
          .each((__, a) => {
            const tag = $(a).text().trim();
            if (tag) tagLabels.push(tag);
          });
      }
    });

    return App.createSourceManga({
      id: mangaId,
      mangaInfo: App.createMangaInfo({
        titles: [title],
        image,
        author,
        desc,
        status,
        hentai: false,
        tags: tagLabels.length
          ? [
              App.createTagSection({
                id: "genres",
                label: "Genres",
                tags: tagLabels.map((label) =>
                  App.createTag({
                    id: label.toLowerCase().replace(/\s+/g, "-"),
                    label,
                  }),
                ),
              }),
            ]
          : [],
      }),
    });
  }

  parseChapterList($: CheerioAPI, _mangaId: string): Chapter[] {
    const chapters: Chapter[] = [];
    const seen = new Set<string>();

    $("a[href*='/chapters/']").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const chapterId = href.split("/chapters/")[1]?.split("?")[0]?.trim();
      if (!chapterId || seen.has(chapterId)) return;
      seen.add(chapterId);

      // First span inside span.grow contains the chapter title, e.g. "Chapter 1072"
      const titleText = $(el).find("span.grow span").first().text().trim();
      const numMatch = titleText.match(/(\d+(?:\.\d+)?)/);
      const chapNum = numMatch ? parseFloat(numMatch[1]) : 0;

      const datetimeAttr = $(el).find("time").attr("datetime");
      const time = datetimeAttr ? new Date(datetimeAttr) : undefined;

      chapters.push(
        App.createChapter({
          id: chapterId,
          chapNum,
          name: titleText || `Chapter ${chapNum}`,
          langCode: "en",
          time,
        }),
      );
    });

    return chapters;
  }

  parseChapterDetails(
    $: CheerioAPI,
    mangaId: string,
    chapterId: string,
  ): ChapterDetails {
    const pages: string[] = [];

    $("img").each((_, el) => {
      const src = $(el).attr("src") ?? "";
      const cls = $(el).attr("class") ?? "";
      if (cls.includes("maw-w-full") && src.startsWith("http")) {
        pages.push(src);
      }
    });

    if (!pages.length) {
      throw new Error(
        `WeebCentral: no pages found for chapter "${chapterId}".`,
      );
    }

    return App.createChapterDetails({ id: chapterId, mangaId, pages });
  }

  parseSearchResults($: CheerioAPI): PartialSourceManga[] {
    return this.parseHomeSections($);
  }

  parseSimpleSearch($: CheerioAPI): PartialSourceManga[] {
    const results: PartialSourceManga[] = [];
    const seen = new Set<string>();

    $("a[href*='/series/']").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const mangaId = this.extractMangaId(href);
      if (!mangaId) return;

      const seriesId = mangaId.split("/")[0];
      if (seen.has(seriesId)) return;
      seen.add(seriesId);

      // Title from img alt (minus the " cover" suffix) or URL slug fallback
      const imgAlt = $(el).find("img").first().attr("alt") ?? "";
      const title =
        imgAlt.replace(/\s*cover$/i, "").trim() ||
        (mangaId.split("/").pop()?.replace(/-/g, " ") ?? "");

      const image = `${COVER_BASE}/${seriesId}.jpg`;
      results.push(App.createPartialSourceManga({ mangaId, title, image }));
    });

    return results;
  }

  pagedResults(items: PartialSourceManga[]): PagedResults {
    return App.createPagedResults({ results: items });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private extractMangaId(href: string): string | null {
    // href: https://weebcentral.com/series/<seriesId>/<slug>
    const match = href.match(/\/series\/([^?#\s]+)/);
    return match ? match[1] : null;
  }
}
