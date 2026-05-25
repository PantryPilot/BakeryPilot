import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "../lib/context";
import { Sidebar, TopBar, BottomStrip } from "../components/Shell";
import { ChatDrawerWrapper } from "../components/ChatDrawerWrapper";

export const metadata: Metadata = {
  title: "BakeryPilot",
  description: "Agentic ops copilot for industrial bakery supply chains",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <div className="h-screen w-screen flex bg-[#0a0d14] text-slate-200 overflow-hidden">
            <Sidebar/>
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <TopBar/>
              <main className="flex-1 min-h-0 relative overflow-hidden">
                {children}
              </main>
              <BottomStrip/>
            </div>
            <ChatDrawerWrapper/>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
