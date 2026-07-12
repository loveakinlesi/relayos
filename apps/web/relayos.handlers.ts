import type { AppRelay } from './relayos.config';

/**
 * All of this app's event handlers, registered here rather than in
 * relayos.config.ts - keeps the relay's wiring (storage, plugins, retry
 * policy) separate from the business logic that runs when an event arrives.
 */
export function registerHandlers(relay: AppRelay): void {
  relay.on('test.ping', async (event, ctx) => {
    ctx.log.info('handled test.ping', event);
  });

  relay.on('test.fail', async (_event, ctx) => {
    ctx.log.warn('about to fail on purpose');
    throw new Error('simulated handler failure');
  });

  // Demo-only: makes "send-receipt" fail exactly once per charge so a retry
  // has something real to resume past. A production app wouldn't need this -
  // the flakiness would come from an actual email provider timing out.
  const receiptAttemptsByCharge = new Map<string, number>();

  /**
   * A real post-payment workflow: receiving the money is only the trigger,
   * everything after it is a sequence of steps that each need to survive a
   * crash/retry independently. record-payment and calculate-fee are pure and
   * cheap, so re-running them on retry would be harmless - but send-receipt
   * calls a flaky external provider, and notify-fulfillment shouldn't fire
   * twice for the same charge. ctx.step.run() gives each step that guarantee
   * without any of this handler needing to know it's being retried.
   */
  relay.on('stripe.charge.succeeded', async (event, ctx) => {
    // event.data is typed from @relayos/stripe's event catalog - charge is a
    // full Stripe.Charge, no hand-written type or cast needed.
    const charge = event.data.object;

    const payment = await ctx.step.run('record-payment', async () => {
      // In a real app: INSERT into a payments/ledger table here.
      ctx.log.info('recorded payment', charge);
      return { chargeId: charge.id, amount: charge.amount, currency: charge.currency };
    });

    const fee = await ctx.step.run('calculate-fee', async () => {
      // Chains off record-payment's output - a common workflow shape.
      const feeAmount = Math.round(payment.amount * 0.029 + 30);
      const netAmount = payment.amount - feeAmount;
      ctx.log.info('calculated platform fee', { feeAmount, netAmount });
      return { feeAmount, netAmount };
    });

    await ctx.step.run('send-receipt', async () => {
      const attempts = (receiptAttemptsByCharge.get(payment.chargeId) ?? 0) + 1;
      receiptAttemptsByCharge.set(payment.chargeId, attempts);
      if (attempts === 1) {
        throw new Error('receipt email provider timed out (simulated)');
      }
      ctx.log.info('sent receipt email', {
        chargeId: payment.chargeId,
        to: charge.customer ?? 'unknown customer',
      });
    });

    await ctx.step.run('notify-fulfillment', async () => {
      ctx.log.info('notified fulfillment', {
        chargeId: payment.chargeId,
        netAmount: fee.netAmount,
      });
    });
  });

  relay.on('github.push', async (event, ctx) => {
    ctx.log.info('handled github.push', event);
  });

  /**
   * Demonstrates ctx.step.run(): step1 has an observable side effect
   * (incrementing a counter) that should only ever happen once per execution,
   * even across a failed attempt + retryExecution(). step2 fails on its first
   * attempt and succeeds on retry, proving a failed step actually re-runs
   * instead of being cached like a completed one.
   */
  let step1RunCount = 0;
  let step2AttemptCount = 0;

  relay.on('test.steps', async (_event, ctx) => {
    const step1Result = await ctx.step.run('step1', async () => {
      step1RunCount += 1;
      return { ranTimes: step1RunCount };
    });
    ctx.log.info('step1 result', step1Result);

    await ctx.step.run('step2', async () => {
      step2AttemptCount += 1;
      if (step2AttemptCount < 2) {
        throw new Error(`step2 transient failure (attempt ${step2AttemptCount})`);
      }
      return { attempt: step2AttemptCount };
    });

    ctx.log.info('test.steps handler completed');
  });
}
