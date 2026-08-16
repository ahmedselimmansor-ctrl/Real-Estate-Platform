import { AuthenticatedUser } from './authenticated-user';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    /** Passport principal — populated by the JWT strategy (stage 2). */
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends AuthenticatedUser {}

    interface Request {
      /** Correlation id, always present after `requestIdMiddleware`. */
      requestId: string;
    }
  }
}

export {};
