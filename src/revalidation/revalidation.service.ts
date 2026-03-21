import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type RevalidationType = 'blog' | 'portfolio';

@Injectable()
export class RevalidationService {
  private readonly logger = new Logger(RevalidationService.name);

  constructor(private readonly config: ConfigService) {}

  async trigger(type: RevalidationType, slug?: string): Promise<void> {
    const urlKey = type === 'blog' ? 'BLOG_REVALIDATE_URL' : 'PORTFOLIO_REVALIDATE_URL';
    const baseUrl = this.config.get<string>(urlKey);

    if (!baseUrl) {
      this.logger.warn(`${urlKey} not configured, skipping revalidation`);
      return;
    }

    const secret = this.config.get<string>('REVALIDATE_SECRET');
    if (!secret) {
      this.logger.warn('REVALIDATE_SECRET not configured, skipping revalidation');
      return;
    }

    try {
      const response = await fetch(`${baseUrl}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, type, ...(slug && { slug }) }),
      });

      if (!response.ok) {
        this.logger.warn(`Revalidation failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      this.logger.warn(`Revalidation request failed: ${(error as Error).message}`);
    }
  }
}
