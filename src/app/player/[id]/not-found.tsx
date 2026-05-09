import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-dim)]">404</div>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Player not listed</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        This player isn&apos;t on the FDF Box Score NFL market yet, or the URL is malformed.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-2 rounded-md border border-[var(--color-brand)]/40 bg-[var(--color-brand)]/10 px-4 py-2 text-sm font-semibold uppercase tracking-wider text-[var(--color-brand-soft)] hover:bg-[var(--color-brand)]/20"
      >
        Back to market
      </Link>
    </div>
  );
}
