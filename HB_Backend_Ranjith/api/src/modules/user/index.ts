import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { resolver, validator as zValidator } from "hono-openapi/zod";
// import { zValidator } from '@hono/zod-validator';
import { z } from "zod";
import dayjs from "dayjs";
import {
  createAdminSchema,
  createDealerSchema,
  listDealersQuerySchema,
  userIdParamSchema,
  updateDealerStatusSchema,
  listAdminsQuerySchema,
  updateAdminStatusSchema,
  changePasswordSchema,
  resetPasswordSchema,
  updateDealerByDealerSchema,
  sendPasswordChangeEmailSchema,
} from "./_dto";
import { successResponse } from "@/utils/response";
import { prisma } from "@/lib/prisma";
import { ConflictError, NotFoundError, ValidationError, AppError, UnauthorizedError, BadRequestError } from "@/utils/errors";
import { Role, DealerAccountStatus } from "generated/prisma";
import { authenticate } from "@/middleware/authenticate";
import { authorize } from "@/middleware/authorize";
import { validationHook } from "@/middleware/validationHook";
import { sendPasswordResetEmail, sendDealerWelcomeEmail } from "@/utils/emailFacade";

// Generate session token
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Generate random password that meets validation requirements:
// - At least one lowercase letter
// - At least one uppercase letter
// - At least one special character
// - Between 8 and 20 characters
function generateRandomPassword(length: number = 12): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}';
  const allChars = lowercase + uppercase + numbers + special;

  // Ensure length is between 8 and 20
  const validLength = Math.max(8, Math.min(20, length));

  // Start with required characters
  const array = new Uint8Array(validLength);
  crypto.getRandomValues(array);

  let password = '';

  // Add at least one of each required type
  password += lowercase[array[0] % lowercase.length];
  password += uppercase[array[1] % uppercase.length];
  password += special[array[2] % special.length];

  // Fill the rest with random characters from all sets
  for (let i = 3; i < validLength; i++) {
    password += allChars[array[i] % allChars.length];
  }

  // Shuffle the password to randomize the positions
  const shuffled = password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');

  return shuffled;
}

const userRoutes = new Hono();

// List Admin Users
userRoutes.get(
  "/admin",
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ["User"],
    summary: "List admin users",
    description:
      "Get paginated list of admin users with search and filter (Admin only)",
    responses: {
      200: {
        description: "List of admin users",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(z.any()),
                meta: z.object({
                  page: z.number(),
                  limit: z.number(),
                  total: z.number(),
                  totalPages: z.number(),
                }),
              }),
            ),
          },
        },
      },
    },
  }),
  zValidator("query", listAdminsQuerySchema, validationHook),
  async (c) => {
    const { page, limit, search, status } = c.req.valid("query");
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      role: { code: Role.Admin },
    };

    // Status filter
    if (status !== undefined) {
      where.status = status;
    }

    // Search filter
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    // Get total count
    const total = await prisma.user.count({ where });

    // Get admins
    const admins = await prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        createdAt: true,
        role: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    return c.json({
      success: true,
      data: admins,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  },
);

// List Dealers
userRoutes.get(
  "/dealer",
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ["User"],
    summary: "List dealers",
    description:
      "Get paginated list of dealers with search and filter (Admin only)",
    responses: {
      200: {
        description: "List of dealers",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.array(z.any()),
                meta: z.object({
                  page: z.number(),
                  limit: z.number(),
                  total: z.number(),
                  totalPages: z.number(),
                }),
              }),
            ),
          },
        },
      },
    },
  }),
  zValidator("query", listDealersQuerySchema, validationHook),
  async (c) => {
    const { page, limit, search, accountStatus } = c.req.valid("query");
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      role: { code: Role.Dealer },
      status: true,
    };

    // Search filter
    if (search) {
      const searchInt = parseInt(search, 10);

      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { dealer: { companyName: { contains: search, mode: "insensitive" } } },
        ...(Number.isInteger(searchInt)
          ? [{ dealer: { accountNumber: searchInt } }]
          : []),
      ];
    }

    // Account status filter
    if (accountStatus) {
      where.dealer = { ...where.dealer, accountStatus };
    }

    // Get total count
    const total = await prisma.user.count({ where });

    // Get dealers
    const dealers = await prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        createdAt: true,
        isLocked: true,
        dealer: {
          select: {
            accountNumber: true,
            companyName: true,
            genuinePartsTier: true,
            aftermarketESTier: true,
            aftermarketBTier: true,
            accountStatus: true,
            defaultShippingMethod: true,
            notes: true,
          },
        },
      },
    });

    return c.json({
      success: true,
      data: dealers,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  },
);

