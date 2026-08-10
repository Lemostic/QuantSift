import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { HomePage } from "@/routes/home-page";
import { WatchlistPage } from "@/routes/watchlist-page";
import { ScansPage } from "@/routes/scans-page";
import { PreferencesPage } from "@/routes/preferences-page";
import { NotFoundPage } from "@/routes/not-found-page";
import { useTheme } from "@/hooks/use-theme";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "watchlist", element: <WatchlistPage /> },
      { path: "scans", element: <ScansPage /> },
      { path: "modules/preferences", element: <PreferencesPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  useTheme();
  return <RouterProvider router={router} />;
}
