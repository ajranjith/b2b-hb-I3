import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import dayjs from "dayjs";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError } from "@/utils/errors";
import type { Prisma } from "../../generated/prisma";

type UserDealerWithShippingMethod = Prisma.UserDealerGetPayload<{
  include: { defaultShippingMethod: true };
}>;

export interface AuthUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string | null;
  role: string;
  profileImage: string | null;
  password: string;
  isTempPassword: boolean;
  dealer: UserDealerWithShippingMethod | null;
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export async function authenticate(c: Context, next: Next) {
  let token = getCookie(c, "token");
  // || "8192657868276fc9e15a82855332f8ce4952a078161824a8e235d63e15a039dd";

  if (!token) {
    // Development fallback - remove in production
    throw new UnauthorizedError("Authentication required");

    // dealer
    // token = "8192657868276fc9e15a82855332f8ce4952a078161824a8e235d63e15a039dd";

    //admin
    // token = "a7a7291fdd1a7173a295480899eca391131884e5753edaf070f8c6f6be65b73b";
  }

  const session = await prisma.userSession.findFirst({
    where: {
      token,
      status: true,
    },
    include: {
      user: {
        include: {
          role: true,
          dealer: {
            include: {
              defaultShippingMethod: true,
            },
          },
        },
      },
    },
  });

  if (!session) {
    throw new UnauthorizedError("Invalid session");
  }

  if (dayjs().isAfter(dayjs(session.expiresAt))) {
    // Mark session as inactive
    await prisma.userSession.update({
      where: { id: session.id },
      data: { status: false },
    });
    throw new UnauthorizedError("Session expired");
  }

  if (session.user.isLocked) {
    throw new UnauthorizedError("Your account has been blocked due to multiple failed login attempts. Please contact support.");
  }

  c.set("user", {
    id: session.user.id,
    email: session.user.email,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    role: session.user.role.code,
    profileImage: session.user.profileImage,
    password: session.user.password,
    isTempPassword: session.user.isTempPassword,
    dealer: session.user.dealer as UserDealerWithShippingMethod | null,
  });

  await next();
}
