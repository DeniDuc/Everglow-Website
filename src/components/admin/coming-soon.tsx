import { Clock } from "lucide-react";
import { PageHeader } from "./ui";

/** Placeholder for back-office areas scheduled for a later phase. */
export function ComingSoon({ title, phase, items }: { title: string; phase: string; items: string[] }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="p-4 md:p-6">
        <div className="max-w-2xl rounded-lg border border-admin-line bg-white p-8">
          <p className="flex items-center gap-2 text-sm font-semibold text-admin-blue">
            <Clock className="size-4" /> {phase}
          </p>
          <h2 className="mt-2 text-xl font-semibold">{title}</h2>
          <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-admin-muted">
            {items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