// Get dealer by ID
userRoutes.get(
  "/dealer/:id",
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ["User"],
    summary: "Get dealer user",
    description: "Get an existing dealer user by ID (Admin only)",
    responses: {
      200: {
        description: "Dealer user retrieved successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  firstName: z.string(),
                  lastName: z.string().nullable(),
                  email: z.string(),
                  role: z.object({
                    code: z.string(),
                    name: z.string(),
                  }),
                  createdAt: z.string(),
                  updatedAt: z.string(),
                  dealer: z.object({
                    accountNumber: z.number(),
                    companyName: z.string(),
                    genuinePartsTier: z.string(),
                    aftermarketESTier: z.string(),
                    aftermarketBTier: z.string(),
                    accountStatus: z.string(),
                  }),
                }),
              }),
            ),
          },
        },
      },
      409: {
        description: "User or account number already exists",
      },
    },
  }),
  zValidator("param", userIdParamSchema, validationHook),
  async (c) => {
    const userId = parseInt(c.req.param("id"));

    // if the userId is not dealer resturn error
    const checkDealer = await prisma.userDealer.findUnique({
      where: { userId },
    });

    if (!checkDealer) {
      throw new NotFoundError("Dealer not found");
    }

    // get user by id
    const getUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        profileImage: true,
        createdAt: true,
        updatedAt: true,
        role: {
          select: {
            code: true,
            name: true,
          },
        },
        dealer: {
          select: {
            accountNumber: true,
            companyName: true,
            genuinePartsTier: true,
            aftermarketESTier: true,
            aftermarketBTier: true,
            accountStatus: true,
            notes: true,
            isTemporaryUser: true,
          },
        },
      },
    });

    if (!getUser) {
      throw new NotFoundError("User not found");
    }

    return c.json(successResponse(getUser), 200);
  },
);

// Create Admin User
userRoutes.post(
  "/admin",
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ["User"],
    summary: "Create admin user",
    description: "Create a new admin user with email and password",
    responses: {
      201: {
        description: "Admin user created successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  firstName: z.string(),
                  lastName: z.string(),
                  email: z.string(),
                  profileImage: z.string().nullable(),
                  createdAt: z.string(),
                  role: z.object({
                    code: z.string(),
                    name: z.string(),
                  }),
                }),
              }),
            ),
          },
        },
      },
      409: {
        description: "User already exists",
      },
    },
  }),
  zValidator("json", createAdminSchema, validationHook),
  async (c) => {
    const input = c.req.valid("json");
    const { firstName, lastName, email, password, profileImage } = input;

    // Check for conflicts in priority order: email, password, firstName, lastName
    
    // Check email conflict
    const existingUserByEmail = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUserByEmail) {
      throw new AppError("User with this email already exists", 409, "EMAIL_CONFLICT");
    }


    // Get Admin role
    const adminRole = await prisma.userRole.findUnique({
      where: { code: Role.Admin },
    });

    if (!adminRole) {
      throw new NotFoundError(
        "Admin role not found. Please run seeders first.",
      );
    }

    if (!password) {
      // throw new ConflictError("Password is required to create admin user");
       throw new AppError("Password is required to create admin user", 409, "PASSWORD_REQUIRED");
    }

    // Hash password using Bun
    const hashedPassword = await Bun.password.hash(password, {
      algorithm: "bcrypt",
      cost: 10,
    });

    // Create user
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        password: hashedPassword,
        roleId: adminRole.id,
        ...(profileImage !== undefined && { profileImage }),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        profileImage: true,
        createdAt: true,
        role: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    return c.json(successResponse(user), 201);
  },
);

