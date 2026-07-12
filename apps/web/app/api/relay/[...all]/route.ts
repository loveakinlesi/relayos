import { toNextJsHandler } from '@relayos/nextjs';
import { relay } from '@/relayos.config';

export const { POST } = toNextJsHandler(relay);
