import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const EMAIL_TEMPLATES = {
  ORDER_CONFIRMATION: join(
    __dirname,
    "..",
    "templates",
    "email",
    "index.html"
  ),
  ORDER_CONFIRMATION_DEALER: join(
    __dirname,
    "..",
    "templates",
    "email",
    "order_confirmation_dealer",
    "index.html"
  ),
  WELCOME: join(
    __dirname,
    "..",
    "templates",
    "email",
    "welcome.html"
  ),
} as const;

export function getEmailTemplate(templateName: keyof typeof EMAIL_TEMPLATES): string {
  return EMAIL_TEMPLATES[templateName];
}

export interface BaseEmailVariables {
  customerName?: string;
  orderNumber?: string;
  date?: string;
  [key: string]: string | undefined;
}

export function buildEmailVariables(
  variables: Record<string, string | undefined>
): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(variables)) {
    sanitized[key] = value || "";
  }

  return sanitized;
}
