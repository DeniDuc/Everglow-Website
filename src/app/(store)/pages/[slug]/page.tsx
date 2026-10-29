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
  return (
    <article className="container-page max-w-3xl py-14 md:py-20">
      <h1 className="heading-xl">{page.title}</h1>
      <p className="mt-3 text-sm text-ink-muted">Version {page.version}</p>
      <div className="prose-everglow mt-8" dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />
    </article>
  );
}

export default function ContentPage(props: PageProps<"/pages/[slug]">) {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <Content params={props.params} />
    </Suspense>
  );
}
