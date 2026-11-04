import { z } from "zod";
import { Slug } from "./schema/common.js";
import { readJson } from "./store/fs.js";
import { projectPaths } from "./store/paths.js";

/**
 * What the UserPromptSubmit hook leaves in `.cogit/HEAD` (Story 9.3): the session
 * a code commit in this working tree belongs to, and where its transcript is.
 */
export const SessionHead = z.object({
  sessionId: Slug,
  transcriptPath: z.string().optional(),
  at: z.string().optional(),
});
export type SessionHead = z.infer<typeof SessionHead>;

export async function readSessionHead(root: string): Promise<SessionHead | undefined> {
  const read = await readJson(projectPaths(root).head);
  if (!read.found || "error" in read) return undefined;
  const parsed = SessionHead.safeParse(read.value);
  return parsed.success ? parsed.data : undefined;
}
