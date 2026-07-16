import { z } from "zod";
import { listSessions, type SessionType } from "@/lib/db/repos/sessions";
import { getSettings } from "@/lib/db/repos/settings";
import { startVivaSession } from "@/lib/viva/engine";

export const dynamic = "force-dynamic";

const SessionTypeSchema = z.enum(["viva", "doc_review"]);

const CreateBodySchema = z.object({
  stageId: z.string().min(1),
  provider: z.enum(["claude", "codex"]).optional(),
  documentIds: z.array(z.string().min(1)),
  mode: z.enum(["viva", "drill"]).optional(),
  style: z
    .object({
      intensity: z.enum(["supportive", "standard", "hostile"]),
      focus: z.string().max(500).optional(),
      personas: z.record(z.string(), z.string().max(60)).optional(),
    })
    .optional(),
  model: z.string().optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const rawType = url.searchParams.get("type");
    let type: SessionType | undefined;
    if (rawType !== null) {
      const parsed = SessionTypeSchema.safeParse(rawType);
      if (!parsed.success) {
        return Response.json({ error: `Invalid type: ${rawType}` }, { status: 400 });
      }
      type = parsed.data;
    }
    const stageId = url.searchParams.get("stageId") ?? undefined;
    return Response.json({ sessions: listSessions({ type, stageId }) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = CreateBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.message }, { status: 400 });
    }
    const provider = parsed.data.provider ?? getSettings().default_provider;
    const session = await startVivaSession({
      stageId: parsed.data.stageId,
      provider,
      documentIds: parsed.data.documentIds,
      style: parsed.data.style,
      mode: parsed.data.mode,
      model: parsed.data.model,
    });
    return Response.json({ session });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
