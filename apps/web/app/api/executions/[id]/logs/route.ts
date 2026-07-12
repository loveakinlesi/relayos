import { relay } from '@/relayos.config';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const logs = await relay.listLogs(id);
  return Response.json({ logs });
}
