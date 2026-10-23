import type { RequestContext } from '../auth/access.js';

declare global {
  namespace Express {
    interface Request {
      ctx?: RequestContext;
    }
  }
}

export {};
