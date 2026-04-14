import {
  Request,
  BadgeColor,
  Chapter,
  ChapterDetails,
  ContentRating,
  HomeSection,
  HomeSectionType,
  PagedResults,
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
  getPageNumber,
  throwIfCloudflareBlocked,
} from "../shared";
import {
  MangaDexAtHomeResponse,
  MangaDexChapter,
  MangaDexCollectionResponse,
  MangaDexEntityResponse,
  MangaDexManga,
  MangaDexParser,
} from "./MangaDexParser";

const WEBSITE_BASE_URL = "https://mangadex.org";
const API_BASE_URL = "https://api.mangadex.org";
const MANGA_PAGE_SIZE = 20;
const CHAPTER_PAGE_SIZE = 100;
const MAX_CHAPTER_PAGE_REQUESTS = 100;
const DEFAULT_CONTENT_RATINGS = ["safe", "suggestive", "erotica"];
const SUPPORTED_LANGUAGE = "en";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HOME_SECTION_CONFIGS = {
  latest_updates: { order: "latestUploadedChapter", title: "Latest Updates" },
  popular: { order: "followedCount", title: "Popular" },
  new_manga: { order: "createdAt", title: "New Titles" },
} as const;

type HomeSectionId = keyof typeof HOME_SECTION_CONFIGS;
type SectionLoadResult = {
  error?: Error;
  loaded: boolean;
};
type QueryValue =
  | string
  | number
  | boolean
  | Array<string | number | boolean>
  | undefined;

export const MangaDexInfo: SourceInfo = {
  version: "1.0.0",
  name: "MangaDex",
  icon: "icon.png",
  author: "TiDev00",
  authorWebsite: "https://github.com/TiDev00",
  description:
    "Paperback extension for MangaDex powered by the official public API",
  contentRating: ContentRating.EVERYONE,
  websiteBaseURL: WEBSITE_BASE_URL,
  sourceTags: [
    { text: "English", type: BadgeColor.GREY },
    { text: "API", type: BadgeColor.BLUE },
  ],
  intents:
    SourceIntents.MANGA_CHAPTERS |
    SourceIntents.HOMEPAGE_SECTIONS |
    SourceIntents.CLOUDFLARE_BYPASS_REQUIRED,
};

export class MangaDex extends Source {
  readonly parser = new MangaDexParser();
  readonly baseUrl = WEBSITE_BASE_URL;
  readonly apiBaseUrl = API_BASE_URL;
  readonly requestManager = createSourceRequestManager(WEBSITE_BASE_URL, {
    Accept: "application/vnd.api+json, application/json",
  });

  async getCloudflareBypassRequestAsync(): Promise<Request> {
    return createCloudflareBypassRequest(this.baseUrl);
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    this.assertUuid(mangaId, "manga");

    const response = await this.fetchJson<
      MangaDexEntityResponse<MangaDexManga>
    >(`/manga/${mangaId}`, this.createMangaDetailsQuery());
    return this.parser.parseMangaDetails(response.data);
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    this.assertUuid(mangaId, "manga");

    const preferredChapters = this.parser.parseChapterList(
      await this.fetchAllChapters(mangaId, [SUPPORTED_LANGUAGE]),
    );

    if (preferredChapters.length > 0) {
      return preferredChapters;
    }

    return this.parser.parseChapterList(
      await this.fetchAllChapters(mangaId, []),
    );
  }

  async getChapterDetails(
    mangaId: string,
    chapterId: string,
  ): Promise<ChapterDetails> {
    this.assertUuid(mangaId, "manga");
    this.assertUuid(chapterId, "chapter");

    const response = await this.fetchJson<MangaDexAtHomeResponse>(
      `/at-home/server/${chapterId}`,
    );
    return this.parser.parseChapterDetails(mangaId, chapterId, response);
  }

  async getHomePageSections(
    sectionCallback: (section: HomeSection) => void,
  ): Promise<void> {
    const sections = (
      Object.entries(HOME_SECTION_CONFIGS) as Array<
        [HomeSectionId, (typeof HOME_SECTION_CONFIGS)[HomeSectionId]]
      >
    ).map(([id, config]) => ({
      id,
      title: config.title,
      section: App.createHomeSection({
        id,
        title: config.title,
        type: HomeSectionType.singleRowNormal,
        containsMoreItems: true,
      }),
    }));

    sections.forEach(({ section }) => sectionCallback(section));

    const loadResults = await Promise.all(
      sections.map(async ({ id, title }): Promise<SectionLoadResult> => {
        try {
          const response = await this.fetchMangaSection(id, 1);
          const populatedSection = App.createHomeSection({
            id,
            title,
            type: HomeSectionType.singleRowNormal,
            containsMoreItems: true,
            items: this.parser.parseMangaTiles(response.data),
          });
          sectionCallback(populatedSection);

          return { loaded: true };
        } catch (error) {
          return {
            error: createSectionLoadError(error, title),
            loaded: false,
          };
        }
      }),
    );

    const firstError = loadResults.find((result) => result.error)?.error;
    if (!loadResults.some((result) => result.loaded) && firstError) {
      throw firstError;
    }
  }

