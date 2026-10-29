"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronsLeft,
  ExternalLink,
  FileText,
  Folder,
  Gauge,
  Inbox,
  LineChart,
  LogOut,
  Menu,
  Package,
  PlusCircle,
  Settings,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/lib/i18n/admin";
import { logout } from "@/app/admin/login/actions";

type Item = { href: string; key: MessageKey; icon: React.ComponentType<{ className?: string }>; badge?: number };

export function Sidebar({
  labels,
  user,
  newInquiries,
}: {
  labels: Record<MessageKey, string>;
  user: { name: string; email: string; role: string };
  newInquiries: number;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  const groups: Item[][] = [
    [
      { href: "/admin", key: "nav.dashboard", icon: Gauge },
      { href: "/admin/calendar", key: "nav.calendar", icon: CalendarDays },
    ],
    [
      { href: "/admin/bookings", key: "nav.bookings", icon: Inbox },
      { href: "/admin/clients", key: "nav.clients", icon: Users },
      { href: "/admin/inquiries", key: "nav.inquiries", icon: Inbox, badge: newInquiries },
      { href: "/admin/inventory", key: "nav.inventory", icon: Package },
      { href: "/admin/collections", key: "nav.collections", icon: Folder },
      { href: "/admin/documents", key: "nav.documents", icon: FileText },
    ],
    [{ href: "/admin/reports", key: "nav.reports", icon: LineChart }],
  ];
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  const nav = (
    <nav className="flex h-full flex-col bg-white">
      <div
        className={cn(
          "flex h-16 items-center border-b border-admin-line px-4",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {!collapsed && (
          <Link href="/admin" aria-label="Dashboard">
            <Image src="/media/site/logo.png" alt="Everglow" width={566} height={222} className="h-9 w-auto" />
          </Link>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="hidden rounded p-1 text-admin-muted hover:bg-admin-bg lg:block"
          aria-label="Collapse menu"
        >
          <ChevronsLeft className={cn("size-5 transition-transform", collapsed && "rotate-180")} />
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded p-1 lg:hidden"
          aria-label="Close menu"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="border-b border-admin-line p-2">
        <Link
          href="/admin/bookings/new"
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-[0.95rem] font-medium text-admin-blue hover:bg-admin-blue-soft",
            collapsed && "justify-center px-0",
          )}
          title={labels["nav.newBooking"]}
        >
          <PlusCircle className="size-5 fill-admin-blue text-white" />
          {!collapsed && labels["nav.newBooking"]}
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto">
        {groups.map((g, i) => (
          <ul key={i} className="space-y-0.5 border-b border-admin-line p-2">
            {g.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={labels[item.key]}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-[0.95rem] transition-colors",
                    isActive(item.href) ? "bg-admin-blue-soft text-admin-blue" : "text-admin-text hover:bg-admin-bg",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <item.icon className="size-[18px] shrink-0" />
                  {!collapsed && <span className="flex-1">{labels[item.key]}</span>}
                  {!collapsed && !!item.badge && (
                    <span className="rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ))}
      </div>
      <ul className="space-y-0.5 border-t border-admin-line p-2">
        <li>
          <a
            href="/"
            target="_blank"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-[0.95rem] hover:bg-admin-bg",
              collapsed && "justify-center px-0",
            )}
          >
            <ExternalLink className="size-[18px]" /> {!collapsed && labels["nav.viewSite"]}
          </a>
        </li>
        <li>
          <Link
            href="/admin/settings"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-[0.95rem] hover:bg-admin-bg",
              isActive("/admin/settings") && "bg-admin-blue-soft text-admin-blue",
              collapsed && "justify-center px-0",
            )}
          >
            <Settings className="size-[18px]" /> {!collapsed && labels["nav.settings"]}
          </Link>
        </li>
        <li>
          <Link
            href="/admin/account"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-[0.95rem] hover:bg-admin-bg",
              isActive("/admin/account") && "bg-admin-blue-soft text-admin-blue",
              collapsed && "justify-center px-0",
            )}
          >
            <UserCircle className="size-[18px]" />
            {!collapsed && (
              <span className="min-w-0">
                <span className="block truncate">{user.name}</span>
                <span className="block truncate text-xs text-admin-muted">{user.role}</span>
              </span>
            )}
          </Link>
        </li>
        <li>
          <form action={logout}>
            <button
              type="submit"
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-[0.95rem] text-admin-muted hover:bg-admin-bg",
                collapsed && "justify-center px-0",
              )}
            >
              <LogOut className="size-[18px]" /> {!collapsed && labels["nav.logout"]}
            </button>
          </form>
        </li>
      </ul>
    </nav>
  );

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 border-r border-admin-line transition-[width] duration-200 lg:block print:hidden",
          collapsed ? "w-16" : "w-60",
        )}
      >
        {nav}
      </aside>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-4 left-4 z-40 flex size-12 items-center justify-center rounded-full bg-admin-blue text-white shadow-lg lg:hidden print:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-6" />
      </button>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-xl">{nav}</aside>
        </div>
      )}
    </>
  );
}
