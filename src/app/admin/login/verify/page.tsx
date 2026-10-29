import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { translator } from "@/lib/i18n/admin";
import { AuthCard } from "../auth-card";
import { VerifyForm } from "../login-form";

export const metadata: Metadata = { title: "Verify" };

async function Verify() {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  if (session.mfaPassed) redirect("/admin");
  const t = translator(session.user.locale);
  return (
    <AuthCard title={t("login.verifyTitle")} text={t("login.verifyText")}>
      <VerifyForm locale={session.user.locale} />
    </AuthCard>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
