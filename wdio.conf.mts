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

  services: ["obsidian"],
  reporters: ["obsidian"],
  cacheDir: path.resolve(".obsidian-cache"),

  mochaOpts: {
    ui: "bdd",
    timeout: 900_000,
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
