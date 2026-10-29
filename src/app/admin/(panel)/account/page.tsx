import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/session";
import { translator } from "@/lib/i18n/admin";
import { LanguageCard, PasswordCard, TwoFactorCard } from "./account-forms";

// Per-user back office page: rendered on request, no instant-navigation prefetch needed.
export const instant = false;

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage({ searchParams }: PageProps<"/admin/account">) {
  const user = await requireStaff("view", { skip2faSetup: true });
  const t = translator(user.locale);
  const required = (await searchParams).setup2fa === "required";
  return (
    <>
      <PageHeader title={t("account.title")} />
      <div className="max-w-3xl space-y-5 p-4 md:p-6">
        {required && <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">{t("account.required")}</p>}
        <p className="text-sm text-admin-muted">
          {user.name} · {user.email} · {user.role}
        </p>
        <LanguageCard locale={user.locale} labels={{ title: t("account.language") }} />
        <TwoFactorCard
          enabled={user.totpEnabled}
          labels={{
            title: t("account.twoFactor"),
            enable: t("account.enable2fa"),
            disable: t("account.disable2fa"),
            scan: t("account.scan"),
            enabled: t("account.enabled"),
          }}
        />
        <PasswordCard title={t("account.password")} />
      </div>
    </>
  );
}
