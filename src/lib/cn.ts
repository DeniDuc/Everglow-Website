import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Join class names; later Tailwind classes override earlier conflicting ones (w-20 beats w-full). */
export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values));
}
