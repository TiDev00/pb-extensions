import {
  BadgeColor,
  Chapter,
  ChapterDetails,
  ContentRating,
  HomeSection,
  HomeSectionType,
  PagedResults,
  PartialSourceManga,
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

const BASE_URL = "https://punkrecordz.com";
const CATALOG_PATH = "mangas";
const HOME_SECTION_ID = "catalog";
const PAGE_SIZE = 20;
const API_IMAGE_BASE_URL = "https://api.punkrecordz.com/images/webp";

interface CatalogManga {
  mangaId: string;
  title: string;
  image: string;
  subtitle?: string;
}

interface ChapterRecord {
  chapterId: string;
  chapNum: number;
  name: string;
}

function coerceString(data: unknown): string {
  if (typeof data === "string") return data;
  if (data != null) return JSON.stringify(data);
  return "";
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeTitle(title: string): string {
  return normalizeWhitespace(
    title
      .replace(/\s*\|\s*Punk\s*Record(?:s|z).*$|\s*\|\s*PunkRecordz.*$/i, "")
      .replace(/\s*-\s*Tous les chapitres scan couleur\s*$/i, "")
      .replace(/\s*-\s*Scan couleur\s*$/i, ""),
  );
}

function absoluteUrl(url: string): string {
  const trimmedUrl = normalizeWhitespace(url);
  if (!trimmedUrl) return "";
  if (trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")) {
    return trimmedUrl;
  }
  if (trimmedUrl.startsWith("//")) {
    return `https:${trimmedUrl}`;
  }
  if (trimmedUrl.startsWith("/")) {
    return `${BASE_URL}${trimmedUrl}`;
  }
  return `${BASE_URL}/${trimmedUrl}`;
}

function normalizePath(url: string): string {
  return absoluteUrl(url)
    .replace(/^https?:\/\/[^/]+\/?/i, "")
    .split("?")[0]
    .split("#")[0]
    .replace(/^\/+|\/+$/g, "");
}

function normalizeSearchText(text: string): string {
  return normalizeWhitespace(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase();
}

function extractChapterNumber(text: string): number {
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match?.[1]) return 0;

  const chapterNumber = parseFloat(match[1]);
  return Number.isNaN(chapterNumber) ? 0 : chapterNumber;
}

function buildImageUrlFromThumb(thumb: string): string {
  const normalizedThumb = normalizeWhitespace(thumb);
  if (!normalizedThumb) return "";
  return `${API_IMAGE_BASE_URL}/${normalizedThumb}.webp`;
}

function toPartialSourceManga(manga: CatalogManga): PartialSourceManga {
  return App.createPartialSourceManga({
    mangaId: manga.mangaId,
    image: manga.image,
    title: manga.title,
    subtitle: manga.subtitle,
  });
}

function parseCatalogTiles($: CheerioAPI): CatalogManga[] {
  const mangaMap = new Map<string, CatalogManga>();

  $("a[href*='/mangas/']").each((_index, element) => {
    const mangaPath = normalizePath($(element).attr("href") ?? "");
    const parts = mangaPath.split("/").filter(Boolean);
    if (parts.length !== 2 || parts[0] !== CATALOG_PATH) return;

    const mangaId = parts[1] ?? "";
    const title =
      normalizeTitle($(element).find("h4").first().text()) ||
      normalizeTitle($(element).find("img[alt]").first().attr("alt") ?? "") ||
      mangaId;

    const image = absoluteUrl(
      $(element).find("img[alt]").first().attr("src") ??
        $(element).find("img[alt]").first().attr("data-src") ??
        "",
    );

    mangaMap.set(mangaId, {
      mangaId,
      title,
      image,
    });
  });

  return [...mangaMap.values()];
}

function parseCatalogPayload(html: string): CatalogManga[] {
  const mangaMap = new Map<string, CatalogManga>();
  const normalizedHtml = html.replace(/\\"/g, '"');
  const payloadPattern =
    /"__typename":"Manga","id":"[^"]+","name":"([^"]+)","slug":"([^"]+)","thumb":"([^"]+)","published":true/g;

  for (const match of normalizedHtml.matchAll(payloadPattern)) {
    const title = normalizeTitle(match[1] ?? "");
    const mangaId = normalizeWhitespace(match[2] ?? "");
    const thumb = normalizeWhitespace(match[3] ?? "");

    if (!mangaId || !title) continue;

    mangaMap.set(mangaId, {
      mangaId,
      title,
      image: buildImageUrlFromThumb(thumb),
    });
  }

  return [...mangaMap.values()];
}

function mergeCatalogEntries(
  htmlEntries: CatalogManga[],
  payloadEntries: CatalogManga[],
): CatalogManga[] {
  const mergedEntries = new Map<string, CatalogManga>();
  const orderedIds: string[] = [];

  const upsert = (entry: CatalogManga): void => {
    const existingEntry = mergedEntries.get(entry.mangaId);
    if (!existingEntry) {
      mergedEntries.set(entry.mangaId, entry);
      orderedIds.push(entry.mangaId);
      return;
    }

    mergedEntries.set(entry.mangaId, {
      mangaId: entry.mangaId,
      title: entry.title || existingEntry.title,
      image: entry.image || existingEntry.image,
      subtitle: entry.subtitle ?? existingEntry.subtitle,
    });
  };

  htmlEntries.forEach(upsert);
  payloadEntries.forEach(upsert);

  return orderedIds
    .map((mangaId) => mergedEntries.get(mangaId))
    .filter((entry): entry is CatalogManga => entry != null);
}

function parseChapterList($: CheerioAPI, mangaId: string): ChapterRecord[] {
  const chapterMap = new Map<string, ChapterRecord>();

  $(`a[href*='/${CATALOG_PATH}/${mangaId}/']`).each((_index, element) => {
    const chapterPath = normalizePath($(element).attr("href") ?? "");
    const parts = chapterPath.split("/").filter(Boolean);
    if (parts.length !== 3) return;
    if (parts[0] !== CATALOG_PATH || parts[1] !== mangaId) return;

    const chapterSlug = parts[2] ?? "";
    if (!chapterSlug) return;

    const rawName = normalizeWhitespace($(element).text());
    const chapterNumber =
      extractChapterNumber(chapterSlug) || extractChapterNumber(rawName);
    const resolvedName =
      rawName || (chapterNumber > 0 ? `Chapitre ${chapterSlug}` : chapterSlug);

    const nextRecord: ChapterRecord = {
      chapterId: chapterPath,
      chapNum: chapterNumber,
      name: resolvedName,
    };

    const existingRecord = chapterMap.get(chapterPath);
    if (
      !existingRecord ||
      existingRecord.name.length < nextRecord.name.length
    ) {
      chapterMap.set(chapterPath, nextRecord);
    }
  });

  return [...chapterMap.values()].sort((left, right) => {
    if (right.chapNum !== left.chapNum) return right.chapNum - left.chapNum;
    return right.chapterId.localeCompare(left.chapterId, "en");
  });
}

function parseChapterImageUrls($: CheerioAPI): string[] {
  const prioritizedUrls: string[] = [];
  const fallbackUrls: string[] = [];

  $("img").each((_index, element) => {
    const imageUrl = absoluteUrl(
      $(element).attr("data-src") ??
        $(element).attr("src") ??
        $(element).attr("data-lazy-src") ??
        "",
    );
    if (!imageUrl || !imageUrl.includes("api.punkrecordz.com/images/")) return;

    const alt = normalizeSearchText($(element).attr("alt") ?? "");
    if (alt.includes("page")) {
      prioritizedUrls.push(imageUrl);
      return;
    }

    fallbackUrls.push(imageUrl);
  });

  const resolvedUrls =
    prioritizedUrls.length > 0 ? prioritizedUrls : fallbackUrls;
  return [...new Set(resolvedUrls)];
}

function createPagedCatalogResults(
  entries: CatalogManga[],
  page: number,
): PagedResults {
  const start = (page - 1) * PAGE_SIZE;
  const results = entries
    .slice(start, start + PAGE_SIZE)
    .map(toPartialSourceManga);
  const hasNextPage = start + PAGE_SIZE < entries.length;

  return App.createPagedResults({
    results,
    metadata: hasNextPage ? { page: page + 1 } : undefined,
  });
}

export const PunkRecordzInfo: SourceInfo = {
  version: "1.0.0",
  name: "PunkRecordz",
  icon: "icon.png",
  author: "TiDev00",
  description: "Read colored manga from Punk Recordz.",
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

    const title =
      normalizeTitle($("h2").first().text()) ||
      normalizeTitle($("meta[property='og:title']").attr("content") ?? "") ||
      catalogEntry?.title ||
      mangaId;

    const description =
      normalizeWhitespace(
        $("meta[name='description']").attr("content") ?? "",
      ) ||
      normalizeWhitespace($("nav[aria-label] p").first().text()) ||
      "";

    const image =
      absoluteUrl($("meta[property='og:image']").attr("content") ?? "") ||
      catalogEntry?.image ||
      "";

    return App.createSourceManga({
      id: mangaId,
      mangaInfo: App.createMangaInfo({
        titles: [title],
        image,
        desc: description,
        status: "Ongoing",
        hentai: false,
      }),
    });
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const { $ } = await this.fetchDocument(`${CATALOG_PATH}/${mangaId}`);
    return parseChapterList($, mangaId).map((chapter) =>
      App.createChapter({
        id: chapter.chapterId,
        chapNum: chapter.chapNum,
        name: chapter.name,
        langCode: "fr",
        time: new Date(0),
      }),
    );
  }

  async getChapterDetails(
    mangaId: string,
    chapterId: string,
  ): Promise<ChapterDetails> {
    const chapterPath = chapterId.startsWith(`${CATALOG_PATH}/`)
      ? chapterId
      : `${CATALOG_PATH}/${mangaId}/${chapterId}`;
    const { $ } = await this.fetchDocument(chapterPath);
    const pages = parseChapterImageUrls($);

    if (!pages.length) {
      throw new Error(
        `PunkRecordz chapter page parsing failed for ${chapterPath}.`,
      );
    }

    return App.createChapterDetails({
      id: chapterId,
      mangaId,
      pages,
    });
  }

  async getHomePageSections(
    sectionCallback: (section: HomeSection) => void,
  ): Promise<void> {
    const shellSection = App.createHomeSection({
      id: HOME_SECTION_ID,
      title: "Catalog",
      type: HomeSectionType.singleRowNormal,
      containsMoreItems: true,
    });
    sectionCallback(shellSection);

    const catalog = await this.loadCatalog();
    const populatedSection = App.createHomeSection({
      id: HOME_SECTION_ID,
      title: "Catalog",
      type: HomeSectionType.singleRowNormal,
      containsMoreItems: catalog.length > PAGE_SIZE,
    });
    populatedSection.items = catalog
      .slice(0, PAGE_SIZE)
      .map(toPartialSourceManga);

    sectionCallback(populatedSection);
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
    return createPagedCatalogResults(catalog, page);
  }

  async getSearchResults(
    searchQuery: SearchRequest,
    metadata: unknown,
  ): Promise<PagedResults> {
    const page = getPageNumber(metadata);
    const searchTitle = normalizeSearchText(searchQuery.title ?? "");
    const catalog = await this.loadCatalog();
    const filteredCatalog = !searchTitle
      ? catalog
      : catalog.filter((entry) =>
          normalizeSearchText(`${entry.title} ${entry.mangaId}`).includes(
            searchTitle,
          ),
        );

    return createPagedCatalogResults(filteredCatalog, page);
  }

  getMangaShareUrl(mangaId: string): string {
    return `${this.baseUrl}/${CATALOG_PATH}/${mangaId}`;
  }

  private async fetchDocument(
    path: string,
  ): Promise<{ html: string; $: CheerioAPI }> {
    const response = await this.requestManager.schedule(
      createGetRequest(absoluteUrl(path)),
      1,
    );
    throwIfCloudflareBlocked(response.status);

    const html = coerceString(response.data);
    return {
      html,
      $: this.cheerio.load(html),
    };
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
    const mergedCatalog = mergeCatalogEntries(
      parseCatalogTiles($),
      parseCatalogPayload(html),
    );

    if (mergedCatalog.length > 0) {
      return mergedCatalog;
    }

    throw new Error("PunkRecordz catalog parsing failed.");
  }
}
