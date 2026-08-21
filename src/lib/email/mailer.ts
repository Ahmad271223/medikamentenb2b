import nodemailer from 'nodemailer';
import { env } from '@/lib/env';

// Mail abstraction: provider-neutral SMTP (works with SES/Postmark/Mailgun/…)
// when SMTP_URL is configured; otherwise a console mailer so development and
// tests never depend on an external service.

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  readonly name: string;
  send(mail: Mail): Promise<void>;
}

class ConsoleMailer implements Mailer {
  readonly name = 'console';
  async send(mail: Mail): Promise<void> {
    console.info(`[mail:console] to=${mail.to} subject=${JSON.stringify(mail.subject)}\n${mail.text}`);
  }
}

class SmtpMailer implements Mailer {
  readonly name = 'smtp';
  private transport;
  constructor(url: string) {
    this.transport = nodemailer.createTransport(url);
  }
  async send(mail: Mail): Promise<void> {
    await this.transport.sendMail({
      from: env().MAIL_FROM,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
  }
}

let cached: Mailer | null = null;

export function getMailer(): Mailer {
  if (cached) return cached;
  const smtpUrl = env().SMTP_URL;
  cached = smtpUrl ? new SmtpMailer(smtpUrl) : new ConsoleMailer();
  return cached;
}
