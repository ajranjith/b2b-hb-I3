import type { Context, Next } from 'hono';
import { ForbiddenError } from '../utils/errors';
import type { Role } from '../../generated/prisma';

export const authorize = {
  /**
   * Allow only specified roles to access the route
   */
  allow: (...roles: Role[]) => {
    return async (c: Context, next: Next) => {
      const user = c.get('user');

      if (!user) {
        throw new ForbiddenError('Access denied');
      }

      if (!roles.includes(user.role as Role)) {
        throw new ForbiddenError('You do not have permission to access this resource');
      }

      await next();
    };
  },

  /**
   * Restrict specified roles from accessing the route
   */
  restrict: (...roles: Role[]) => {
    return async (c: Context, next: Next) => {
      const user = c.get('user');

      if (!user) {
        throw new ForbiddenError('Access denied');
      }

      if (roles.includes(user.role as Role)) {
        throw new ForbiddenError('You do not have permission to access this resource');
      }

      await next();
    };
  },
};
