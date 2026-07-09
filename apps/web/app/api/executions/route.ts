import { relay } from '@/lib/relay';

export async function GET() {
  return Response.json({ executions: relay.listExecutions() });
}
