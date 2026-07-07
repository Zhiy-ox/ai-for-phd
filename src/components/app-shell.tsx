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
  icon: ReactNode;
}

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    isActive: (p) =>
      p === "/" || p.startsWith("/stages") || p.startsWith("/reports"),
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <path
          d="M3 9.5 10 3l7 6.5M5 8.5V17h10V8.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/documents",
    label: "Documents",
    isActive: (p) => p.startsWith("/documents"),
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <path
          d="M5 2.5h6.5L15 6v11.5H5V2.5ZM11.5 2.5V6H15M7.5 9.5h5M7.5 12.5h5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/sessions",
    label: "Sessions",
    isActive: (p) => p.startsWith("/sessions"),
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <path
          d="M3 4.5h14v8.5h-8l-3.5 3v-3H3V4.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    isActive: (p) => p.startsWith("/settings"),
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M10 2.8v2M10 15.2v2M17.2 10h-2M4.8 10h-2M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4M15.1 15.1l-1.4-1.4M6.3 6.3 4.9 4.9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

function Brand() {
  return (
    <Link href="/" className="block">
      <p className="font-display text-xl leading-tight text-white">AI for PhD</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-white/50">
        Oxford DPhil copilot
      </p>
    </Link>
  );
}

function ProviderDots() {
  const { status } = useProviderStatus();
  const providers = ["claude", "codex"] as const;
  return (
    <div className="space-y-1.5">
      {providers.map((id) => {
        const auth = status?.[id] ?? null;
        return (
          <div
            key={id}
            className="flex items-center gap-2 text-xs text-white/60"
            title={auth?.detail ?? "Checking…"}
          >
            <AuthDot ok={auth ? auth.ok : null} />
            <span>{PROVIDER_LABELS[id]}</span>
            <span className="truncate text-white/35">
              {auth === null ? "checking…" : auth.ok ? "ready" : "not signed in"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";

  return (
    <div className="min-h-screen">
      {/* Sidebar (md+) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-oxford-deep bg-oxford md:flex">
        <div className="px-5 pb-6 pt-7">
          <Brand />
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active = item.isActive(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-white/10 font-medium text-white"
                    : "text-white/65 hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-5 py-4">
          <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-white/35">
            Assessor backends
          </p>
          <ProviderDots />
        </div>
      </aside>

      {/* Top bar (mobile) */}
      <header className="sticky top-0 z-40 border-b border-oxford-deep bg-oxford md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Brand />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {NAV.map((item) => {
            const active = item.isActive(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs ${
                  active
                    ? "bg-white/15 font-medium text-white"
                    : "text-white/65 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="md:pl-60">
        <div className="mx-auto w-full max-w-5xl px-5 py-8 md:px-10 md:py-12">
          {children}
        </div>
      </main>
    </div>
  );
}
