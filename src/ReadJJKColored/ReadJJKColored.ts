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

const BASE_URL = "https://readjjkcolored.com";
const CONFIG_URL = `${BASE_URL}/config.js`;
const MANGA_ID = "jjk-colored";

// Hardcoded fallbacks in case config.js parsing fails
// Ensures the extension still works with limited functionality instead of completely breaking.
const FALLBACK_IMAGE_URL =
  "https://pub-64c9aaca3834482ab2167dbf51a3b33b.r2.dev/colorizedjjk/chapter%201/01_colorized.webp";
const FALLBACK_BASE_URL =
  "https://pub-64c9aaca3834482ab2167dbf51a3b33b.r2.dev/colorizedjjk";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SiteChapter {
  id: string; // e.g. "chapter1"
  title: string; // e.g. "Chapter 1"
  folder: string; // e.g. "chapter 1"  — may contain spaces
  pageCount: number;
  releaseDate: string; // ISO date e.g. "2018-03-05"
  coverImage: string; // filename e.g. "01_colorized.png"
  // derived:
  chapNum: number;
  volume?: number;
}

interface SiteConfig {
  title: string;
  description: string;
  author: string;
  coverImageUrl: string; // fully-resolved URL
  imageBaseUrl: string;
  filePrefix: string;
  fileSuffix: string;
  fileExtension: string;
  chapters: SiteChapter[]; // sorted newest-first
}

// ─────────────────────────────────────────────────────────────────────────────
// Source metadata
// ─────────────────────────────────────────────────────────────────────────────

