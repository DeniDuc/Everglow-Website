import Image from "next/image";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { Mail, MapPin, Phone } from "lucide-react";
import type { Settings } from "@/lib/settings-schema";
import type { NavItem } from "./header";

function FacebookIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.5 1.6-1.5h1.7V4.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.3H7.4V14h2.8v8h3.3z" />
    </svg>
  );
}
function InstagramIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SocialLinks({ business, className }: { business: Settings["business"]; className?: string }) {
  return (
    <div className={className ?? "flex items-center gap-2"}>
      <a
        href={business.facebookUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Everglow on Facebook"
        className="flex size-10 items-center justify-center rounded-full border border-line bg-white transition-colors hover:border-gold-300 hover:bg-sand-50"
      >
        <FacebookIcon className="size-5" />
      </a>
      <a
        href={business.instagramUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Everglow on Instagram"
        className="flex size-10 items-center justify-center rounded-full border border-line bg-white transition-colors hover:border-gold-300 hover:bg-sand-50"
      >
        <InstagramIcon className="size-5" />
      </a>
    </div>
  );
}

async function CopyrightYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

export function Footer({ nav, business }: { nav: NavItem[]; business: Settings["business"] }) {
  const tel = business.phone.replace(/[^\d+]/g, "");
  return (
    <footer className="mt-auto border-t border-line bg-white">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.2fr_1fr_1fr_1.2fr]">
        <div>
          <Image
            src="/media/site/logo.png"
            alt="Everglow Events & Tents"
            width={566}
            height={222}
            className="h-14 w-auto"
          />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-muted">
            Tents, tables, chairs and event essentials in Winnipeg. {business.tagline}
          </p>
          <SocialLinks business={business} className="mt-5 flex items-center gap-2" />
        </div>
        <nav aria-label="Footer">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Menu</h2>
          <ul className="space-y-2.5 text-[0.95rem]">
            {nav.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="text-ink-soft transition-colors hover:text-gold-700">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Good to know</h2>
          <ul className="space-y-2.5 text-[0.95rem]">
            <li>
              <Link href="/#faq" className="text-ink-soft hover:text-gold-700">
                FAQ
              </Link>
            </li>
            <li>
              <Link href="/pages/customer-responsibility" className="text-ink-soft hover:text-gold-700">
                Customer responsibility
              </Link>
            </li>
            <li>
              <Link href="/pages/terms" className="text-ink-soft hover:text-gold-700">
                Terms &amp; Conditions
              </Link>
            </li>
            <li>
              <Link href="/pages/privacy" className="text-ink-soft hover:text-gold-700">
                Privacy policy
              </Link>
            </li>
          </ul>
        </div>
        <address className="not-italic">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-muted">Contact</h2>
          <ul className="space-y-3 text-[0.95rem] text-ink-soft">
            <li>
              <a href={`tel:${tel}`} className="flex items-center gap-3 hover:text-gold-700">
                <Phone className="size-4 text-gold-500" />
                {business.phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${business.email}`} className="flex items-center gap-3 break-all hover:text-gold-700">
                <Mail className="size-4 shrink-0 text-gold-500" />
                {business.email}
              </a>
            </li>
            <li className="flex items-start gap-3">
              <MapPin className="mt-1 size-4 shrink-0 text-gold-500" />
              <span>
                {business.street}
                <br />
                {business.city}, {business.province} {business.postalCode}
              </span>
            </li>
          </ul>
        </address>
      </div>
      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-2 py-5 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © <CopyrightYear /> Everglow Events &amp; Tents. All rights reserved.
          </p>
          <p>Proudly serving Winnipeg and surrounding areas.</p>
        </div>
      </div>
    </footer>
  );
}
