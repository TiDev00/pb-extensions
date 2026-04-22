import {
  Chapter,
  ChapterDetails,
  PagedResults,
  PartialSourceManga,
  SourceManga,
} from "@paperback/types";

// Hardcoded fallbacks in case config.js parsing fails.
// Ensures the extension still works with limited functionality instead of completely breaking.
const FALLBACK_IMAGE_URL =
  "https://pub-64c9aaca3834482ab2167dbf51a3b33b.r2.dev/colorizedjjk/chapter%201/01_colorized.webp";
const FALLBACK_BASE_URL =
  "https://pub-64c9aaca3834482ab2167dbf51a3b33b.r2.dev/colorizedjjk";

export const MANGA_ID = "jjk-colored";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SiteChapter {
  id: string; // e.g. "chapter1"
  title: string; // e.g. "Chapter 1"
  folder: string; // e.g. "chapter 1"  — may contain spaces
  pageCount: number;
  releaseDate: string; // ISO date e.g. "2018-03-05"
  coverImage: string; // filename e.g. "01_colorized.png"
  chapNum: number;
  volume?: number;
}

export interface SiteConfig {
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

// ── Parser class ─────────────────────────────────────────────────────────────

export class ReadJJKColoredParser {
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
  parseConfigJs(raw: string): SiteConfig {
    // ── Page counts ─────────────────────────────────────────────────────────
    // const CHAPTER_PAGE_COUNTS = [ 58, 26, ... ];
    const countsBlock = raw.match(
      /const\s+CHAPTER_PAGE_COUNTS\s*=\s*\[([\s\S]*?)\]/,
    );
    const pageCounts: number[] = countsBlock
      ? (countsBlock[1].match(/\d+/g) ?? []).map(Number)
      : [];

    // ── CDN base URL ─────────────────────────────────────────────────────────
    // folder: "https://pub-....r2.dev/colorizedjjk/chapter "
    const baseMatch = raw.match(
      /folder:\s*["'](https:\/\/[^"']+?)\/chapter\s*["']/,
    );
    const imageBaseUrl = baseMatch?.[1] ?? FALLBACK_BASE_URL;

    // ── File naming ──────────────────────────────────────────────────────────
    const filePrefix = this.extractStr(raw, "prefix") ?? "";
    const fileSuffix = this.extractStr(raw, "suffix") ?? "_colorized";
    const fileExtension = this.extractStr(raw, "extension") ?? ".webp";

    // ── Manga metadata ───────────────────────────────────────────────────────
    const title = this.extractStr(raw, "title") ?? "Jujutsu Kaisen";
    const description = this.extractStr(raw, "description") ?? "";
    const author = this.extractStr(raw, "author") ?? "Gege Akutami";

    // ── Build chapter objects (mirrors the .map() the browser runs) ──────────
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
      ? `${imageBaseUrl}/${this.encodeFolder(ch1.folder)}/01_colorized${fileExtension}`
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

  parseMangaDetails(cfg: SiteConfig): SourceManga {
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

  parseChapterList(cfg: SiteConfig): Chapter[] {
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

  parseChapterDetails(cfg: SiteConfig, chapId: string): ChapterDetails {
    const ch = cfg.chapters.find((c) => c.id === chapId);
    const pages = ch ? this.buildPageUrls(ch, cfg) : [];

    return App.createChapterDetails({ id: chapId, mangaId: MANGA_ID, pages });
  }

  parseHomeItems(cfg: SiteConfig): PartialSourceManga[] {
    const latest = cfg.chapters[0];
    return [
      App.createPartialSourceManga({
        mangaId: MANGA_ID,
        image: cfg.coverImageUrl,
        title: cfg.title,
        subtitle: latest?.title ?? "",
      }),
    ];
  }

  matchesSearchQuery(query: string): boolean {
    const q = query.toLowerCase();
    if (!q) return true;
    const keywords = ["jujutsu", "kaisen", "jjk", "colored", "colour", "color"];
    return keywords.some((k) => q.includes(k));
  }

  // ── Private helpers ──────────────────────────────────────────────────────

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
  private buildPageUrls(ch: SiteChapter, cfg: SiteConfig): string[] {
    const folder = this.encodeFolder(ch.folder);
    const pages: string[] = [];

    for (let i = 1; i <= ch.pageCount; i++) {
      const nn = String(i).padStart(2, "0");
      const filename = `${cfg.filePrefix}${nn}${cfg.fileSuffix}${cfg.fileExtension}`;
      pages.push(`${cfg.imageBaseUrl}/${folder}/${filename}`);
    }

    return pages;
  }

  /** URL-encodes each path segment while preserving forward slashes */
  private encodeFolder(folder: string): string {
    return folder.split("/").map(encodeURIComponent).join("/");
  }

  /** Extracts the string value of a JS object key (handles single/double quotes) */
  private extractStr(src: string, key: string): string | undefined {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `["']?${escapedKey}["']?\\s*:\\s*["']([^"'\\r\\n]+)["']`,
    );
    return src.match(re)?.[1]?.trim();
  }
}
