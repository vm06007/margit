import { handle } from '@hono/node-server/vercel';
import { app } from '../server/src/index.js';

// Hono reads the request stream itself; Vercel must not consume it first.
export const config = { api: { bodyParser: false } };

export default handle(app);
