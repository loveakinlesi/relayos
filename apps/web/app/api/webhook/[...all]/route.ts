import { toNextJsHandler } from 'relayos/next-js';
import { relay } from '@/relay';

export const { POST } = toNextJsHandler(relay);
