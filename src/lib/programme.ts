// Server-side resolution of the user's active programme (chosen in the
// first-run wizard / settings). Falls back to the built-in default when
// unset or when a stored id no longer exists.
import { getSettings } from "@/lib/db/repos/settings";
import {
  DEFAULT_PROGRAMME_ID,
  getProgramme,
  type ProgrammeTemplate,
} from "@/lib/template";

export function getActiveProgrammeId(): string {
  const stored = getSettings().programme_id;
  if (stored) {
    try {
      getProgramme(stored);
      return stored;
    } catch {
      // Stored id from an older version — fall through to the default.
    }
  }
  return DEFAULT_PROGRAMME_ID;
}

export function getActiveProgramme(): ProgrammeTemplate {
  return getProgramme(getActiveProgrammeId());
}
