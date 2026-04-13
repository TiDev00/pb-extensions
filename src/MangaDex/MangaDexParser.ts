import {
  Chapter,
  ChapterDetails,
  PartialSourceManga,
  SourceManga,
  TagSection,
} from "@paperback/types";

type MangaDexLocalizedText = Record<string, string>;

interface MangaDexTag {
  id: string;
  attributes: {
    name: MangaDexLocalizedText;
    group: string;
  };
}

interface MangaDexRelationshipAttributes {
  fileName?: string;
  name?: string;
}

export interface MangaDexRelationship {
  id: string;
  type: string;
  attributes?: MangaDexRelationshipAttributes;
}

export interface MangaDexManga {
  id: string;
  attributes: {
    altTitles: MangaDexLocalizedText[];
    contentRating: string;
    description: MangaDexLocalizedText;
    status: string;
    tags: MangaDexTag[];
    title: MangaDexLocalizedText;
    year?: number;
  };
  relationships: MangaDexRelationship[];
}

export interface MangaDexChapter {
  id: string;
  attributes: {
    chapter: string | null;
    externalUrl: string | null;
    isUnavailable: boolean;
    pages: number;
    publishAt: string;
    readableAt: string;
    title: string;
    translatedLanguage: string;
    updatedAt: string;
    volume: string | null;
  };
}

export interface MangaDexCollectionResponse<T> {
  data: T[];
  limit: number;
  offset: number;
  total: number;
}

export interface MangaDexEntityResponse<T> {
  data: T;
}

export interface MangaDexAtHomeResponse {
  baseUrl: string;
  chapter: {
    data: string[];
    hash: string;
  };
}

const AT_HOME_HOST_SUFFIX = ".mangadex.network";
const TITLE_LANGUAGE_PREFERENCE = ["en", "en-us", "ja-ro", "ja"];
const UNKNOWN_STATUS = "Unknown";

export class MangaDexParser {
  parseMangaDetails(manga: MangaDexManga): SourceManga {
    const title = getLocalizedText(
      manga.attributes.title,
      manga.attributes.altTitles,
    );
    const author = getRelationshipName(manga, "author");
    const artist = getRelationshipName(manga, "artist") || author;

    return App.createSourceManga({
      id: manga.id,
      mangaInfo: App.createMangaInfo({
        titles: [title || "Unknown Title"],
        image: getCoverImageUrl(manga),
        author: author || "Unknown",
        artist: artist || "Unknown",
        desc: getLocalizedText(manga.attributes.description),
        status: parseStatus(manga.attributes.status),
        hentai: manga.attributes.contentRating === "pornographic",
        tags: buildTagSections(manga),
      }),
    });
  }

  parseChapterList(chapters: MangaDexChapter[]): Chapter[] {
    return chapters
      .filter(
        (chapter) =>
          !chapter.attributes.externalUrl && !chapter.attributes.isUnavailable,
      )
      .map((chapter) => {
        const chapterNumber = parseNumericValue(chapter.attributes.chapter);
        const volume = parseNumericValue(chapter.attributes.volume);
        const label = buildChapterLabel(chapter);

        return App.createChapter({
          id: chapter.id,
          chapNum: chapterNumber,
          name: label,
          langCode: chapter.attributes.translatedLanguage || "en",
          volume,
          time: new Date(
            chapter.attributes.readableAt ||
              chapter.attributes.publishAt ||
              chapter.attributes.updatedAt,
          ),
        });
      });
  }

  parseChapterDetails(
    mangaId: string,
    chapterId: string,
    atHome: MangaDexAtHomeResponse,
  ): ChapterDetails {
    const baseUrl = getTrustedAtHomeBaseUrl(atHome.baseUrl);
    const chapterHash = sanitizeAtHomeHash(atHome.chapter.hash);
    const pages = atHome.chapter.data.map(
      (fileName) =>
        `${baseUrl}/data/${chapterHash}/${sanitizeAtHomeFileName(fileName)}`,
    );

    return App.createChapterDetails({ id: chapterId, mangaId, pages });
  }

