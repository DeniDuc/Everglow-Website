import Link from "next/link";
import { cn } from "@/lib/cn";

/** Small admin UI kit in the Booqable style: white cards on a cool grey canvas, blue actions. */

export function PageHeader({
  title,
  back,
  actions,
  children,
}: {
  title: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-admin-line bg-white">
      <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-2 md:px-6">
        <h1 className="flex min-w-0 items-center gap-2 text-2xl font-light text-admin-text md:text-[1.7rem]">
          {back && (
            <>
              <Link href={back.href} className="truncate text-admin-muted hover:text-admin-text">
                {back.label}
              </Link>
              <span className="text-admin-muted">›</span>
            </>
          )}
          <span className="truncate font-normal">{title}</span>
        </h1>
        {children}
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
    </div>
  );
}

export function Card({
  title,
  actions,
  children,
  className,
  padded = true,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-admin-line bg-white", className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-admin-line px-5 py-4">
          <h2 className="text-[1.05rem] font-semibold text-admin-text">{title}</h2>
          {actions}
        </header>
      )}
      <div className={padded ? "p-5" : undefined}>{children}</div>
    </section>
  );
}

export function Button({
  variant = "secondary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  return <button {...props} className={cn(buttonClass(variant), className)} />;
}

export function buttonClass(variant: "primary" | "secondary" | "danger" | "ghost" = "secondary") {
  return cn(
    "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
    variant === "primary" && "bg-admin-blue text-white hover:bg-admin-blue-dark",
    variant === "secondary" && "border border-admin-line bg-white text-admin-text hover:bg-admin-bg",
    variant === "danger" && "border border-red-200 bg-white text-red-600 hover:bg-red-50",
    variant === "ghost" && "text-admin-blue hover:bg-admin-blue-soft",
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-sm font-semibold text-admin-text">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-admin-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export const inputClass =
  "h-10 w-full rounded-md border border-admin-line bg-white px-3 text-sm text-admin-text outline-none transition focus:border-admin-blue focus:ring-2 focus:ring-admin-blue/20 disabled:bg-admin-bg";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, "h-auto min-h-24 py-2", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputClass, "pr-8", props.className)} />;
}

export function Checkbox({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <input type="checkbox" {...props} className="mt-0.5 size-4 shrink-0 rounded accent-admin-blue" />
      <span>
        <span className="block text-sm text-admin-text">{label}</span>
        {hint && <span className="block text-xs text-admin-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function Badge({
  tone = "grey",
  children,
}: {
  tone?: "grey" | "green" | "blue" | "amber" | "red";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone === "grey" && "bg-admin-bg text-admin-muted",
        tone === "green" && "bg-admin-green text-white",
        tone === "blue" && "bg-admin-blue text-white",
        tone === "amber" && "bg-amber-100 text-amber-800",
        tone === "red" && "bg-red-100 text-red-700",
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-lg font-semibold text-admin-text">{title}</p>
      {text && <p className="max-w-md text-sm text-admin-muted">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Table({ head, children }: { head: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-admin-line bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-admin-line text-admin-text">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-admin-line">{children}</tbody>
      </table>
    </div>
  );
}
