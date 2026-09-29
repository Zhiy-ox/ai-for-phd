"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AuthDot, useProviderStatus } from "@/components/provider-picker";
import { apiGet, PROVIDER_LABELS } from "@/components/api";
import { DEFAULT_PROGRAMME_ID, listProgrammes } from "@/lib/template";

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

// Names come from the template registry so a new or renamed programme
// shows up in the masthead without touching this file.
function programmeNameFor(id: string): string {
  const programmes = listProgrammes();
  return (
    programmes.find((p) => p.id === id)?.name ??
    programmes.find((p) => p.id === DEFAULT_PROGRAMME_ID)?.name ??
    "Doctoral programme"
  );
}

function Brand({ dark, programmeName }: { dark: boolean; programmeName: string }) {
  return (
    <Link
      href="/"
      aria-label={`AI for PhD — ${programmeName}`}
      className={`flex min-h-11 shrink-0 items-center gap-2.5 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
        dark ? "focus-visible:outline-[#f5f2ea]" : "focus-visible:outline-oxford"
      }`}
    >
      <span
        className="font-display text-[22px] font-medium italic"
        style={{ color: dark ? "#f5f2ea" : "var(--color-ink)" }}
      >
        AI for PhD
      </span>
      <span
        className="hidden max-w-40 truncate text-[10px] uppercase tracking-[0.18em] sm:inline"
        style={{ color: dark ? "rgba(245,242,234,0.72)" : "var(--color-ink-soft)" }}
        title={programmeName}
      >
        {programmeName}
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
  const [programmeName, setProgrammeName] = useState("Doctoral programme");
  // The viva room paints its own full-bleed dark background.
  const dark = /^\/sessions\/[^/]+$/.test(pathname);

  // Load once; the welcome wizard and Settings dispatch
  // "aiphd:programme-changed" whenever they switch programmes.
  useEffect(() => {
    let active = true;
    const refreshProgramme = () => {
      void apiGet<{ programme_id: string }>("/api/settings")
        .then((settings) => {
          if (active) setProgrammeName(programmeNameFor(settings.programme_id || DEFAULT_PROGRAMME_ID));
        })
        .catch(() => {
          // Branding should never block navigation when settings are unavailable.
        });
    };

    refreshProgramme();
    window.addEventListener("aiphd:programme-changed", refreshProgramme);
    return () => {
      active = false;
      window.removeEventListener("aiphd:programme-changed", refreshProgramme);
    };
  }, []);

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
          <Brand dark={dark} programmeName={programmeName} />
          <nav
            aria-label="Primary"
            className="ml-1 flex items-center gap-1 overflow-x-auto md:ml-3"
          >
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
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                    dark ? "focus-visible:outline-[#f5f2ea]" : "focus-visible:outline-oxford"
                  } ${cls}`}
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
