import "server-only";
import { asc, desc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customers, deliveryTiers } from "@/db/schema";
import { addressText } from "@/lib/customers";
import { loadCatalog } from "@/lib/orders/service";
import { priceLabel } from "@/lib/pricing";
import type { CustomerOption, PickerItem } from "./order-editor";

/** Everything the order editor needs besides the order itself. */
export async function loadEditorData() {
  const [catalog, tiers, clientRows] = await Promise.all([
    loadCatalog(db),
    db.select().from(deliveryTiers).orderBy(asc(deliveryTiers.position)),
    db.select().from(customers).where(isNull(customers.archivedAt)).orderBy(desc(customers.number)).limit(5000),
  ]);
  const picker: PickerItem[] = catalog.map((c) => ({
    variantId: c.variantId,
    title: c.variantName,
    productName: c.productName,
    service: c.productType === "service",
    tracked: c.tracked,
    hidden: !c.showInStore,
    basePriceCents: c.basePriceCents,
    priceLabel: priceLabel(c),
  }));
  // Personal data is decrypted here, server-side, for staff only.
  const customerOptions: CustomerOption[] = clientRows.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email ?? "",
    phone: c.phone ?? "",
    address: addressText(c.address),
  }));
  return {
    catalog: picker,
    tiers: tiers.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name, priceCents: t.priceCents })),
    customers: customerOptions,
  };
}
