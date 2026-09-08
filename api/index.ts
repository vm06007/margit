import { handle } from '@hono/node-server/vercel';
import { app } from '../server/src/index.js';

export default handle(app);
