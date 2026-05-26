"use client";

interface IconProps {
  name: string;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 16, className = "" }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24" as const,
    fill: "none" as const,
    stroke: "currentColor" as const,
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };
  switch (name) {
    case "grid":     return <svg {...common}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
    case "box":      return <svg {...common}><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>;
    case "truck":    return <svg {...common}><rect x="1" y="6" width="13" height="10"/><path d="M14 9h4l3 3v4h-7"/><circle cx="5.5" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/></svg>;
    case "calendar": return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>;
    case "bars":     return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>;
    case "chat":     return <svg {...common}><path d="M21 12a8 8 0 0 1-12 6.9L3 21l2.1-6A8 8 0 1 1 21 12z"/></svg>;
    case "bell":     return <svg {...common}><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>;
    case "chevron":  return <svg {...common}><path d="M6 9l6 6 6-6"/></svg>;
    case "x":        return <svg {...common}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case "play":     return <svg {...common}><path d="M6 4l14 8-14 8z"/></svg>;
    case "pause":    return <svg {...common}><path d="M7 4v16M17 4v16"/></svg>;
    case "mic":      return <svg {...common}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>;
    case "send":     return <svg {...common}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>;
    case "check":    return <svg {...common}><path d="M4 12l5 5L20 6"/></svg>;
    case "spark":    return <svg {...common}><path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M5 19l4-4M15 9l4-4"/></svg>;
    case "filter":   return <svg {...common}><path d="M3 5h18l-7 9v7l-4-2v-5L3 5z"/></svg>;
    case "search":   return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
    case "warn":     return <svg {...common}><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.5"/></svg>;
    case "info":     return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>;
    case "leaf":     return <svg {...common}><path d="M20 4c-9 0-15 4-15 12 0 2 1 3 2 4M5 20c10 0 15-7 15-16"/></svg>;
    case "dot":      return <svg {...common}><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>;
    case "diff":     return <svg {...common}><path d="M9 4v16M5 8h8M15 12l4-4 4 4M19 8v12"/></svg>;
    case "wave":     return <svg {...common}><path d="M3 12c2 0 2-5 4-5s2 10 4 10 2-7 4-7 2 5 4 5 2-3 2-3"/></svg>;
    case "drop":     return <svg {...common}><path d="M12 3s7 8 7 13a7 7 0 0 1-14 0c0-5 7-13 7-13z"/></svg>;
    case "zap":      return <svg {...common}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>;
    case "download": return <svg {...common}><path d="M12 3v12M8 11l4 4 4-4M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"/></svg>;
    default: return null;
  }
}
