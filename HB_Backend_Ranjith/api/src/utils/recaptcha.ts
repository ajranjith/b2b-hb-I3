interface RecaptchaVerifyResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
  score?: number;
  action?: string;
}

/**
 * Verify Google reCAPTCHA token
 * @param token - The reCAPTCHA token from the frontend
 * @returns Promise<boolean> - True if verification successful
 */
export async function verifyRecaptcha(token: string,vissibleRecaptcha?:boolean): Promise<boolean> {
  const RECAPTCHA_SECRET_KEY=process.env.RECAPTCHA_SECRET_KEY;
  const RECAPTCHA_SECRET_KEY_V2=process.env.RECAPTCHA_SECRET_KEY_V2;

  const secretKey = vissibleRecaptcha?RECAPTCHA_SECRET_KEY_V2:RECAPTCHA_SECRET_KEY;
  if (!secretKey) {
    console.error('[reCAPTCHA] Secret key not configured');
    return false;
  }

  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `secret=${secretKey}&response=${token}`,
    });

    const data: RecaptchaVerifyResponse = await response.json();
    
    if (!data.success) {
      console.error('[reCAPTCHA] Verification failed:', data['error-codes']);
      return false;
    }

    // For invisible reCAPTCHA v2, we just check success
    // For v3, you might want to check the score as well
    return data.success;
  } catch (error) {
    console.error('[reCAPTCHA] Verification error:', error);
    return false;
  }
}
