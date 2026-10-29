import { cn } from "@/lib/cn";

/** The site's signature heading: a script eyebrow ("Our") above a serif title. */
export function SectionHeading({
  eyebrow,
  title,
  intro,
  align = "left",
  as: Tag = "h2",
  className,
  children,
}: {
  eyebrow?: string;
  title: string;
  intro?: React.ReactNode;
  align?: "left" | "center";
  as?: "h1" | "h2";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", align === "center" && "items-center text-center md:flex-col md:items-center", className)}>
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <Tag className="heading-lg text-ink">{title}</Tag>
        {intro && <div className="mt-4 text-[0.975rem] leading-relaxed text-ink-soft">{intro}</div>}
      </div>
      {children}
    </div>
  );
}
