import { z } from "zod";
import { IsoDate, Slug } from "./common.js";

export const PROJECT_SCHEMA = 1;

export const Epoch = z.object({
  id: Slug,
  title: z.string().min(1).max(200),
  createdAt: IsoDate,
});

export const Project = z.object({
  schema: z.literal(PROJECT_SCHEMA),
  name: z.string().min(1).max(200),
  epochs: z.array(Epoch).default([]),
});

export type Epoch = z.infer<typeof Epoch>;
export type Project = z.infer<typeof Project>;
