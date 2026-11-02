import type { SessionUser } from '../security/token.js';

// Tell TypeScript about the fields our middleware adds to every Express request.
// This is "declaration merging": we add fields to Express' own Request type.
declare global {
  namespace Express {
    interface Request {
      id: string; // set by the requestId middleware
      user?: SessionUser; // set by requireAuth when the login cookie is valid
      clientIp?: string; // set by requireProxySecret: the visitor's IP as reported by our own web app
    }
  }
}

export {};
