"use client";

import { useRef, useState, type DragEvent } from "react";
import type { DocumentKind, DocumentSummary } from "@/lib/db/repos/documents";
import { apiUpload, DOCUMENT_KINDS, KIND_LABELS, messageOf } from "@/components/api";
import { Spinner } from "@/components/ui";

const ACCEPT = ".pdf,.docx,.md,.tex,.txt";

// Drag-and-drop + click-to-browse uploader. POSTs multipart/form-data to
// /api/documents with the chosen kind and (optionally fixed) stage.
export function UploadDropzone({
  stageId,
  stages,
  defaultKind = "other",
  onUploaded,
}: {
  // Fixed stage for every upload (stage page). Omit to show a stage select.
  stageId?: string;
  // Options for the stage select when stageId is not fixed.
  stages?: { id: string; title: string }[];
  defaultKind?: DocumentKind;
  onUploaded: (doc: DocumentSummary) => void;
}) {
  const [kind, setKind] = useState<DocumentKind>(defaultKind);
  const [selectedStage, setSelectedStage] = useState<string>(stageId ?? "");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of list) {
        const form = new FormData();
        form.set("file", file);
        form.set("kind", kind);
        const stage = stageId ?? selectedStage;
        if (stage) form.set("stageId", stage);
        const { document } = await apiUpload<{ document: DocumentSummary }>(
          "/api/documents",
          form,
        );
        onUploaded(document);
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (uploading) return;
    void handleFiles(e.dataTransfer.files);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragging ? "border-oxford bg-oxford-faint" : "border-line bg-white/70"
        }`}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2 text-ink-soft">
            <Spinner className="h-5 w-5 text-oxford" />
            <p className="text-sm">Uploading &amp; extracting text…</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-ink">
              Drag a file here, or{" "}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="font-medium text-oxford underline underline-offset-2 hover:text-oxford-mid"
              >
                browse
              </button>
            </p>
            <p className="mt-1.5 text-xs text-ink-faint">
              .pdf, .docx, .md, .tex or .txt — prefer <span className="font-mono">.tex</span>/
              <span className="font-mono">.md</span> over PDF for best extraction
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
          }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-ink-soft">
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as DocumentKind)}
            className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:border-oxford focus:outline-none"
          >
            {DOCUMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        {stageId === undefined && stages && stages.length > 0 ? (
          <label className="flex items-center gap-2 text-ink-soft">
            Stage
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:border-oxford focus:outline-none"
            >
              <option value="">Unassigned</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
