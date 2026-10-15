import * as fs from "node:fs";
import * as path from "node:path";
import { env } from "node:process";
import { browser } from "@wdio/globals";
import type {} from "webdriverio";
import type {} from "wdio-obsidian-service";

/**
 * Parity oracle runner. Tracks the latest public Obsidian release by default,
 * because a divergence only matters against the version users actually have.
 */
const appVersion = env.OBSIDIAN_APP_VERSION ?? "latest";
const installerVersion = env.OBSIDIAN_INSTALLER_VERSION ?? "latest";

/**
 * Escape hatch for running an app build the downloader cannot reach: point at a
 * local `obsidian.asar` (an insider build, or a distro package) to check whether a
 * behaviour we depend on holds in a release that is not public yet.
 */
const appPath = env.OBSIDIAN_APP_PATH;

/**
 * `appPath` alone is not enough, which cost two full recordings to establish.
 *
 * The service resolves the app version against its `obsidian-versions.json` BEFORE it
 * consults `appPath`, so an unlisted version dies with `No Obsidian app version "1.15.0"
 * found` and a listed one downloads that version and ignores the override entirely --
 * leaving a recording of the wrong app that looks completely normal. An alpha is never in
 * the manifest, which is exactly when this hatch is wanted.
 *
 * So when an override is in play the manifest is rewritten locally with an entry for the
 * requested version, cloned from the newest real one and marked beta, and handed to the
 * service as a file URL -- its own documented `versionsUrl` option. `appPath` then supplies
 * the asar and the synthetic entry's download URLs are never fetched.
 *
 * Gated on `OBSIDIAN_APP_PATH` being set, so CI -- which never sets it -- resolves versions
 * exactly as before.
 */
function localVersionsUrl(): string | undefined {
  if (appPath === undefined || appPath === "") return undefined;
  if (env.OBSIDIAN_APP_VERSION === undefined) return undefined;
  const cached = path.resolve(".obsidian-cache", "obsidian-versions.json");
  if (!fs.existsSync(cached)) return undefined;
  const manifest = JSON.parse(fs.readFileSync(cached, "utf8")) as {
    versions: {
      version: string;
      isBeta?: boolean;
      maxInstallerVersion?: string;
    }[];
  };
  const wanted = env.OBSIDIAN_APP_VERSION;
  if (manifest.versions.some((entry) => entry.version === wanted))
    return undefined;
  const newest = manifest.versions[manifest.versions.length - 1];
  if (newest === undefined) return undefined;
  manifest.versions.push({
    ...newest,
    version: wanted,
    isBeta: true,
    maxInstallerVersion:
      installerVersion === "latest" ? newest.version : installerVersion,
  });
  const written = path.resolve(
    ".obsidian-cache",
    "obsidian-versions.local.json",
  );
  fs.writeFileSync(written, JSON.stringify(manifest));
  console.log(
    `wdio.conf: ${wanted} is not in the service manifest; synthesised an entry and will load the app from ${appPath}`,
  );
  return `file://${written}`;
}

const versionsUrl = localVersionsUrl();

export const config: WebdriverIO.Config = {
  runner: "local",
  framework: "mocha",
  specs: ["./test/parity/oracle.e2e.ts"],
  maxInstances: 1,

  capabilities: [
    {
      browserName: "obsidian",
      browserVersion: appVersion,
      "wdio:obsidianOptions": {
        installerVersion,
        vault: "test-vault",
        copy: true,
        ...(appPath ? { appPath } : {}),
      },
    },
  ],

  services: [["obsidian", { ...(versionsUrl ? { versionsUrl } : {}) }]],
  reporters: ["obsidian"],
  cacheDir: path.resolve(".obsidian-cache"),

  mochaOpts: {
    ui: "bdd",
    /**
     * The default recording is a minute and a half, so fifteen minutes is a
     * generous ceiling that still surfaces a genuine hang quickly in CI. The
     * full cross-check is a different job -- it mounts a real Reading View for
     * every case in the corpus, and at 2631 cases it ran past that ceiling and
     * was killed mid-sweep, which reads exactly like a parity failure while
     * being nothing of the kind. The audit gets its own budget rather than
     * loosening the default.
     */
    timeout: process.env.PARITY_FULL_PROXY_CHECK === "1" ? 5_400_000 : 900_000,
  },

  waitforInterval: 250,
  waitforTimeout: 10_000,
  connectionRetryTimeout: 180_000,
  connectionRetryCount: 3,
  logLevel: "warn",
  injectGlobals: false,

  async beforeSuite() {
    /**
     * Obsidian's reading-mode renderer drives itself from requestAnimationFrame,
     * and Chromium starves rAF while the window is unfocused: the render queue
     * stays `queued` forever and `sections` never leaves 0, so every capture comes
     * back empty. Focus emulation convinces the renderer it is focused without
     * raising the OS window, which keeps this usable on a busy desktop and in CI.
     */
    try {
      const puppeteer = (await (
        browser as unknown as {
          getPuppeteer(): Promise<{ pages(): Promise<unknown[]> }>;
        }
      ).getPuppeteer()) as { pages(): Promise<unknown[]> };
      const pages = await puppeteer.pages();
      const page = pages[0] as {
        target(): {
          createCDPSession(): Promise<{
            send(method: string, params?: unknown): Promise<unknown>;
          }>;
        };
      };
      const session = await page.target().createCDPSession();
      await session.send("Emulation.setFocusEmulationEnabled", {
        enabled: true,
      });
    } catch {
      /* CI runs under a window manager that focuses the window anyway */
    }
  },
};