// Create Dealer User
userRoutes.post(
  "/dealer",
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ["User"],
    summary: "Create dealer user",
    description: "Create a new dealer user (Admin only)",
    responses: {
      201: {
        description: "Dealer user created successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  firstName: z.string(),
                  lastName: z.string().nullable(),
                  email: z.string(),
                  profileImage: z.string().nullable(),
                  createdAt: z.string(),
                  role: z.object({
                    code: z.string(),
                    name: z.string(),
                  }),
                  dealer: z.object({
                    accountNumber: z.number(),
                    companyName: z.string(),
                    genuinePartsTier: z.string(),
                    aftermarketESTier: z.string(),
                    aftermarketBTier: z.string(),
                    accountStatus: z.string(),
                  }),
                }),
              }),
            ),
          },
        },
      },
      409: {
        description: "User or account number already exists",
      },
    },
  }),
  zValidator("json", createDealerSchema, validationHook),
  async (c) => {
    const input = c.req.valid("json");
    const {
      firstName,
      lastName,
      email,
      accountNumber,
      companyName,
      genuinePartsTier,
      aftermarketESTier,
      aftermarketBTier,
      notes,
      profileImage,
    } = input;

    // Validate account number range
    if (accountNumber > 2147483647) {
      throw new AppError("Account number must not exceed 2,147,483,647", 409, "ACCOINT_NUMBER_CONFLICT");
    }

    // Generate random 8-character password for new dealers
    const tempPassword = generateRandomPassword(12);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictError("User with this email already exists","EMAIL_CONFLICT");
    }

    // Check if account number already exists
    const existingDealer = await prisma.userDealer.findUnique({
      where: { accountNumber },
    });

    if (existingDealer) {
      throw new ConflictError("Dealer with this account number already exists", "ACCOUNT_NUM_CONFLICT");
    }

    // Get Dealer role
    const dealerRole = await prisma.userRole.findUnique({
      where: { code: Role.Dealer },
    });

    if (!dealerRole) {
      throw new NotFoundError(
        "Dealer role not found. Please run seeders first.",
      );
    }

    // Hash temporary password using Bun
    const hashedPassword = await Bun.password.hash(tempPassword, {
      algorithm: "bcrypt",
      cost: 10,
    });

    // Create user with dealer info in transaction
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        password: hashedPassword,
        roleId: dealerRole.id,
        isTempPassword: true,
        ...(profileImage !== undefined && { profileImage }),
        dealer: {
          create: {
            accountNumber,
            companyName,
            genuinePartsTier,
            aftermarketESTier,
            aftermarketBTier,
            accountStatus: DealerAccountStatus.Active,
            notes,
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        profileImage: true,
        createdAt: true,
        role: {
          select: {
            code: true,
            name: true,
          },
        },
        dealer: {
          select: {
            accountNumber: true,
            companyName: true,
            genuinePartsTier: true,
            aftermarketESTier: true,
            aftermarketBTier: true,
            accountStatus: true,
          },
        },
      },
    });

    // Send welcome email with temporary password
    try {
      const userName = `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`;
      const loginUrl = process.env.FRONTEND_URL || "http://localhost:5174/login";
      
      await sendDealerWelcomeEmail({
        email: user.email,
        userName,
        tempPassword,
        loginUrl,
      });
    } catch (error) {
      // Log error but don't fail user creation if email fails
      console.error("Failed to send dealer welcome email:", error);
      // Email facade handles errors internally, so we can continue
    }

    return c.json(successResponse(user), 201);
  },
);

// Update Admin User
userRoutes.put(
  "/admin-update/:id",
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ["User"],
    summary: "Update admin user",
    description:
      "Update an existing admin user deatil firstname, lastname, email",
    responses: {
      201: {
        description: "Admin user updated successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  firstName: z.string(),
                  lastName: z.string(),
                  email: z.string(),
                  profileImage: z.string().nullable(),
                  updatedAt: z.string(),
                }),
              }),
            ),
          },
        },
      },
      409: {
        description: "User already exists",
      },
    },
  }),
  zValidator("param", userIdParamSchema, validationHook),
  zValidator("json", createAdminSchema, validationHook),
  async (c) => {
    const input = c.req.valid("json");
    const userId = parseInt(c.req.param("id"));
    const { firstName, lastName, email, profileImage } = input;

    //get user by id
    const getUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!getUser) {
      throw new NotFoundError("User not found");
    }

    // Check if new email already exists
    const existingUserEmail = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUserEmail && existingUserEmail.id !== userId) {
      throw new ConflictError("User with this email already exists");
    }

    // Update user
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        email,
        ...(profileImage !== undefined && { profileImage }),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        profileImage: true,
        updatedAt: true,
      },
    });

    return c.json(successResponse(user), 201);
  },
);

