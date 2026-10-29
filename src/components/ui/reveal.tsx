import { cn } from "@/lib/cn";

/**
 * Fades and lifts content in as it scrolls into view using CSS scroll-driven animations.
 * No JavaScript: content is always present for search engines and browsers without support
 * (they simply show it without the effect). Reduced-motion users get no animation.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  /** Stagger in seconds; shifts the animation range slightly. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  return (
    <Tag
      className={cn("reveal", className)}
      style={delay ? ({ "--reveal-delay": `${Math.round(delay * 100)}%` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
