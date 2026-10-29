import type { Metadata } from "next";
import { translator } from "@/lib/i18n/admin";
import { AuthCard } from "./auth-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  const t = translator("en");
  return (
    <AuthCard title={t("login.title")}>
      <LoginForm />
    </AuthCard>
  );
}
