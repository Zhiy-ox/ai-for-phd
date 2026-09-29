import { z } from "zod";
import { getSettings, setSettings } from "@/lib/db/repos/settings";
import { listProgrammes } from "@/lib/template";

export const dynamic = "force-dynamic";

const programmeIds = listProgrammes().map((programme) => programme.id);
const ProgrammeIdSchema = z.string().refine((id) => programmeIds.includes(id), {
  message: `Unknown programme. Choose one of: ${programmeIds.join(", ")}`,
});

const PutBodySchema = z.object({
  default_provider: z.enum(["claude", "codex"]).optional(),
  claude_model: z.string().optional(),
  codex_model: z.string().optional(),
  current_stage: z.string().optional(),
  // Empty is the persisted sentinel for "use the built-in default" on a
  // fresh install; every non-empty value must name a registered template.
  programme_id: z.union([z.literal(""), ProgrammeIdSchema]).optional(),
  onboarded: z.string().optional(),
});

export async function GET(): Promise<Response> {
  try {
    return Response.json(getSettings());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const parsed = PutBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.message }, { status: 400 });
    }
    return Response.json(setSettings(parsed.data));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
