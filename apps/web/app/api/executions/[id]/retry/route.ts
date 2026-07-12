import { relay } from '@/relayos.config';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const execution = await relay.retryExecution(id);
  return Response.json({ execution });
}
