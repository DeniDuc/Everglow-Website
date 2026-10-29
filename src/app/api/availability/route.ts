import { z } from "zod";
import { storeAvailability } from "@/lib/store/quote";

const query = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
  ids: z
    .string()
    .transform((s) => s.split(",").filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1).max(200)),
});

/** GET /api/availability?start=ISO&end=ISO&ids=uuid,uuid → free units per product for the period. */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = query.safeParse(params);
  if (!parsed.success || parsed.data.end <= parsed.data.start) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const result = await storeAvailability(parsed.data.ids, parsed.data.start, parsed.data.end);
  return Response.json(
    { products: Object.fromEntries(result) },
    { headers: { "Cache-Control": "private, max-age=15" } },
  );
}
