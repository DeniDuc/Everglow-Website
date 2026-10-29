import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getPage } from "@/lib/store/catalog";
import { textFromHtml } from "@/lib/seo";

const editable = ["terms", "privacy", "customer-responsibility"];

export function generateStaticParams() {
  return editable.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/pages/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = editable.includes(slug) ? await getPage(slug) : null;
  if (!page) return {};
  return {
    title: page.seoTitle ?? page.title,
    description: page.seoDescription ?? textFromHtml(page.bodyHtml),
    alternates: { canonical: `/pages/${slug}` },
  };
}

async function Content({ params }: { params: PageProps<"/pages/[slug]">["params"] }) {
  const { slug } = await params;
  const page = editable.includes(slug) ? await getPage(slug) : null;
  if (!page) notFound();
  // Long documents (Terms, Privacy) get a table of contents built from their numbered sections.
  const toc = [...page.bodyHtml.matchAll(/<h2 id="([^"]+)">([^<]+)<\/h2>/g)].map((m) => ({ id: m[1], title: m[2] }));
  return (
    <div className="container-page py-14 md:py-20">
      <div className={toc.length > 3 ? "grid gap-10 lg:grid-cols-[260px_1fr]" : "mx-auto max-w-3xl"}>
        {toc.length > 3 && (
          <nav
            aria-label="On this page"
            className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:self-start lg:overflow-y-auto"
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">On this page</p>
            <ol className="space-y-1.5 text-sm">
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="text-ink-soft transition-colors hover:text-gold-700">
                    {t.title.replace(/&amp;/g, "&")}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <article className="min-w-0 max-w-3xl">
          <h1 className="heading-xl">{page.title}</h1>
          <p className="mt-3 text-sm text-ink-muted">Version {page.version}</p>
          <div className="prose-everglow mt-8" dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />
        </article>
      </div>
    </div>
  );
}

export default function ContentPage(props: PageProps<"/pages/[slug]">) {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <Content params={props.params} />
    </Suspense>
  );
}
