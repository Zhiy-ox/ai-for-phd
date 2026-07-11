"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AppSettings } from "@/lib/db/repos/settings";
import { DEFAULT_PROGRAMME_ID, listProgrammes } from "@/lib/template";
import type { ProviderId } from "@/lib/providers/types";
import { apiGet, apiSend, messageOf, PROVIDER_LABELS } from "@/components/api";
import { AuthDot, useProviderStatus } from "@/components/provider-picker";
import {
  Button,
  Card,
  ErrorBanner,
  PageLoading,
  SectionLabel,
  Spinner,
} from "@/components/ui";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { status } = useProviderStatus();

  useEffect(() => {
    apiGet<AppSettings>("/api/settings")
      .then(setSettings)
      .catch((e) => setError(messageOf(e)));
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiSend<AppSettings>("/api/settings", "PUT", settings);
      setSettings(updated);
      setSaved(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  if (error && !settings) return <ErrorBanner tone="red" message={error} />;
  if (!settings) return <PageLoading label="Loading settings…" />;

  const providers: ProviderId[] = ["claude", "codex"];

  return (
    <div className="mx-auto max-w-[700px] px-5 py-12 md:px-9">
      <header className="mb-8">
        <SectionLabel>Configuration</SectionLabel>
        <h1 className="mt-2 font-display text-[34px] font-normal text-ink">Settings</h1>
      </header>

      <div className="space-y-6">
        <Card className="p-5">
          <SectionLabel>Programme</SectionLabel>
          <p className="mt-1 text-xs text-ink-faint">
            The stage structure, gate names, and examiner panels. Switching seeds the
            new programme&apos;s stages; your documents and sessions are kept.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              value={settings.programme_id || DEFAULT_PROGRAMME_ID}
              onChange={(e) => setSettings({ ...settings, programme_id: e.target.value })}
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-oxford focus:outline-none"
            >
              {listProgrammes().map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Link href="/welcome" className="text-[13px] font-medium text-oxford hover:underline">
              Re-run setup →
            </Link>
          </div>
        </Card>

        <Card className="p-5">
          <SectionLabel>Default assessor backend</SectionLabel>
          <div className="mt-3 space-y-2">
            {providers.map((id) => {
              const auth = status?.[id] ?? null;
              return (
                <label
                  key={id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                    settings.default_provider === id
                      ? "border-oxford bg-oxford-faint"
                      : "border-line bg-white hover:border-oxford/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="default_provider"
                    checked={settings.default_provider === id}
                    onChange={() => setSettings({ ...settings, default_provider: id })}
                    className="accent-oxford"
                  />
                  <span className="font-medium text-ink">{PROVIDER_LABELS[id]}</span>
                  <span className="ml-auto flex items-center gap-2 text-xs text-ink-soft">
                    <AuthDot ok={auth ? auth.ok : null} />
                    {auth === null ? "checking…" : auth.detail}
                  </span>
                </label>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <SectionLabel>Models</SectionLabel>
          <p className="mt-1 text-xs text-ink-faint">
            Leave blank to use each provider&apos;s default. Smaller models are faster
            and cheaper on your usage window.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-ink-soft">
              <span className="mb-1 block text-xs text-ink-faint">Claude model</span>
              <input
                type="text"
                value={settings.claude_model}
                onChange={(e) => setSettings({ ...settings, claude_model: e.target.value })}
                placeholder="provider default"
                className="w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-xs text-ink focus:border-oxford focus:outline-none"
              />
            </label>
            <label className="text-sm text-ink-soft">
              <span className="mb-1 block text-xs text-ink-faint">Codex model</span>
              <input
                type="text"
                value={settings.codex_model}
                onChange={(e) => setSettings({ ...settings, codex_model: e.target.value })}
                placeholder="provider default"
                className="w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-xs text-ink focus:border-oxford focus:outline-none"
              />
            </label>
          </div>
        </Card>

        {error ? <ErrorBanner message={error} /> : null}

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? <Spinner /> : null} Save settings
          </Button>
          {saved ? <span className="text-sm text-emerald-700">Saved ✓</span> : null}
        </div>

        <Card className="p-5">
          <SectionLabel>How the backends work</SectionLabel>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            AI for PhD does not use API keys. The assessor panel runs on your existing
            subscriptions: <span className="font-medium text-ink">Claude Code</span>{" "}
            (Claude subscription, via the locally installed <code>claude</code> CLI) or{" "}
            <span className="font-medium text-ink">Codex</span> (ChatGPT subscription,
            via the <code>codex</code> CLI). If a backend shows as signed out, log in
            from Terminal and it will turn green here.
          </p>
        </Card>
      </div>
    </div>
  );
}
