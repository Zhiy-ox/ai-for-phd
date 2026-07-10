"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { DocumentSummary } from "@/lib/db/repos/documents";
import type { ProgrammeTemplate } from "@/lib/template";
import { apiGet, apiSend, formatChars, formatDate, messageOf } from "@/components/api";
import { KindBadge } from "@/components/status-chip";
import { UploadDropzone } from "@/components/upload-dropzone";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  PageLoading,
  SectionLabel,
} from "@/components/ui";

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [programme, setProgramme] = useState<ProgrammeTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet<{ documents: DocumentSummary[] }>("/api/documents")
      .then((r) => setDocs(r.documents))
      .catch((e) => setError(messageOf(e)));
  }, []);

  useEffect(() => {
    load();
    apiGet<{ programme: ProgrammeTemplate }>("/api/programme")
      .then((r) => setProgramme(r.programme))
      .catch(() => {});
  }, [load]);

  async function remove(id: string) {
    if (!window.confirm("Delete this document and its stored file?")) return;
    try {
      await apiSend(`/api/documents/${id}`, "DELETE");
      load();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  const stageTitle = (id: string | null) =>
    programme?.stages.find((s) => s.id === id)?.title ?? id ?? "—";

  return (
    <div className="mx-auto max-w-[920px] px-5 py-12 md:px-9">
      <header className="mb-8">
        <SectionLabel>Library</SectionLabel>
        <h1 className="mt-2 font-display text-[34px] font-normal text-ink">Documents</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Everything the AI reads about your research lives here — report drafts,
          proposals, papers. Text is extracted on upload and fed whole into each
          feedback or viva session.
        </p>
      </header>

      <div className="mb-8">
        <UploadDropzone
          stages={programme?.stages.map((s) => ({ id: s.id, title: s.title }))}
          onUploaded={load}
        />
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      {docs === null ? (
        <PageLoading label="Loading documents…" />
      ) : docs.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          hint="Drop in your transfer report draft to get started — .tex or .md extract most cleanly."
        />
      ) : (
        <ul className="space-y-2">
          {docs.map((doc) => (
            <li key={doc.id}>
              <Card className="flex flex-wrap items-center gap-3 p-4">
                <Link
                  href={`/documents/${doc.id}`}
                  className="font-medium text-oxford hover:underline"
                >
                  {doc.filename}
                </Link>
                <KindBadge kind={doc.kind} />
                {doc.stage_id ? <Chip tone="neutral">{stageTitle(doc.stage_id)}</Chip> : null}
                {doc.has_text ? (
                  <Chip tone="green">{formatChars(doc.char_count) || "text ✓"}</Chip>
                ) : (
                  <Chip tone="amber" title={doc.extract_error ?? undefined}>
                    extraction failed
                  </Chip>
                )}
                <span className="ml-auto flex items-center gap-3">
                  <span className="text-xs text-ink-faint">{formatDate(doc.created_at)}</span>
                  <Button variant="danger" onClick={() => remove(doc.id)}>
                    Delete
                  </Button>
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
