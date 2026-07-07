import type { StageStatus } from "@/lib/db/repos/stage-instances";
import type { SessionStatus } from "@/lib/db/repos/sessions";
import type { DocumentKind } from "@/lib/db/repos/documents";
import type { ProviderId } from "@/lib/providers/types";
import { Chip, type ChipTone } from "@/components/ui";
import { KIND_LABELS, PROVIDER_LABELS } from "@/components/api";

const STAGE_STATUS: Record<StageStatus, { label: string; tone: ChipTone }> = {
  passed: { label: "Passed ✓", tone: "green" },
  active: { label: "In progress", tone: "navy" },
  upcoming: { label: "Upcoming", tone: "neutral" },
  locked: { label: "Locked", tone: "muted" },
  referred: { label: "Referred", tone: "amber" },
};

export function StageStatusChip({ status }: { status: StageStatus }) {
  const s = STAGE_STATUS[status] ?? STAGE_STATUS.upcoming;
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

const SESSION_STATUS: Record<SessionStatus, { label: string; tone: ChipTone }> = {
  active: { label: "Live", tone: "green" },
  ended: { label: "Ended", tone: "neutral" },
  errored: { label: "Errored", tone: "red" },
};

export function SessionStatusChip({ status }: { status: SessionStatus }) {
  const s = SESSION_STATUS[status] ?? SESSION_STATUS.ended;
  return (
    <Chip tone={s.tone}>
      {status === "active" ? (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
      ) : null}
      {s.label}
    </Chip>
  );
}

export function ProviderBadge({ provider }: { provider: ProviderId }) {
  return <Chip tone={provider === "claude" ? "brass" : "navy"}>{PROVIDER_LABELS[provider] ?? provider}</Chip>;
}

export function KindBadge({ kind }: { kind: DocumentKind }) {
  const primary =
    kind === "transfer_report" ||
    kind === "confirmation_report" ||
    kind === "paper" ||
    kind === "thesis";
  return <Chip tone={primary ? "navy" : "neutral"}>{KIND_LABELS[kind] ?? kind}</Chip>;
}
