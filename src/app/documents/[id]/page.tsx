"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { DocumentRow } from "@/lib/db/repos/documents";
import type { ReportRow } from "@/lib/db/repos/reports";
import type { ProviderId } from "@/lib/providers/types";
import type { AppSettings } from "@/lib/db/repos/settings";
import { apiGet, apiSend, formatChars, formatDateTime, messageOf } from "@/components/api";
import { KindBadge } from "@/components/status-chip";
import { ProviderPicker } from "@/components/provider-picker";
import {
  Button,
  Card,
  Chip,
  ErrorBanner,
  PageLoading,
  SectionLabel,
  Spinner,
} from "@/components/ui";

const PREVIEW_CHARS = 5000;

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [pasted, setPasted] = useState("");
  const [savingText, setSavingText] = useState(false);
  const [provider, setProvider] = useState<ProviderId>("claude");
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(() => {
    apiGet<{ document: DocumentRow }>(`/api/documents/${params.id}`)
      .then((r) => setDoc(r.document))
      .catch((e) => setError(messageOf(e)));
    apiGet<{ reports: ReportRow[] }>(`/api/reports?documentId=${params.id}`)
      .then((r) => setReports(r.reports))
      .catch(() => {});
  }, [params.id]);

  useEffect(() => {
    load();
    apiGet<AppSettings>("/api/settings")
      .then((s) => setProvider(s.default_provider))
      .catch(() => {});
  }, [load]);

  async function saveText() {
    setSavingText(true);
    setError(null);
    try {
      await apiSend(`/api/documents/${params.id}/text`, "POST", { text: pasted });
      setPasted("");
      load();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSavingText(false);
    }
  }

  async function review() {
    setReviewing(true);
    setError(null);
    try {
      const { reportId } = await apiSend<{ reportId: string }>(
        `/api/documents/${params.id}/review`,
        "POST",
        { provider },
      );
      router.push(`/reports/${reportId}`);
    } catch (err) {
      setError(messageOf(err));
      setReviewing(false);
    }
  }

  if (error && !doc) return <ErrorBanner tone="red" message={error} />;
  if (!doc) return <PageLoading label="Loading document…" />;

  const text = doc.extracted_text ?? "";
  const preview = showAll ? text : text.slice(0, PREVIEW_CHARS);

  return (
    <div className="mx-auto max-w-[1020px] px-5 py-11 md:px-9">
      <Link href="/documents" className="text-sm text-ink-faint hover:text-oxford">
        ← Documents
      </Link>
      <header className="mb-6 mt-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="break-all font-display text-[28px] font-normal text-ink">{doc.filename}</h1>
          <KindBadge kind={doc.kind} />
          {doc.extracted_text ? (
            <Chip tone="green">{formatChars(doc.char_count)}</Chip>
          ) : (
            <Chip tone="amber">no text</Chip>
          )}
        </div>
        <p className="mt-1 text-xs text-ink-faint">
          Uploaded {formatDateTime(doc.created_at)}
        </p>
      </header>

      {error ? (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      {doc.extract_error && !doc.extracted_text ? (
        <div className="mb-4">
          <ErrorBanner
            message={`Extraction failed: ${doc.extract_error}`}
            hint="Paste the document text below instead — or re-upload as .tex/.md, which extract most reliably."
          />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section>
          <SectionLabel>Extracted text</SectionLabel>
          {doc.extracted_text ? (
            <>
              <pre className="mt-2 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-white p-4 font-mono text-xs leading-relaxed text-ink">
                {preview}
                {!showAll && text.length > PREVIEW_CHARS ? "\n…" : ""}
              </pre>
              {text.length > PREVIEW_CHARS ? (
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="mt-2 text-sm font-medium text-oxford hover:underline"
                >
                  {showAll ? "Show less" : `Show all ${formatChars(text.length)}`}
                </button>
              ) : null}
            </>
          ) : (
            <div className="mt-2">
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={12}
                placeholder="Paste the full document text here…"
                className="w-full rounded-xl border border-line bg-white p-4 font-mono text-xs leading-relaxed text-ink focus:border-oxford focus:outline-none"
              />
              <Button
                className="mt-2"
                onClick={saveText}
                disabled={pasted.trim().length === 0 || savingText}
              >
                {savingText ? <Spinner /> : null} Save text
              </Button>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <Card className="p-5">
            <SectionLabel>Rubric review</SectionLabel>
            <p className="mt-2 text-sm text-ink-soft">
              A senior-academic reviewer scores the document against the stage rubric
              and anchors comments to exact passages.
            </p>
            <div className="mt-3">
              <ProviderPicker value={provider} onChange={setProvider} disabled={reviewing} />
            </div>
            <Button
              className="mt-4 w-full"
              onClick={review}
              disabled={!doc.extracted_text || reviewing}
            >
              {reviewing ? <Spinner /> : null}
              {reviewing ? "Reviewer is reading…" : "Run review"}
            </Button>
            {reviewing ? (
              <p className="mt-2 text-xs text-ink-faint">
                This reads the whole document — expect a minute or two.
              </p>
            ) : null}
          </Card>

          <div>
            <SectionLabel>Reports on this document</SectionLabel>
            {reports.length === 0 ? (
              <p className="mt-2 text-sm text-ink-faint">None yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {reports.map((r) => (
                  <li key={r.id}>
                    <Link href={`/reports/${r.id}`} className="block">
                      <Card className="flex items-center gap-2 p-3 text-sm transition-shadow hover:shadow-md">
                        <span className="font-medium text-oxford">Document review</span>
                        <span className="ml-auto text-xs text-ink-faint">
                          {formatDateTime(r.created_at)}
                        </span>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
