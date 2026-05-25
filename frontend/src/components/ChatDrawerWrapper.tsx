"use client";
import { usePathname } from "next/navigation";
import { useApp } from "../lib/context";
import { ChatDrawer } from "./ChatDrawer";

export function ChatDrawerWrapper() {
  const { chatOpen, setChatOpen, chatContext } = useApp();
  const pathname = usePathname();

  if (pathname === "/chat") return null;

  return (
    <ChatDrawer open={chatOpen} setOpen={setChatOpen} context={chatContext}/>
  );
}
