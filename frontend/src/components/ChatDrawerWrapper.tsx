"use client";
import { usePathname } from "next/navigation";
import { CopilotButton } from "./ChatDrawer";

export function ChatDrawerWrapper() {
  const pathname = usePathname();
  if (pathname === "/chat") return null;
  return <CopilotButton />;
}