  parseMangaTiles(mangaList: MangaDexManga[]): PartialSourceManga[] {
    return mangaList.map((manga) => this.parseMangaTile(manga));
  }

  parseMangaTile(manga: MangaDexManga): PartialSourceManga {
    const author = getRelationshipName(manga, "author");
    const subtitle =
      author ||
      (manga.attributes.year ? String(manga.attributes.year) : undefined);

    return App.createPartialSourceManga({
      mangaId: manga.id,
      image: getCoverImageUrl(manga),
      title:
        getLocalizedText(manga.attributes.title, manga.attributes.altTitles) ||
        manga.id,
      subtitle,
    });
  }
}

function buildChapterLabel(chapter: MangaDexChapter): string {
  const chapterNumber = chapter.attributes.chapter;
  const baseLabel = chapterNumber ? `Chapter ${chapterNumber}` : "Oneshot";
  return chapter.attributes.title
    ? `${baseLabel} - ${chapter.attributes.title}`
    : baseLabel;
}

function buildTagSections(manga: MangaDexManga): TagSection[] {
  const tags = manga.attributes.tags
    .map((tag) => {
      const label = getLocalizedText(tag.attributes.name);
      return label ? App.createTag({ id: tag.id, label }) : undefined;
    })
    .filter(
      (tag): tag is ReturnType<typeof App.createTag> => tag !== undefined,
    );

  if (tags.length === 0) {
    return [];
  }

  return [
    App.createTagSection({
      id: "genres",
      label: "Genres",
      tags,
    }),
  ];
}

function getCoverImageUrl(manga: MangaDexManga): string {
  const fileName = manga.relationships.find(
    (relationship) => relationship.type === "cover_art",
  )?.attributes?.fileName;

  return fileName
    ? `https://uploads.mangadex.org/covers/${manga.id}/${fileName}`
    : "";
}

function getLocalizedText(
  primary?: MangaDexLocalizedText,
  alternatives: MangaDexLocalizedText[] = [],
): string {
  for (const language of TITLE_LANGUAGE_PREFERENCE) {
    const value = primary?.[language]?.trim();
    if (value) {
      return value;
    }
  }

  const primaryFallback = firstLocalizedValue(primary);
  if (primaryFallback) {
    return primaryFallback;
  }

  for (const alternative of alternatives) {
    const fallback = firstLocalizedValue(alternative);
    if (fallback) {
      return fallback;
    }
  }

  return "";
}

function firstLocalizedValue(values?: MangaDexLocalizedText): string {
  return (
    Object.values(values ?? {})
      .map((value) => value.trim())
      .find(Boolean) ?? ""
  );
}

function getRelationshipName(manga: MangaDexManga, type: string): string {
  return (
    manga.relationships
      .find((relationship) => relationship.type === type)
      ?.attributes?.name?.trim() ?? ""
  );
}

function parseNumericValue(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseStatus(status: string): string {
  switch (status) {
    case "ongoing":
      return "Ongoing";
    case "completed":
      return "Completed";
    case "hiatus":
      return "Hiatus";
    case "cancelled":
      return "Cancelled";
    default:
      return UNKNOWN_STATUS;
  }
}

function getTrustedAtHomeBaseUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl);

  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname.endsWith(AT_HOME_HOST_SUFFIX)
  ) {
    throw new Error(`Untrusted MangaDex at-home server: ${baseUrl}`);
  }

  return parsed.toString().replace(/\/$/, "");
}

function sanitizeAtHomeHash(hash: string): string {
  if (!/^[0-9a-f]+$/i.test(hash)) {
    throw new Error(`Invalid MangaDex chapter hash: ${hash}`);
  }

  return hash;
}

function sanitizeAtHomeFileName(fileName: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(fileName)) {
    throw new Error(`Invalid MangaDex page file name: ${fileName}`);
  }

  return fileName;
}