  async getViewMoreItems(
    homepageSectionId: string,
    metadata: unknown,
  ): Promise<PagedResults> {
    const page = getPageNumber(metadata);
    if (!(homepageSectionId in HOME_SECTION_CONFIGS)) {
      return App.createPagedResults({ results: [] });
    }

    const response = await this.fetchMangaSection(
      homepageSectionId as HomeSectionId,
      page,
    );

    return App.createPagedResults({
      results: this.parser.parseMangaTiles(response.data),
      metadata:
        response.offset + response.limit < response.total
          ? { page: page + 1 }
          : undefined,
    });
  }

  async getSearchResults(
    searchQuery: SearchRequest,
    metadata: unknown,
  ): Promise<PagedResults> {
    const page = getPageNumber(metadata);
    const query = searchQuery.title?.trim();
    const response = await this.fetchJson<
      MangaDexCollectionResponse<MangaDexManga>
    >("/manga", {
      ...this.createMangaListQuery(page),
      ...(query ? { title: query } : { "order[followedCount]": "desc" }),
    });

    return App.createPagedResults({
      results: this.parser.parseMangaTiles(response.data),
      metadata:
        response.offset + response.limit < response.total
          ? { page: page + 1 }
          : undefined,
    });
  }

  getMangaShareUrl(mangaId: string): string {
    return `${this.baseUrl}/title/${mangaId}`;
  }

  private buildApiUrl(
    path: string,
    query: Record<string, QueryValue> = {},
  ): string {
    const url = new URL(path, `${this.apiBaseUrl}/`);

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        value.forEach((entry) => url.searchParams.append(key, String(entry)));
        continue;
      }

      url.searchParams.append(key, String(value));
    }

    return url.toString();
  }

  private createMangaDetailsQuery(): Record<string, QueryValue> {
    return {
      "includes[]": ["cover_art", "author", "artist"],
    };
  }

  private createMangaListQuery(page = 1): Record<string, QueryValue> {
    return {
      limit: MANGA_PAGE_SIZE,
      offset: (page - 1) * MANGA_PAGE_SIZE,
      hasAvailableChapters: true,
      "availableTranslatedLanguage[]": SUPPORTED_LANGUAGE,
      "contentRating[]": DEFAULT_CONTENT_RATINGS,
      "includes[]": ["cover_art", "author", "artist"],
    };
  }

  private async fetchAllChapters(
    mangaId: string,
    translatedLanguages: string[],
  ): Promise<MangaDexChapter[]> {
    const chapters: MangaDexChapter[] = [];
    let offset = 0;
    let requestCount = 0;

    while (requestCount < MAX_CHAPTER_PAGE_REQUESTS) {
      requestCount += 1;

      const response = await this.fetchJson<
        MangaDexCollectionResponse<MangaDexChapter>
      >(`/manga/${mangaId}/feed`, {
        limit: CHAPTER_PAGE_SIZE,
        offset,
        "contentRating[]": DEFAULT_CONTENT_RATINGS,
        "order[chapter]": "desc",
        "order[volume]": "desc",
        ...(translatedLanguages.length > 0
          ? { "translatedLanguage[]": translatedLanguages }
          : {}),
      });

      chapters.push(...response.data);
      offset += response.data.length;

      if (response.data.length === 0 || offset >= response.total) {
        return chapters;
      }
    }

    throw new Error(`Exceeded chapter pagination limit for manga ${mangaId}`);
  }

  private async fetchJson<T>(
    path: string,
    query: Record<string, QueryValue> = {},
  ): Promise<T> {
    const url = this.buildApiUrl(path, query);
    const response = await this.requestManager.schedule(
      createGetRequest(url),
      1,
    );

    throwIfCloudflareBlocked(response.status);

    if (response.status >= 400) {
      // Include the full URL and a snippet of the response body to aid debugging.
      const snippet = String(response.data ?? "")
        .slice(0, 300)
        .replace(/\n/g, " ");
      throw new Error(
        `MangaDex API request failed with status ${response.status} for ${path} — ${url} — ${snippet}`,
      );
    }

    return parseMangaDexResponseData<T>(response.data, path);
  }

  private fetchMangaSection(
    sectionId: HomeSectionId,
    page: number,
  ): Promise<MangaDexCollectionResponse<MangaDexManga>> {
    return this.fetchJson<MangaDexCollectionResponse<MangaDexManga>>("/manga", {
      ...this.createMangaListQuery(page),
      [`order[${HOME_SECTION_CONFIGS[sectionId].order}]`]: "desc",
    });
  }

  private assertUuid(value: string, entityName: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new Error(`Invalid ${entityName} id: ${value}`);
    }
  }
}

function createSectionLoadError(error: unknown, title: string): Error {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(`Failed to load MangaDex section "${title}": ${reason}`);
}

function parseMangaDexResponseData<T>(data: unknown, path: string): T {
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as T;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to parse MangaDex API response for ${path}: ${reason}`,
      );
    }
  }

  if (isMangaDexResponseShape(data)) {
    return data as T;
  }

  throw new Error(
    `Unexpected MangaDex API response type for ${path}: ${typeof data}`,
  );
}

function isMangaDexResponseShape(
  value: unknown,
): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "data" in value || ("baseUrl" in value && "chapter" in value);
}
