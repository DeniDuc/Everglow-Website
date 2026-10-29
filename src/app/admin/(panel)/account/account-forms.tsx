"use client";

import Image from "next/image";
import { useActionState, useState, useTransition } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button, Card, Field, Input } from "@/components/admin/ui";
import { changePassword, confirm2fa, disable2fa, setLocale, start2fa } from "./actions";

type Result = { ok: boolean; error?: string; message?: string };
const initial: Result = { ok: false };

function Msg({ state }: { state: Result }) {
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
  if (state.message) return <p className="text-sm text-green-700">{state.message}</p>;
  return null;
}

export function LanguageCard({ locale, labels }: { locale: "en" | "ru"; labels: { title: string } }) {
  const [pending, start] = useTransition();
  return (
    <Card title={labels.title}>
      <div className="flex gap-2">
        {(["en", "ru"] as const).map((l) => (
          <Button
            key={l}
            variant={locale === l ? "primary" : "secondary"}
            disabled={pending}
            onClick={() => start(() => setLocale(l))}
          >
            {l === "en" ? "English" : "Русский"}
          </Button>
        ))}
      </div>
    </Card>
  );
}

export function PasswordCard({ title }: { title: string }) {
  const [state, action, pending] = useActionState(changePassword, initial);
  return (
    <Card title={title}>
      <form action={action} className="grid gap-3 md:grid-cols-2">
        <Field label="Current password">
          <Input name="current" type="password" autoComplete="current-password" required />
        </Field>
        <Field label="New password" hint="At least 12 characters, letters and numbers.">
          <Input name="next" type="password" autoComplete="new-password" required />
        </Field>
        <div className="flex items-center gap-3 md:col-span-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
          <Msg state={state} />
        </div>
      </form>
    </Card>
  );
}

export function TwoFactorCard({
  enabled,
  labels,
}: {
  enabled: boolean;
  labels: { title: string; enable: string; disable: string; scan: string; enabled: string };
}) {
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [starting, start] = useTransition();
  const [confirmState, confirmAction, confirming] = useActionState(confirm2fa, initial);
  const [disableState, disableAction, disabling] = useActionState(disable2fa, initial);

  if (enabled && !confirmState.ok) {
    return (
      <Card title={labels.title}>
        <p className="flex items-center gap-2 text-sm text-green-700">
          <ShieldCheck className="size-5" /> {labels.enabled}
        </p>
        <form action={disableAction} className="mt-4 flex flex-wrap items-end gap-2">
          <Field label="Code">
            <Input name="code" inputMode="numeric" maxLength={7} className="w-36" required />
          </Field>
          <Button type="submit" variant="danger" disabled={disabling}>
            {labels.disable}
          </Button>
          <Msg state={disableState} />
        </form>
      </Card>
    );
  }
  return (
    <Card title={labels.title}>
      {confirmState.ok ? (
        <p className="flex items-center gap-2 text-sm text-green-700">
          <ShieldCheck className="size-5" /> {confirmState.message}
        </p>
      ) : !setup ? (
        <Button variant="primary" disabled={starting} onClick={() => start(async () => setSetup(await start2fa()))}>
          {starting && <Loader2 className="size-4 animate-spin" />} {labels.enable}
        </Button>
      ) : (
        <div className="flex flex-wrap gap-6">
          <Image
            src={setup.qr}
            alt="QR code for your authenticator app"
            width={220}
            height={220}
            unoptimized
            className="rounded border border-admin-line"
          />
          <div className="max-w-sm space-y-3">
            <p className="text-sm">{labels.scan}</p>
            <p className="break-all rounded bg-admin-bg px-3 py-2 font-mono text-xs">{setup.secret}</p>
            <form action={confirmAction} className="flex items-end gap-2">
              <Field label="Code">
                <Input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  className="w-36"
                  required
                />
              </Field>
              <Button type="submit" variant="primary" disabled={confirming}>
                Confirm
              </Button>
            </form>
            <Msg state={confirmState} />
          </div>
        </div>
      )}
    </Card>
  );
}
