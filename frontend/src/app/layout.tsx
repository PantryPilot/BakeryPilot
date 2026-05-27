import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppProvider } from "../lib/context";
import { Sidebar, TopBar, BottomStrip } from "../components/Shell";
import { ChatDrawerWrapper } from "../components/ChatDrawerWrapper";
import { AlertBanner } from "../components/AlertBanner";
import { ACCENT_STORAGE_KEY, DEFAULT_ACCENT, DEFAULT_THEME, THEME_STORAGE_KEY } from "../lib/theme";

export const metadata: Metadata = {
  title: "BakeryPilot",
  description: "Agentic ops copilot for industrial bakery supply chains",
};

const themeInitScript = `
(() => {
  try {
    const root = document.documentElement;
    const storedTheme = window.localStorage.getItem("${THEME_STORAGE_KEY}");
    const theme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : "${DEFAULT_THEME}";
    const storedAccent = window.localStorage.getItem("${ACCENT_STORAGE_KEY}");
    const accent = storedAccent === "blue" || storedAccent === "emerald" || storedAccent === "violet" || storedAccent === "amber"
      ? storedAccent
      : "${DEFAULT_ACCENT}";
    root.dataset.theme = theme;
    root.dataset.accent = accent;
    root.style.colorScheme = theme;
  } catch {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME} data-accent={DEFAULT_ACCENT} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning>
        <AppProvider>
          <div className="bp-app-shell h-screen w-screen flex overflow-hidden">
            <Suspense fallback={<div className="bp-sidebar-fallback hidden md:block shrink-0 w-[208px]" />}>
              <Sidebar/>
            </Suspense>
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <TopBar/>
              <main className="flex-1 min-h-0 relative overflow-hidden">
                <div className="page-transition h-full">
                  {children}
                </div>
              </main>
              <BottomStrip/>
            </div>
            <AlertBanner/>
            <ChatDrawerWrapper/>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
