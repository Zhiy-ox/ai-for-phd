"use client";

import { useEffect, useState } from "react";
import type { AuthStatus, ProviderId } from "@/lib/providers/types";
import { apiGet, messageOf, PROVIDER_LABELS } from "@/components/api";

// AuthStatus plus the server's memory of a recent usage-window hit.
export type ProviderStatusInfo = AuthStatus & { limitedAt?: string | null };

export interface ProvidersStatus {
  claude: ProviderStatusInfo;
  codex: ProviderStatusInfo;
}

export function useProviderStatus() {
  const [status, setStatus] = useState<ProvidersStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<ProvidersStatus>("/api/providers/status")
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((err) => {
        if (!cancelled) setError(messageOf(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { status, error, loading: status === null && error === null };
}

export function AuthDot({
  ok,
  className = "",
}: {
  ok: boolean | null;
  className?: string;
}) {
  const color =
    ok === null ? "bg-ink-faint/50" : ok ? "bg-emerald-500" : "bg-red-500";
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${color} ${className}`}
    />
  );
}

const PROVIDER_SUBTITLES: Record<ProviderId, string> = {
  claude: "Claude subscription via the Claude Code CLI",
  codex: "ChatGPT subscription via the Codex CLI",
};

// Radio-style provider selector with live auth status. Unauthenticated
// providers are greyed out and show their fix-it instruction.
export function ProviderPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ProviderId;
  onChange: (provider: ProviderId) => void;
  disabled?: boolean;
}) {
  const { status, loading, error } = useProviderStatus();
  const providers: ProviderId[] = ["claude", "codex"];

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {providers.map((id) => {
          const auth = status?.[id] ?? null;
          const ok = auth ? auth.ok : null;
          const selectable = !disabled && ok !== false;
          const selected = value === id;
          const other = id === "claude" ? "codex" : "claude";
          const otherFresh = Boolean(status?.[other]?.ok) && !status?.[other]?.limitedAt;
          return (
            <button
              key={id}
              type="button"
              disabled={!selectable}
              onClick={() => onChange(id)}
              aria-pressed={selected}
              className={`rounded-xl border p-4 text-left transition-colors ${
                selected
                  ? "border-oxford bg-oxford-faint ring-1 ring-oxford"
                  : "border-line bg-white hover:border-oxford/40"
              } ${ok === false ? "cursor-not-allowed opacity-60" : ""} ${
                disabled ? "cursor-not-allowed opacity-60" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <AuthDot ok={ok} />
                <span className="font-medium text-ink">{PROVIDER_LABELS[id]}</span>
                {selected ? (
                  <span className="ml-auto text-xs font-medium text-oxford">
                    Selected
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-ink-faint">{PROVIDER_SUBTITLES[id]}</p>
              <p
                className={`mt-2 text-xs ${
                  ok === false ? "font-medium text-red-700" : "text-ink-soft"
                }`}
              >
                {loading ? "Checking authentication…" : auth?.detail ?? "Status unknown"}
              </p>
              {ok && auth?.limitedAt ? (
                <p className="anim-rise-sm mt-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[11.5px] font-medium leading-snug text-amber-800">
                  Hit its usage window at{" "}
                  {new Date(auth.limitedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {otherFresh ? ` — ${PROVIDER_LABELS[other]} looks fresher.` : " — it may still be resetting."}
                </p>
              ) : null}
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="mt-2 text-xs text-amber-800">
          Could not check provider status: {error}
        </p>
      ) : null}
    </div>
  );
}
