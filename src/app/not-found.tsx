import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-cream px-4 text-center">
      <p className="eyebrow">Oops</p>
      <h1 className="heading-xl">Page not found</h1>
      <p className="max-w-md text-ink-muted">The page you&apos;re looking for has moved or no longer exists.</p>
      <div className="mt-2 flex gap-3">
        <Link href="/" className="btn btn-primary">Go home</Link>
        <Link href="/pages/catalogue" className="btn btn-outline">Browse rentals</Link>
      </div>
    </main>
  );
}
