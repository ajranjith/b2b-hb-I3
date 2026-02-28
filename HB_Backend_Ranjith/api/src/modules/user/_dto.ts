import { z } from "zod";
import { DealerTier, DealerAccountStatus } from "../../../generated/prisma";

// Password validation regex
// - At least one lowercase letter
// - At least one uppercase letter
// - At least one special character
// - Between 8 and 20 characters
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,20}$/;
const passwordValidation = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(20, "Password must be at most 20 characters")
  .regex(
    passwordRegex,
    "Password must contain at least one lowercase letter, one uppercase letter, and one special character"
  );

export const userIdParamSchema = z.object({
  id: z.coerce.number().int().positive("User ID must be a positive integer"),
});

export const createAdminSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.string().email("Invalid email address"),
  password: passwordValidation.optional(),
  profileImage: z.string().url("Profile image must be a valid URL").optional().nullable(),
});

export type CreateAdminInput = z.infer<typeof createAdminSchema>;

export const createDealerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.string().email("Invalid email address"),
  accountNumber: z.number().int().positive("Account number must be positive").max(2147483647, "Account Number is not Valid"),
  companyName: z.string().min(1, "Company name is required"),
  genuinePartsTier: z.nativeEnum(DealerTier),
  aftermarketESTier: z.nativeEnum(DealerTier),
  aftermarketBTier: z.nativeEnum(DealerTier),
  defaultShippingMethod: z
    .number()
    .int()
    .positive("Shipping method must be positive")
    .optional(),
  notes: z.string().optional(),
  profileImage: z.string().url("Profile image must be a valid URL").optional().nullable(),
});

export type CreateDealerInput = z.infer<typeof createDealerSchema>;

export const updateDealerSchema = z.object({
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().optional(),
  email: z.string().email("Invalid email address"),
  accountNumber: z.number().int().positive("Account number must be positive").max(2147483647, "Account number is not valid"),
  companyName: z.string().min(1, "Company name is required").optional(),
  genuinePartsTier: z.nativeEnum(DealerTier).optional(),
  aftermarketESTier: z.nativeEnum(DealerTier).optional(),
  aftermarketBTier: z.nativeEnum(DealerTier).optional(),
  notes: z.string().optional(),
});

export type UpdateDealerInput = z.infer<typeof updateDealerSchema>;

export const updateDealerByDealerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.string().email("Invalid email address"),
  accountNumber: z.number().int().positive("Account number must be positive").max(2147483647, "Account number is not valid"),
  companyName: z.string().min(1, "Company name is required"),
  genuinePartsTier: z.nativeEnum(DealerTier),
  aftermarketESTier: z.nativeEnum(DealerTier),
  aftermarketBTier: z.nativeEnum(DealerTier),
  defaultShippingMethod: z
    .number()
    .int()
    .positive("Shipping method must be positive")
    .optional(),
  notes: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: passwordValidation.optional(),
  profileImage: z.string().url("Profile image must be a valid URL").optional().nullable(),
}).refine(
  (data) => {
    // If newPassword is provided, currentPassword must also be provided
    if (data.newPassword && !data.currentPassword) {
      return false;
    }
    // If currentPassword is provided, newPassword must also be provided
    if (data.currentPassword && !data.newPassword) {
      return false;
    }
    return true;
  },
  {
    message: "Both currentPassword and newPassword must be provided together",
    path: ["currentPassword"],
  }
);

export type UpdateDealerByDealerInput = z.infer<typeof updateDealerByDealerSchema>;

export const listDealersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  accountStatus: z.nativeEnum(DealerAccountStatus).optional(),
});

export type ListDealersQuery = z.infer<typeof listDealersQuerySchema>;

export const updateDealerStatusSchema = z.object({
  accountStatus: z.nativeEnum(DealerAccountStatus),
});

export type UpdateDealerStatusInput = z.infer<typeof updateDealerStatusSchema>;

export const listAdminsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  status: z.coerce.boolean().optional(),
});

export type ListAdminsQuery = z.infer<typeof listAdminsQuerySchema>;

export const updateAdminStatusSchema = z.object({
  status: z.boolean(),
});

export type UpdateAdminStatusInput = z.infer<typeof updateAdminStatusSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "Current password is required"),
  newPassword: passwordValidation,
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  newPassword: passwordValidation,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const sendPasswordChangeEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export type SendPasswordChangeEmailInput = z.infer<typeof sendPasswordChangeEmailSchema>;