// Update Dealer User By LoggedIn User/Dealer
userRoutes.put(
  "/dealer-update",
  authenticate,
  authorize.allow(Role.Dealer),
  describeRoute({
    tags: ["User"],
    summary: "Update dealer user - By Dealer",
    description: "Update an existing dealer user (Dealer only)",
    responses: {
      201: {
        description: "Dealer user updated successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  firstName: z.string(),
                  lastName: z.string().nullable(),
                  email: z.string(),
                  profileImage: z.string().nullable(),
                  createdAt: z.string(),
                  updatedAt: z.string(),
                  dealer: z.object({
                    accountNumber: z.number(),
                    companyName: z.string(),
                    genuinePartsTier: z.string(),
                    aftermarketESTier: z.string(),
                    aftermarketBTier: z.string(),
                    accountStatus: z.string(),
                  }),
                }),
              }),
            ),
          },
        },
      },
      409: {
        description: "User or account number already exists",
      },
    },
  }),
  zValidator("json", updateDealerByDealerSchema, validationHook),
  async (c) => {
    const getUserFromCookie = c.get("user");
    const userId = getUserFromCookie.id;
    const input = c.req.valid("json");
    const {
      firstName,
      lastName,
      email,
      accountNumber,
      companyName,
      genuinePartsTier,
      aftermarketESTier,
      aftermarketBTier,
      notes,
      currentPassword,
      newPassword,
      profileImage,
    } = input;

    // get user by id with password
    const getUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
        dealer: {
          select: {
            id: true,
            userId: true,
            accountNumber: true,
          },
        },
      },
    });

    if (!getUser) {
      throw new NotFoundError("User not found");
    }

    // Check if useremail already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser && existingUser.id !== userId) {
      throw new ConflictError("User with this email already exists");
    }

    // Check if account number already exists
    const existingDealer = await prisma.userDealer.findUnique({
      where: { accountNumber },
    });

    if (existingDealer && existingDealer.userId !== userId) {
      throw new ConflictError("Dealer with this account number already exists", "ACCOUNT_NUM_CONFLICT");
    }

    // Prepare update data
    const updateData: any = {
      firstName,
      lastName,
      email,
      ...(profileImage !== undefined && { profileImage }),
      dealer: {
        update: {
          accountNumber,
          companyName,
          genuinePartsTier,
          aftermarketESTier,
          aftermarketBTier,
          accountStatus: DealerAccountStatus.Active,
          notes,
          isTemporaryUser: false,
        },
      },
    };

    // Handle password update if both currentPassword and newPassword are provided
    if (currentPassword && newPassword) {
      // Verify current password
      const isValidPassword = await Bun.password.verify(
        currentPassword,
        getUser.password
      );

      if (!isValidPassword) {
        throw new AppError("Current password is incorrect", 400, "INCORRECT_CURRENTPASSWORD");
      }

      // Hash new password
      const hashedPassword = await Bun.password.hash(newPassword, {
        algorithm: "bcrypt",
        cost: 10,
      });

      updateData.password = hashedPassword;
    }

    // Update user with dealer info
    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        profileImage: true,
        createdAt: true,
        updatedAt: true,
        dealer: {
          select: {
            accountNumber: true,
            isTemporaryUser: true,
            companyName: true,
            genuinePartsTier: true,
            aftermarketESTier: true,
            aftermarketBTier: true,
            accountStatus: true,
          },
        },
      },
    });

    return c.json(successResponse(user), 201);
  },
);

