import type { Metadata } from "next";
import { getStoreSettings } from "@/lib/store/catalog";
import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };

export default async function CartPage() {
  const settings = await getStoreSettings();
  return (
    <div className="container-page py-10 md:py-14">
      <h1 className="heading-lg mb-8">Your cart</h1>
      <CartView perKmCents={settings.delivery.perKmCents} phone={settings.business.phone} />
    </div>
  );
}
