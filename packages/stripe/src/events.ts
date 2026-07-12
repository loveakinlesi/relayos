import type Stripe from 'stripe';

/**
 * Every Stripe webhook event, keyed the way RelayOS namespaces them
 * ("stripe." + Stripe's own event type), mapped to that event's `data`
 * payload - data.object is the concrete resource, e.g. a Stripe.Charge for
 * "stripe.charge.succeeded".
 *
 * Derived from the official `stripe` package's discriminated Event union, so
 * the catalog tracks whichever stripe version the application has installed.
 */
export type StripeEventMap = {
  [K in Stripe.Event['type'] as `stripe.${K}`]: Extract<Stripe.Event, { type: K }>['data'];
};
