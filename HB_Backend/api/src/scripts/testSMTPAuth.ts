import nodemailer from "nodemailer";

/**
 * Test SMTP Authentication
 *
 * This script tests if your SMTP credentials work
 */
async function testSMTPAuth() {
  console.log("🔧 Testing SMTP Authentication...\n");

  const config = {
    host: process.env.SMTP_HOST || "smtp.office365.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,
    },
  };

  console.log("📋 Configuration:");
  console.log(`   Host: ${config.host}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   Secure: ${config.secure}`);
  console.log(`   User: ${config.auth.user}`);
  console.log(`   Password: ${config.auth.pass ? "***" + config.auth.pass.slice(-4) : "NOT SET"}`);
  console.log();

  if (!config.auth.user || !config.auth.pass) {
    console.error("❌ SMTP_USER or SMTP_PASSWORD not set in .env");
    process.exit(1);
  }

  try {
    console.log("🔌 Creating transporter...");
    const transporter = nodemailer.createTransport(config);

    console.log("✅ Transporter created");
    console.log();

    console.log("🔍 Verifying connection...");
    await transporter.verify();

    console.log("✅ SMTP connection verified successfully!");
    console.log();
    console.log("🎉 Your SMTP credentials are working!");
    console.log();
    console.log("You can now send emails. Try:");
    console.log("  bun run test:email");

  } catch (error: any) {
    console.error("❌ SMTP verification failed\n");
    console.error("Error details:");
    console.error(`   Code: ${error.code}`);
    console.error(`   Response: ${error.response}`);
    console.error(`   Message: ${error.message}`);
    console.log();

    // Provide specific troubleshooting based on error
    if (error.code === "EAUTH" || error.responseCode === 535) {
      console.log("🔧 Troubleshooting Authentication Error:");
      console.log();

      if (error.response?.includes("SmtpClientAuthentication is disabled")) {
        console.log("❌ SMTP AUTH is DISABLED for your tenant");
        console.log();
        console.log("Solutions:");
        console.log("1. Enable SMTP AUTH in Microsoft 365 Admin Center");
        console.log("   → Settings → Org settings → Modern authentication");
        console.log();
        console.log("2. Enable for your mailbox via PowerShell:");
        console.log("   Set-CASMailbox -Identity \"ajith@dgstechlimited.com\" -SmtpClientAuthenticationDisabled $false");
        console.log();
        console.log("3. Wait 15-30 minutes for changes to propagate");
        console.log();
        console.log("4. If you have 2FA enabled, use an App Password instead");
        console.log("   Generate at: https://account.microsoft.com/security");
      } else {
        console.log("❌ Authentication failed - Invalid credentials");
        console.log();
        console.log("Checklist:");
        console.log("✓ Is SMTP_USER correct? (current: " + config.auth.user + ")");
        console.log("✓ Is SMTP_PASSWORD correct?");
        console.log("✓ Do you have 2FA enabled? Use App Password if yes");
        console.log("✓ Did you enable SMTP AUTH for this mailbox?");
        console.log();
        console.log("PowerShell command to check:");
        console.log(`  Get-CASMailbox -Identity "${config.auth.user}" | Select SmtpClientAuthenticationDisabled`);
      }
    } else if (error.code === "ETIMEDOUT" || error.code === "ECONNREFUSED") {
      console.log("🔧 Troubleshooting Connection Error:");
      console.log();
      console.log("✓ Check if SMTP_HOST is correct (current: " + config.host + ")");
      console.log("✓ Check if SMTP_PORT is correct (current: " + config.port + ")");
      console.log("✓ Check if your firewall allows outbound connections on port " + config.port);
      console.log("✓ Try SMTP_PORT=25 if 587 doesn't work");
    }

    process.exit(1);
  }
}

testSMTPAuth().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
