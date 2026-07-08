// Thin typed fetch helpers + shared display labels for the client pages.
// All row/template types are imported (type-only) from the pinned modules.
import type { DocumentKind } from "@/lib/db/repos/documents";
import type { ProviderId } from "@/lib/providers/types";
import type { ActivityId } from "@/lib/template";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (data && typeof data.error === "string" && data.error.length > 0) {
      return data.error;
    }
  } catch {
    // Non-JSON error body — fall through to the generic message.
  }
  return `Request failed (HTTP ${res.status})`;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  return (await res.json()) as T;
}

export async function apiSend<T>(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  return (await res.json()) as T;
}

export async function apiUpload<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  return (await res.json()) as T;
}

export function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/* ------------------------------------------------------------------ */
/* Display labels                                                      */
/* ------------------------------------------------------------------ */

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

export const KIND_LABELS: Record<DocumentKind, string> = {
  transfer_report: "Transfer report",
  confirmation_report: "Confirmation report",
  proposal: "Proposal",
  paper: "Paper / manuscript",
  referee_reports: "Referee reports",
  thesis: "Thesis / chapters",
  other: "Other",
};

export const DOCUMENT_KINDS: DocumentKind[] = [
  "transfer_report",
  "confirmation_report",
  "proposal",
  "paper",
  "referee_reports",
  "thesis",
  "other",
];

// The document kind each stage's interview examines first.
export const STAGE_PRIMARY_KIND: Record<string, DocumentKind> = {
  "prs-start": "proposal",
  transfer: "transfer_report",
  confirmation: "confirmation_report",
  papers: "paper",
  thesis: "thesis",
  "final-viva": "thesis",
};

export const ACTIVITY_LABELS: Record<ActivityId, string> = {
  doc_feedback: "Document feedback",
  mock_viva: "Mock viva",
  rebuttal_roleplay: "Rebuttal role-play",
  writing_support: "Writing support",
  viva_prep: "Viva preparation",
};

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatChars(count: number | null | undefined): string {
  if (count === null || count === undefined) return "";
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k chars`;
  return `${count} chars`;
}
