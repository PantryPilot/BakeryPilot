"use client";
import { usePathname } from "next/navigation";
import { useApp } from "../lib/context";
import { ChatDrawer } from "./ChatDrawer";

export function ChatDrawerWrapper() {
  const { chatContext } = useApp();
  const pathname = usePathname();

  if (pathname === "/chat") return null;

  return <ChatDrawer context={chatContext} />;
}
