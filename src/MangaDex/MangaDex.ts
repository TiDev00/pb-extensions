import {
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
  createGetRequest,
  createSourceRequestManager,
  getPageNumber,
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
const DEFAULT_CONTENT_RATINGS = [
  "safe",
  "suggestive",
  "erotic",
  "pornographic",
];
const SUPPORTED_LANGUAGE = "en";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HOME_SECTION_CONFIGS = {
  latest_updates: { order: "latestUploadedChapter", title: "Latest Updates" },
  popular: { order: "followedCount", title: "Popular" },
  new_manga: { order: "createdAt", title: "New Titles" },
} as const;

type HomeSectionId = keyof typeof HOME_SECTION_CONFIGS;
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
  intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS,
};

export class MangaDex extends Source {
  readonly parser = new MangaDexParser();
  readonly baseUrl = WEBSITE_BASE_URL;
  readonly apiBaseUrl = API_BASE_URL;
  readonly requestManager = createSourceRequestManager(API_BASE_URL);

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    this.assertUuid(mangaId, "manga");

    const response = await this.fetchJson<
      MangaDexEntityResponse<MangaDexManga>
    >(`/manga/${mangaId}`, this.createMangaQuery());
    return this.parser.parseMangaDetails(response.data);
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    this.assertUuid(mangaId, "manga");

    const chapters = await this.fetchAllChapters(mangaId);
    return this.parser.parseChapterList(chapters);
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
    const sectionEntries = (
      Object.entries(HOME_SECTION_CONFIGS) as Array<
        [HomeSectionId, (typeof HOME_SECTION_CONFIGS)[HomeSectionId]]
      >
    ).map(([id, config]) =>
      App.createHomeSection({
        id,
        title: config.title,
        type: HomeSectionType.singleRowNormal,
        containsMoreItems: true,
      }),
    );

    sectionEntries.forEach(sectionCallback);

    const results = await Promise.all(
      sectionEntries.map((section) =>
        this.fetchMangaSection(section.id as HomeSectionId, 1),
      ),
    );

    sectionEntries.forEach((section, index) => {
      section.items = this.parser.parseMangaTiles(results[index]?.data ?? []);
      sectionCallback(section);
    });
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
      ...this.createMangaQuery(page),
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

  private createMangaQuery(page = 1): Record<string, QueryValue> {
    return {
      limit: MANGA_PAGE_SIZE,
      offset: (page - 1) * MANGA_PAGE_SIZE,
      "availableTranslatedLanguage[]": SUPPORTED_LANGUAGE,
      "contentRating[]": DEFAULT_CONTENT_RATINGS,
      "includes[]": ["cover_art", "author", "artist"],
    };
  }

  private async fetchAllChapters(mangaId: string): Promise<MangaDexChapter[]> {
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
        "translatedLanguage[]": SUPPORTED_LANGUAGE,
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
    const response = await this.requestManager.schedule(
      createGetRequest(this.buildApiUrl(path, query)),
      1,
    );

    if (response.status >= 400) {
      throw new Error(
        `MangaDex API request failed with status ${response.status} for ${path}`,
      );
    }

    try {
      return JSON.parse(response.data as string) as T;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to parse MangaDex API response for ${path}: ${reason}`,
      );
    }
  }

  private fetchMangaSection(
    sectionId: HomeSectionId,
    page: number,
  ): Promise<MangaDexCollectionResponse<MangaDexManga>> {
    return this.fetchJson<MangaDexCollectionResponse<MangaDexManga>>("/manga", {
      ...this.createMangaQuery(page),
      [`order[${HOME_SECTION_CONFIGS[sectionId].order}]`]: "desc",
    });
  }

  private assertUuid(value: string, entityName: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new Error(`Invalid ${entityName} id: ${value}`);
    }
  }
}
