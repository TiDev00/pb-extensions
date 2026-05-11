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
} from "@paperback/types";
import { CheerioAPI } from "cheerio";

import {
  createCloudflareBypassRequest,
  createGetRequest,
  createSourceRequestManager,
  throwIfCloudflareBlocked,
} from "../shared";

import { WeebCentralParser } from "./WeebCentralParser";

// ── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = "https://weebcentral.com";

// ── Source metadata ──────────────────────────────────────────────────────────

export const WeebCentralInfo: SourceInfo = {
  version: "1.0.0",
  name: "WeebCentral",
  icon: "icon.png",
  author: "TiDev00",
  description: "Read manga from WeebCentral.com",
  contentRating: ContentRating.EVERYONE,
  websiteBaseURL: BASE_URL,
  sourceTags: [{ text: "English", type: BadgeColor.GREY }],
  intents:
    SourceIntents.MANGA_CHAPTERS |
    SourceIntents.HOMEPAGE_SECTIONS |
    SourceIntents.CLOUDFLARE_BYPASS_REQUIRED,
};

// ── Source class ─────────────────────────────────────────────────────────────

export class WeebCentral extends Source {
  readonly parser = new WeebCentralParser();
  readonly baseUrl = BASE_URL;
  readonly requestManager = createSourceRequestManager(BASE_URL);

  async getCloudflareBypassRequestAsync(): Promise<Request> {
    return createCloudflareBypassRequest(this.baseUrl);
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const { $ } = await this.fetchDocument(`/series/${mangaId}`);
    return this.parser.parseMangaDetails($, mangaId);
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const seriesId = mangaId.split("/")[0];
    const { $ } = await this.fetchDocument(
      `/series/${seriesId}/full-chapter-list`,
    );
    return this.parser.parseChapterList($, mangaId);
  }

  async getChapterDetails(
    mangaId: string,
    chapterId: string,
  ): Promise<ChapterDetails> {
    // Images are loaded via HTMX — request the dedicated endpoint directly
    const { $ } = await this.fetchDocument(
      `/chapters/${chapterId}/images?reading_style=long_strip`,
      { "HX-Request": "true" },
    );
    return this.parser.parseChapterDetails($, mangaId, chapterId);
  }

  async getHomePageSections(
    sectionCallback: (section: HomeSection) => void,
  ): Promise<void> {
    // Emit an empty shell so the UI shows a loading indicator
    sectionCallback(
      App.createHomeSection({
        id: "latest",
        title: "Latest Updates",
        type: HomeSectionType.singleRowNormal,
        containsMoreItems: false,
      }),
    );

    const { $ } = await this.fetchDocument("/");
    const items = this.parser.parseHomeSections($);

    const populated = App.createHomeSection({
      id: "latest",
      title: "Latest Updates",
      type: HomeSectionType.singleRowNormal,
      containsMoreItems: false,
    });
    populated.items = items;
    sectionCallback(populated);
  }

  async getSearchResults(
    searchQuery: SearchRequest,
    _metadata: unknown,
  ): Promise<PagedResults> {
    const query = (searchQuery.title ?? "").trim();

    if (!query) {
      // Empty query: return the homepage latest-update tiles
      const { $ } = await this.fetchDocument("/");
      return App.createPagedResults({
        results: this.parser.parseHomeSections($),
      });
    }

    // Non-empty query: use the quick-search POST endpoint
    const { $ } = await this.postDocument(
      "/search/simple?location=main",
      `text=${encodeURIComponent(query)}`,
      { "HX-Request": "true" },
    );
    return App.createPagedResults({
      results: this.parser.parseSimpleSearch($),
    });
  }

  getMangaShareUrl(mangaId: string): string {
    return `${this.baseUrl}/series/${mangaId}`;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async fetchDocument(
    path: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ $: CheerioAPI }> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;

    const request = createGetRequest(url);
    if (Object.keys(extraHeaders).length) {
      request.headers = { ...(request.headers ?? {}), ...extraHeaders };
    }

    const response = await this.requestManager.schedule(request, 1);
    throwIfCloudflareBlocked(response.status);

    const html =
      typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);

    return { $: this.cheerio.load(html) };
  }

  private async postDocument(
    path: string,
    body: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ $: CheerioAPI }> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;

    const request = App.createRequest({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...extraHeaders,
      },
      data: body,
    });

    const response = await this.requestManager.schedule(request, 1);
    throwIfCloudflareBlocked(response.status);

    const html =
      typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);

    return { $: this.cheerio.load(html) };
  }
}
