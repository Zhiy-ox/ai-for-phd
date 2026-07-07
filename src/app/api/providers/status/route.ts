import { getProvidersStatus } from "@/lib/providers/auth-status";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const status = await getProvidersStatus();
    return Response.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
