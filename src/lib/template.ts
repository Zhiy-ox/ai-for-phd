import { z } from "zod";
import { oxfordDphil } from "@/templates/oxford-dphil";

export const ActivityIdSchema = z.enum([
  "doc_feedback",
  "mock_viva",
  "rebuttal_roleplay",
  "writing_support",
  "viva_prep",
]);

export const RubricCriterionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  weight: z.number().min(0).max(1).default(1),
});

export const PersonaTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  style: z.string(),
  focus: z.array(z.string()),
});

export const VerdictTemplateSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
});

export const StageGateSchema = z.object({
  type: z.enum(["none", "report_and_viva", "submission", "examination", "recurring"]),
  formRef: z.string().optional(),
});

// Optional per-stage styling of the interview exercise. Defaults describe a
// formal Oxford viva; the papers stage overrides them to frame a peer-review
// rebuttal rehearsal instead.
export const SessionStyleSchema = z.object({
  label: z.string().optional(),
  brief: z.string().optional(),
  opening: z.string().optional(),
  reportTitle: z.string().optional(),
});

export const StageTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  ordinal: z.number().int(),
  description: z.string(),
  typicalTiming: z.object({
    from: z.number(),
    to: z.number(),
    label: z.string(),
  }),
  gate: StageGateSchema,
  requiredDocuments: z.array(
    z.object({ id: z.string(), title: z.string(), description: z.string() }),
  ),
  activities: z.array(ActivityIdSchema),
  implemented: z.boolean(),
  assessment: z
    .object({
      panel: z.array(PersonaTemplateSchema),
      rubric: z.array(RubricCriterionSchema),
      verdicts: z.array(VerdictTemplateSchema),
      session: SessionStyleSchema.optional(),
    })
    .optional(),
});

export const ProgrammeTemplateSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    institutionNote: z.string().optional(),
    timeUnit: z.enum(["term", "semester", "month"]),
    stages: z.array(StageTemplateSchema).min(1),
  })
  .refine(
    (p) => new Set(p.stages.map((s) => s.id)).size === p.stages.length,
    { message: "stage ids must be unique" },
  )
  .refine(
    (p) => p.stages.every((s) => !(s.gate.type === "report_and_viva" && s.implemented) || s.assessment),
    { message: "implemented report_and_viva stages must define an assessment block" },
  );

export type ActivityId = z.infer<typeof ActivityIdSchema>;
export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;
export type PersonaTemplate = z.infer<typeof PersonaTemplateSchema>;
export type VerdictTemplate = z.infer<typeof VerdictTemplateSchema>;
export type StageGate = z.infer<typeof StageGateSchema>;
export type StageTemplate = z.infer<typeof StageTemplateSchema>;
export type ProgrammeTemplate = z.infer<typeof ProgrammeTemplateSchema>;

const registry = new Map<string, ProgrammeTemplate>();

function register(template: unknown): void {
  const parsed = ProgrammeTemplateSchema.parse(template);
  registry.set(parsed.id, parsed);
}

register(oxfordDphil);

export const DEFAULT_PROGRAMME_ID = "oxford-dphil";

export function getProgramme(id: string): ProgrammeTemplate {
  const p = registry.get(id);
  if (!p) throw new Error(`Unknown programme template: ${id}`);
  return p;
}

export function listProgrammes(): ProgrammeTemplate[] {
  return [...registry.values()];
}

export function getStage(programmeId: string, stageId: string): StageTemplate {
  const stage = getProgramme(programmeId).stages.find((s) => s.id === stageId);
  if (!stage) throw new Error(`Unknown stage ${stageId} in programme ${programmeId}`);
  return stage;
}

export interface SessionStyle {
  label: string;
  brief?: string;
  opening?: string;
  reportTitle: string;
}

// Resolved session styling with viva defaults.
export function getSessionStyle(stage: StageTemplate): SessionStyle {
  const s = stage.assessment?.session;
  return {
    label: s?.label ?? "Mock viva",
    brief: s?.brief,
    opening: s?.opening,
    reportTitle: s?.reportTitle ?? "Mock Viva Assessment",
  };
}
