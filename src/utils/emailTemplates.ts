/**
 * Professional HTML Email Templates for K10 Football Academy & Analytics Platform
 * Matches the website Dark Mode & Neon Green (#00FF66) Aesthetic
 */

interface IEmailTemplateOptions {
  title: string;
  subtitle?: string;
  name: string;
  message: string;
  code?: string;
  codeLabel?: string;
  expiryMinutes?: number;
  actionUrl?: string;
  actionText?: string;
  footerNote?: string;
}

const LOGO_URL =
  'https://res.cloudinary.com/da1uxchgo/image/upload/v1789203555/avatars/lgslkuvuy28gwznlrlzr.png';

/**
 * Base Responsive Dark Mode HTML Wrapper matching K10 Football Website
 */
const renderBaseTemplate = (options: IEmailTemplateOptions): string => {
  const {
    title,
    subtitle = 'TRANSFORMING FOOTBALL ANALYTICS',
    name,
    message,
    code,
    codeLabel = 'YOUR VERIFICATION OTP',
    expiryMinutes = 5,
    actionUrl,
    actionText,
    footerNote = 'Security Warning: Never share this OTP with anyone. K10 staff will never ask for your verification code.',
  } = options;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #000000;
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      color: #E2E8F0;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #000000;
      padding: 40px 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #0A0A0A;
      border: 1px solid #1F2937;
      border-top: 4px solid #00FF66;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
    }
    .header {
      background-color: #000000;
      padding: 36px 24px 24px 24px;
      text-align: center;
      border-bottom: 1px solid #1F2937;
    }
    .logo-img {
      height: 58px;
      max-width: 250px;
      object-fit: contain;
      display: block;
      margin: 0 auto 8px auto;
    }
    .brand-subtitle {
      color: #00FF66;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 3px;
      text-transform: uppercase;
      margin-top: 8px;
    }
    .content {
      padding: 40px 36px;
      color: #D1D5DB;
      font-size: 15px;
      line-height: 1.7;
    }
    .greeting {
      font-size: 20px;
      font-weight: 700;
      color: #FFFFFF;
      margin-top: 0;
      margin-bottom: 18px;
    }
    .code-box {
      background-color: #000000;
      border: 2px dashed #00FF66;
      border-radius: 12px;
      padding: 28px 20px;
      text-align: center;
      margin: 32px 0;
      box-shadow: 0 0 25px rgba(0, 255, 102, 0.12);
    }
    .code-label {
      font-size: 12px;
      font-weight: 800;
      color: #9CA3AF;
      letter-spacing: 2.5px;
      margin-bottom: 10px;
      text-transform: uppercase;
    }
    .code-value {
      font-family: 'Courier New', Consolas, monospace;
      font-size: 42px;
      font-weight: 900;
      color: #00FF66;
      letter-spacing: 10px;
      margin: 10px 0;
      text-shadow: 0 0 15px rgba(0, 255, 102, 0.5);
    }
    .expiry-text {
      font-size: 13px;
      color: #00E676;
      font-weight: 600;
      margin-top: 10px;
    }
    .btn {
      display: inline-block;
      background-color: #00FF66;
      color: #000000 !important;
      text-decoration: none;
      font-weight: 800;
      font-size: 15px;
      padding: 14px 36px;
      border-radius: 8px;
      margin: 20px 0;
      letter-spacing: 0.5px;
      box-shadow: 0 4px 20px rgba(0, 255, 102, 0.4);
    }
    .divider {
      border: none;
      border-top: 1px solid #1F2937;
      margin: 32px 0;
    }
    .footer-note {
      font-size: 13px;
      color: #6B7280;
      line-height: 1.5;
    }
    .footer {
      background-color: #000000;
      padding: 28px 24px;
      text-align: center;
      color: #6B7280;
      font-size: 13px;
      border-top: 1px solid #1F2937;
    }
    .footer a {
      color: #00FF66;
      text-decoration: none;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
          <div class="container">
            <!-- Header with Seamless Black Background Matching Logo -->
            <div class="header">
              <img src="${LOGO_URL}" alt="K10 Football Analysis" class="logo-img" />
              <div class="brand-subtitle">${subtitle}</div>
            </div>

            <!-- Body Content -->
            <div class="content">
              <p class="greeting">Hello <span style="color: #00FF66;">${name}</span>,</p>
              <p>${message}</p>

              ${
                code
                  ? `
              <div class="code-box">
                <div class="code-label">${codeLabel}</div>
                <div class="code-value">${code}</div>
                <div class="expiry-text">⏰ Valid for ${expiryMinutes} minutes</div>
              </div>
              `
                  : ''
              }

              ${
                actionUrl && actionText
                  ? `
              <div style="text-align: center;">
                <a href="${actionUrl}" class="btn" target="_blank">${actionText}</a>
              </div>
              `
                  : ''
              }

              <hr class="divider" />
              <p class="footer-note">${footerNote}</p>
            </div>

            <!-- Footer -->
            <div class="footer">
              <p style="margin: 0 0 8px 0;">&copy; ${new Date().getFullYear()} K10 Football Academy Platform. All rights reserved.</p>
              <p style="margin: 0;">Need assistance? Contact <a href="mailto:support@k10football.com">support@k10football.com</a></p>
            </div>
          </div>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
  `.trim();
};

/**
 * OTP Verification Email Template
 */
export const getOtpVerificationEmailTemplate = (name: string, otp: string): string => {
  return renderBaseTemplate({
    title: 'Verify your K10 Football Academy Account',
    name,
    message:
      'Thank you for joining <b>K10 Football Academy</b>! Please enter the 6-digit verification code below to verify your email and activate your account.',
    code: otp,
    codeLabel: 'YOUR VERIFICATION OTP',
    expiryMinutes: 5,
    footerNote:
      'Security Warning: Never share this OTP with anyone. K10 staff will never ask for your verification code.',
  });
};

/**
 * Resend OTP Verification Email Template
 */
export const getResendOtpEmailTemplate = (name: string, otp: string): string => {
  return renderBaseTemplate({
    title: 'New Verification Code - K10 Football Academy',
    name,
    message:
      'You requested a new verification code for your <b>K10 Football Academy</b> account. Use the code below to complete your verification.',
    code: otp,
    codeLabel: 'NEW VERIFICATION CODE',
    expiryMinutes: 5,
    footerNote:
      'If you did not request a new OTP code, please check your account security immediately.',
  });
};

/**
 * Password Reset OTP Email Template
 */
export const getPasswordResetEmailTemplate = (name: string, otp: string): string => {
  return renderBaseTemplate({
    title: 'Password Reset Request - K10 Football Academy',
    name,
    message:
      'We received a request to reset your password for your <b>K10 Football Academy</b> account. Enter the authorization code below to proceed with resetting your password.',
    code: otp,
    codeLabel: 'PASSWORD RESET CODE',
    expiryMinutes: 10,
    footerNote:
      'If you did not request a password reset, please ignore this email. Your password will remain unchanged.',
  });
};

/**
 * Welcome Email Template (Sent after successful verification)
 */
export const getWelcomeEmailTemplate = (name: string, role: string): string => {
  return renderBaseTemplate({
    title: 'Welcome to K10 Football Academy!',
    name,
    message: `Congratulations! Your email has been verified and your account is now fully active as a <b>${role}</b>.<br><br>You can now log in to access your customized dashboard, build your player profile, submit match performance stats, and connect with top football academies.`,
    actionText: 'ACCESS DASHBOARD',
    actionUrl: 'https://k10football.com/login',
    footerNote: 'We are thrilled to have you in the K10 Football family!',
  });
};
