import { z } from "zod";
import { isValidIsoDate } from "../core/dates";
import type { AppState } from "../core/types";

const fraction = z.union([z.literal(0.5), z.literal(1)]);
const weeklyValue = z.union([z.literal(0), z.literal(0.5), z.literal(1)]);
const isoDate = z.string().refine(isValidIsoDate, "Invalid date");
const rule = z.object({ enabled: z.boolean().optional(), fraction: fraction.optional() });

const customHoliday = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fraction,
  rule: z.discriminatedUnion("type", [
    z.object({ type: z.literal("yearly"), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) }),
    z.object({ type: z.literal("once"), date: isoDate }),
  ]),
});

export const appStateSchema = z.object({
  version: z.literal(1),
  language: z.string().nullable(),
  calendar: z.object({
    // Calendar ids look like "en.ch" or "en.new_zealand"; anything else could be a path trick.
    id: z.string().regex(/^[a-z]{2}\.[a-z_]+$/).nullable(),
    regions: z.array(z.string()),
    includeObservances: z.boolean(),
  }),
  holidayRules: z.record(z.string(), rule),
  yearOverrides: z.record(z.string().regex(/^\d{4}$/), z.record(z.string(), rule)),
  customHolidays: z.array(customHoliday),
  weeklyPlan: z.tuple([weeklyValue, weeklyValue, weeklyValue, weeklyValue, weeklyValue, weeklyValue, weeklyValue]),
  leave: z
    .record(z.string(), fraction)
    .refine((leave) => Object.keys(leave).every(isValidIsoDate), "Invalid leave date"),
  theme: z.enum(["system", "light", "dark"]),
});

export type ParseError = "invalidJson" | "unsupportedVersion" | "invalidShape";
export type ParseResult = { ok: true; state: AppState } | { ok: false; error: ParseError };

export function parseAppState(input: unknown): ParseResult {
  if (typeof input === "object" && input !== null && typeof (input as { version?: unknown }).version === "number") {
    if ((input as { version: number }).version > 1) return { ok: false, error: "unsupportedVersion" };
  }
  const result = appStateSchema.safeParse(input);
  return result.success ? { ok: true, state: result.data as AppState } : { ok: false, error: "invalidShape" };
}

export function parseStateText(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalidJson" };
  }
  return parseAppState(json);
}
