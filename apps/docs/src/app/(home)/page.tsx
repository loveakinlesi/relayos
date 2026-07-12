import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="mb-4 rounded-full border px-3 py-1 text-xs text-fd-muted-foreground">
        Durable webhook execution for TypeScript
      </p>
      <h1 className="mb-4 max-w-2xl text-4xl font-bold tracking-tight">
        Receiving a webhook is easy. Everything after it is the hard part.
      </h1>
      <p className="mb-8 max-w-xl text-fd-muted-foreground">
        RelayOS checkpoints every step of your webhook handlers - retries resume past what already
        succeeded, historical events replay on demand, and every attempt leaves an audit trail.
      </p>
      <div className="mb-10 flex gap-3">
        <Link
          href="/docs"
          className="rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground"
        >
          Get started
        </Link>
        <Link href="/docs/quickstart" className="rounded-lg border px-5 py-2.5 text-sm font-medium">
          Quickstart
        </Link>
      </div>
      <pre className="max-w-full overflow-x-auto rounded-lg border bg-fd-secondary px-5 py-3 text-left text-sm">
        <code>pnpm add relayos</code>
      </pre>
    </main>
  );
}
