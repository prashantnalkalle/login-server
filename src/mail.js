const nodemailer = require('nodemailer');
const config = require('./config');

async function sendResetLink(email, token) {
  // The Angular reset page reads this one-time token from its query string.
  const resetUrl = new URL('/reset-password', config.APP_URL);
  resetUrl.searchParams.set('token', token);

  // Local development can use the printed link; production must send email.
  if (!config.SMTP_HOST) {
    if (config.NODE_ENV === 'production') {
      throw new Error('SMTP must be configured in production.');
    }

    console.info(`Password reset link for ${email}: ${resetUrl}`);
    return;
  }

  const mailer = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER
      ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
      : undefined
  });

  await mailer.sendMail({
    from: config.SMTP_FROM,
    to: email,
    subject: 'Reset your password',
    text: `Use this link within ${config.RESET_TOKEN_TTL_MINUTES} minutes: ${resetUrl}`
  });
}

module.exports = { sendResetLink };
