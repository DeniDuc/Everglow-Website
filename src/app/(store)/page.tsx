import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarCheck, CreditCard, PackageCheck, ShieldCheck, Sparkles, Tent, Truck } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { Carousel } from "@/components/store/carousel";
import { DateBar } from "@/components/store/date-bar";
import { FaqAccordion } from "@/components/store/faq-accordion";
import { JsonLd } from "@/components/store/json-ld";
import { ProductCard } from "@/components/store/product-card";
import { getCollections, getFaq, getPage, getStoreProducts, getStoreSettings } from "@/lib/store/catalog";
import { faqJsonLd, localBusinessJsonLd } from "@/lib/seo";
import { money } from "@/lib/format";

export default async function HomePage() {
  const [collections, products, faq, responsibility, settings] = await Promise.all([
    getCollections(),
    getStoreProducts(),
    getFaq(),
    getPage("customer-responsibility"),
    getStoreSettings(),
  ]);
  const tiles = ["tents", "tables", "chairs", "eventessentials"]
    .map((slug) => collections.find((c) => c.slug === slug))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const counts = (slug: string) => products.filter((p) => p.collectionSlugs.includes(slug)).length;
  const popular = products.filter((p) => p.featured).slice(0, 12);
  const smallestDelivery = settings.deliveryTiers[0]?.priceCents;

  const benefits = [
    { icon: PackageCheck, title: "Free self-pickup", text: "Pick up and return most items yourself at no charge." },
    { icon: Truck, title: smallestDelivery ? `Delivery from ${money(smallestDelivery)}` : "Delivery available", text: "Curbside delivery across Winnipeg. Tents are delivered and installed." },
    { icon: Tent, title: "Tent setup included", text: "Our crew installs and takes down every marquee tent." },
    { icon: CalendarCheck, title: "Book online 24/7", text: "Live availability, instant booking with a 50% deposit." },
  ];

  const steps = [
    { icon: CalendarCheck, title: "Pick your dates", text: "Choose pickup and return. Most items are one price for up to 3 days." },
    { icon: Sparkles, title: "Add your rentals", text: "See live availability for your dates while you shop." },
    { icon: Truck, title: "Pickup or delivery", text: "Pick up for free, or let us deliver. We call the Sunday before with exact times." },
    { icon: CreditCard, title: "Pay 50% to book", text: "Secure your booking online. The balance is due 14 days before the event." },
  ];

  return (
    <>
      <JsonLd data={localBusinessJsonLd(settings.business)} />
      {faq.length > 0 && <JsonLd data={faqJsonLd(faq)} />}

      {/* Hero */}
      <section className="relative isolate">
        <div className="relative h-[78svh] min-h-[520px] max-h-[820px] overflow-hidden">
          <Image
            src="/media/site/hero.webp"
            alt="Outdoor wedding ceremony with rows of white chairs by the lake"
            fill
            priority
            sizes="100vw"
            className="animate-ken-burns object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-ink/55 via-ink/35 to-ink/70" />
          <div className="relative z-10 flex h-full flex-col items-center justify-center px-4 pb-16 text-center text-cream">
            <p className="animate-fade-up font-script text-3xl text-sand-200 md:text-4xl">Everglow Events &amp; Tents</p>
            <h1 className="heading-xl mt-3 max-w-3xl animate-fade-up text-balance uppercase [animation-delay:120ms]">
              Make every moment glow
            </h1>
            <p className="mt-5 max-w-xl animate-fade-up text-lg text-cream/90 [animation-delay:240ms]">
              Plan ahead, relax later — we&apos;ve got everything covered.
            </p>
            <div className="mt-8 flex animate-fade-up flex-wrap justify-center gap-3 [animation-delay:360ms]">
              <Link href="/pages/catalogue" className="btn btn-sand px-6">
                Check out products <ArrowRight className="size-4" />
              </Link>
              <a href={`tel:${settings.business.phone.replace(/[^\d+]/g, "")}`} className="btn border border-cream/40 px-6 text-cream backdrop-blur hover:bg-cream/10">
                Call {settings.business.phone}
              </a>
            </div>
          </div>
        </div>
        <div className="container-page relative z-20 -mt-12">
          <DateBar />
        </div>
      </section>

      {/* Benefits */}
      <section aria-label="Why Everglow" className="container-page py-14">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((b, i) => (
            <Reveal as="li" key={b.title} delay={i * 0.06} className="flex gap-4 rounded-2xl bg-white p-5 shadow-soft">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sand-100">
                <b.icon className="size-5 text-gold-700" />
              </span>
              <div>
                <h2 className="font-semibold">{b.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{b.text}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* Rental catalogue */}
      <section className="container-page pb-20" aria-labelledby="catalogue-heading">
        <Reveal>
          <SectionHeading
            eyebrow="Our"
            title="Rental Catalogue"
            intro="Everything you need to host a great event — tents, tables, chairs, and more. Clean, reliable, and easy to set up. Perfect for weddings, parties, and special moments."
          >
            <Link href="/pages/catalogue" className="btn btn-outline shrink-0">
              See all <ArrowRight className="size-4" />
            </Link>
          </SectionHeading>
        </Reveal>
        <ul className="mt-10 grid auto-rows-[220px] gap-4 sm:grid-cols-2 md:auto-rows-[260px] lg:grid-cols-4">
          {tiles.map((c, i) => (
            <Reveal as="li" key={c.slug} delay={i * 0.08} className={i === 0 ? "sm:col-span-2 sm:row-span-2" : i === 3 ? "sm:col-span-2" : ""}>
              <Link href={`/collections/${c.slug}`} className="group relative block h-full overflow-hidden rounded-[var(--radius-card)] bg-sand-100">
                {c.image && (
                  <Image src={c.image} alt="" fill sizes="(max-width: 640px) 100vw, 50vw" className="object-cover transition-transform duration-[1.2s] ease-[var(--ease-out-soft)] group-hover:scale-[1.06]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5 text-cream md:p-6">
                  <div>
                    <h3 className={i === 0 ? "heading-lg" : "heading-md"}>{c.name}</h3>
                    <p className="text-sm text-cream/80">{counts(c.slug)} items</p>
                  </div>
                  <span className="flex size-11 items-center justify-center rounded-full bg-cream/15 backdrop-blur transition-[background-color,transform] duration-300 group-hover:translate-x-1 group-hover:bg-cream group-hover:text-ink">
                    <ArrowRight className="size-5" />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* How it works */}
      <section className="bg-white py-20" aria-labelledby="how-heading">
        <div className="container-page">
          <Reveal>
            <SectionHeading eyebrow="Easy as" title="How booking works" align="center" />
          </Reveal>
          <ol className="relative mt-12 grid gap-6 md:grid-cols-4">
            <div className="absolute left-[12.5%] right-[12.5%] top-7 hidden h-px bg-gradient-to-r from-gold-300 via-sand-200 to-gold-300 md:block" aria-hidden="true" />
            {steps.map((s, i) => (
              <Reveal as="li" key={s.title} delay={i * 0.1} className="relative text-center">
                <span className="relative mx-auto flex size-14 items-center justify-center rounded-full border border-gold-300 bg-cream">
                  <s.icon className="size-6 text-gold-700" />
                  <span className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-ink text-xs font-semibold text-cream">{i + 1}</span>
                </span>
                <h3 className="mt-4 font-display text-2xl">{s.title}</h3>
                <p className="mx-auto mt-2 max-w-60 text-sm leading-relaxed text-ink-muted">{s.text}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Let's work together */}
      <section className="relative isolate overflow-hidden py-28 text-center text-cream md:py-36">
        <Image src="/media/site/ceremony.webp" alt="" fill sizes="100vw" className="-z-10 object-cover" />
        <div className="absolute inset-0 -z-10 bg-ink/55" />
        <Reveal className="container-page">
          <h2 className="heading-xl uppercase">
            Let&apos;s
            <br />
            work together!
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-cream/90">
            We guarantee our clients will receive the best value for their buck, and can rest easy,{" "}
            <strong className="font-semibold text-cream">maybe even on one of our comfortable chairs!</strong>
          </p>
          <Link href="/pages/contact" className="btn btn-sand mt-8 px-6">
            Get in touch <ArrowRight className="size-4" />
          </Link>
        </Reveal>
      </section>

      {/* Popular items */}
      {popular.length > 0 && (
        <section className="container-page py-20" aria-labelledby="popular-heading">
          <Reveal>
            <SectionHeading eyebrow="Our" title="Frequently rented items">
              <Link href="/pages/catalogue" className="btn btn-outline shrink-0">
                Full catalogue <ArrowRight className="size-4" />
              </Link>
            </SectionHeading>
          </Reveal>
          <div className="mt-10">
            <Carousel label="Frequently rented items">
              {popular.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </Carousel>
          </div>
        </section>
      )}

      {/* FAQ */}
      <section id="faq" className="bg-sand-50 py-20" aria-labelledby="faq-heading">
        <div className="container-page grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <Reveal>
            <p className="eyebrow">Questions?</p>
            <h2 id="faq-heading" className="heading-lg">
              Frequently asked questions
            </h2>
            <p className="mt-4 text-ink-soft">Explore the FAQs to ensure you&apos;re well-prepared to embark on your event journey with us.</p>
            <div className="mt-8 rounded-2xl bg-white p-5 shadow-soft">
              <p className="font-semibold">Still have a question?</p>
              <p className="mt-1 text-sm text-ink-muted">We&apos;re happy to help you plan.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={`tel:${settings.business.phone.replace(/[^\d+]/g, "")}`} className="btn btn-primary">
                  {settings.business.phone}
                </a>
                <Link href="/pages/contact" className="btn btn-outline">
                  Message us
                </Link>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <FaqAccordion items={faq} />
          </Reveal>
        </div>
      </section>

      {/* Customer responsibility */}
      {responsibility && (
        <section className="container-page py-20" aria-labelledby="responsibility-heading">
          <div className="grid gap-10 rounded-[1.75rem] bg-white p-6 shadow-soft md:grid-cols-[1fr_2fr] md:p-12">
            <Reveal>
              <span className="flex size-14 items-center justify-center rounded-full bg-sand-100">
                <ShieldCheck className="size-7 text-gold-700" />
              </span>
              <h2 id="responsibility-heading" className="heading-lg mt-5">
                {responsibility.title}
              </h2>
              <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
                <BadgeCheck className="size-4 text-gold-500" /> Please read before your event
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="prose-everglow" dangerouslySetInnerHTML={{ __html: responsibility.bodyHtml }} />
            </Reveal>
          </div>
        </section>
      )}
    </>
  );
}