// Update Dealer User By Admin
userRoutes.put(
  "/dealer-update-admin/:id",
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ["User"],
    summary: "Update dealer user - By Admin",
    description: "Update an existing dealer user (Admin only)",
    responses: {
      201: {
        description: "Dealer user updated successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  firstName: z.string(),
                  lastName: z.string().nullable(),
                  email: z.string(),
                  profileImage: z.string().nullable(),
                  createdAt: z.string(),
                  updatedAt: z.string(),
                  dealer: z.object({
                    accountNumber: z.number(),
                    companyName: z.string(),
                    genuinePartsTier: z.string(),
                    aftermarketESTier: z.string(),
                    aftermarketBTier: z.string(),
                    accountStatus: z.string(),
                  }),
                }),
              }),
            ),
          },
        },
      },
      409: {
        description: "User or account number already exists",
      },
    },
  }),
  zValidator("param", userIdParamSchema, validationHook),
  zValidator("json", createDealerSchema, validationHook),
  async (c) => {
    const input = c.req.valid("json");
    const userId = parseInt(c.req.param("id"));
    const {
      firstName,
      lastName,
      email,
      accountNumber,
      companyName,
      genuinePartsTier,
      aftermarketESTier,
      aftermarketBTier,
      defaultShippingMethod,
      notes,
      profileImage,
    } = input;

    // get user by id
    const getUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { dealer: true },
    });

    if (!getUser) {
      throw new NotFoundError("User not found");
    }

    // Check if useremail already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser && existingUser.id !== userId) {
      throw new ConflictError("User with this email already exists");
    }

    // Check if account number already exists
    const existingDealer = await prisma.userDealer.findUnique({
      where: { accountNumber },
    });

    if (existingDealer && existingDealer.userId !== userId) {
      throw new ConflictError("Dealer with this account number already exists", "ACCOUNT_NUM_CONFLICT");
    }

    // Create user with dealer info in transaction
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        email,
        ...(profileImage !== undefined && { profileImage }),
        dealer: {
          update: {
            accountNumber,
            companyName,
            genuinePartsTier,
            aftermarketESTier,
            aftermarketBTier,
            accountStatus: DealerAccountStatus.Active,
            notes,
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        profileImage: true,
        createdAt: true,
        updatedAt: true,
        dealer: {
          select: {
            accountNumber: true,
            companyName: true,
            genuinePartsTier: true,
            aftermarketESTier: true,
            aftermarketBTier: true,
            accountStatus: true,
          },
        },
      },
    });

    return c.json(successResponse(user), 201);
  },
);

// Update Dealer Status By Admin
userRoutes.patch(
  "/dealer-status/:id",
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ["User"],
    summary: "Update dealer status",
    description: "Update dealer account status (Admin only)",
    responses: {
      200: {
        description: "Dealer status updated successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  firstName: z.string(),
                  lastName: z.string().nullable(),
                  email: z.string(),
                  dealer: z.object({
                    accountNumber: z.number(),
                    companyName: z.string(),
                    accountStatus: z.string(),
                  }),
                }),
              }),
            ),
          },
        },
      },
      404: {
        description: "Dealer not found",
      },
    },
  }),
  zValidator("param", userIdParamSchema, validationHook),
  zValidator("json", updateDealerStatusSchema, validationHook),
  async (c) => {
    const userId = parseInt(c.req.param("id"));
    const { accountStatus } = c.req.valid("json");

    // Check if dealer exists
    const dealer = await prisma.userDealer.findUnique({
      where: { userId },
    });

    if (!dealer) {
      throw new NotFoundError("Dealer not found");
    }

    // Update dealer status
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        dealer: {
          update: {
            accountStatus,
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        dealer: {
          select: {
            accountNumber: true,
            companyName: true,
            accountStatus: true,
          },
        },
      },
    });

    return c.json(successResponse(updatedUser), 200);
  },
);

// Reset Dealer Password By Admin
userRoutes.post(
  "/dealer-reset-password/:id",
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ["User"],
    summary: "Reset dealer password",
    description: "Generate a new temporary password for a dealer and send it via email (Admin only)",
    responses: {
      200: {
        description: "Dealer password reset successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                message: z.string(),
                data: z.object({
                  id: z.number(),
                  firstName: z.string(),
                  lastName: z.string().nullable(),
                  email: z.string(),
                }),
              }),
            ),
          },
        },
      },
      404: {
        description: "Dealer not found",
      },
    },
  }),
  zValidator("param", userIdParamSchema, validationHook),
  async (c) => {
    const userId = parseInt(c.req.param("id"));

    // Check if dealer exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        dealer: true,
        role: true,
      },
    });

    if (!user || !user.dealer) {
      throw new NotFoundError("Dealer not found");
    }

    // Verify user is a dealer
    if (user.role.code !== Role.Dealer) {
      throw new BadRequestError("User is not a dealer");
    }

    // Generate new temporary password
    const tempPassword = generateRandomPassword(12);

    // Hash temporary password using Bun
    const hashedPassword = await Bun.password.hash(tempPassword, {
      algorithm: "bcrypt",
      cost: 10,
    });

    // Update user password, set isTempPassword flag, and unlock account
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        isTempPassword: true,
        isLocked: false,
      },
    });

    // Reset failed login attempts
    await prisma.userDealer.update({
      where: { userId },
      data: { failedLoginAttempts: 0 },
    });

    // Invalidate all active sessions for this dealer (soft delete)
    await prisma.userSession.updateMany({
      where: {
        userId,
        status: true,
      },
      data: {
        status: false,
      },
    });

    // Send email with temporary password
    try {
      const userName = `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`;
      const loginUrl = process.env.FRONTEND_URL || "http://localhost:5174/login";

      await sendDealerWelcomeEmail({
        email: user.email,
        userName,
        tempPassword,
        loginUrl,
      });
    } catch (error) {
      console.error("Failed to send dealer password reset email:", error);
      // Email facade handles errors internally, so we can continue
    }

    return c.json(
      successResponse({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      }),
      200,
    );
  },
);

