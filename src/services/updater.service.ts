import { app } from "electron";
import { autoUpdater } from "electron-updater";
import log from "electron-log";

// How long to wait after launch before the first check — keeps startup snappy
// and avoids racing the network coming up right after a reboot/login.
const INITIAL_DELAY_MS = 15_000;
// How often to poll the feed while the app keeps running in the tray.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Wire up background auto-updates.
 *
 * Behaviour:
 *  - Only runs in packaged builds that have an update feed configured.
 *  - Silently downloads new versions in the background when the network is
 *    available (electron-updater `autoDownload`).
 *  - Applies the downloaded update the next time the app quits/restarts
 *    (`autoInstallOnAppQuit`) — no interruption while the bridge is serving
 *    print jobs.
 *  - Offline / unreachable feed is treated as a no-op and retried on the next
 *    interval, so a machine with no connectivity never blocks or errors out.
 */
export function initAutoUpdater(): void {
  // No feed baked in (dev run or a build without R2_PUBLIC_URL) → nothing to do.
  if (!app.isPackaged) {
    log.info("[updater] skipping auto-update (app not packaged)");
    return;
  }

  // Route electron-updater logs to file so update issues on client machines
  // (where there's no console) can be diagnosed after the fact.
  log.transports.file.level = "info";
  autoUpdater.logger = log;

  // Download in the background; install on the next quit/restart. These are the
  // electron-updater defaults — set explicitly so the intent is clear.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    log.info(`[updater] update available: ${info.version} — downloading`);
  });
  autoUpdater.on("update-not-available", () => {
    log.info("[updater] already up to date");
  });
  autoUpdater.on("download-progress", (p) => {
    log.info(`[updater] downloading ${Math.round(p.percent)}%`);
  });
  autoUpdater.on("update-downloaded", (info) => {
    log.info(
      `[updater] ${info.version} downloaded — will install on next restart`
    );
  });
  autoUpdater.on("error", (err) => {
    // Never surface update failures to the user; just record them.
    log.warn(`[updater] error: ${err?.message ?? err}`);
  });

  // Kick off the first check after a short delay, then poll periodically.
  setTimeout(checkForUpdates, INITIAL_DELAY_MS);
  intervalHandle = setInterval(checkForUpdates, CHECK_INTERVAL_MS);
}

/**
 * Trigger a single update check. Safe to call at any time (e.g. from a tray
 * menu item). Swallows network errors so offline machines don't throw.
 */
export function checkForUpdates(): void {
  if (!app.isPackaged) {
    return;
  }
  autoUpdater.checkForUpdates().catch((err) => {
    // Offline or feed unreachable — ignore and rely on the next scheduled check.
    log.warn(`[updater] check failed: ${err?.message ?? err}`);
  });
}

/** Stop the periodic checks (not usually needed; provided for completeness). */
export function stopAutoUpdater(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
