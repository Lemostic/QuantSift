import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { HomePage } from "@/routes/home-page";
import { PreferencesPage } from "@/routes/preferences-page";
import { NotFoundPage } from "@/routes/not-found-page";
import { useTheme } from "@/hooks/use-theme";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "modules/watchlist", element: <HomePage /> },
      { path: "modules/preferences", element: <PreferencesPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  useTheme();
  return <RouterProvider router={router} />;
}
