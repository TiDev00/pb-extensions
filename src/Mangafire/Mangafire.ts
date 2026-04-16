import {
  BadgeColor,
  Chapter,
  ChapterDetails,
  ContentRating,
  HomeSection,
  HomeSectionType,
  PagedResults,
  Request,
  SearchRequest,
  Source,
  SourceInfo,
  SourceIntents,
  SourceManga,
  TagSection,
} from "@paperback/types";

import {
  createCloudflareBypassRequest,
  createGetRequest,
  createSourceRequestManager,
  getPageNumber,
  throwIfCloudflareBlocked,
} from "../shared";

const BASE_URL = "https://mangafire.to";

function coerceString(data: unknown): string {
  if (typeof data === "string") return data;
  if (data != null) return JSON.stringify(data);
  return "";
}

function slugFromHref(href: string): string {
  return href
    .replace(/.*\/manga\//, "")
    .split("?")[0]
    .split("#")[0]
    .trim();
}

export const MangafireInfo: SourceInfo = {
  version: "1.0.0",
  name: "Mangafire",
  icon: "icon.png",
  author: "TiDev00",
  description: "Read manga from MangaFire.to — multi-type, multi-language",
  contentRating: ContentRating.EVERYONE,
  websiteBaseURL: BASE_URL,
  sourceTags: [
    { text: "English", type: BadgeColor.GREY },
    { text: "Multi", type: BadgeColor.YELLOW },
  ],
  intents:
    SourceIntents.MANGA_CHAPTERS |
    SourceIntents.HOMEPAGE_SECTIONS |
    SourceIntents.CLOUDFLARE_BYPASS_REQUIRED,
};

export class Mangafire extends Source {
  readonly baseUrl = BASE_URL;
  readonly requestManager = createSourceRequestManager(BASE_URL);

  async getCloudflareBypassRequestAsync(): Promise<Request> {
    return createCloudflareBypassRequest(this.baseUrl);
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const response = await this.requestManager.schedule(
      createGetRequest(`${this.baseUrl}/manga/${mangaId}`),
      1,
    );
    throwIfCloudflareBlocked(response.status);

    const html = coerceString(response.data);
    const $ = this.cheerio.load(html);

    const title =
      $("h1.manga-name").first().text().trim() ||
      $(".manga-detail h1").first().text().trim() ||
      $("h1").first().text().trim() ||
      mangaId;

    const coverImg =
      $('meta[property="og:image"]').attr("content")?.trim() ??
      $(".manga-poster img, .film-poster img, img.poster")
        .first()
        .attr("src") ??
      $(".poster img").first().attr("src") ??
      "";

    const desc =
      $(".synopsis .modal-content").text().trim() ||
      $(".synopsis").text().trim() ||
      $('[class*="synopsis"]').first().text().trim() ||
      $('meta[name="description"]').attr("content")?.trim() ||
      "";

    const rawStatus =
      $(".manga-status .status, .detail-status .status, [class*='status']")
        .first()
        .text()
        .toLowerCase() || "";
    const status = rawStatus.includes("complet") ? "Completed" : "Ongoing";

    const genreTags: ReturnType<typeof App.createTag>[] = [];
    $(
      ".genres a[href*='/genre/'], .genre a[href*='/genre/'], a[href*='/genre/']",
    ).each((_i, el) => {
      const label = $(el).text().trim();
      const href = $(el).attr("href") ?? "";
      const id = href.split("/genre/").pop()?.split("?")[0] ?? label;
      if (label) genreTags.push(App.createTag({ id, label }));
    });

    const tags: TagSection[] =
      genreTags.length > 0
        ? [
            App.createTagSection({
              id: "genres",
              label: "Genres",
              tags: genreTags,
            }),
          ]
        : [];

    return App.createSourceManga({
      id: mangaId,
      mangaInfo: App.createMangaInfo({
        titles: [title],
        image: coverImg,
        desc,
        status,
        hentai: false,
        tags,
      }),
    });
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const response = await this.requestManager.schedule(
      createGetRequest(`${this.baseUrl}/manga/${mangaId}`),
      1,
    );
    throwIfCloudflareBlocked(response.status);

    const html = coerceString(response.data);
    const $ = this.cheerio.load(html);
    const numericMangaId = html.match(/data-id="(\d+)"/)?.[1] ?? "";

    const chapters: Chapter[] = [];
    const seenChapterNumbers = new Set<string>();

    const addChapter = (chapterNumText: string, name: string, time: Date) => {
      if (!chapterNumText || seenChapterNumbers.has(chapterNumText)) return;
      seenChapterNumbers.add(chapterNumText);

      const chapNum = parseFloat(chapterNumText);
      const chapterId = numericMangaId
        ? `${numericMangaId}_chapter-${chapterNumText}`
        : `chapter-${chapterNumText}`;

      chapters.push(
        App.createChapter({
          id: chapterId,
          chapNum: Number.isNaN(chapNum) ? 0 : chapNum,
          name: name || `Chapter ${chapterNumText}`,
          langCode: "en",
          time: Number.isNaN(time.getTime()) ? new Date(0) : time,
        }),
      );
    };

    $("a[href*='/read/'][href*='/en/chapter-']").each((_i, el) => {
      const href = $(el).attr("href") ?? "";
      const chapterMatch = href.match(/\/chapter-([\d.]+)/i);
      if (!chapterMatch) return;

      const chapterNumText = chapterMatch[1];
      const title = $(el).attr("title")?.trim() || $(el).text().trim();
      const dateMatch = title.match(/([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/);
      const time = dateMatch ? new Date(dateMatch[1]) : new Date(0);
      addChapter(chapterNumText, title || `Chapter ${chapterNumText}`, time);
    });

    if (chapters.length === 0) {
      const ajaxUrl = `${this.baseUrl}/ajax/read/${numericMangaId}/chapter/en`;
      try {
        const ajaxResponse = await this.requestManager.schedule(
          createGetRequest(ajaxUrl),
          1,
        );
        const ajaxJson = JSON.parse(coerceString(ajaxResponse.data)) as {
          status?: number;
          result?: {
            html?: string;
            chapters?: Array<{
              id?: unknown;
              name?: unknown;
              data_id?: unknown;
            }>;
          };
        };

        if (ajaxJson.status === 200 && ajaxJson.result) {
          if (typeof ajaxJson.result.html === "string") {
            const $chapter = this.cheerio.load(ajaxJson.result.html);
            $chapter("[data-id]").each((_i, el) => {
              const chapterNumText =
                $chapter(el).attr("data-name") ||
                $chapter(el).attr("data-number") ||
                "";
              const chapterId =
                $chapter(el).attr("data-id") ||
                $chapter(el).attr("data-chapter-id") ||
                "";
              if (!chapterNumText || !chapterId) return;

              const dateText =
                $chapter(el)
                  .text()
                  .trim()
                  .match(/([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/)?.[1] ?? "";
              const time = dateText ? new Date(dateText) : new Date(0);
              addChapter(chapterNumText, `Chapter ${chapterNumText}`, time);
            });
          } else if (Array.isArray(ajaxJson.result.chapters)) {
            for (const chapter of ajaxJson.result.chapters) {
              const chapterNumText = String(
                chapter.name ?? chapter.data_id ?? "",
              ).trim();
              if (!chapterNumText) continue;
              const time = new Date(0);
              addChapter(chapterNumText, `Chapter ${chapterNumText}`, time);
            }
          }
        }
      } catch {
        // Ignore AJAX failures and fall back to page scraping.
      }
    }

    chapters.sort((a, b) => b.chapNum - a.chapNum);
    return chapters;
  }

  async getChapterDetails(
    mangaId: string,
    chapterId: string,
  ): Promise<ChapterDetails> {
    let pages: string[] = [];

    const chapterMarker = chapterId.indexOf("_chapter-");
    let numericMangaId =
      chapterMarker > 0 ? chapterId.slice(0, chapterMarker) : "";
    const chapterNum =
      chapterMarker > 0
        ? chapterId.slice(chapterMarker + "_chapter-".length)
        : chapterId.replace(/^chapter-/, "");

    if (!numericMangaId) {
      try {
        const detailResponse = await this.requestManager.schedule(
          createGetRequest(`${this.baseUrl}/manga/${mangaId}`),
          1,
        );
        throwIfCloudflareBlocked(detailResponse.status);
        const detailHtml = coerceString(detailResponse.data);
        numericMangaId = detailHtml.match(/data-id="(\d+)"/)?.[1] ?? "";
      } catch {
        numericMangaId = "";
      }
    }

    if (numericMangaId) {
      try {
        const chapterListUrl = `${this.baseUrl}/ajax/read/${numericMangaId}/chapter/en`;
        const chapterListResponse = await this.requestManager.schedule(
          createGetRequest(chapterListUrl),
          1,
        );
        const chapterListJson = JSON.parse(
          coerceString(chapterListResponse.data),
        ) as {
          status?: number;
          result?: {
            html?: string;
            chapters?: Array<{ id?: unknown; name?: unknown }>;
          };
        };

        if (chapterListJson.status === 200 && chapterListJson.result) {
          let numericChapterId: string | null = null;

          if (typeof chapterListJson.result.html === "string") {
            const $chapter = this.cheerio.load(chapterListJson.result.html);
            $chapter("[data-id]").each((_i, el) => {
              const name =
                $chapter(el).attr("data-name") ||
                $chapter(el).attr("data-number") ||
                "";
              if (
                name === chapterNum ||
                parseFloat(name) === parseFloat(chapterNum)
              ) {
                numericChapterId = $chapter(el).attr("data-id") ?? null;
              }
            });
          } else if (Array.isArray(chapterListJson.result.chapters)) {
            const found = chapterListJson.result.chapters.find((chapter) => {
              const name = String(chapter.name ?? "");
              return (
                name === chapterNum ||
                parseFloat(name) === parseFloat(chapterNum)
              );
            });
            numericChapterId = found?.id != null ? String(found.id) : null;
          }

          if (numericChapterId) {
            const imageResponse = await this.requestManager.schedule(
              createGetRequest(
                `${this.baseUrl}/ajax/read/chapter/${numericChapterId}`,
              ),
              1,
            );
            const imageJson = JSON.parse(coerceString(imageResponse.data)) as {
              result?: { images?: unknown[]; webp_images?: unknown[] };
            };
            const imageList =
              imageJson?.result?.images ?? imageJson?.result?.webp_images ?? [];

            pages = imageList
              .map((image) =>
                Array.isArray(image) ? String(image[0]) : String(image),
              )
              .filter((url) => url.startsWith("http"));
          }
        }
      } catch {
        // Fall back to scraping the reader page.
      }
    }

    if (pages.length === 0) {
      try {
        const readerResponse = await this.requestManager.schedule(
          createGetRequest(
            `${this.baseUrl}/read/${mangaId}/en/chapter-${chapterNum}`,
          ),
          1,
        );
        const $ = this.cheerio.load(coerceString(readerResponse.data));

        $("img").each((_i, el) => {
          const src =
            $(el).attr("src") ||
            $(el).attr("data-src") ||
            $(el).attr("data-lazy-src") ||
            "";
          if (src && src.startsWith("http")) pages.push(src);
        });
      } catch {
        // Leave pages empty.
      }
    }

    const uniquePages = [...new Set(pages)];
    return App.createChapterDetails({
      id: chapterId,
      mangaId,
      pages: uniquePages,
    });
  }

  async getHomePageSections(
    sectionCallback: (section: HomeSection) => void,
  ): Promise<void> {
    const mostViewedShell = App.createHomeSection({
      id: "most_viewed",
      title: "Most Viewed",
      type: HomeSectionType.singleRowNormal,
      containsMoreItems: false,
    });
    const recentShell = App.createHomeSection({
      id: "recently_updated",
      title: "Recently Updated",
      type: HomeSectionType.singleRowNormal,
      containsMoreItems: true,
    });
    const newReleaseShell = App.createHomeSection({
      id: "new_release",
      title: "New Release",
      type: HomeSectionType.singleRowNormal,
      containsMoreItems: false,
    });

    sectionCallback(mostViewedShell);
    sectionCallback(recentShell);
    sectionCallback(newReleaseShell);

    const response = await this.requestManager.schedule(
      createGetRequest(`${this.baseUrl}/home`),
      1,
    );
    throwIfCloudflareBlocked(response.status);

    const $ = this.cheerio.load(coerceString(response.data));

    const parseUnit = (element: unknown) => {
      const $el = $(element as never);
      const href =
        ($el.is("a[href*='/manga/']")
          ? ($el.attr("href") ?? "")
          : ($el.find("a[href*='/manga/']").first().attr("href") ?? "")) || "";

      if (!href) return null;

      const mangaId = slugFromHref(href);
      if (!mangaId || mangaId.includes("/")) return null;

      const title =
        $el.find(".name, .title, h3, h4, h2").first().text().trim() ||
        $el.find("a[href*='/manga/']").first().attr("title")?.trim() ||
        $el.find("img").first().attr("alt")?.trim() ||
        "";

      if (!title) return null;

      const image =
        $el.find("img").first().attr("src") ||
        $el.find("img").first().attr("data-src") ||
        "";

      const subtitle =
        $el
          .find("a[href*='/read/'], .chapter a, .chap a")
          .first()
          .text()
          .trim() || undefined;

      return App.createPartialSourceManga({ mangaId, title, image, subtitle });
    };

    const mostViewedItems = [];
    $(
      "#most-viewed .unit, .most-viewed .unit, [id*='most-viewed'] .unit, .ranking .unit, ol.ranking li, section:has(h2:contains('Most Viewed')) .unit",
    ).each((_i, el) => {
      const tile = parseUnit(el);
      if (tile) mostViewedItems.push(tile);
    });

    const recentItems = [];
    $(
      "#recently-updated .unit, .recently-updated .unit, [id*='recently-updated'] .unit, section:has(h2:contains('Recently Updated')) .unit",
    ).each((_i, el) => {
      const tile = parseUnit(el);
      if (tile) recentItems.push(tile);
    });

    const newReleaseItems = [];
    $(
      "#new-releases .unit, .new-releases .unit, [id*='new-release'] .unit, [id*='new-arrival'] .unit, section:has(h2:contains('New Release')) .unit",
    ).each((_i, el) => {
      const tile = parseUnit(el);
      if (tile) newReleaseItems.push(tile);
    });

    if (
      mostViewedItems.length === 0 &&
      recentItems.length === 0 &&
      newReleaseItems.length === 0
    ) {
      $("a[href*='/manga/']").each((_i, el) => {
        const href = $(el).attr("href") ?? "";
        const mangaId = slugFromHref(href);
        if (!mangaId || mangaId.includes("/")) return;

        const title =
          $(el).attr("title")?.trim() ||
          $(el).find("img").first().attr("alt")?.trim() ||
          $(el).text().trim() ||
          "";
        const image =
          $(el).find("img").first().attr("src") ||
          $(el).find("img").first().attr("data-src") ||
          "";

        if (title) {
          recentItems.push(
            App.createPartialSourceManga({ mangaId, title, image }),
          );
        }
      });
    }

    const mostViewedFull = App.createHomeSection({
      id: "most_viewed",
      title: "Most Viewed",
      type: HomeSectionType.singleRowNormal,
      containsMoreItems: false,
    });
    mostViewedFull.items = mostViewedItems.slice(0, 20);
    sectionCallback(mostViewedFull);

    const recentFull = App.createHomeSection({
      id: "recently_updated",
      title: "Recently Updated",
      type: HomeSectionType.singleRowNormal,
      containsMoreItems: true,
    });
    recentFull.items = recentItems.slice(0, 20);
    sectionCallback(recentFull);

    const newReleaseFull = App.createHomeSection({
      id: "new_release",
      title: "New Release",
      type: HomeSectionType.singleRowNormal,
      containsMoreItems: false,
    });
    newReleaseFull.items = newReleaseItems.slice(0, 20);
    sectionCallback(newReleaseFull);
  }

  async getSearchResults(
    query: SearchRequest,
    metadata: unknown,
  ): Promise<PagedResults> {
    const page = getPageNumber(metadata);
    const keyword = encodeURIComponent(query.title ?? "");
    const url = `${this.baseUrl}/filter?keyword=${keyword}&page=${page}`;

    const response = await this.requestManager.schedule(
      createGetRequest(url),
      1,
    );
    throwIfCloudflareBlocked(response.status);

    const $ = this.cheerio.load(coerceString(response.data));
    const results = [];
    const seen = new Set<string>();

    $(".unit, [class*='unit']").each((_i, el) => {
      const $el = $(el);
      const href = $el.find("a[href*='/manga/']").first().attr("href") ?? "";
      const mangaId = slugFromHref(href);
      if (!mangaId || mangaId.includes("/") || seen.has(mangaId)) return;

      seen.add(mangaId);

      const title =
        $el.find(".name, .title, h3").first().text().trim() ||
        $el.find("a[href*='/manga/']").first().attr("title")?.trim() ||
        $el.find("img").first().attr("alt")?.trim() ||
        "";
      const image =
        $el.find("img").first().attr("src") ||
        $el.find("img").first().attr("data-src") ||
        "";

      if (title) {
        results.push(App.createPartialSourceManga({ mangaId, title, image }));
      }
    });

    if (results.length === 0) {
      $("a[href*='/manga/']").each((_i, el) => {
        const href = $(el).attr("href") ?? "";
        const mangaId = slugFromHref(href);
        if (!mangaId || mangaId.includes("/") || seen.has(mangaId)) return;

        seen.add(mangaId);

        const title =
          $(el).attr("title")?.trim() ||
          $(el).find("img").first().attr("alt")?.trim() ||
          $(el).text().trim() ||
          "";
        const image =
          $(el).find("img").first().attr("src") ||
          $(el).find("img").first().attr("data-src") ||
          "";

        if (title) {
          results.push(App.createPartialSourceManga({ mangaId, title, image }));
        }
      });
    }

    const hasMore = results.length >= 18;

    return App.createPagedResults({
      results,
      metadata: hasMore ? { page: page + 1 } : undefined,
    });
  }

  getMangaShareUrl(mangaId: string): string {
    return `${this.baseUrl}/manga/${mangaId}`;
  }
}
