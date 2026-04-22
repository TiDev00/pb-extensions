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
  getPageNumber,
  throwIfCloudflareBlocked,
} from "../shared";

import {
  CatalogManga,
  CATALOG_PATH,
  PAGE_SIZE,
  PunkRecordzParser,
} from "./PunkRecordzParser";

// ── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = "https://punkrecordz.com";
const HOME_SECTION_ID = "catalog";

// ── Source metadata ──────────────────────────────────────────────────────────

export const PunkRecordzInfo: SourceInfo = {
  version: "1.0.0",
  name: "PunkRecordz",
  icon: "icon.png",
  author: "TiDev00",
  description: "Read colored manga from PunkRecordz.com",
  contentRating: ContentRating.EVERYONE,
  websiteBaseURL: BASE_URL,
  sourceTags: [
    { text: "French", type: BadgeColor.GREY },
    { text: "Colored", type: BadgeColor.BLUE },
  ],
  intents:
    SourceIntents.MANGA_CHAPTERS |
    SourceIntents.HOMEPAGE_SECTIONS |
    SourceIntents.CLOUDFLARE_BYPASS_REQUIRED,
};

export class PunkRecordz extends Source {
  readonly parser = new PunkRecordzParser();
  readonly baseUrl = BASE_URL;
  readonly requestManager = createSourceRequestManager(BASE_URL);

  private catalogCache: CatalogManga[] | null = null;
  private catalogPromise: Promise<CatalogManga[]> | null = null;

  async getCloudflareBypassRequestAsync(): Promise<Request> {
    return createCloudflareBypassRequest(this.baseUrl);
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const [catalog, { $ }] = await Promise.all([
      this.loadCatalog(),
      this.fetchDocument(`${CATALOG_PATH}/${mangaId}`),
    ]);
    const catalogEntry = catalog.find((entry) => entry.mangaId === mangaId);
    return this.parser.parseMangaDetails($, mangaId, catalogEntry);
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const { $ } = await this.fetchDocument(`${CATALOG_PATH}/${mangaId}`);
    return this.parser.parseChapterList($, mangaId);
  }

  async getChapterDetails(
    mangaId: string,
    chapterId: string,
  ): Promise<ChapterDetails> {
    const chapterPath = chapterId.startsWith(`${CATALOG_PATH}/`)
      ? chapterId
      : `${CATALOG_PATH}/${mangaId}/${chapterId}`;
    const { $ } = await this.fetchDocument(chapterPath);
    return this.parser.parseChapterDetails($, mangaId, chapterId);
  }

  async getHomePageSections(
    sectionCallback: (section: HomeSection) => void,
  ): Promise<void> {
    sectionCallback(
      App.createHomeSection({
        id: HOME_SECTION_ID,
        title: "Catalog",
        type: HomeSectionType.singleRowNormal,
        containsMoreItems: true,
      }),
    );

    const catalog = await this.loadCatalog();
    const populated = App.createHomeSection({
      id: HOME_SECTION_ID,
      title: "Catalog",
      type: HomeSectionType.singleRowNormal,
      containsMoreItems: catalog.length > PAGE_SIZE,
    });
    populated.items = catalog
      .slice(0, PAGE_SIZE)
      .map((entry) => this.parser.toPartialSourceManga(entry));
    sectionCallback(populated);
  }

  async getViewMoreItems(
    homepageSectionId: string,
    metadata: unknown,
  ): Promise<PagedResults> {
    if (homepageSectionId !== HOME_SECTION_ID) {
      return App.createPagedResults({ results: [] });
    }

    const page = getPageNumber(metadata);
    const catalog = await this.loadCatalog();
    return this.parser.pagedResults(catalog, page);
  }

  async getSearchResults(
    searchQuery: SearchRequest,
    metadata: unknown,
  ): Promise<PagedResults> {
    const page = getPageNumber(metadata);
    const catalog = await this.loadCatalog();
    const filtered = this.parser.filterCatalog(
      catalog,
      searchQuery.title ?? "",
    );
    return this.parser.pagedResults(filtered, page);
  }

  getMangaShareUrl(mangaId: string): string {
    return `${this.baseUrl}/${CATALOG_PATH}/${mangaId}`;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async fetchDocument(
    path: string,
  ): Promise<{ html: string; $: CheerioAPI }> {
    const response = await this.requestManager.schedule(
      createGetRequest(`${this.baseUrl}/${path}`),
      1,
    );
    throwIfCloudflareBlocked(response.status);

    const html =
      typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);
    return { html, $: this.cheerio.load(html) };
  }

  private async loadCatalog(): Promise<CatalogManga[]> {
    if (this.catalogCache) return this.catalogCache;
    if (this.catalogPromise) return this.catalogPromise;

    this.catalogPromise = this.fetchCatalog();

    try {
      this.catalogCache = await this.catalogPromise;
      return this.catalogCache;
    } finally {
      this.catalogPromise = null;
    }
  }

  private async fetchCatalog(): Promise<CatalogManga[]> {
    const { html, $ } = await this.fetchDocument(CATALOG_PATH);
    const catalog = this.parser.parseCatalog($, html);

    if (catalog.length > 0) return catalog;
    throw new Error("PunkRecordz catalog parsing failed.");
  }
}
