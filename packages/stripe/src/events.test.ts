import { describe, it, expect, expectTypeOf } from 'vitest';
import type Stripe from 'stripe';
import type { StripeEventMap } from './events';

// Type-level assertions: checked by tsc (the lint gate), not at runtime.

type Has<K extends string> = K extends keyof StripeEventMap ? true : false;

describe('StripeEventMap', () => {
  it('catalogs stripe events under the stripe. namespace', () => {
    expectTypeOf<Has<'stripe.charge.succeeded'>>().toEqualTypeOf<true>();
    expectTypeOf<Has<'stripe.invoice.paid'>>().toEqualTypeOf<true>();
    expectTypeOf<Has<'stripe.customer.subscription.created'>>().toEqualTypeOf<true>();
    expectTypeOf<Has<'stripe.not.a.real.event'>>().toEqualTypeOf<false>();
    expect(true).toBe(true);
  });

  it('types data.object as the concrete Stripe resource', () => {
    expectTypeOf<
      StripeEventMap['stripe.charge.succeeded']['object']
    >().toEqualTypeOf<Stripe.Charge>();
    expectTypeOf<
      StripeEventMap['stripe.customer.subscription.created']['object']
    >().toEqualTypeOf<Stripe.Subscription>();
    expect(true).toBe(true);
  });
});
