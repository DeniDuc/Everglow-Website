import { BookingProvider } from "@/components/store/booking-provider";
import { AddedToast, CartDrawer } from "@/components/store/cart-drawer";
import { DatePicker } from "@/components/store/date-picker";
import { Footer } from "@/components/store/footer";
import { Header, type NavItem } from "@/components/store/header";
import { getStoreProducts, getStoreSettings } from "@/lib/store/catalog";

const nav: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/pages/catalogue", label: "Catalogue" },
  { href: "/collections/tents", label: "Tents" },
  { href: "/collections/tables", label: "Tables" },
  { href: "/collections/chairs", label: "Chairs" },
  { href: "/collections/eventessentials", label: "Event Essentials" },
  { href: "/pages/contact", label: "Contact" },
];

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [settings, products] = await Promise.all([getStoreSettings(), getStoreProducts()]);
  const searchItems = products.map((p) => ({
    slug: p.slug,
    name: p.name,
    image: p.image?.src ?? null,
    priceCents: p.fromPriceCents,
    priceLabel: p.priceLabel,
    keywords: `${p.name} ${p.collectionSlugs.join(" ")} ${p.excerpt ?? ""}`.toLowerCase(),
  }));
  const rules = {
    timezone: settings.business.timezone,
    minNoticeHours: settings.booking.minNoticeHours,
    maxAdvanceDays: settings.booking.maxAdvanceDays,
    openTime: settings.booking.openTime,
    closeTime: settings.booking.closeTime,
    blackoutDates: settings.blackoutDates,
    slotMinutes: settings.booking.slotMinutes,
    defaultPickupTime: settings.booking.defaultPickupTime,
    defaultReturnTime: settings.booking.defaultReturnTime,
  };

  return (
    <BookingProvider rules={rules}>
      <div className="flex min-h-dvh flex-col">
        <Header nav={nav} searchItems={searchItems} phone={settings.business.phone} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer nav={nav} business={settings.business} />
      </div>
      <DatePicker />
      <CartDrawer />
      <AddedToast />
    </BookingProvider>
  );
}
