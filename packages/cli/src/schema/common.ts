import { z } from "zod";

/** Ids end up in file names and HTML, so keep them to a safe slug. */
export const Slug = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/, "must be a slug: letters, digits, _ . -");

export const IsoDate = z.iso.datetime({ offset: true });
