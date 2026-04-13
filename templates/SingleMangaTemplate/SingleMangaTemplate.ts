// ─────────────────────────────────────────────────────────────────────────────
// SINGLE-MANGA TEMPLATE
//
// Use this template when the target site hosts only ONE manga title.
// The source exposes that single title on the home page and in search,
// and lets the user browse its chapter list and read pages.
//
// Steps to adapt:
//   1. Replace every TEMPLATE_NAME  → your source class name (e.g. ReadJJKColored)
//   2. Replace TEMPLATE_DOMAIN      → the real base URL (e.g. https://readjjkcolored.com)
//   3. Replace TEMPLATE_AUTHOR      → your GitHub username
//   4. Update MANGA_ID_SLUG         → the URL path slug of the manga page
//   5. Adjust selectors in SingleMangaTemplateParser.ts to match the real HTML
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

import { SingleMangaTemplateParser } from "./SingleMangaTemplateParser";

// ── Constants ────────────────────────────────────────────────────────────────

const TEMPLATE_BASE_URL = "https://TEMPLATE_DOMAIN.com";
const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1";

/**
 * The URL path to the single manga's detail page.
 * e.g. if the full URL is https://example.com/manga/my-title
 * then set this to 'manga/my-title'
 */
const MANGA_ID_SLUG = "manga/TEMPLATE_MANGA_SLUG";

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
  readonly parser = new SingleMangaTemplateParser();
  readonly baseUrl = TEMPLATE_BASE_URL;
  readonly mangaIdSlug = MANGA_ID_SLUG;
  readonly requestManager = createSourceRequestManager(TEMPLATE_BASE_URL);

  async getCloudflareBypassRequestAsync(): Promise<Request> {
    return createCloudflareBypassRequest(this.baseUrl);
  }

  async getMangaDetails(_mangaId: string): Promise<SourceManga> {
    const response = await this.requestManager.schedule(
      createGetRequest(`${this.baseUrl}/${this.mangaIdSlug}`),
      1,
    );
    throwIfCloudflareBlocked(response.status);
    const $ = this.cheerio.load(response.data as string);
    return this.parser.parseMangaDetails($, this.mangaIdSlug);
  }

  async getChapters(_mangaId: string): Promise<Chapter[]> {
    const response = await this.requestManager.schedule(
      createGetRequest(`${this.baseUrl}/${this.mangaIdSlug}`),
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

  // ── Home page ─────────────────────────────────────────────────────────────

  async getHomePageSections(
    sectionCallback: (section: HomeSection) => void,
  ): Promise<void> {
    const section = App.createHomeSection({
      id: "single_manga",
      title: "TEMPLATE_NAME",
      type: HomeSectionType.singleRowNormal,
      containsMoreItems: false,
    });

    sectionCallback(section);

    const response = await this.requestManager.schedule(
      createGetRequest(`${this.baseUrl}/${this.mangaIdSlug}`),
      1,
    );
    throwIfCloudflareBlocked(response.status);
    const $ = this.cheerio.load(response.data as string);

    section.items = [this.parser.parseMangaTile($, this.mangaIdSlug)];
    sectionCallback(section);
  }

  // ── Search ────────────────────────────────────────────────────────────────

  async getSearchResults(
    searchQuery: SearchRequest,
    _metadata: unknown,
  ): Promise<PagedResults> {
    const query = (searchQuery.title ?? "").toLowerCase();
    // Replace these keywords with ones relevant to your site's title
    const titleWords = ["manga", "comic"];

    const matches = !query || titleWords.some((w) => query.includes(w));

    if (!matches) {
      return App.createPagedResults({ results: [] });
    }

    const response = await this.requestManager.schedule(
      createGetRequest(`${this.baseUrl}/${this.mangaIdSlug}`),
      1,
    );
    throwIfCloudflareBlocked(response.status);
    const $ = this.cheerio.load(response.data as string);

    return App.createPagedResults({
      results: [this.parser.parseMangaTile($, this.mangaIdSlug)],
    });
  }

  getMangaShareUrl(mangaId: string): string {
    return `${this.baseUrl}/${mangaId}`;
  }
}
