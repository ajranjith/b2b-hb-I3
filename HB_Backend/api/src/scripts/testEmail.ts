import { emailService } from "@/services/emailService";
import { EMAIL_TEMPLATES, buildEmailVariables } from "@/utils/emailTemplates";

async function testEmailService() {
  console.log("Testing email service...\n");

  if (!emailService.isConfigured()) {
    console.error("❌ Email service is not configured. Please set SMTP environment variables.");
    process.exit(1);
  }

  const isConnected = await emailService.verifyConnection();

  if (!isConnected) {
    console.error("❌ Failed to connect to SMTP server.");
    process.exit(1);
  }

  console.log("✅ Successfully connected to SMTP server\n");

  const testEmail = process.env.TEST_EMAIL || "test@example.com";

  console.log(`Sending test email to: ${testEmail}\n`);

  const variables = buildEmailVariables({
    customerName: "Test User",
    message: "This is a test email from Hotbray to verify the email service setup is working correctly.",
    actionText: "Visit Dashboard",
    actionUrl: "https://hotbray.com/dashboard",
    year: new Date().getFullYear().toString(),
  });

  const sent = await emailService.sendTemplateEmail(
    testEmail,
    "Welcome to Hotbray - Test Email",
    EMAIL_TEMPLATES.WELCOME,
    variables
  );

  if (sent) {
    console.log("✅ Test email sent successfully!");
  } else {
    console.error("❌ Failed to send test email.");
    process.exit(1);
  }
}

testEmailService().catch((error) => {
  console.error("Error during email test:", error);
  process.exit(1);
});
