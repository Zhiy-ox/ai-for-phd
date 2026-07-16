import { getProvidersStatus } from "@/lib/providers/auth-status";
import { usageLimitedAt } from "@/lib/providers/usage";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const status = await getProvidersStatus();
    // limitedAt is read fresh on every call (auth status itself is cached).
    return Response.json({
      claude: { ...status.claude, limitedAt: usageLimitedAt("claude") },
      codex: { ...status.codex, limitedAt: usageLimitedAt("codex") },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
