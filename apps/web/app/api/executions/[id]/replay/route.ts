import { relay } from '@/relay';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const execution = await relay.replayExecution(id);
  return Response.json({ execution });
}