// Unlock Dealer Account By Admin
userRoutes.patch(
  "/dealer-unlock/:id",
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ["User"],
    summary: "Unlock dealer account",
    description: "Unlock a dealer account that was locked due to failed login attempts (Admin only)",
    responses: {
      200: {
        description: "Dealer account unlocked successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                message: z.string(),
              }),
            ),
          },
        },
      },
      404: {
        description: "Dealer not found",
      },
    },
  }),
  zValidator("param", userIdParamSchema, validationHook),
  async (c) => {
    const userId = parseInt(c.req.param("id"));

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { dealer: true, role: true },
    });

    if (!user || !user.dealer || user.role.code !== Role.Dealer) {
      throw new NotFoundError("Dealer not found");
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isLocked: false },
    });

    await prisma.userDealer.update({
      where: { userId },
      data: { failedLoginAttempts: 0 },
    });

    return c.json(successResponse({ message: "Dealer account has been unlocked successfully." }), 200);
  },
);

// Update Admin User Status
userRoutes.patch(
  "/admin-status/:id",
  authenticate,
  authorize.allow(Role.Admin),
  describeRoute({
    tags: ["User"],
    summary: "Update admin user status",
    description: "Update admin user status (Admin only)",
    responses: {
      200: {
        description: "Admin status updated successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  firstName: z.string(),
                  lastName: z.string().nullable(),
                  email: z.string(),
                  status: z.boolean(),
                }),
              }),
            ),
          },
        },
      },
      404: {
        description: "Admin user not found",
      },
    },
  }),
  zValidator("param", userIdParamSchema, validationHook),
  zValidator("json", updateAdminStatusSchema, validationHook),
  async (c) => {
    const userId = parseInt(c.req.param("id"));
    const { status } = c.req.valid("json");

    // Check if user exists and is an admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user || user.role.code !== Role.Admin) {
      throw new NotFoundError("Admin user not found");
    }

    // Update admin status
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { status },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
      },
    });

    return c.json(successResponse(updatedUser), 200);
  },
);

// Change password (authenticated user changes their own password)
userRoutes.put(
  "/password",
  authenticate,
  describeRoute({
    tags: ["User"],
    summary: "Change user password",
    description: "Change the authenticated user's password. Requires current password verification.",
    responses: {
      200: {
        description: "Password changed successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                message: z.string(),
              }),
            ),
          },
        },
      },
      400: {
        description: "Invalid request or incorrect current password",
      },
      401: {
        description: "Authentication required",
      },
    },
  }),
  zValidator("json", changePasswordSchema, validationHook),
  async (c) => {
    const authUser = c.get("user");
    const { currentPassword, newPassword } = c.req.valid("json");

    // Get user with password from database
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Verify current password
    const isValidPassword = await Bun.password.verify(
      currentPassword,
      user.password
    );

    if (!isValidPassword) {
      throw new AppError("Current password is incorrect", 400, "INCORRECT_CURRENTPASSWORD");
    }

    // Hash new password using Bun
    const hashedPassword = await Bun.password.hash(newPassword, {
      algorithm: "bcrypt",
      cost: 10,
    });

    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return c.json({
      success: true,
      message: "Password changed successfully",
    });
  },
);

