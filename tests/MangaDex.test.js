"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const cheerio = require("cheerio");

const bundle = require("../bundles/MangaDex/source.js");

const VALID_MANGA_ID = "32d76d19-8a05-4db0-9fc2-e0b0648fe9d0";
const VALID_CHAPTER_ID = "50854749-695e-4930-b1b7-06861685db40";

function createApp(scheduleHandler) {
  global.App = {
    createRequest: (info) => info,
    createSourceManga: (info) => info,
    createMangaInfo: (info) => info,
    createChapter: (info) => info,
    createChapterDetails: (info) => info,
    createPartialSourceManga: (info) => info,
    createPagedResults: (info) => ({ results: [], ...info }),
    createHomeSection: (info) => ({ items: [], ...info }),
    createTagSection: (info) => info,
    createTag: (info) => info,
    createRequestManager: (options) => ({
      schedule: async (request, retries) => {
        let nextRequest = { ...request };

        if (options.interceptor?.interceptRequest) {
          nextRequest = await options.interceptor.interceptRequest(nextRequest);
        }

        let response = await scheduleHandler(nextRequest, retries);

        if (options.interceptor?.interceptResponse) {
          response = await options.interceptor.interceptResponse(response);
        }

        return response;
      },
    }),
  };
}

function createSource(scheduleHandler) {
  createApp(scheduleHandler);
  return new bundle.Sources.MangaDex(cheerio);
}

function createManga(id, title) {
  return {
    id,
    attributes: {
      altTitles: [],
      contentRating: "safe",
      description: { en: `${title} description` },
      status: "ongoing",
      tags: [],
      title: { en: title },
      year: 2024,
    },
    relationships: [
      {
        id: `${id}-author`,
        type: "author",
        attributes: { name: "Test Author" },
      },
      {
        id: `${id}-cover`,
        type: "cover_art",
        attributes: { fileName: "cover.jpg" },
      },
    ],
  };
}

function createMangaCollection(data) {
  return {
    data,
    limit: data.length || 20,
    offset: 0,
    total: data.length,
  };
}

function createChapter(id, translatedLanguage) {
  return {
    id,
    attributes: {
      chapter: "1",
      externalUrl: null,
      isUnavailable: false,
      pages: 18,
      publishAt: "2024-01-01T00:00:00+00:00",
      readableAt: "2024-01-01T00:00:00+00:00",
      title: "Test Chapter",
      translatedLanguage,
      updatedAt: "2024-01-01T00:00:00+00:00",
      volume: "1",
    },
  };
}

test("MangaDex homepage sections populate when responses are already parsed JSON objects", async () => {
  const source = createSource(async (request) => {
    assert.match(request.url, /^https:\/\/api\.mangadex\.org\/manga\?/);

    return {
      data: createMangaCollection([
        createManga("11111111-1111-4111-8111-111111111111", "Alpha"),
        createManga("22222222-2222-4222-8222-222222222222", "Beta"),
      ]),
      headers: {},
      status: 200,
    };
  });

  const sections = new Map();

  await source.getHomePageSections((section) => {
    sections.set(section.id, {
      id: section.id,
      items: [...(section.items ?? [])],
      title: section.title,
    });
  });

  assert.deepEqual([...sections.keys()].sort(), [
    "latest_updates",
    "new_manga",
    "popular",
  ]);

  for (const section of sections.values()) {
    assert.equal(section.items.length, 2);
    assert.ok(section.items[0].mangaId);
    assert.ok(section.items[0].title);
  }
});

test("MangaDex homepage keeps successful sections when one request fails", async () => {
  const source = createSource(async (request) => {
    const url = new URL(request.url);

    if (url.searchParams.get("order[latestUploadedChapter]") === "desc") {
      throw new Error("Latest updates failed");
    }

    return {
      data: createMangaCollection([
        createManga("33333333-3333-4333-8333-333333333333", "Gamma"),
      ]),
      headers: {},
      status: 200,
    };
  });

  const sections = new Map();

  await source.getHomePageSections((section) => {
    sections.set(section.id, {
      id: section.id,
      items: [...(section.items ?? [])],
      title: section.title,
    });
  });

  const populatedSections = [...sections.values()].filter(
    (section) => section.items.length > 0,
  );

  assert.equal(populatedSections.length, 2);
  assert.equal(sections.get("latest_updates").items.length, 0);
});

test("MangaDex homepage throws when every section request fails", async () => {
  const source = createSource(async () => {
    throw new Error("Network timeout");
  });

  await assert.rejects(
    () => source.getHomePageSections(() => {}),
    /Failed to load MangaDex section/,
  );
});

test("MangaDex chapter fallback retries without a language filter", async () => {
  const requestedLanguageFilters = [];
  const source = createSource(async (request) => {
    const url = new URL(request.url);

    assert.equal(url.pathname, `/manga/${VALID_MANGA_ID}/feed`);

    const translatedLanguages = url.searchParams.getAll("translatedLanguage[]");
    requestedLanguageFilters.push(translatedLanguages);

    if (translatedLanguages.length > 0) {
      assert.deepEqual(translatedLanguages, ["en"]);

      return {
        data: createMangaCollection([]),
        headers: {},
        status: 200,
      };
    }

    return {
      data: createMangaCollection([createChapter(VALID_CHAPTER_ID, "es")]),
      headers: {},
      status: 200,
    };
  });

  const chapters = await source.getChapters(VALID_MANGA_ID);

  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].id, VALID_CHAPTER_ID);
  assert.equal(chapters[0].langCode, "es");
  assert.deepEqual(requestedLanguageFilters, [["en"], []]);
});
