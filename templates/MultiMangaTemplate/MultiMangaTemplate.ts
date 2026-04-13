// ─────────────────────────────────────────────────────────────────────────────
// MULTI-MANGA TEMPLATE
//
// Use this template when the target site hosts a full catalogue of manga titles
// with search, browse, home sections, and pagination.
//
// Steps to adapt:
//   1. Replace every TEMPLATE_NAME  → your source class name (e.g. SushiScan)
//   2. Replace TEMPLATE_DOMAIN      → real base URL (e.g. https://sushiscan.net)
//   3. Replace TEMPLATE_AUTHOR      → your GitHub username
//   4. Review the URL patterns in getViewMoreItems() and searchRequest()
//   5. Adjust selectors in MultiMangaTemplateParser.ts to match the real HTML
// ─────────────────────────────────────────────────────────────────────────────

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

import { MultiMangaTemplateParser } from "./MultiMangaTemplateParser";

// ── Constants ────────────────────────────────────────────────────────────────

const TEMPLATE_BASE_URL = "https://TEMPLATE_DOMAIN.com";
const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1";

// Keep this helper block in sync with src/shared.ts.
// Templates stay self-contained so copied sources do not depend on repo-only modules.
function createSourceRequestManager(baseUrl: string) {
  return App.createRequestManager({
    requestsPerSecond: 4,
    requestTimeout: 20_000,
    interceptor: {
      interceptRequest: async (request: Request): Promise<Request> => ({
        ...request,
        headers: {
          ...(request.headers ?? {}),
          "user-agent": MOBILE_USER_AGENT,
          referer: baseUrl,
        },
      }),
      interceptResponse: async (response) => response,
    },
  });
}

function createGetRequest(url: string): Request {
  return App.createRequest({ url, method: "GET" });
}

function createCloudflareBypassRequest(baseUrl: string): Request {
  return createGetRequest(baseUrl);
}

function throwIfCloudflareBlocked(status: number): void {
  if (status === 403 || status === 503) {
    throw new Error(
      'CLOUDFLARE BYPASS ERROR:\nGo to Source settings and tap "Cloudflare Bypass".',
    );
  }
}

// ── Source metadata ──────────────────────────────────────────────────────────

export const TEMPLATE_NAMEInfo: SourceInfo = {
  version: "1.0.0",
  name: "TEMPLATE_NAME",
  icon: "icon.png",
  author: "TEMPLATE_AUTHOR",
  authorWebsite: "https://github.com/TEMPLATE_AUTHOR",
  description: "Paperback extension for TEMPLATE_DOMAIN.com",
  contentRating: ContentRating.EVERYONE,
  websiteBaseURL: TEMPLATE_BASE_URL,
  sourceTags: [{ text: "English", type: BadgeColor.GREY }],
  intents:
    SourceIntents.MANGA_CHAPTERS |
    SourceIntents.HOMEPAGE_SECTIONS |
    SourceIntents.CLOUDFLARE_BYPASS_REQUIRED,
};

// ── Source class ─────────────────────────────────────────────────────────────

export class TEMPLATE_NAME extends Source {
  readonly parser = new MultiMangaTemplateParser();
  readonly baseUrl = TEMPLATE_BASE_URL;
  readonly requestManager = createSourceRequestManager(TEMPLATE_BASE_URL);

  async getCloudflareBypassRequestAsync(): Promise<Request> {
    return createCloudflareBypassRequest(this.baseUrl);
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const response = await this.requestManager.schedule(
      createGetRequest(`${this.baseUrl}/${mangaId}`),
      1,
    );
    throwIfCloudflareBlocked(response.status);
    const $ = this.cheerio.load(response.data as string);
    return this.parser.parseMangaDetails($, mangaId);
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const response = await this.requestManager.schedule(
      createGetRequest(`${this.baseUrl}/${mangaId}`),
      1,
    );
    throwIfCloudflareBlocked(response.status);
    const $ = this.cheerio.load(response.data as string);
    return this.parser.parseChapterList($);
  }

  async getChapterDetails(
    mangaId: string,
    chapterId: string,
  ): Promise<ChapterDetails> {
    const response = await this.requestManager.schedule(
      createGetRequest(`${this.baseUrl}/${chapterId}`),
      1,
    );
    throwIfCloudflareBlocked(response.status);
    const $ = this.cheerio.load(response.data as string);
    return this.parser.parseChapterDetails($, mangaId, chapterId);
  }

  async getHomePageSections(
    sectionCallback: (section: HomeSection) => void,
  ): Promise<void> {
    const sections = [
      App.createHomeSection({
        id: "latest_updates",
        title: "Latest Updates",
        type: HomeSectionType.singleRowNormal,
        containsMoreItems: true,
      }),
      App.createHomeSection({
        id: "popular",
        title: "Popular",
        type: HomeSectionType.singleRowNormal,
        containsMoreItems: true,
      }),
      App.createHomeSection({
        id: "new_manga",
        title: "New Titles",
        type: HomeSectionType.singleRowNormal,
        containsMoreItems: true,
      }),
    ];

    for (const s of sections) sectionCallback(s);

    const response = await this.requestManager.schedule(
      createGetRequest(this.baseUrl),
      1,
    );
    throwIfCloudflareBlocked(response.status);
    const $ = this.cheerio.load(response.data as string);

    sections[0]!.items = this.parser.parseLatestUpdates($);
    sectionCallback(sections[0]!);

    sections[1]!.items = this.parser.parsePopular($);
    sectionCallback(sections[1]!);

    sections[2]!.items = this.parser.parseNewManga($);
    sectionCallback(sections[2]!);
  }

  async getViewMoreItems(
    homepageSectionId: string,
    metadata: unknown,
  ): Promise<PagedResults> {
    const page: number = (metadata as { page?: number })?.page ?? 1;

    const urlMap: Record<string, string> = {
      latest_updates: `${this.baseUrl}/?order=latest&page=${page}`,
      popular: `${this.baseUrl}/?order=popular&page=${page}`,
      new_manga: `${this.baseUrl}/?order=new&page=${page}`,
    };

    const url = urlMap[homepageSectionId];
    if (!url) return App.createPagedResults({ results: [] });

    const response = await this.requestManager.schedule(
      createGetRequest(url),
      1,
    );
    throwIfCloudflareBlocked(response.status);
    const $ = this.cheerio.load(response.data as string);

    return App.createPagedResults({
      results: this.parser.parseMangaGrid($),
      metadata: this.parser.hasNextPage($) ? { page: page + 1 } : undefined,
    });
  }

  async getSearchResults(
    searchQuery: SearchRequest,
    metadata: unknown,
  ): Promise<PagedResults> {
    const page: number = (metadata as { page?: number })?.page ?? 1;
    const query = encodeURIComponent(searchQuery.title ?? "");
    const url = `${this.baseUrl}/?s=${query}&page=${page}`;

    const response = await this.requestManager.schedule(
      createGetRequest(url),
      1,
    );
    throwIfCloudflareBlocked(response.status);
    const $ = this.cheerio.load(response.data as string);

    return App.createPagedResults({
      results: this.parser.parseSearchResults($),
      metadata: this.parser.hasNextPage($) ? { page: page + 1 } : undefined,
    });
  }

  getMangaShareUrl(mangaId: string): string {
    return `${this.baseUrl}/${mangaId}`;
  }
}
