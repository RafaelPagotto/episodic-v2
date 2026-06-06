type PageHeaderProps = {
  description: string;
  eyebrow?: string;
  title: string;
};

export function PageHeader({ description, eyebrow, title }: PageHeaderProps) {
  return (
    <header className="space-y-2">
      {eyebrow ? <p className="text-xs font-semibold uppercase text-primary">{eyebrow}</p> : null}
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </header>
  );
}
