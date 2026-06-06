type ProgressBarProps = {
  label?: string;
  progressPercentage: number;
  totalEpisodeCount: number;
  watchedEpisodeCount: number;
};

export function ProgressBar({
  label,
  progressPercentage,
  totalEpisodeCount,
  watchedEpisodeCount,
}: ProgressBarProps) {
  const safeProgressPercentage = Math.min(100, Math.max(0, progressPercentage));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="truncate">
          {label ? `${label}: ` : ""}
          {watchedEpisodeCount} / {totalEpisodeCount} episodes
        </span>
        <span className="shrink-0">{safeProgressPercentage}%</span>
      </div>
      <div
        aria-label={label ?? "Progress"}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={safeProgressPercentage}
        className="h-2 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${safeProgressPercentage}%` }} />
      </div>
    </div>
  );
}
