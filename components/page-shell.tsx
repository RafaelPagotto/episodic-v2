type PageShellProps = {
  title: string;
  description: string;
};

export function PageShell({ title, description }: PageShellProps) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        Foundation placeholder
      </div>
    </section>
  );
}
