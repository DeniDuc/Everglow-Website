import Image from "next/image";
import { DateBar } from "./date-bar";

/** Collection/catalogue header: soft photo background, title, intro and the date bar. */
export function PageHero({ title, intro, image, eyebrow }: { title: string; intro?: React.ReactNode; image?: string | null; eyebrow?: string }) {
  return (
    <section className="relative isolate">
      <div className="relative overflow-hidden bg-sand-100">
        {image && <Image src={image} alt="" fill priority sizes="100vw" className="-z-10 object-cover opacity-30 blur-[2px]" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-sand-100 via-sand-100/85 to-sand-100/40" />
        <div className="container-page pb-20 pt-12 md:pb-24 md:pt-16">
          {eyebrow && <p className="eyebrow animate-fade-up">{eyebrow}</p>}
          <h1 className="heading-xl animate-fade-up [animation-delay:80ms]">{title}</h1>
          {intro && <div className="prose-everglow mt-5 max-w-3xl animate-fade-up text-base [animation-delay:160ms]">{intro}</div>}
        </div>
      </div>
      <div className="container-page relative z-10 -mt-10">
        <DateBar />
      </div>
    </section>
  );
}