// Reset password by token
userRoutes.put(
  "/reset-password",
  describeRoute({
    tags: ["User"],
    summary: "Reset password using token",
    description: `Reset password using a valid session token. The token should be the user's session token.

**Request Body:**
- token: Session token (required)
- newPassword: New password (required, min 8 characters)

**Example:**
\`\`\`bash
curl -X PUT \\
  -H "Content-Type: application/json" \\
  -d '{"token": "your-session-token", "newPassword": "NewPassword123!"}' \\
  http://localhost:3000/api/v1/user/reset-password
\`\`\``,
    responses: {
      200: {
        description: "Password reset successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                message: z.string(),
              }),
            ),
          },
        },
      },
      400: {
        description: "Invalid request or token",
      },
      401: {
        description: "Invalid or expired token",
      },
      404: {
        description: "Session not found",
      },
    },
  }),
  zValidator("json", resetPasswordSchema, validationHook),
  async (c) => {
    const { token, newPassword } = c.req.valid("json");

    // Find PasswordResetToken by token (with user relation)
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: {
        token,
      },
      include: {
        user: true,
      },
    });

    if (!resetToken) {
      throw new UnauthorizedError("Invalid or expired token");
    }

    // Validate token hasn't been used
    if (resetToken.isUsed) {
      throw new UnauthorizedError("Token has already been used");
    }

    // Validate token hasn't expired
    if (resetToken.expiresAt < new Date()) {
      throw new UnauthorizedError("Token has expired");
    }

    // Validate user is active
    if (!resetToken.user.status) {
      throw new UnauthorizedError("Account is inactive");
    }

    // Hash new password using Bun
    const hashedPassword = await Bun.password.hash(newPassword, {
      algorithm: "bcrypt",
      cost: 10,
    });

    // Use transaction for atomicity
    await prisma.$transaction([
      // Update user password and unlock if account was locked
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword, isLocked: false },
      }),
      // Reset failed login attempts (no-op if user is not a dealer)
      prisma.userDealer.updateMany({
        where: { userId: resetToken.userId },
        data: { failedLoginAttempts: 0 },
      }),
      // Mark token as used
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: {
          isUsed: true,
          usedAt: new Date(),
        },
      }),
      // Invalidate all user sessions (force re-login)
      prisma.userSession.updateMany({
        where: {
          userId: resetToken.userId,
          status: true,
        },
        data: {
          status: false,
        },
      }),
    ]);

    return c.json({
      success: true,
      message: "Password reset successfully. Please log in with your new password.",
    });
  },
);

// Send password change confirmation email (Admin and Dealer)
userRoutes.post(
  "/send-password-change-email",
  describeRoute({
    tags: ["User"],
    summary: "Send password change confirmation email",
    description: `Send a password change confirmation email to a user by their email address. Available for both Admin and Dealer users.

**Request Body:**
- email: User's email address (required)

**Email Content:**
- Contains a confirmation message asking if the user wants to change their password
- Includes a confirmation link (if actionUrl is provided in environment)

**Note:** The email template is located at \`src/templates/email/password_change_confirmation.html\``,
    responses: {
      200: {
        description: "Email sent successfully",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                success: z.literal(true),
                message: z.string(),
              }),
            ),
          },
        },
      },
      400: {
        description: "Invalid request",
      },
      401: {
        description: "Authentication required",
      },
      404: {
        description: "User not found",
      },
      500: {
        description: "Failed to send email",
      },
    },
  }),
  zValidator("json", sendPasswordChangeEmailSchema, validationHook),
  async (c) => {
    const { email } = c.req.valid("json");

    // Check if user exists by email
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });

    // If user not found, throw error
    if (!user) {
      throw new NotFoundError("No account found with this email address");
    }

    // If user inactive, throw error
    if (!user.status) {
      throw new NotFoundError("This account is inactive. Please contact support.");
    }

    // Invalidate old unused tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        isUsed: false,
      },
      data: {
        isUsed: true,
        usedAt: new Date(),
      },
    });

    // Generate new cryptographic token (30-minute expiry)
    const resetToken = generateToken();
    const expiresAt = dayjs().add(30, "minutes").toDate();

    // Create PasswordResetToken record
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: resetToken,
        expiresAt,
      },
    });

    // Prepare email data
    const userName = `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5174";
    const actionUrl = `${frontendUrl}/forgot-password?token=${resetToken}`;

    // Send email using the email facade (non-blocking, logs to database)
    try {
      await sendPasswordResetEmail({
        email: user.email,
        userName,
        actionUrl,
      });
    } catch (error) {
      // Log error but don't fail the request if email fails
      console.error("Failed to send password reset email:", error);
      // Email facade handles errors internally, so we can continue
    }

    // Return success message
    return c.json({
      success: true,
      message: "Password reset link has been sent to your email address",
    });
  },
);

export default userRoutes;
