import { toNextJsHandler } from 'relayos/next-js';
import { relay } from '@/lib/relay';

export const { POST } = toNextJsHandler(relay);
