import { cartQuoteInput, quoteCart } from "@/lib/store/quote";

/** POST /api/quote → price breakdown + availability for the cart (no side effects). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = cartQuoteInput.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid cart" }, { status: 400 });
  const result = await quoteCart(parsed.data);
  return Response.json(result);
}
