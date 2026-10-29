import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

export const TIMEZONE = "America/Winnipeg";

const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

/** $1,350.00 */
export function money(cents: number): string {
  return cad.format(cents / 100).replace("CA$", "$");
}

/** Format an instant in Winnipeg time, e.g. "EEE, MMM d · h:mm a". */
export function formatLocal(at: Date | string | number, pattern: string): string {
  return format(new TZDate(new Date(at).getTime(), TIMEZONE), pattern);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
