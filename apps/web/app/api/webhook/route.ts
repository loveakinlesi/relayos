import { createRelay, type NormalizedEvent } from 'relayos';

const relay = createRelay();

relay.on('test.ping', async (event) => {
  console.log('[relayos] handled test.ping', event);
});

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<NormalizedEvent>;

  const event: NormalizedEvent = {
    id: body.id ?? crypto.randomUUID(),
    type: body.type ?? 'test.ping',
    data: body.data ?? {},
    receivedAt: new Date().toISOString(),
  };

  await relay.ingest(event);

  return Response.json({ received: event });
}
