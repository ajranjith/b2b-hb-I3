/**
 * Email Handlers - Central export point
 *
 * Add new email handlers here as they are created.
 */

export { orderConfirmationEmail, type OrderConfirmationData } from "./orderConfirmation";
export { BaseEmail } from "./baseEmail";
export * from "./emailHelpers";
