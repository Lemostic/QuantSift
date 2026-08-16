import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ModuleCategory } from "@/lib/registry";
import type { DataSourceId } from "@/data/provider-registry";
import {
  DEFAULT_PADDING,
  clampAxis,
  type PagePadding,
} from "@/lib/spacing";

interface AppState {
  // UI state
  sidebarCollapsed: boolean;
  activeCategory: ModuleCategory | "all";

  // User prefs (persisted)
  theme: "dark" | "light" | "system";
  recentModules: string[];
  contentPadding: PagePadding;
  marketDataSource: DataSourceId;
  allowOfflineFallback: boolean;

  // Actions
  toggleSidebar: () => void;
  setActiveCategory: (cat: ModuleCategory | "all") => void;
  setTheme: (t: "dark" | "light" | "system") => void;
  trackRecent: (moduleId: string) => void;
  setContentPadding: (next: PagePadding) => void;
  resetContentPadding: () => void;
  setMarketDataSource: (source: DataSourceId) => void;
  setAllowOfflineFallback: (allow: boolean) => void;
}

export function migrateAppState(
  persisted: unknown,
  fromVersion: number,
): unknown {
  if (!persisted || typeof persisted !== "object") return persisted;
  const p = persisted as Record<string, unknown>;

  // ---- v5 ----
  // Switch from the 4-sided `{ top, right, bottom, left }` shape
  // to the 2-axis `{ vertical, horizontal }` shape.
  if (fromVersion < 5) {
    const legacy = p.contentPadding as Record<string, unknown> | undefined;
    if (legacy && typeof legacy === "object") {
      const topN = typeof legacy.top === "number" ? legacy.top : null;
      const bottomN = typeof legacy.bottom === "number" ? legacy.bottom : null;
      const leftN = typeof legacy.left === "number" ? legacy.left : null;
      const rightN = typeof legacy.right === "number" ? legacy.right : null;
      const hasFourSide =
        topN !== null || bottomN !== null || leftN !== null || rightN !== null;
      if (hasFourSide) {
        const vertical =
          topN !== null && bottomN !== null
            ? Math.round((topN + bottomN) / 2)
            : topN ?? bottomN ?? DEFAULT_PADDING.vertical;
        const horizontal =
          leftN !== null && rightN !== null
            ? Math.round((leftN + rightN) / 2)
            : leftN ?? rightN ?? DEFAULT_PADDING.horizontal;
        p.contentPadding = { vertical, horizontal };
      } else if (
        typeof legacy.vertical !== "number" ||
        typeof legacy.horizontal !== "number"
      ) {
        p.contentPadding = { ...DEFAULT_PADDING };
      }
    } else if (typeof legacy === "number") {
      const side =
        legacy === 0 ? 0 :
        legacy === 4 ? 16 :
        legacy === 6 ? 24 :
        legacy === 10 ? 40 :
        legacy === 16 ? 64 :
        legacy === 20 ? 80 :
        DEFAULT_PADDING.vertical;
      p.contentPadding = { vertical: side, horizontal: side };
    } else {
      p.contentPadding = { ...DEFAULT_PADDING };
    }
  }

  if (fromVersion < 6) {
    p.marketDataSource = "akshare";
    p.allowOfflineFallback = true;
  }

  // ---- v7 ----
  // The live source moved from the AKShare Python sidecar to the native
  // Rust EastMoney provider; the old persisted id is migrated.
  if (fromVersion < 7) {
    if (p.marketDataSource === "akshare") {
      p.marketDataSource = "eastmoney";
    } else if (
      p.marketDataSource !== "eastmoney" &&
      p.marketDataSource !== "recorded"
    ) {
      p.marketDataSource = "eastmoney";
    }
  }

  if (p.marketDataSource !== "eastmoney" && p.marketDataSource !== "recorded") {
    p.marketDataSource = "eastmoney";
  }
  if (typeof p.allowOfflineFallback !== "boolean") {
    p.allowOfflineFallback = true;
  }

  return p;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      activeCategory: "all",
      theme: "dark",
      recentModules: [],
      contentPadding: DEFAULT_PADDING,
      marketDataSource: "eastmoney",
      allowOfflineFallback: true,

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setActiveCategory: (cat) => set({ activeCategory: cat }),
      setTheme: (theme) => set({ theme }),
      trackRecent: (moduleId) =>
        set((s) => {
          const next = [
            moduleId,
            ...s.recentModules.filter((id) => id !== moduleId),
          ].slice(0, 8);
          return { recentModules: next };
        }),
      setContentPadding: (next) => {
        // Each axis is independently clamped to the allowed window so the
        // preferences UI can stay loose with the inputs without poisoning
        // the persisted state.
        set({
          contentPadding: {
            vertical: clampAxis(next.vertical),
            horizontal: clampAxis(next.horizontal),
          },
        });
      },
      resetContentPadding: () => set({ contentPadding: DEFAULT_PADDING }),
      setMarketDataSource: (marketDataSource) => set({ marketDataSource }),
      setAllowOfflineFallback: (allowOfflineFallback) =>
        set({ allowOfflineFallback }),
    }),
    {
      name: "quantsift.app-state.v1",
      storage: createJSONStorage(() => localStorage),
      version: 7,
      partialize: (s) => ({
        theme: s.theme,
        recentModules: s.recentModules,
        sidebarCollapsed: s.sidebarCollapsed,
        contentPadding: s.contentPadding,
        marketDataSource: s.marketDataSource,
        allowOfflineFallback: s.allowOfflineFallback,
      }),
      migrate: migrateAppState,
    },
  ),
);
