import { z } from "zod";

export const PROJECT_SCHEMA = 1;

/**
 * The project file. Older ones also list `epochs`; the parse drops them, since
 * sessions are no longer grouped into epochs.
 */
export const Project = z.object({
  schema: z.literal(PROJECT_SCHEMA),
  name: z.string().min(1).max(200),
});

export type Project = z.infer<typeof Project>;
