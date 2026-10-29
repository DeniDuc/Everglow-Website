"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, Search, ShoppingBag, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useBooking } from "./booking-provider";
import { SearchDialog, type SearchItem } from "./search-dialog";

export type NavItem = { href: string; label: string };

export function Header({ nav, searchItems, phone }: { nav: NavItem[]; searchItems: SearchItem[]; phone: string }) {
  const pathname = usePathname();
  const { cartCount, setCartOpen } = useBooking();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
  }, [menuOpen]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-cream">
        Skip to content
      </a>
      <header
        className={cn(
          "sticky top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-300",
          scrolled || menuOpen ? "bg-white/85 shadow-[0_1px_0_rgb(35_25_5/0.08)] backdrop-blur-xl" : "bg-white",
        )}
      >
        <div className={cn("container-page flex items-center gap-4 transition-[height] duration-300", scrolled ? "h-16" : "h-20")}>
          <Link href="/" className="shrink-0" aria-label="Everglow Events & Tents – home">
            <Image
              src="/media/site/logo.png"
              alt="Everglow Events & Tents"
              width={566}
              height={222}
              priority
              className={cn("w-auto transition-[height] duration-300", scrolled ? "h-9" : "h-11")}
            />
          </Link>

          <nav aria-label="Main" className="mx-auto hidden lg:block">
            <ul className="flex items-center gap-1">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={cn(
                      "relative rounded-full px-3.5 py-2 text-[0.9rem] text-ink-soft transition-colors hover:text-ink",
                      isActive(item.href) && "text-ink",
                    )}
                  >
                    {item.label}
                    {isActive(item.href) && (
                      <motion.span layoutId="nav-active" className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-gold-300" />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-1 lg:ml-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="group flex h-11 items-center gap-2 rounded-full px-3 text-ink-soft transition-colors hover:bg-sand-50 hover:text-ink"
              aria-label="Search rentals"
            >
              <Search className="size-5" />
              <span className="hidden text-sm xl:inline">Search</span>
              <kbd className="hidden rounded border border-line px-1.5 text-[0.7rem] text-ink-muted xl:inline">⌘K</kbd>
            </button>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative flex size-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-sand-50 hover:text-ink"
              aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
            >
              <ShoppingBag className="size-5" />
              <AnimatePresence>
                {cartCount > 0 && (
                  <motion.span
                    key={cartCount}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 22 }}
                    className="absolute right-1 top-1 flex min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[0.7rem] font-semibold leading-5 text-cream"
                  >
                    {cartCount > 99 ? "99+" : cartCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
            <button
              type="button"
              className="flex size-11 items-center justify-center rounded-full text-ink lg:hidden"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              {menuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.nav
              id="mobile-menu"
              aria-label="Mobile"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "calc(100dvh - 4rem)" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden bg-white/95 backdrop-blur-xl lg:hidden"
            >
              <ul className="container-page flex flex-col gap-1 pt-4">
                {nav.map((item, i) => (
                  <motion.li
                    key={item.href}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 + i * 0.04 }}
                  >
                    <Link
                      href={item.href}
                      className={cn(
                        "block rounded-2xl px-4 py-3.5 font-display text-3xl text-ink-soft",
                        isActive(item.href) && "bg-sand-50 text-ink",
                      )}
                    >
                      {item.label}
                    </Link>
                  </motion.li>
                ))}
              </ul>
              <div className="container-page mt-6">
                <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="btn btn-sand w-full">
                  Call {phone}
                </a>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} items={searchItems} />
    </>
  );
}
