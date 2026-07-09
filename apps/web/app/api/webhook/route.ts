import type { NormalizedEvent } from 'relayos';
import { relay } from '@/lib/relay';

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<NormalizedEvent>;

  const event: NormalizedEvent = {
    id: body.id ?? crypto.randomUUID(),
    type: body.type ?? 'test.ping',
    data: body.data ?? {},
    receivedAt: new Date().toISOString(),
  };

  const execution = await relay.ingest(event);

  return Response.json({ received: event, execution });
}
