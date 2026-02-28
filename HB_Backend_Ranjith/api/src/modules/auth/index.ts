import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import dayjs from 'dayjs';
import { loginSchema, changePasswordSchema, dealerLoginSchema } from './_dto';
import { prisma } from '@/lib/prisma';
import {  UnauthorizedError ,ValidationError } from '@/utils/errors';
import { Role } from 'generated/prisma';
import { authenticate } from '@/middleware/authenticate';
import { validationHook } from '@/middleware/validationHook';
import { verifyRecaptcha } from '@/utils/recaptcha';

const authRoutes = new Hono();

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

authRoutes.post(
  '/login/admin',
  describeRoute({
    tags: ['Auth'],
    summary: 'Admin login',
    description: 'Login with email and password',
    responses: {
      200: {
        description: 'Login successful',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                message: z.string(),
              })
            ),
          },
        },
      },
      401: {
        description: 'Invalid credentials',
      },
    },
  }),
  zValidator('json', loginSchema),
  async (c) => {
    const { email, password, captchaToken } = c.req.valid('json');

    // Verify reCAPTCHA token
    const isCaptchaValid = await verifyRecaptcha(captchaToken);
    if (!isCaptchaValid) {
      throw new ValidationError('Captcha verification failed. Please try again.');
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      select: { role: true ,password: true, id: true, status: true},
    });

    if (!user) {
      throw new ValidationError('Invalid email or password');
    }

    if (user.role.code !== Role.Admin) {
      throw new UnauthorizedError('You are not authorized to login as an admin');
    }

    // Check admin account status
    if (!user.status) {
      throw new UnauthorizedError('Your account has been deactivated. Please contact your administrator.');
    }

    // Verify password using Bun
    const isValidPassword = await Bun.password.verify(password, user.password);

    if (!isValidPassword) {
      throw new ValidationError('Invalid email or password');
    }

    const expiresAt = dayjs().add(30, 'day').toDate();

    // Check for existing session
    const existingSession = await prisma.userSession.findFirst({
      where: {
        userId: user.id,
        status: true,
      },
    });

    let token: string;

    if (existingSession) {
      // Update existing session
      token = existingSession.token;
      await prisma.userSession.update({
        where: { id: existingSession.id },
        data: { expiresAt },
      });
    } else {
      // Create new session
      token = generateToken();
      await prisma.userSession.create({
        data: {
          userId: user.id,
          token,
          expiresAt,
        },
      });
    }

    setCookie(c, 'token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      ...(process.env.DOMAIN && { domain: process.env.DOMAIN }),
      maxAge: THIRTY_DAYS_SECONDS,
      path: '/',
    });

    return c.json({
      success: true,
      message: 'Logged in successfully!',
    });
  }
);

authRoutes.post(
  '/login/dealer',
  describeRoute({
    tags: ['Auth'],
    summary: 'Dealer login',
    description: 'Dealer login with email and password',
    responses: {
      200: {
        description: 'Login successful',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                message: z.string(),
                data: z.object({
                  accountNumber: z.number(),
                  companyName: z.string(),
                  accountStatus: z.string(),
                }),
              })
            ),
          },
        },
      },
      401: {
        description: 'Invalid credentials',
      },
    },
  }),
  zValidator('json', dealerLoginSchema, validationHook),
  async (c) => {
    const { email, password, captchaToken,vissibleRecaptcha } = c.req.valid('json');

    // Verify reCAPTCHA token
    const isCaptchaValid = await verifyRecaptcha(captchaToken,vissibleRecaptcha);
    if (!isCaptchaValid) {
      throw new ValidationError('Captcha verification failed. Please try again.');
    }

    // Find user by email with dealer information
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        password: true,
        role: true,
        status: true,
        isLocked: true,
        dealer: {
          select: {
            id: true,
            accountNumber: true,
            companyName: true,
            accountStatus: true,
            isTemporaryUser: true,
            failedLoginAttempts: true,
          },
        },
      },
    });

    if (!user) {
      throw new ValidationError('Invalid email or password');
    }

    if (user.role.code !== Role.Dealer) {
      throw new UnauthorizedError('You are not authorized to login as a dealer');
    }

    if (!user.dealer) {
      throw new UnauthorizedError('Dealer account not found');
    }

    // Check if user account is locked due to multiple failed login attempts
    if (user.isLocked) {
      throw new UnauthorizedError('Your account has been blocked due to multiple failed login attempts. Please contact support.');
    }

    // Check dealer account status - prevent inactive and non-active accounts from logging in
    if (user.dealer.accountStatus === 'Inactive') {
      throw new UnauthorizedError('Your dealer account is inactive. Please contact support to activate your account.');
    }

    if (user.dealer.accountStatus === 'Suspended') {
      throw new UnauthorizedError('Your dealer account is suspended. Please contact support.');
    }

    if (user.dealer.accountStatus !== 'Active') {
      throw new UnauthorizedError('Your dealer account is not active. Please contact support.');
    }

    // Get current failed login attempts
    const currentAttempts = user.dealer.failedLoginAttempts || 0;

    // Verify password using Bun
    const isValidPassword = await Bun.password.verify(password, user.password);

    if (!isValidPassword) {
      // Increment failed login attempts
      const newFailedAttempts = currentAttempts + 1;

      // If attempts reach 5, lock the user account and invalidate all active sessions
      if (newFailedAttempts >= 5) {
        await prisma.user.update({
          where: { id: user.id },
          data: { isLocked: true },
        });
        await prisma.userDealer.update({
          where: { id: user.dealer.id },
          data: { failedLoginAttempts: newFailedAttempts },
        });
        await prisma.userSession.updateMany({
          where: { userId: user.id, status: true },
          data: { status: false },
        });
        throw new UnauthorizedError('Too many failed login attempts. Your account has been blocked. Please contact support.');
      }

      // Update failed login attempts
      await prisma.userDealer.update({
        where: { id: user.dealer.id },
        data: { failedLoginAttempts: newFailedAttempts },
      });

      // Throw error after 3 attempts
      // if (newFailedAttempts >= 3) {
      //   throw new UnauthorizedError(`Too many failed login attempts (${newFailedAttempts}/5). Your account will be blocked after 5 failed attempts. Please contact support.`);
      // }
      if (newFailedAttempts >= 3) {
          throw new UnauthorizedError(`Too many failed login attempts (${newFailedAttempts}/5). Your account will be blocked after 5 failed attempts.`,
            {
              failedAttempts: newFailedAttempts,
              maxAttempts: 5,
              remainingAttempts: 5 - newFailedAttempts,
            });  
      }

      throw new ValidationError('Invalid email or password');
    }

    // Reset failed login attempts and update isTemporaryUser to false after successful login
    await prisma.userDealer.update({
      where: { id: user.dealer.id },
      data: {
        failedLoginAttempts: 0,
        ...(user.dealer.isTemporaryUser && { isTemporaryUser: false }),
      },
    });

    const expiresAt = dayjs().add(30, 'day').toDate();

    // Check for existing session
    const existingSession = await prisma.userSession.findFirst({
      where: {
        userId: user.id,
        status: true,
      },
    });

    let token: string;

    if (existingSession) {
      // Update existing session
      token = existingSession.token;
      await prisma.userSession.update({
        where: { id: existingSession.id },
        data: { expiresAt },
      });
    } else {
      // Create new session
      token = generateToken();
      await prisma.userSession.create({
        data: {
          userId: user.id,
          token,
          expiresAt,
        },
      });
    }

    setCookie(c, 'token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      ...(process.env.DOMAIN && { domain: process.env.DOMAIN }),
      maxAge: THIRTY_DAYS_SECONDS,
      path: '/',
    });

    return c.json({
      success: true,
      message: 'Logged in successfully!',
      data: {
        accountNumber: user.dealer.accountNumber,
        companyName: user.dealer.companyName,
        accountStatus: user.dealer.accountStatus,
      },
    });
  }
);

