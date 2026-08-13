import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  BellSimpleRinging,
  Briefcase,
  CalendarDots,
  ChartLine,
  ChartLineUp,
  ArrowBendDownLeft,
  Eraser,
  GearSix,
  ListChecks,
  MagnifyingGlass,
  type Icon,
} from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface WorkspaceCommand {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  path: string;
  icon: Icon;
}

const COMMANDS: WorkspaceCommand[] = [
  {
    id: "research",
    name: "研究工作台",
    description: "查看推荐排名、K 线和动态买点",
    keywords: ["首页", "行情", "k线", "买点", "信号"],
    path: "/",
    icon: ChartLineUp,
  },
  {
    id: "watchlist",
    name: "监控中心",
    description: "管理观察列表、备注和标签",
    keywords: ["自选", "股票", "基金", "监控"],
    path: "/watchlist",
    icon: ListChecks,
  },
  {
    id: "portfolio",
    name: "持仓研究",
    description: "复核成本、盈亏与退出风险",
    keywords: ["持仓", "成本", "盈亏", "止损", "止盈", "风险"],
    path: "/portfolio",
    icon: Briefcase,
  },
  {
    id: "backtest",
    name: "回测研究",
    description: "验证研究信号、退出边界和历史成本",
    keywords: ["回测", "历史", "策略", "模拟", "回撤"],
    path: "/backtest",
    icon: ChartLine,
  },
  {
    id: "scans",
    name: "扫描调度",
    description: "配置工作日扫描并查看运行历史",
    keywords: ["自动", "定时", "扫描", "任务"],
    path: "/scans",
    icon: CalendarDots,
  },
  {
    id: "alerts",
    name: "提醒中心",
    description: "配置提醒策略和本地发件箱",
    keywords: ["短信", "通知", "webhook", "提醒"],
    path: "/alerts",
    icon: BellSimpleRinging,
  },
  {
    id: "preferences",
    name: "偏好设置",
    description: "调整主题和内容密度",
    keywords: ["设置", "主题", "边距", "外观"],
    path: "/modules/preferences",
    icon: GearSix,
  },
];

function matches(command: WorkspaceCommand, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    command.id,
    command.name,
    command.description,
    ...command.keywords,
  ].some((value) => value.toLowerCase().includes(normalized));
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const results = useMemo(
    () => COMMANDS.filter((command) => matches(command, query)),
    [query],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const openPalette = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("quantsift:open-command-palette", openPalette);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("quantsift:open-command-palette", openPalette);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (active >= results.length) setActive(Math.max(0, results.length - 1));
  }, [active, results.length]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-command-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const commit = (index: number) => {
    const command = results[index];
    if (!command) return;
    setOpen(false);
    navigate(command.path);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="top-[14vh] max-w-[620px] overflow-hidden rounded-lg p-0"
        hideClose
      >
        <DialogTitle className="sr-only">工作区命令</DialogTitle>
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <MagnifyingGlass size={16} className="text-foreground-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((value) => Math.min(results.length - 1, value + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((value) => Math.max(0, value - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                commit(active);
              }
            }}
            placeholder="搜索研究、持仓、扫描或提醒"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-foreground-subtle"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="清空搜索"
              className="grid h-7 w-7 place-items-center text-foreground-subtle hover:bg-accent hover:text-foreground active:scale-[0.96]"
            >
              <Eraser size={14} />
            </button>
          )}
          <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-foreground-subtle">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[420px] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <div className="grid min-h-40 place-items-center px-4 text-center">
              <div>
                <MagnifyingGlass size={22} className="mx-auto text-foreground-subtle" />
                <p className="mt-2 text-xs font-medium">没有匹配的工作区</p>
                <p className="mt-1 text-[10px] text-foreground-muted">
                  尝试搜索“持仓”“K线”或“提醒”
                </p>
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {results.map((command, index) => {
                const CommandIcon = command.icon;
                const selected = active === index;
                return (
                  <motion.button
                    key={command.id}
                    type="button"
                    data-command-index={index}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => commit(index)}
                    className="relative grid w-full grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left outline-none"
                  >
                    {selected && (
                      <motion.span
                        layoutId="command-highlight"
                        className="absolute inset-0 rounded-md bg-primary/[0.075]"
                        transition={{ type: "spring", stiffness: 300, damping: 28 }}
                      />
                    )}
                    <span
                      className={cn(
                        "relative grid h-8 w-8 place-items-center rounded-md border",
                        selected
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border bg-background text-foreground-muted",
                      )}
                    >
                      <CommandIcon size={16} />
                    </span>
                    <span className="relative min-w-0">
                      <span className="block truncate text-xs font-medium">{command.name}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-foreground-muted">
                        {command.description}
                      </span>
                    </span>
                    <span className="relative font-mono text-[9px] text-foreground-subtle">
                      /{command.id}
                    </span>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-muted/25 px-4 py-2 font-mono text-[9px] text-foreground-subtle">
          <span className="flex items-center gap-3">
            <span>↑↓ 选择</span>
            <span className="flex items-center gap-1">
              <ArrowBendDownLeft size={11} /> 打开
            </span>
          </span>
          <span>{results.length} 个工作区</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
