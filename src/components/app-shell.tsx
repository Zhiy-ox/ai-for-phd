"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AuthDot, useProviderStatus } from "@/components/provider-picker";
import { PROVIDER_LABELS } from "@/components/api";

interface NavItem {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
}

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Journey",
    isActive: (p) => p === "/" || p.startsWith("/stages") || p.startsWith("/reports"),
  },
  { href: "/documents", label: "Documents", isActive: (p) => p.startsWith("/documents") },
  { href: "/sessions", label: "Sessions", isActive: (p) => p.startsWith("/sessions") },
  { href: "/settings", label: "Settings", isActive: (p) => p.startsWith("/settings") },
];

function Brand({ dark }: { dark: boolean }) {
  return (
    <Link href="/" className="flex items-baseline gap-2.5">
      <span
        className="font-display text-[22px] font-medium italic"
        style={{ color: dark ? "#f5f2ea" : "var(--color-ink)" }}
      >
        AI for PhD
      </span>
      <span
        className="text-[10px] uppercase tracking-[0.22em]"
        style={{ color: dark ? "rgba(245,242,234,0.5)" : "var(--color-ink-faint)" }}
      >
        Oxford DPhil
      </span>
    </Link>
  );
}

// Compact provider-readiness indicator for the masthead's right edge.
function ProviderStatus({ dark }: { dark: boolean }) {
  const { status } = useProviderStatus();
  const claude = status?.claude ?? null;
  const codex = status?.codex ?? null;
  const ready = claude?.ok ? "claude" : codex?.ok ? "codex" : null;
  return (
    <div
      className="hidden items-center gap-2 text-xs sm:flex"
      style={{ color: dark ? "rgba(245,242,234,0.6)" : "var(--color-ink-faint)" }}
    >
      <AuthDot ok={ready ? true : claude === null ? null : false} />
      <span>
        {ready
          ? `${PROVIDER_LABELS[ready]} ready`
          : claude === null
            ? "checking…"
            : "no backend"}
      </span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  // The viva room paints its own full-bleed dark background.
  const dark = /^\/sessions\/[^/]+$/.test(pathname);

  return (
    <div className="min-h-screen" style={dark ? { background: "#0a1626" } : undefined}>
      <header
        className="no-print sticky top-0 z-50 border-b backdrop-blur-md"
        style={
          dark
            ? { background: "rgba(10,22,38,0.72)", borderColor: "rgba(255,255,255,0.08)" }
            : { background: "rgba(245,242,234,0.82)", borderColor: "var(--color-line)" }
        }
      >
        <div className="mx-auto flex h-16 max-w-[1140px] items-center gap-5 px-5 md:px-9">
          <Brand dark={dark} />
          <nav className="ml-1 flex items-center gap-1 overflow-x-auto md:ml-3">
            {NAV.map((item) => {
              const active = item.isActive(pathname);
              const cls = dark
                ? active
                  ? "bg-white/10 text-[#f5f2ea]"
                  : "text-[rgba(245,242,234,0.6)] hover:text-[#f5f2ea]"
                : active
                  ? "bg-oxford-soft text-oxford"
                  : "text-ink-soft hover:bg-oxford-faint hover:text-oxford";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${cls}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto">
            <ProviderStatus dark={dark} />
          </div>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
