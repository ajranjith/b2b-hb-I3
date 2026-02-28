# SMTP Authentication Troubleshooting

## Current Issue

Getting error: `SmtpClientAuthentication is disabled for the Tenant`

Even though:
- ✅ SMTP AUTH enabled at organization level
- ✅ SMTP AUTH enabled for mailbox
- ✅ Using app password
- ✅ Waited 24+ hours for propagation

## Things to Try

### 1. Try Alternative SMTP Server

Your POP/IMAP settings use `outlook.office365.com`, try this for SMTP too:

```env
SMTP_HOST=outlook.office365.com  # Instead of smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
```

### 2. Try Port 25 (Legacy)

Some organizations only allow SMTP on port 25:

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=25
SMTP_SECURE=false
```

### 3. Check Conditional Access Policies

Even with SMTP enabled, Conditional Access might block it:

**Azure Portal → Azure AD → Security → Conditional Access**

Look for policies blocking:
- "Exchange ActiveSync clients"
- "Other clients"
- Legacy authentication

### 4. Verify SMTP AUTH Status

Run this PowerShell to triple-check:

```powershell
Connect-ExchangeOnline

# Check tenant level
Get-TransportConfig | Select SmtpClientAuthenticationDisabled

# Check your mailbox
Get-CASMailbox -Identity "ajith@dgstechlimited.com" | fl *Smtp*

# Check if there are any authentication policies
Get-AuthenticationPolicy | fl

# Check your mailbox authentication policy
Get-CASMailbox -Identity "ajith@dgstechlimited.com" | Select AuthenticationPolicy
```

### 5. Enable Per-User SMTP AUTH

Try enabling SMTP AUTH specifically for your mailbox:

```powershell
Set-CASMailbox -Identity "ajith@dgstechlimited.com" -SmtpClientAuthenticationDisabled $false

# Force it again
Set-CASMailbox -Identity "ajith@dgstechlimited.com" -SmtpClientAuthenticationDisabled $false -Confirm:$false

# Verify
Get-CASMailbox -Identity "ajith@dgstechlimited.com" | Select SmtpClientAuthenticationDisabled
```

### 6. Check Exchange Online Protection

Check if Exchange Online Protection is blocking:

```powershell
Get-HostedOutboundSpamFilterPolicy | fl *Smtp*
```

### 7. Check for Authentication Policy

```powershell
# See all authentication policies
Get-AuthenticationPolicy

# Check what's assigned to your mailbox
Get-User "ajith@dgstechlimited.com" | Select AuthenticationPolicy

# If there's a policy, check its settings
Get-AuthenticationPolicy -Identity "PolicyName" | fl
```

## Alternative Solutions

### Option A: Use Different SMTP Provider

**Easiest:** Use a service that doesn't have these restrictions

#### Resend (Recommended)
```bash
bun add resend
```

```env
RESEND_API_KEY=re_xxxxx
```

#### SendGrid
```bash
bun add @sendgrid/mail
```

```env
SENDGRID_API_KEY=SG.xxxxx
```

#### Gmail
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASSWORD=app-password
```

### Option B: Microsoft Graph API with OAuth2

**Best for production:** More secure, no SMTP AUTH issues

Requires:
1. Azure App Registration
2. Client ID and Client Secret
3. OAuth2 authentication flow

Would you like me to implement this?

## Quick Decision Tree

```
Can you contact your IT admin?
├─ Yes → Ask them to:
│         1. Enable SMTP AUTH at tenant level
│         2. Enable SMTP AUTH for your mailbox
│         3. Check Conditional Access policies
│         4. Check Authentication policies
│
└─ No → Use alternative:
          1. Resend (easiest)
          2. SendGrid
          3. Gmail
          4. Graph API (best for production)
```

## Next Steps

1. **Try alternative SMTP server:**
   ```bash
   # Update .env
   SMTP_HOST=outlook.office365.com

   # Test
   bun run test:smtp
   ```

2. **If still failing, run PowerShell diagnostics above**

3. **If all else fails, switch to Resend or Graph API**

Let me know which approach you want to take!
