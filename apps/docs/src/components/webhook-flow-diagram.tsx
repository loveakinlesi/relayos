'use client';

import { forwardRef, useRef, type ReactNode } from 'react';
import { Code2, Database } from 'lucide-react';
import { AnimatedBeam } from '@/components/magicui/animated-beam';
import { TechIcon } from '@/components/tech-icon';
import { cn } from '@/lib/cn';

const Circle = forwardRef<HTMLDivElement, { className?: string; children: ReactNode }>(
  ({ className, children }, ref) => (
    <div
      ref={ref}
      className={cn(
        'z-10 flex items-center justify-center rounded-full border bg-fd-card p-3 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  ),
);
Circle.displayName = 'Circle';

export function WebhookFlowDiagram() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<HTMLDivElement>(null);
  const githubRef = useRef<HTMLDivElement>(null);
  const clerkRef = useRef<HTMLDivElement>(null);
  const shopifyRef = useRef<HTMLDivElement>(null);
  const relayRef = useRef<HTMLDivElement>(null);
  const dbRef = useRef<HTMLDivElement>(null);
  const handlerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative flex w-full max-w-xl items-center justify-between px-4 py-8"
    >
      <div className="flex flex-col gap-5">
        <Circle ref={stripeRef}>
          <TechIcon icon="stripe" />
        </Circle>
        <Circle ref={githubRef}>
          <TechIcon icon="github" />
        </Circle>
        <Circle ref={clerkRef}>
          <TechIcon icon="clerk" />
        </Circle>
        <Circle ref={shopifyRef}>
          <TechIcon icon="shopify" />
        </Circle>
      </div>

      <Circle
        ref={relayRef}
        className="size-20 border-violet-500/30 bg-gradient-to-br from-indigo-500/10 via-violet-500/10 to-fuchsia-500/10 p-0"
      >
        <span className="bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 bg-clip-text text-xs font-bold text-transparent">
          Restaq
        </span>
      </Circle>

      <div className="flex flex-col gap-10">
        <Circle ref={dbRef}>
          <Database className="size-5 text-fd-muted-foreground" />
        </Circle>
        <Circle ref={handlerRef}>
          <Code2 className="size-5 text-fd-muted-foreground" />
        </Circle>
      </div>

      <AnimatedBeam
        containerRef={containerRef}
        fromRef={stripeRef}
        toRef={relayRef}
        curvature={-50}
        gradientStartColor="#6366f1"
        gradientStopColor="#d946ef"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={githubRef}
        toRef={relayRef}
        curvature={-15}
        gradientStartColor="#6366f1"
        gradientStopColor="#d946ef"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={clerkRef}
        toRef={relayRef}
        curvature={15}
        gradientStartColor="#6366f1"
        gradientStopColor="#d946ef"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={shopifyRef}
        toRef={relayRef}
        curvature={50}
        gradientStartColor="#6366f1"
        gradientStopColor="#d946ef"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={relayRef}
        toRef={dbRef}
        curvature={-30}
        gradientStartColor="#d946ef"
        gradientStopColor="#0ea5e9"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={relayRef}
        toRef={handlerRef}
        curvature={30}
        gradientStartColor="#d946ef"
        gradientStopColor="#0ea5e9"
      />
    </div>
  );
}
