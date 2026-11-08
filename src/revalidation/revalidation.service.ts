import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type RevalidationType = 'blog' | 'portfolio';

// 공개 키다. 블로그가 `/<키>.txt` 로 서빙해야 IndexNow 가 소유를 인정한다(hyunwoo-dev apps/blog/public).
const INDEXNOW_KEY = '3a3687a65a431eb10cce7317627ac096';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

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

  async notifyIndexNow(slug: string): Promise<void> {
    const baseUrl = this.config.get<string>('BLOG_REVALIDATE_URL');
    if (!baseUrl) {
      this.logger.warn('BLOG_REVALIDATE_URL not configured, skipping IndexNow');
      return;
    }

    const { host, origin } = new URL(baseUrl);
    try {
      const response = await fetch(INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host,
          key: INDEXNOW_KEY,
          keyLocation: `${origin}/${INDEXNOW_KEY}.txt`,
          urlList: [`${origin}/blog/${slug}`],
        }),
      });

      if (!response.ok) {
        this.logger.warn(`IndexNow failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      this.logger.warn(`IndexNow request failed: ${(error as Error).message}`);
    }
  }
}