authRoutes.get(
  '/profile',
  describeRoute({
    tags: ['Auth'],
    summary: 'Get current user profile',
    description: 'Get authenticated user profile information',
    responses: {
      200: {
        description: 'User profile retrieved successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  email: z.string(),
                  firstName: z.string(),
                  lastName: z.string().nullable(),
                  role: z.string(),
                  profileImage: z.string().nullable(),
                  isTempPassword: z.boolean(),
                  dealer: z.any().nullable(),
                  isTemporaryUser: z.boolean(),
                  defaultShippingMethod: z.object({
                    id: z.number(),
                    name: z.string(),
                  }).nullable(),
                }),
              })
            ),
          },
        },
      },
      401: {
        description: 'Authentication required',
      },
    },
  }),
  authenticate,
  async (c) => {
    const user = c.get('user');

    const isTemporaryUser = user.dealer?.isTemporaryUser ?? false;
    // Type assertion needed because TypeScript doesn't infer the included relation type
    const defaultShippingMethod = (user.dealer as typeof user.dealer & { defaultShippingMethod: { id: number; name: string } | null })?.defaultShippingMethod ?? null;

    return c.json({
      success: true,
      data: {
        ...user,
        isTemporaryUser,
        defaultShippingMethod,
      },
    });
  }
);

authRoutes.post(
  '/logout',
  authenticate,
  describeRoute({
    tags: ['Auth'],
    summary: 'Logout',
    description: 'Logout current user and invalidate session',
    responses: {
      200: {
        description: 'Logout successful',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                message: z.string(),
              })
            ),
          },
        },
      },
      401: {
        description: 'Authentication required',
      },
    },
  }),
  async (c) => {
    const token = getCookie(c, 'token');

    if (token) {
      // Invalidate session in database
      await prisma.userSession.updateMany({
        where: {
          token,
          status: true,
        },
        data: {
          status: false,
        },
      });
    }

    // Clear the cookie
    deleteCookie(c, 'token', {
      path: '/',
      ...(process.env.DOMAIN && { domain: process.env.DOMAIN }),
    });

    return c.json({
      success: true,
      message: 'Logged out successfully!',
    });
  }
);

// Change password
authRoutes.post(
  '/change-password',
  authenticate,
  describeRoute({
    tags: ['Auth'],
    summary: 'Change password',
    description: 'Change the current user password. Sets isTempPassword to false upon successful change.',
    responses: {
      200: {
        description: 'Password changed successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                message: z.string(),
              })
            ),
          },
        },
      },
      400: {
        description: 'Invalid current password or validation error',
      },
      401: {
        description: 'Authentication required',
      },
    },
  }),
  zValidator('json', changePasswordSchema, validationHook),
  async (c) => {
    const user = c.get('user');
    const { currentPassword, newPassword, captchaToken } = c.req.valid('json');

    // Verify reCAPTCHA token
    const isCaptchaValid = await verifyRecaptcha(captchaToken);
    if (!isCaptchaValid) {
      throw new ValidationError('Captcha verification failed. Please try again.');
    }

    // Verify current password
    const isValidPassword = await Bun.password.verify(currentPassword, user.password);

    if (!isValidPassword) {
      throw new ValidationError('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await Bun.password.hash(newPassword, {
      algorithm: 'bcrypt',
      cost: 10,
    });

    // Update password and set isTempPassword to false
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        isTempPassword: false,
      },
    });

    return c.json({
      success: true,
      message: 'Password changed successfully!',
    });
  }
);

export default authRoutes;
