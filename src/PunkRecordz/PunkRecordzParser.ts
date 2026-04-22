import {
  Chapter,
  ChapterDetails,
  PagedResults,
  PartialSourceManga,
  SourceManga,
} from "@paperback/types";
import { CheerioAPI } from "cheerio";

export const CATALOG_PATH = "mangas";
export const PAGE_SIZE = 20;

const BASE_URL = "https://punkrecordz.com";
const API_IMAGE_BASE_URL = "https://api.punkrecordz.com/images/webp";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CatalogManga {
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

// ── Parser class ─────────────────────────────────────────────────────────────

export class PunkRecordzParser {
  parseCatalog($: CheerioAPI, html: string): CatalogManga[] {
    return this.mergeCatalogEntries(
      this.parseCatalogTiles($),
      this.parseCatalogPayload(html),
    );
  }

  parseMangaDetails(
    $: CheerioAPI,
    mangaId: string,
    catalogEntry?: CatalogManga,
  ): SourceManga {
    const title =
      this.normalizeTitle($("h2").first().text()) ||
      this.normalizeTitle(
        $("meta[property='og:title']").attr("content") ?? "",
      ) ||
      catalogEntry?.title ||
      mangaId;

    const description =
      this.normalizeWhitespace(
        $("meta[name='description']").attr("content") ?? "",
      ) ||
      this.normalizeWhitespace($("nav[aria-label] p").first().text()) ||
      "";

    const image =
      this.absoluteUrl($("meta[property='og:image']").attr("content") ?? "") ||
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

  parseChapterList($: CheerioAPI, mangaId: string): Chapter[] {
    return this.parseChapterRecords($, mangaId).map((record) =>
      App.createChapter({
        id: record.chapterId,
        chapNum: record.chapNum,
        name: record.name,
        langCode: "fr",
        time: new Date(0),
      }),
    );
  }

  parseChapterDetails(
    $: CheerioAPI,
    mangaId: string,
    chapterId: string,
  ): ChapterDetails {
    const pages = this.parseChapterImageUrls($);

    if (!pages.length) {
      throw new Error(
        `PunkRecordz: no pages found for chapter "${chapterId}".`,
      );
    }

    return App.createChapterDetails({ id: chapterId, mangaId, pages });
  }

  filterCatalog(catalog: CatalogManga[], query: string): CatalogManga[] {
    const normalized = this.normalizeSearchText(query);
    if (!normalized) return catalog;
    return catalog.filter((entry) =>
      this.normalizeSearchText(`${entry.title} ${entry.mangaId}`).includes(
        normalized,
      ),
    );
  }

  pagedResults(catalog: CatalogManga[], page: number): PagedResults {
    const start = (page - 1) * PAGE_SIZE;
    const results = catalog
      .slice(start, start + PAGE_SIZE)
      .map((entry) => this.toPartialSourceManga(entry));
    const hasNextPage = start + PAGE_SIZE < catalog.length;

    return App.createPagedResults({
      results,
      metadata: hasNextPage ? { page: page + 1 } : undefined,
    });
  }

  toPartialSourceManga(manga: CatalogManga): PartialSourceManga {
    return App.createPartialSourceManga({
      mangaId: manga.mangaId,
      image: manga.image,
      title: manga.title,
      subtitle: manga.subtitle,
    });
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private parseCatalogTiles($: CheerioAPI): CatalogManga[] {
    const mangaMap = new Map<string, CatalogManga>();

    $("a[href*='/mangas/']").each((_index, element) => {
      const mangaPath = this.normalizePath($(element).attr("href") ?? "");
      const parts = mangaPath.split("/").filter(Boolean);
      if (parts.length !== 2 || parts[0] !== CATALOG_PATH) return;

      const mangaId = parts[1] ?? "";
      const title =
        this.normalizeTitle($(element).find("h4").first().text()) ||
        this.normalizeTitle(
          $(element).find("img[alt]").first().attr("alt") ?? "",
        ) ||
        mangaId;

      const image = this.absoluteUrl(
        $(element).find("img[alt]").first().attr("src") ??
          $(element).find("img[alt]").first().attr("data-src") ??
          "",
      );

      mangaMap.set(mangaId, { mangaId, title, image });
    });

    return [...mangaMap.values()];
  }

  private parseCatalogPayload(html: string): CatalogManga[] {
    const mangaMap = new Map<string, CatalogManga>();
    const normalizedHtml = html.replace(/\\"/g, '"');
    const payloadPattern =
      /"__typename":"Manga","id":"[^"]+","name":"([^"]+)","slug":"([^"]+)","thumb":"([^"]+)","published":true/g;

    for (const match of normalizedHtml.matchAll(payloadPattern)) {
      const title = this.normalizeTitle(match[1] ?? "");
      const mangaId = this.normalizeWhitespace(match[2] ?? "");
      const thumb = this.normalizeWhitespace(match[3] ?? "");

      if (!mangaId || !title) continue;

      mangaMap.set(mangaId, {
        mangaId,
        title,
        image: this.buildImageUrlFromThumb(thumb),
      });
    }

    return [...mangaMap.values()];
  }

  private mergeCatalogEntries(
    htmlEntries: CatalogManga[],
    payloadEntries: CatalogManga[],
  ): CatalogManga[] {
    const mergedEntries = new Map<string, CatalogManga>();
    const orderedIds: string[] = [];

    const upsert = (entry: CatalogManga): void => {
      const existing = mergedEntries.get(entry.mangaId);
      if (!existing) {
        mergedEntries.set(entry.mangaId, entry);
        orderedIds.push(entry.mangaId);
        return;
      }
      mergedEntries.set(entry.mangaId, {
        mangaId: entry.mangaId,
        title: entry.title || existing.title,
        image: entry.image || existing.image,
        subtitle: entry.subtitle ?? existing.subtitle,
      });
    };

    htmlEntries.forEach(upsert);
    payloadEntries.forEach(upsert);

    return orderedIds
      .map((id) => mergedEntries.get(id))
      .filter((entry): entry is CatalogManga => entry != null);
  }

  private parseChapterRecords($: CheerioAPI, mangaId: string): ChapterRecord[] {
    const chapterMap = new Map<string, ChapterRecord>();

    $(`a[href*='/${CATALOG_PATH}/${mangaId}/']`).each((_index, element) => {
      const chapterPath = this.normalizePath($(element).attr("href") ?? "");
      const parts = chapterPath.split("/").filter(Boolean);
      if (parts.length !== 3) return;
      if (parts[0] !== CATALOG_PATH || parts[1] !== mangaId) return;

      const chapterSlug = parts[2] ?? "";
      if (!chapterSlug) return;

      const rawName = this.normalizeWhitespace($(element).text());
      const chapterNumber =
        this.extractChapterNumber(chapterSlug) ||
        this.extractChapterNumber(rawName);
      const resolvedName =
        rawName ||
        (chapterNumber > 0 ? `Chapitre ${chapterSlug}` : chapterSlug);

      const nextRecord: ChapterRecord = {
        chapterId: chapterPath,
        chapNum: chapterNumber,
        name: resolvedName,
      };

      const existing = chapterMap.get(chapterPath);
      if (!existing || existing.name.length < nextRecord.name.length) {
        chapterMap.set(chapterPath, nextRecord);
      }
    });

    return [...chapterMap.values()].sort((a, b) => {
      if (b.chapNum !== a.chapNum) return b.chapNum - a.chapNum;
      return b.chapterId.localeCompare(a.chapterId, "en");
    });
  }

  private parseChapterImageUrls($: CheerioAPI): string[] {
    const prioritized: string[] = [];
    const fallback: string[] = [];

    $("img").each((_index, element) => {
      const imageUrl = this.absoluteUrl(
        $(element).attr("data-src") ??
          $(element).attr("src") ??
          $(element).attr("data-lazy-src") ??
          "",
      );
      if (!imageUrl || !imageUrl.includes("api.punkrecordz.com/images/"))
        return;

      const alt = this.normalizeSearchText($(element).attr("alt") ?? "");
      if (alt.includes("page")) {
        prioritized.push(imageUrl);
      } else {
        fallback.push(imageUrl);
      }
    });

    return [...new Set(prioritized.length > 0 ? prioritized : fallback)];
  }

  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }

  private normalizeTitle(title: string): string {
    return this.normalizeWhitespace(
      title
        .replace(/\s*\|\s*Punk\s*Record(?:s|z).*$|\s*\|\s*PunkRecordz.*$/i, "")
        .replace(/\s*-\s*Tous les chapitres scan couleur\s*$/i, "")
        .replace(/\s*-\s*Scan couleur\s*$/i, ""),
    );
  }

  private absoluteUrl(url: string): string {
    const trimmed = this.normalizeWhitespace(url);
    if (!trimmed) return "";
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://"))
      return trimmed;
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    if (trimmed.startsWith("/")) return `${BASE_URL}${trimmed}`;
    return `${BASE_URL}/${trimmed}`;
  }

  private normalizePath(url: string): string {
    return this.absoluteUrl(url)
      .replace(/^https?:\/\/[^/]+\/?/i, "")
      .split("?")[0]
      .split("#")[0]
      .replace(/^\/+|\/+$/g, "");
  }

  private normalizeSearchText(text: string): string {
    return this.normalizeWhitespace(text)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .toLowerCase();
  }

  private extractChapterNumber(text: string): number {
    const match = text.match(/(\d+(?:\.\d+)?)/);
    if (!match?.[1]) return 0;
    const num = parseFloat(match[1]);
    return Number.isNaN(num) ? 0 : num;
  }

  private buildImageUrlFromThumb(thumb: string): string {
    const normalized = this.normalizeWhitespace(thumb);
    if (!normalized) return "";
    return `${API_IMAGE_BASE_URL}/${normalized}.webp`;
  }
}
