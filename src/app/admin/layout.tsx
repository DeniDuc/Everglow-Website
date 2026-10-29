import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Everglow Admin" },
  robots: { index: false, follow: false },
};

// The back office is per-user and always rendered at request time.
export const instant = false;

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-admin-bg font-sans text-admin-text">{children}</div>;
}
