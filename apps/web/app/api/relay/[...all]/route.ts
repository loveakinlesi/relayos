import { toNextJsHandler } from 'relayos/next-js';
import { relay } from '@/relayos.config';

export const { POST } = toNextJsHandler(relay);
