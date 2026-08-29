import nodemailer from "nodemailer";

export type SenderCreds = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
};

const transporterCache = new Map<string, nodemailer.Transporter>();

export function getTransporter(sender: SenderCreds): nodemailer.Transporter {
  const cacheKey = `${sender.smtpHost}:${sender.smtpPort}:${sender.smtpUser}`;
  const cached = transporterCache.get(cacheKey);
  if (cached) return cached;

  const transporter = nodemailer.createTransport({
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: false,
    auth: { user: sender.smtpUser, pass: sender.smtpPass },
  });
  transporterCache.set(cacheKey, transporter);
  return transporter;
}

export async function sendMail(
  sender: SenderCreds,
  opts: { to: string; subject: string; html: string }
) {
  const transporter = getTransporter(sender);
  const info = await transporter.sendMail({
    from: sender.smtpUser,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  // Ethereal gives back a preview URL — handy for the demo video.
  const previewUrl = nodemailer.getTestMessageUrl(info) || null;
  return { messageId: info.messageId, previewUrl };
}

/**
 * Creates a throwaway Ethereal test account if the caller didn't configure
 * real SMTP creds for a sender. Used by the seed script / "add sender" flow.
 */
export async function createEtherealAccount() {
  const account = await nodemailer.createTestAccount();
  return {
    smtpHost: account.smtp.host,
    smtpPort: account.smtp.port,
    smtpUser: account.user,
    smtpPass: account.pass,
  };
}
