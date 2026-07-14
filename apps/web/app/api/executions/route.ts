import { relay } from '@/relay';

export async function GET() {
  return Response.json({ executions: await relay.listExecutions() });
}
