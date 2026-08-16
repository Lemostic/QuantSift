import { LocalStorageBarCacheStore } from "./store";

let browserCache: LocalStorageBarCacheStore | null = null;

/**
 * Shared browser cache singleton. The webview's localStorage backs the
 * daily-bar cache; the store seam keeps a future SQLite adapter a drop-in
 * replacement without touching callers.
 */
export function getBrowserBarCache(): LocalStorageBarCacheStore {
  if (browserCache === null) {
    browserCache = new LocalStorageBarCacheStore(window.localStorage);
  }
  return browserCache;
}
