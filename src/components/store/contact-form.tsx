"use client";

import { useActionState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { sendInquiry, type ContactState } from "@/app/(store)/pages/contact/actions";
import { cn } from "@/lib/cn";

function Field({ label, name, error, textarea, ...props }: { label: string; name: string; error?: string; textarea?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  const cls = cn(
    "peer w-full rounded-2xl border bg-white px-4 pb-2.5 pt-6 text-[0.95rem] outline-none transition-colors placeholder-transparent focus:border-gold-500",
    error ? "border-danger" : "border-line",
  );
  return (
    <label className="relative block">
      {textarea ? (
        <textarea name={name} rows={5} placeholder={label} className={cn(cls, "resize-y")} aria-invalid={!!error} required={props.required} />
      ) : (
        <input name={name} placeholder={label} className={cls} aria-invalid={!!error} {...props} />
      )}
      <span className="pointer-events-none absolute left-4 top-2 text-xs font-medium text-ink-muted transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-[0.95rem] peer-focus:top-2 peer-focus:text-xs">
        {label}
      </span>
      {error && <span className="mt-1 block text-sm text-danger">{error}</span>}
    </label>
  );
}

export function ContactForm() {
  const [state, action, pending] = useActionState<ContactState, FormData>(sendInquiry, { ok: false });
  return (
    <AnimatePresence mode="wait">
      {state.ok ? (
        <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl bg-white p-8 text-center shadow-soft" role="status">
          <CheckCircle2 className="mx-auto size-12 text-success" />
          <p className="mt-4 font-display text-2xl">Thank you!</p>
          <p className="mt-2 text-ink-muted">We received your message and will get back to you as soon as we can.</p>
        </motion.div>
      ) : (
        <motion.form key="form" action={action} className="space-y-4" exit={{ opacity: 0 }}>
          <Field label="Name" name="name" autoComplete="name" required error={state.errors?.name} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" name="email" type="email" autoComplete="email" required error={state.errors?.email} />
            <Field label="Phone (optional)" name="phone" type="tel" autoComplete="tel" error={state.errors?.phone} />
          </div>
          <Field label="Message — event date, items, questions" name="message" textarea required error={state.errors?.message} />
          <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          {state.message && <p className="text-sm text-danger" role="alert">{state.message}</p>}
          <button type="submit" className="btn btn-primary px-6" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send message
          </button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
