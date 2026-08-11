import { motion } from "framer-motion";
import { Command, Info, MagnifyingGlass } from "@phosphor-icons/react";
import { useLocation } from "react-router-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TopBarProps {
  appInfo: {
    name: string;
    version: string;
    tauriVersion: string;
    modules: unknown[];
  } | null;
  error: string | null;
}

const PAGE_TITLE: Record<string, { section: string; title: string }> = {
  "/": { section: "QUANTSIFT", title: "研究工作台" },
  "/watchlist": { section: "MONITOR", title: "观察列表" },
  "/portfolio": { section: "PORTFOLIO", title: "持仓研究" },
  "/scans": { section: "AUTOMATION", title: "扫描调度" },
  "/alerts": { section: "DELIVERY", title: "提醒中心" },
  "/modules/preferences": { section: "SYSTEM", title: "偏好设置" },
};

export function TopBar({ appInfo, error }: TopBarProps) {
  const location = useLocation();
  const current = PAGE_TITLE[location.pathname] ?? {
    section: "QUANTSIFT",
    title: "研究工具",
  };
  const online = !error && appInfo != null;

  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl sm:px-6">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 130, damping: 20 }}
        className="min-w-0"
      >
        <div className="font-mono text-[9px] font-semibold text-primary">
          {current.section} / 01
        </div>
        <div className="mt-1 truncate text-sm font-semibold text-foreground">
          {current.title}
        </div>
      </motion.div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new Event("quantsift:open-command-palette"))
          }
          className="hidden h-9 items-center gap-2 rounded-md border border-border bg-background-elevated/60 px-3 text-xs text-foreground-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-border-strong hover:text-foreground active:scale-[0.98] sm:flex"
        >
          <MagnifyingGlass size={15} />
          <span>搜索功能</span>
          <kbd className="ml-3 flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-foreground-subtle">
            <Command size={10} /> K
          </kbd>
        </button>

        <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-background-elevated/60 px-2.5 sm:px-3">
          <span className="relative flex h-2 w-2">
            {online && (
              <motion.span
                className="absolute inset-0 rounded-full bg-accent-emerald/50"
                animate={{ scale: [1, 1.9, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 2.8, repeat: Infinity }}
              />
            )}
            <span
              className={`relative h-2 w-2 rounded-full ${
                online ? "bg-accent-emerald" : "bg-accent-rose"
              }`}
            />
          </span>
          <span className="hidden font-mono text-[10px] text-foreground-muted sm:inline">
            {online ? "本地引擎在线" : "后端离线"}
          </span>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="关于 QuantSift"
              className="grid h-9 w-9 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-accent hover:text-foreground active:scale-[0.96]"
            >
              <Info size={17} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            QuantSift {appInfo?.version ?? "0.1.0"} · 本地量化研究
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
