import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow: string;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl space-y-4", className)}>
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
        {eyebrow}
      </p>
      <h2 className="font-serif text-3xl leading-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      <p className="text-base leading-8 text-muted-foreground sm:text-lg">
        {description}
      </p>
    </div>
  );
}
