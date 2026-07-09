import { relay } from '@/lib/relay';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const steps = await relay.listSteps(id);
  return Response.json({ steps });
}
