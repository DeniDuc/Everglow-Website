import type { Metadata } from "next";
import Image from "next/image";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { ContactForm } from "@/components/store/contact-form";
import { SocialLinks } from "@/components/store/footer";
import { Reveal } from "@/components/ui/reveal";
import { getStoreSettings } from "@/lib/store/catalog";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Questions about tent, table or chair rentals in Winnipeg? Call (431) 337-7021, email us or send a message. Pickup at 43 Jim Smith Dr.",
  alternates: { canonical: "/pages/contact" },
};

export default async function ContactPage() {
  const { business } = await getStoreSettings();
  const tel = business.phone.replace(/[^\d+]/g, "");
  const address = `${business.street}, ${business.city}, ${business.province} ${business.postalCode}`;
  const cards = [
    { icon: Mail, title: "Email", text: "Got questions or need help? Drop us an email and we'll get back to you as soon as possible.", value: business.email, href: `mailto:${business.email}` },
    { icon: Phone, title: "Phone", text: "Prefer to talk? Give us a call — we're happy to help you over the phone!", value: business.phone, href: `tel:${tel}` },
    { icon: MapPin, title: "Location", text: "This is where you'll pick up and return your items.", value: address, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` },
  ];
  return (
    <>
      <section className="bg-sand-100">
        <div className="container-page py-14 md:py-20">
          <p className="eyebrow animate-fade-up">Say hello</p>
          <h1 className="heading-xl animate-fade-up [animation-delay:80ms]">Contact us</h1>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {cards.map((c, i) => (
              <Reveal as="li" key={c.title} delay={i * 0.06}>
                <a href={c.href} target={c.icon === MapPin ? "_blank" : undefined} rel="noopener noreferrer" className="group flex h-full flex-col rounded-3xl bg-white p-6 shadow-soft transition hover:-translate-y-1 hover:shadow-lift">
                  <span className="flex size-12 items-center justify-center rounded-full bg-sand-100 transition-colors group-hover:bg-sand-200">
                    <c.icon className="size-5 text-gold-700" />
                  </span>
                  <h2 className="heading-md mt-5">{c.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{c.text}</p>
                  <p className="mt-auto break-words pt-4 text-sm font-semibold uppercase tracking-wide text-gold-700">{c.value}</p>
                </a>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>
      <section className="container-page grid gap-10 py-16 md:grid-cols-2 md:py-20">
        <div>
          <h2 className="heading-lg">Any questions?</h2>
          <p className="mt-3 text-ink-soft">Cannot find something you&apos;re looking for? Send us a message and we will get back to you as soon as we can.</p>
          <div className="mt-8">
            <ContactForm />
          </div>
          <div className="mt-8 flex items-center gap-4 text-sm text-ink-muted">
            <Clock className="size-4" /> Flexible pickup and return times — just ask.
          </div>
          <SocialLinks business={business} className="mt-4 flex gap-2" />
        </div>
        <Reveal className="relative min-h-80 overflow-hidden rounded-3xl md:min-h-full">
          <Image src="/media/site/contact.webp" alt="" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
        </Reveal>
      </section>
    </>
  );
}
