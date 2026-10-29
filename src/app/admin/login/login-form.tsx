"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { buttonClass, Field, Input } from "@/components/admin/ui";
import { translator, type Locale } from "@/lib/i18n/admin";
import { login, verifyCode, type LoginState } from "./actions";

export function LoginForm({ locale = "en" }: { locale?: Locale }) {
  const t = translator(locale);
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <Field label={t("login.email")}>
        <Input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus={!state.email}
          defaultValue={state.email}
          key={state.email ?? "empty"}
        />
      </Field>
      <Field label={t("login.password")}>
        <Input name="password" type="password" autoComplete="current-password" required autoFocus={!!state.email} />
      </Field>
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error === "tooMany" ? t("login.tooMany") : t("login.invalid")}
        </p>
      )}
      <button type="submit" className={buttonClass("primary") + " w-full"} disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />} {t("login.submit")}
      </button>
    </form>
  );
}

export function VerifyForm({ locale = "en" }: { locale?: Locale }) {
  const t = translator(locale);
  const [state, action, pending] = useActionState<LoginState, FormData>(verifyCode, {});
  return (
    <form action={action} className="space-y-4">
      <Field label={t("login.code")}>
        <Input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          autoFocus
          className="text-center text-xl tracking-[0.4em]"
        />
      </Field>
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error === "tooMany" ? t("login.tooMany") : t("login.badCode")}
        </p>
      )}
      <button type="submit" className={buttonClass("primary") + " w-full"} disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />} {t("login.verify")}
      </button>
    </form>
  );
}