export const ReadJJKColoredInfo: SourceInfo = {
  version: "1.0.0",
  name: "ReadJJKColored",
  icon: "icon.png",
  author: "TiDev00",
  authorWebsite: "https://github.com/TiDev00",
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

// ─────────────────────────────────────────────────────────────────────────────
// Source class
// ─────────────────────────────────────────────────────────────────────────────

export class ReadJJKColored extends Source {
  readonly baseUrl = BASE_URL;
  readonly requestManager = createSourceRequestManager(BASE_URL);

  /** In-memory cache — avoids re-fetching config.js on every method call */
  private _config: SiteConfig | null = null;

  async getCloudflareBypassRequestAsync(): Promise<Request> {
    return createCloudflareBypassRequest(this.baseUrl);
  }

  // ── Config loader ─────────────────────────────────────────────────────────

  private async loadConfig(): Promise<SiteConfig> {
    if (this._config) return this._config;
    const response = await this.requestManager.schedule(
      createGetRequest(CONFIG_URL),
      1,
    );
    throwIfCloudflareBlocked(response.status);
    this._config = parseConfigJs(response.data as string);
    return this._config;
  }

  // ── Paperback API ─────────────────────────────────────────────────────────

  async getMangaDetails(_mangaId: string): Promise<SourceManga> {
    const cfg = await this.loadConfig();

    return App.createSourceManga({
      id: MANGA_ID,
      mangaInfo: App.createMangaInfo({
        titles: [cfg.title],
        image: cfg.coverImageUrl,
        author: cfg.author,
        artist: cfg.author,
        desc: cfg.description,
        status: "Ongoing",
        hentai: false,
        tags: [
          App.createTagSection({
            id: "genres",
            label: "Genres",
            tags: [
              App.createTag({ id: "action", label: "Action" }),
              App.createTag({ id: "colored", label: "Colored" }),
              App.createTag({ id: "shounen", label: "Shounen" }),
              App.createTag({ id: "supernatural", label: "Supernatural" }),
            ],
          }),
        ],
      }),
    });
  }

  async getChapters(_mangaId: string): Promise<Chapter[]> {
    const cfg = await this.loadConfig();

    return cfg.chapters.map((ch) =>
      App.createChapter({
        id: ch.id,
        chapNum: ch.chapNum,
        name: ch.title,
        langCode: "en",
        volume: ch.volume,
        time: ch.releaseDate ? new Date(ch.releaseDate) : new Date(),
      }),
    );
  }

  async getChapterDetails(
    _mangaId: string,
    chapId: string,
  ): Promise<ChapterDetails> {
    const cfg = await this.loadConfig();
    const ch = cfg.chapters.find((c) => c.id === chapId);
    const pages = ch ? buildPageUrls(ch, cfg) : [];

    return App.createChapterDetails({
      id: chapId,
      mangaId: MANGA_ID,
      pages,
    });
  }

  async getHomePageSections(
    sectionCallback: (section: HomeSection) => void,
  ): Promise<void> {
    const section = App.createHomeSection({
      id: "jjk_colored",
      title: "Jujutsu Kaisen – Colored",
      type: HomeSectionType.singleRowNormal,
      containsMoreItems: false,
    });

    sectionCallback(section);

    const cfg = await this.loadConfig();
    const latest = cfg.chapters[0];

    section.items = [
      App.createPartialSourceManga({
        mangaId: MANGA_ID,
        image: cfg.coverImageUrl,
        title: cfg.title,
        subtitle: latest?.title ?? "",
      }),
    ];
    sectionCallback(section);
  }

  async getSearchResults(
    query: SearchRequest,
    _metadata: unknown,
  ): Promise<PagedResults> {
    const q = (query.title ?? "").toLowerCase();
    const keywords = ["jujutsu", "kaisen", "jjk", "colored", "colour", "color"];
    const hit = !q || keywords.some((k) => q.includes(k));

    if (!hit) return App.createPagedResults({ results: [] });

    const cfg = await this.loadConfig();

    return App.createPagedResults({
      results: [
        App.createPartialSourceManga({
          mangaId: MANGA_ID,
          image: cfg.coverImageUrl,
          title: cfg.title,
        }),
      ],
    });
  }

  getMangaShareUrl(mangaId: string): string {
    return `${this.baseUrl}/?manga=${mangaId}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// config.js parser  (pure functions, no eval)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses the raw config.js text into a typed SiteConfig.
 *
 * The real file structure (confirmed from live site):
 *
 *   const CHAPTER_PAGE_COUNTS = [58, 26, 23, ...];
 *
 *   const MANGA_CONFIG = {
 *     title: "Jujutsu Kaisen",
 *     ...
 *     chapters: CHAPTER_PAGE_COUNTS.map((pageCount, index) => ({
 *       id: "chapter" + (index + 1),
 *       folder: "https://.../colorizedjjk/chapter " + (index + 1),
 *       pageCount,
 *       coverImage: "01_colorized.webp"
 *     })),
 *     fileNaming: { prefix: "", suffix: "_colorized", extension: ".webp" },
 *   };
 *
 * Because chapters is computed via .map(), there are no literal object entries
 * to regex-parse. Instead we read CHAPTER_PAGE_COUNTS directly.
 */
function parseConfigJs(raw: string): SiteConfig {
  // ── Page counts ───────────────────────────────────────────────────────────
  // const CHAPTER_PAGE_COUNTS = [ 58, 26, ... ];
  const countsBlock = raw.match(
    /const\s+CHAPTER_PAGE_COUNTS\s*=\s*\[([\s\S]*?)\]/,
  );
  const pageCounts: number[] = countsBlock
    ? (countsBlock[1].match(/\d+/g) ?? []).map(Number)
    : [];

  // ── CDN base URL ──────────────────────────────────────────────────────────
  // folder: "https://pub-....r2.dev/colorizedjjk/chapter "
  const baseMatch = raw.match(
    /folder:\s*["'](https:\/\/[^"']+?)\/chapter\s*["']/,
  );
  const imageBaseUrl = baseMatch?.[1] ?? FALLBACK_BASE_URL;

  // ── File naming ───────────────────────────────────────────────────────────
  const filePrefix = extractStr(raw, "prefix") ?? "";
  const fileSuffix = extractStr(raw, "suffix") ?? "_colorized";
  const fileExtension = extractStr(raw, "extension") ?? ".webp";

  // ── Manga metadata ────────────────────────────────────────────────────────
  const title = extractStr(raw, "title") ?? "Jujutsu Kaisen";
  const description = extractStr(raw, "description") ?? "";
  const author = extractStr(raw, "author") ?? "Gege Akutami";

  // ── Build chapter objects (mirrors the .map() the browser runs) ───────────
  const chapters: SiteChapter[] = pageCounts
    .map((pageCount, index) => ({
      id: `chapter${index + 1}`,
      title: `Chapter ${index + 1}`,
      folder: `chapter ${index + 1}`, // relative — passed to encodeFolder()
      pageCount,
      releaseDate: "",
      coverImage: `01_colorized${fileExtension}`,
      chapNum: index + 1,
      volume: undefined,
    }))
    .filter((ch) => ch.pageCount > 0); // skip placeholder 0-page entries

  chapters.sort((a, b) => b.chapNum - a.chapNum); // newest first

  // Cover = chapter 1, page 1
  const ch1 = chapters[chapters.length - 1];
  const coverImageUrl = ch1
    ? `${imageBaseUrl}/${encodeFolder(ch1.folder)}/01_colorized${fileExtension}`
    : FALLBACK_IMAGE_URL;

  return {
    title,
    description,
    author,
    coverImageUrl,
    imageBaseUrl,
    filePrefix,
    fileSuffix,
    fileExtension,
    chapters,
  };
}

/**
 * Generates ordered page image URLs for one chapter.
 *
 * Pattern from static HTML:
 *   {imageBaseUrl}/{folder}/{prefix}{NN}{suffix}{extension}
 *
 * Example output:
 *   https://pub-....r2.dev/colorizedjjk/chapter%201/01_colorized.webp
 *   https://pub-....r2.dev/colorizedjjk/chapter%201/02_colorized.webp
 *   ...
 */
function buildPageUrls(ch: SiteChapter, cfg: SiteConfig): string[] {
  const folder = encodeFolder(ch.folder);
  const pages: string[] = [];

  for (let i = 1; i <= ch.pageCount; i++) {
    const nn = String(i).padStart(2, "0");
    const filename = `${cfg.filePrefix}${nn}${cfg.fileSuffix}${cfg.fileExtension}`;
    pages.push(`${cfg.imageBaseUrl}/${folder}/${filename}`);
  }

  return pages;
}

/** URL-encodes each path segment while preserving forward slashes */
function encodeFolder(folder: string): string {
  return folder.split("/").map(encodeURIComponent).join("/");
}

// ── Regex micro-helpers ───────────────────────────────────────────────────────

/** Extracts the string value of a JS object key (handles single/double quotes) */
function extractStr(src: string, key: string): string | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `["']?${escapedKey}["']?\\s*:\\s*["']([^"'\\r\\n]+)["']`,
  );
  return src.match(re)?.[1]?.trim();
}
