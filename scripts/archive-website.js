const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const BASE_URL = "http://127.0.0.1:8001";
const ARCHIVE_LABEL = "SparkOS Redesign";
const DEFAULT_ARCHIVE_ROOT =
  "/Users/williamdickens/Library/Mobile Documents/com~apple~CloudDocs/_SPARK ELECTIC/_Buisness Documents/Technology & Infrastructure/Website/Website Archives";

const pages = [
  { page: "/", name: "home" },
  { page: "/about", name: "about" },
  { page: "/services", name: "services" },
  { page: "/projects", name: "projects" },
  { page: "/faq", name: "faq" },
  { page: "/service-areas", name: "service-areas" },
  { page: "/contact", name: "contact" },
  { page: "/privacy", name: "privacy" },
];

const viewports = [
  { label: "Desktop", width: 1440, height: 900 },
  { label: "Mobile", width: 390, height: 844 },
];

function todayStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function expandHome(directory) {
  if (directory === "~") {
    return process.env.HOME;
  }

  if (directory.startsWith("~/")) {
    return path.join(process.env.HOME, directory.slice(2));
  }

  return directory;
}

function archiveRoot() {
  const configuredRoot = process.env.WEBSITE_ARCHIVE_DIR;

  if (configuredRoot) {
    return path.resolve(expandHome(configuredRoot));
  }

  return DEFAULT_ARCHIVE_ROOT;
}

async function ensureArchiveFolders(outputDir) {
  await fs.mkdir(outputDir, { recursive: true });

  await Promise.all(
    viewports.map((viewport) =>
      fs.mkdir(path.join(outputDir, viewport.label), { recursive: true })
    )
  );
}

async function capturePage(browser, outputDir, route, viewport) {
  const context = await browser.newContext({
    viewport: {
      width: viewport.width,
      height: viewport.height,
    },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  const url = new URL(route.page, BASE_URL).toString();
  const filename = `${route.name}.png`;
  const filePath = path.join(outputDir, viewport.label, filename);
  const timestamp = new Date().toISOString();

  try {
    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    if (!response || !response.ok()) {
      const status = response ? response.status() : "no response";
      throw new Error(`Navigation failed for ${url}: ${status}`);
    }

    await page.screenshot({
      path: filePath,
      fullPage: true,
    });

    return {
      ok: true,
      entry: {
        page: route.page,
        viewport: viewport.label,
        filename: path.join(viewport.label, filename),
        timestamp,
      },
    };
  } catch (error) {
    return {
      ok: false,
      failure: {
        page: route.page,
        viewport: viewport.label,
        filename: path.join(viewport.label, filename),
        timestamp,
        error: error.message,
      },
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const outputDir = path.join(
    archiveRoot(),
    `${todayStamp()} ${ARCHIVE_LABEL}`
  );
  const manifestPath = path.join(outputDir, "screenshots.json");
  const manifest = [];
  const failures = [];

  await ensureArchiveFolders(outputDir);

  const browser = await chromium.launch();

  try {
    for (const viewport of viewports) {
      for (const route of pages) {
        const result = await capturePage(browser, outputDir, route, viewport);

        if (result.ok) {
          manifest.push(result.entry);
          console.log(
            `Captured ${route.page} at ${viewport.label}: ${result.entry.filename}`
          );
        } else {
          failures.push(result.failure);
          console.error(
            `Failed ${route.page} at ${viewport.label}: ${result.failure.error}`
          );
        }
      }
    }
  } finally {
    await browser.close();
  }

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log("");
  console.log("Website archive complete");
  console.log(`Pages captured: ${manifest.length}`);
  console.log(`Output directory: ${outputDir}`);

  if (failures.length > 0) {
    console.log(`Failures: ${failures.length}`);
    for (const failure of failures) {
      console.log(
        `- ${failure.page} (${failure.viewport}): ${failure.error}`
      );
    }
    process.exitCode = 1;
  } else {
    console.log("Failures: none");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
