import Link from 'next/link';
import {
  ArrowRight,
  Database,
  History,
  Layers,
  RotateCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { TechIcon } from '@/components/tech-icon';
import { WebhookFlowDiagram } from '@/components/webhook-flow-diagram';
import { techIcons } from '@/lib/tech-icons';

const features = [
  {
    icon: Layers,
    title: 'Durable steps',
    description:
      "ctx.step.run(name, fn) checkpoints every unit of work. A retry resumes past whatever already succeeded - it never re-runs a completed step's side effects.",
    color: 'text-indigo-600 bg-indigo-500/10 dark:text-indigo-400',
  },
  {
    icon: RotateCw,
    title: 'Automatic retries',
    description:
      'A failed execution schedules its own retry with exponential backoff, up to a configurable cap - no queue infrastructure, no polling.',
    color: 'text-sky-600 bg-sky-500/10 dark:text-sky-400',
  },
  {
    icon: History,
    title: 'Replay & restart',
    description:
      'Resume in place, force every step to re-run, or reprocess a historical event as a brand-new execution - three distinct recovery tools, not one overloaded button.',
    color: 'text-violet-600 bg-violet-500/10 dark:text-violet-400',
  },
  {
    icon: ShieldCheck,
    title: 'Real signature verification',
    description:
      'Stripe, GitHub, Clerk, Shopify, and Resend plugins all do actual HMAC verification against the raw request body - not a stub.',
    color: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400',
  },
  {
    icon: Database,
    title: 'Storage, auto-detected',
    description:
      'Pass a pg.Pool, better-sqlite3 database, or mysql2 pool straight into relayos({ database }) - the dialect is detected automatically, migrations included.',
    color: 'text-amber-600 bg-amber-500/10 dark:text-amber-400',
  },
  {
    icon: Sparkles,
    title: 'Fully-typed events',
    description:
      "relay.on('stripe.charge.succeeded', ...) autocompletes every event your registered plugins can emit, with event.data typed per event.",
    color: 'text-fuchsia-600 bg-fuchsia-500/10 dark:text-fuchsia-400',
  },
];

const frameworks: (keyof typeof techIcons)[] = ['nextdotjs', 'express', 'hono', 'nestjs'];
const providers: (keyof typeof techIcons)[] = ['stripe', 'github', 'clerk', 'shopify', 'resend'];

export default function HomePage() {
  return (
    <main className="relative flex flex-1 flex-col items-center overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-120px] left-1/2 -z-20 h-80 w-80 -translate-x-[65%] rounded-full bg-violet-500/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-80px] left-1/2 -z-20 h-72 w-96 -translate-x-[15%] rounded-full bg-fuchsia-500/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[40px] left-1/2 -z-20 h-64 w-64 -translate-x-[110%] rounded-full bg-sky-500/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,color-mix(in_oklch,var(--color-fd-border)_60%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,var(--color-fd-border)_60%,transparent)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_70%_50%_at_50%_0%,black_15%,transparent_70%)]"
      />

      {/* Hero */}
      <section className="flex w-full flex-col items-center px-6 pt-24 pb-16 text-center md:pt-32">
        <h1 className="mb-5 max-w-3xl text-4xl font-bold tracking-tight text-balance md:text-6xl">
          Receiving a webhook is easy.{' '}
          <span className="bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
            Everything after it
          </span>{' '}
          is the hard part.
        </h1>
        <p className="mb-10 max-w-xl text-balance text-fd-muted-foreground md:text-lg">
          RelayOS checkpoints every step of your webhook handlers - retries resume past what
          already succeeded, historical events replay on demand, and every attempt leaves an
          audit trail.
        </p>

        <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs"
            className="group inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-violet-600/20 transition-transform hover:scale-[1.02]"
          >
            Get started
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/docs/installation"
            className="rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-fd-secondary"
          >
            Installation
          </Link>
        </div>

        <div className="w-full max-w-md overflow-hidden rounded-xl border bg-fd-card shadow-sm">
          <div className="flex items-center gap-1.5 border-b bg-fd-secondary/50 px-4 py-2">
            <span className="size-2.5 rounded-full bg-red-400/70" />
            <span className="size-2.5 rounded-full bg-yellow-400/70" />
            <span className="size-2.5 rounded-full bg-green-400/70" />
          </div>
          <pre className="overflow-x-auto px-5 py-4 text-left text-sm">
            <code>
              <span className="text-fd-muted-foreground">$ </span>
              npx relayos@latest init
            </code>
          </pre>
        </div>
        <p className="mt-3 text-xs text-fd-muted-foreground">
          Nothing to install first - scaffolds <code>relay.ts</code> and installs exactly what you
          choose.
        </p>
      </section>


      {/* Works with */}
      <section className="flex w-full max-w-4xl flex-col items-center gap-4 px-6 pb-16">
        <p className="text-xs font-medium tracking-wide text-fd-muted-foreground uppercase">
          Works with the stack you already have
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {frameworks.map((icon) => (
            <span
              key={icon}
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-500/5 px-3 py-1 text-xs font-medium text-fd-secondary-foreground"
            >
              <TechIcon icon={icon} size={14} />
              {techIcons[icon].name}
            </span>
          ))}
          {providers.map((icon) => (
            <span
              key={icon}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/5 px-3 py-1 text-xs font-medium text-fd-secondary-foreground"
            >
              <TechIcon icon={icon} size={14} />
              {techIcons[icon].name}
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="grid w-full max-w-5xl grid-cols-1 gap-4 px-6 pb-16 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, description, color }) => (
          <div
            key={title}
            className="flex flex-col gap-3 rounded-xl border bg-fd-card p-6 text-left transition-colors hover:border-fd-primary/30"
          >
            <div className={`flex size-9 items-center justify-center rounded-lg ${color}`}>
              <Icon className="size-4.5" />
            </div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-fd-muted-foreground">{description}</p>
          </div>
        ))}
      </section>
 {/* How it works */}
      <section className="flex w-full max-w-3xl flex-col items-center gap-2 px-6 pb-8 text-center">
        <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
          Webhooks in, durable executions out
        </h2>
        <p className="max-w-lg text-fd-muted-foreground">
          Every provider delivery lands in the same durable pipeline before it ever reaches your
          code.
        </p>
        <WebhookFlowDiagram />
      </section>
      {/* Code preview */}
      <section className="mx-6 my-24 flex w-full max-w-3xl flex-col items-center gap-6 text-center">
        <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
          A handler is just TypeScript
        </h2>
        <p className="max-w-xl text-fd-muted-foreground">
          No workflow DSL to learn - <code>relay.on()</code> registers a plain async function, and{' '}
          <code>ctx.step.run()</code> is the only new concept.
        </p>
        <div className="w-full overflow-hidden rounded-xl border bg-fd-card text-left shadow-sm">
          <div className="flex items-center gap-1.5 border-b bg-fd-secondary/50 px-4 py-2">
            <span className="size-2.5 rounded-full bg-red-400/70" />
            <span className="size-2.5 rounded-full bg-yellow-400/70" />
            <span className="size-2.5 rounded-full bg-green-400/70" />
            <span className="ml-2 text-xs text-fd-muted-foreground">relay.handlers.ts</span>
          </div>
          <pre className="overflow-x-auto px-5 py-4 text-sm leading-relaxed">
            <code>{`relay.on('stripe.charge.succeeded', async (event, ctx) => {
  const charge = event.data.object; // typed as Stripe.Charge

  const payment = await ctx.step.run('charge-payment', async () => {
    return { orderId: charge.metadata.orderId, amount: charge.amount };
  });

  await ctx.step.run('send-confirmation', async () => {
    ctx.log.info('order confirmed', payment);
  });
});`}</code>
          </pre>
        </div>
      </section>

      

      {/* Final CTA */}
      <section className="relative flex w-full flex-col items-center gap-6 overflow-hidden border-t px-6 py-20 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-violet-500/5 via-fuchsia-500/5 to-transparent"
        />
        <h2 className="max-w-lg text-2xl font-bold tracking-tight md:text-3xl">
          Stop re-writing retry logic by hand.
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs"
            className="group inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-violet-600/20 transition-transform hover:scale-[1.02]"
          >
            Read the docs
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/docs/basic-usage"
            className="rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-fd-secondary"
          >
            Basic usage
          </Link>
        </div>
      </section>
    </main>
  );
}
