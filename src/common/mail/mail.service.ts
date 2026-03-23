import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly adminEmail: string | undefined;

  constructor(config: ConfigService) {
    const smtpUser = config.get<string>('SMTP_USER');
    const smtpPass = config.get<string>('SMTP_PASS');
    this.adminEmail = config.get<string>('ADMIN_EMAIL');

    if (smtpUser && smtpPass) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: smtpUser, pass: smtpPass },
      });
      this.logger.log('Mail service initialized');
    } else {
      this.transporter = null;
      this.logger.warn('SMTP not configured — mail service disabled');
    }
  }

  async sendContactNotification(contact: {
    name: string;
    email: string;
    subject?: string | null;
    message: string;
  }): Promise<void> {
    if (!this.transporter || !this.adminEmail) return;

    try {
      await this.transporter.sendMail({
        from: `"chahyunwoo.dev" <${this.adminEmail}>`,
        to: this.adminEmail,
        replyTo: contact.email,
        subject: `[Portfolio Contact] ${contact.subject || 'New Message'} — ${contact.name}`,
        html: `
          <h3>New contact from portfolio</h3>
          <p><strong>Name:</strong> ${this.escapeHtml(contact.name)}</p>
          <p><strong>Email:</strong> ${this.escapeHtml(contact.email)}</p>
          <p><strong>Subject:</strong> ${this.escapeHtml(contact.subject || '-')}</p>
          <hr/>
          <p>${this.escapeHtml(contact.message).replace(/\n/g, '<br/>')}</p>
        `,
      });
      this.logger.log(`Contact notification sent for ${contact.name}`);
    } catch (error) {
      this.logger.error('Failed to send contact notification', error);
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
