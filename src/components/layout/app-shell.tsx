import { Suspense, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import { NavRail } from "@/components/nav/nav-rail";
import { TopBar } from "@/components/layout/top-bar";
import { CommandPalette } from "@/components/palette/command-palette";
import { useAppStore } from "@/store/app-store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useWatchlist } from "@/watchlist/use-watchlist";
import { useAutomaticScan } from "@/scans/use-scan-center";
import { useAutomaticAlertDispatch } from "@/alerts/use-alert-center";
import { useIntelligentAutoScan } from "@/ai/use-analysis-center";

interface BackendAppInfo {
  name: string;
  version: string;
  tauriVersion: string;
  modules: { id: string; name: string; category: string; enabled: boolean }[];
}

export function AppShell() {
  const watchlist = useWatchlist();
  const [appInfo, setAppInfo] = useState<BackendAppInfo | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const trackRecent = useAppStore((s) => s.trackRecent);
  const activeInstrumentIds = watchlist.entries
    .filter((entry) => entry.enabled)
    .map((entry) => entry.instrumentId);
  const autoAnalyzeIds = watchlist.entries
    .filter((entry) => entry.enabled && entry.autoAnalyze)
    .map((entry) => entry.instrumentId);
  useAutomaticScan(activeInstrumentIds);
  useAutomaticAlertDispatch();
  useIntelligentAutoScan(autoAnalyzeIds);

  useEffect(() => {
    invoke<BackendAppInfo>("app_info")
      .then(setAppInfo)
      .catch((err) => setBackendError(String(err)));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      const m = path.match(/^\/modules\/([^/]+)/);
      if (m) trackRecent(m[1]);
    };
    window.addEventListener("quantsift:nav", handler);
    return () => window.removeEventListener("quantsift:nav", handler);
  }, [trackRecent]);

  return (
    <TooltipProvider delayDuration={200}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex h-[100dvh] min-h-[100dvh] w-screen overflow-hidden bg-background text-foreground"
      >
        <NavRail />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar appInfo={appInfo} error={backendError} />
          <main
            className="flex-1 overflow-auto"
            style={{ overscrollBehavior: "contain" }}
          >
            <Suspense fallback={<RouteLoadingState />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </motion.div>

      {/* Global Cmd/Ctrl+K palette. Listens for the shortcut inside. */}
      <CommandPalette />
    </TooltipProvider>
  );
}

function RouteLoadingState() {
  return (
    <div className="space-y-4 px-5 py-5 lg:px-7" aria-label="正在加载页面">
      <div className="h-16 border-b border-border/70">
        <div className="h-3 w-20 rounded bg-muted shimmer" />
        <div className="mt-3 h-6 w-40 rounded bg-muted shimmer" />
      </div>
      <div className="h-24 border-y border-border bg-muted/40 shimmer" />
      <div className="h-80 rounded-lg border border-border bg-muted/40 shimmer" />
    </div>
  );
}
