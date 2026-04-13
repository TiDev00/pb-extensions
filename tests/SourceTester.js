// Integration test runner for Paperback v0.8 extensions.
// Tests the compiled bundle against the live website.
//
// Usage:
//   node tests/SourceTester.js                  → test all sources in src/
//   node tests/SourceTester.js ReadJJKColored   → test one source
//   pnpm test                                    → build then test all
//   pnpm test -- ReadJJKColored                  → build then test one
//
// Node 18+ required (uses built-in fetch).
//
// LOCAL DEV: bypass TLS certificate validation when running behind a corporate
// SSL-inspection proxy. Set LOCAL_DEV=1 in your shell to enable this.
"use strict";
if (process.env.LOCAL_DEV === "1") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const path = require("path");
const fs = require("fs");
const cheerio = require("cheerio");

// ─────────────────────────────────────────────────────────────────────────────
// ANSI colour helpers
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};
const pass = (msg) => console.log(`  ${C.green("✓")} ${msg}`);
const fail = (msg, err) => {
  console.log(`  ${C.red("✗")} ${msg}`);
  if (err) console.log(`    ${C.dim(String(err))}`);
};
const note = (msg) => console.log(`  ${C.yellow("→")} ${C.dim(msg)}`);

// ─────────────────────────────────────────────────────────────────────────────
// App global polyfill
// Must be set before any source bundle is require()'d.
// ─────────────────────────────────────────────────────────────────────────────
global.App = {
  // Factory helpers — all are plain pass-through objects
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

  // Request manager — uses Node 18+ built-in fetch
  createRequestManager: (options) => ({
    schedule: async (request, _retries) => {
      // Apply the source's own interceptor (adds user-agent, referer, etc.)
      let req = { ...request };
      if (options.interceptor?.interceptRequest) {
        req = await options.interceptor.interceptRequest(req);
      }

      const ctrl = new AbortController();
      const timer = setTimeout(
        () => ctrl.abort(),
        options.requestTimeout ?? 20_000,
      );

      let response;
      try {
        const res = await fetch(req.url, {
          method: req.method ?? "GET",
          headers: req.headers ?? {},
          signal: ctrl.signal,
        });
        const data = await res.text();
        response = {
          data,
          status: res.status,
          headers: Object.fromEntries(res.headers.entries()),
        };
      } finally {
        clearTimeout(timer);
      }

      if (options.interceptor?.interceptResponse) {
        response = await options.interceptor.interceptResponse(response);
      }
      return response;
    },
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Core test runner for a single source
// ─────────────────────────────────────────────────────────────────────────────
async function testSource(sourceName) {
  const bundlePath = path.join(
    __dirname,
    "..",
    "bundles",
    sourceName,
    "source.js",
  );

  if (!fs.existsSync(bundlePath)) {
    console.log(C.red(`  Bundle not found: ${bundlePath}`));
    console.log(C.yellow(`  Run ${C.bold("pnpm run build")} first.`));
    return { passed: 0, failed: 1 };
  }

  // Load the bundle — esbuild IIFE exports Sources onto module.exports
  const bundle = require(bundlePath);
  const SourceClass = bundle.Sources?.[sourceName];

  if (!SourceClass) {
    console.log(C.red(`  Class "${sourceName}" not found in bundle.Sources`));
    const available = Object.keys(bundle.Sources ?? {}).join(", ");
    console.log(C.yellow(`  Available: ${available || "(none)"}`));
    return { passed: 0, failed: 1 };
  }

  // Instantiate — Source constructor takes the cheerio namespace
  const source = new SourceClass(cheerio);

  let passed = 0;
  let failed = 0;
  const ok = (msg) => {
    pass(msg);
    passed++;
  };
  const bad = (msg, err) => {
    fail(msg, err);
    failed++;
  };

  // ── STEP 1: Home page sections ─────────────────────────────────────────
  console.log(C.bold("\n  getHomePageSections"));
  let firstMangaId = "";
  try {
    const sections = [];
    await source.getHomePageSections((section) => {
      if (section.items?.length > 0) sections.push(section);
    });
    if (sections.length === 0) {
      bad("No populated home sections returned");
    } else {
      ok(`${sections.length} section(s) with items`);
      const tile = sections[0].items[0];
      firstMangaId = tile?.mangaId ?? "";
      note(`Discovered mangaId: "${firstMangaId}"`);
      if (!tile?.image) bad("Tile is missing image URL");
      else ok("Tile has image URL");
      if (!tile?.title) bad("Tile is missing title");
      else ok(`Tile title: "${tile.title}"`);
    }
  } catch (e) {
    bad("Threw an error", e.message);
  }

  if (!firstMangaId) {
    console.log(C.yellow("\n  No mangaId found — skipping remaining tests"));
    return { passed, failed };
  }

  // ── STEP 2: Manga details ──────────────────────────────────────────────
  console.log(C.bold("\n  getMangaDetails"));
  let firstChapterId = "";
  try {
    const manga = await source.getMangaDetails(firstMangaId);
    const info = manga?.mangaInfo ?? manga; // handle both shapes
    const titles = info?.titles ?? [];
    const image = info?.image ?? "";
    const desc = info?.desc ?? "";

    if (titles.length === 0) bad("No titles");
    else ok(`Title: "${titles[0]}"`);

    if (!image) bad("No cover image URL");
    else ok("Has cover image URL");

    if (!desc) bad("No description");
    else ok(`Description: ${desc.length} chars`);
  } catch (e) {
    bad("Threw an error", e.message);
  }

  // ── STEP 3: Chapter list ───────────────────────────────────────────────
  console.log(C.bold("\n  getChapters"));
  try {
    const chapters = await source.getChapters(firstMangaId);
    if (!Array.isArray(chapters) || chapters.length === 0) {
      bad("No chapters returned");
    } else {
      ok(`${chapters.length} chapter(s)`);
      const first = chapters[0];
      firstChapterId = first?.id ?? "";
      note(
        `First chapter — id: "${firstChapterId}", chapNum: ${first?.chapNum}`,
      );
      const missingId = chapters.filter((c) => !c.id).length;
      const missingNum = chapters.filter((c) => c.chapNum === undefined).length;
      if (missingId > 0) bad(`${missingId} chapter(s) missing id`);
      else ok("All chapters have an id");
      if (missingNum > 0) bad(`${missingNum} chapter(s) missing chapNum`);
      else ok("All chapters have chapNum");
    }
  } catch (e) {
    bad("Threw an error", e.message);
  }

  // ── STEP 4: Chapter details (page images) ─────────────────────────────
  console.log(C.bold("\n  getChapterDetails"));
  if (firstChapterId) {
    try {
      const details = await source.getChapterDetails(
        firstMangaId,
        firstChapterId,
      );
      const pages = details?.pages ?? [];
      if (pages.length === 0) {
        bad("No page URLs returned");
      } else {
        ok(`${pages.length} page image URL(s)`);
        note(`First page: ${pages[0]}`);
        const invalid = pages.filter((p) => !/^https?:\/\//.test(p));
        if (invalid.length > 0) bad(`${invalid.length} invalid URL(s)`);
        else ok("All page URLs are valid http(s) URLs");
      }
    } catch (e) {
      bad("Threw an error", e.message);
    }
  } else {
    note("Skipped — no chapterId discovered");
  }

  // ── STEP 5: Search ─────────────────────────────────────────────────────
  console.log(C.bold("\n  getSearchResults"));
  const searchFn =
    source.getSearchResults?.bind(source) ?? source.searchRequest?.bind(source);
  if (searchFn) {
    try {
      // Use empty string — triggers "return all" for single-manga sources
      // while still exercising the full search code path.
      const res = await searchFn({ title: "" }, undefined);
      const items = res?.results ?? [];
      if (items.length === 0)
        bad(
          "No results returned for empty query (search may not be implemented)",
        );
      else {
        ok(`${items.length} result(s) for empty query`);
        note(`First result: "${items[0]?.title}" (id: ${items[0]?.mangaId})`);
      }
    } catch (e) {
      bad("Threw an error", e.message);
    }
  } else {
    note("getSearchResults not implemented — skipped");
  }

  return { passed, failed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const arg = process.argv[2];
  const srcDir = path.join(__dirname, "..", "src");

  const sources = arg
    ? [arg]
    : fs
        .readdirSync(srcDir)
        .filter((f) => fs.statSync(path.join(srcDir, f)).isDirectory());

  if (sources.length === 0) {
    console.log(C.yellow("No sources found in src/"));
    process.exit(0);
  }

  console.log(
    C.bold(C.cyan(`\nPaperback Extension Tester — live integration tests`)),
  );
  console.log(C.dim(`Testing: ${sources.join(", ")}\n`));

  let totalPassed = 0;
  let totalFailed = 0;

  for (const name of sources) {
    const bar = "─".repeat(50);
    console.log(C.bold(C.cyan(`\n┌ ${name}`)));
    console.log(C.dim(`│ ${bar}`));

    const { passed, failed } = await testSource(name);
    totalPassed += passed;
    totalFailed += failed;

    const colour = failed > 0 ? C.red : C.green;
    console.log(C.dim(`│ ${bar}`));
    console.log(
      C.bold(
        `└ ${colour(`${passed} passed`)}, ${failed > 0 ? C.red(`${failed} failed`) : C.dim(`${failed} failed`)}`,
      ),
    );
  }

  console.log("\n" + "═".repeat(52));
  const colour = totalFailed > 0 ? C.red : C.green;
  console.log(
    C.bold(
      `  ${colour(`${totalPassed} passed`)}, ${totalFailed > 0 ? C.red(`${totalFailed} failed`) : C.dim(`${totalFailed} failed`)}`,
    ),
  );
  console.log("═".repeat(52) + "\n");

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
