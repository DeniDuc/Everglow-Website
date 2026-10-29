import Image from "next/image";

export function AuthCard({ title, text, children }: { title: string; text?: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-admin-line bg-white p-8 shadow-sm">
        <Image
          src="/media/site/logo.png"
          alt="Everglow Events & Tents"
          width={566}
          height={222}
          className="mx-auto h-14 w-auto"
          priority
        />
        <h1 className="mt-6 text-center text-xl font-semibold">{title}</h1>
        {text && <p className="mt-2 text-center text-sm text-admin-muted">{text}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
