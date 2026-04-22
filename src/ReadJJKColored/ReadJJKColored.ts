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

import {
  createCloudflareBypassRequest,
  createGetRequest,
  createSourceRequestManager,
  throwIfCloudflareBlocked,
} from "../shared";

import { ReadJJKColoredParser, SiteConfig } from "./ReadJJKColoredParser";

// ── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = "https://readjjkcolored.com";
const CONFIG_URL = `${BASE_URL}/config.js`;

// ── Source metadata ──────────────────────────────────────────────────────────

export const ReadJJKColoredInfo: SourceInfo = {
  version: "1.0.0",
  name: "ReadJJKColored",
  icon: "icon.png",
  author: "TiDev00",
  description:
    "Read Jujutsu Kaisen in full AI-colorized HD from readjjkcolored.com",
  contentRating: ContentRating.EVERYONE,
  websiteBaseURL: BASE_URL,
  sourceTags: [
    { text: "English", type: BadgeColor.GREY },
    { text: "Colored", type: BadgeColor.BLUE },
  ],
  intents:
    SourceIntents.MANGA_CHAPTERS |
    SourceIntents.HOMEPAGE_SECTIONS |
    SourceIntents.CLOUDFLARE_BYPASS_REQUIRED,
};

// ── Source class ─────────────────────────────────────────────────────────────

export class ReadJJKColored extends Source {
  readonly parser = new ReadJJKColoredParser();
  readonly baseUrl = BASE_URL;
  readonly requestManager = createSourceRequestManager(BASE_URL);

  /** In-memory cache — avoids re-fetching config.js on every method call */
  private _config: SiteConfig | null = null;

  async getCloudflareBypassRequestAsync(): Promise<Request> {
    return createCloudflareBypassRequest(this.baseUrl);
  }

  async getMangaDetails(_mangaId: string): Promise<SourceManga> {
    const cfg = await this.loadConfig();
    return this.parser.parseMangaDetails(cfg);
  }

  async getChapters(_mangaId: string): Promise<Chapter[]> {
    const cfg = await this.loadConfig();
    return this.parser.parseChapterList(cfg);
  }

  async getChapterDetails(
    _mangaId: string,
    chapId: string,
  ): Promise<ChapterDetails> {
    const cfg = await this.loadConfig();
    return this.parser.parseChapterDetails(cfg, chapId);
  }

  async getHomePageSections(
    sectionCallback: (section: HomeSection) => void,
  ): Promise<void> {
    sectionCallback(
      App.createHomeSection({
        id: "jjk_colored",
        title: "Jujutsu Kaisen – Colored",
        type: HomeSectionType.singleRowNormal,
        containsMoreItems: false,
      }),
    );

    const cfg = await this.loadConfig();
    const populated = App.createHomeSection({
      id: "jjk_colored",
      title: "Jujutsu Kaisen – Colored",
      type: HomeSectionType.singleRowNormal,
      containsMoreItems: false,
    });
    populated.items = this.parser.parseHomeItems(cfg);
    sectionCallback(populated);
  }

  async getSearchResults(
    query: SearchRequest,
    _metadata: unknown,
  ): Promise<PagedResults> {
    if (!this.parser.matchesSearchQuery(query.title ?? "")) {
      return App.createPagedResults({ results: [] });
    }

    const cfg = await this.loadConfig();
    return App.createPagedResults({ results: this.parser.parseHomeItems(cfg) });
  }

  getMangaShareUrl(mangaId: string): string {
    return `${this.baseUrl}/?manga=${mangaId}`;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async loadConfig(): Promise<SiteConfig> {
    if (this._config) return this._config;
    const response = await this.requestManager.schedule(
      createGetRequest(CONFIG_URL),
      1,
    );
    throwIfCloudflareBlocked(response.status);
    this._config = this.parser.parseConfigJs(response.data as string);
    return this._config;
  }
}
