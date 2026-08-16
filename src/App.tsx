import { lazy } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { useTheme } from "@/hooks/use-theme";

const HomePage = lazy(() =>
  import("@/routes/home-page").then((module) => ({ default: module.HomePage })),
);
const WatchlistPage = lazy(() =>
  import("@/routes/watchlist-page").then((module) => ({
    default: module.WatchlistPage,
  })),
);
const ScansPage = lazy(() =>
  import("@/routes/scans-page").then((module) => ({ default: module.ScansPage })),
);
const AlertsPage = lazy(() =>
  import("@/routes/alerts-page").then((module) => ({ default: module.AlertsPage })),
);
const PortfolioPage = lazy(() =>
  import("@/routes/portfolio-page").then((module) => ({
    default: module.PortfolioPage,
  })),
);
const BacktestPage = lazy(() =>
  import("@/routes/backtest-page").then((module) => ({
    default: module.BacktestPage,
  })),
);
const IntelligencePage = lazy(() =>
  import("@/routes/intelligence-page").then((module) => ({
    default: module.IntelligencePage,
  })),
);
const GlossaryPage = lazy(() =>
  import("@/routes/glossary-page").then((module) => ({
    default: module.GlossaryPage,
  })),
);
const PreferencesPage = lazy(() =>
  import("@/routes/preferences-page").then((module) => ({
    default: module.PreferencesPage,
  })),
);
const NotFoundPage = lazy(() =>
  import("@/routes/not-found-page").then((module) => ({
    default: module.NotFoundPage,
  })),
);

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "watchlist", element: <WatchlistPage /> },
      { path: "portfolio", element: <PortfolioPage /> },
      { path: "backtest", element: <BacktestPage /> },
      { path: "intelligence", element: <IntelligencePage /> },
      { path: "glossary", element: <GlossaryPage /> },
      { path: "scans", element: <ScansPage /> },
      { path: "alerts", element: <AlertsPage /> },
      { path: "modules/preferences", element: <PreferencesPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  useTheme();
  return <RouterProvider router={router} />;
}
