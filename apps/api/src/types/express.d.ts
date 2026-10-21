// Tell TypeScript that every Express request has an `id` (set by the requestId middleware).
// This is "declaration merging": we add a field to Express' own Request type.
declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export {};
