import { relay } from '@/relayos.config';

export async function GET() {
  return Response.json({ executions: await relay.listExecutions() });
}
