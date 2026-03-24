import { Injectable, Logger } from '@nestjs/common';

interface GeoResult {
  city: string | null;
  country: string | null;
}

interface IpApiResponse {
  status: string;
  city?: string;
  regionName?: string;
  countryCode?: string;
}

const CACHE_TTL = 24 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 5000;
const MIN_REQUEST_INTERVAL = 1400; // ip-api.com free: 45/min ≈ 1 req per 1.33s

@Injectable()
export class GeolocationService {
  private readonly logger = new Logger(GeolocationService.name);
  private readonly cache = new Map<string, { result: GeoResult; expiry: number }>();
  private lastRequestAt = 0;
  private pending: Promise<GeoResult> = Promise.resolve({ city: null, country: null });

  async lookup(ip: string): Promise<GeoResult> {
    if (!ip || ip === '127.0.0.1' || ip === '::1') {
      return { city: null, country: null };
    }

    const cached = this.cache.get(ip);
    if (cached && cached.expiry > Date.now()) {
      return cached.result;
    }

    if (cached) this.cache.delete(ip);

    return this.enqueue(ip);
  }

  private enqueue(ip: string): Promise<GeoResult> {
    const next = this.pending.then(() => this.throttledLookup(ip));
    this.pending = next.catch(() => ({ city: null, country: null }));
    return next;
  }

  private async throttledLookup(ip: string): Promise<GeoResult> {
    const recheck = this.cache.get(ip);
    if (recheck && recheck.expiry > Date.now()) return recheck.result;

    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < MIN_REQUEST_INTERVAL) {
      await new Promise(r => setTimeout(r, MIN_REQUEST_INTERVAL - elapsed));
    }

    try {
      this.lastRequestAt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(
        `http://ip-api.com/json/${ip}?fields=status,city,regionName,countryCode`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);

      const data = (await res.json()) as IpApiResponse;

      if (data.status !== 'success') {
        return { city: null, country: null };
      }

      const result: GeoResult = {
        city:
          data.regionName && data.city ? `${data.city}, ${data.regionName}` : (data.city ?? null),
        country: data.countryCode ?? null,
      };

      if (this.cache.size >= MAX_CACHE_SIZE) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
      }

      this.cache.set(ip, { result, expiry: Date.now() + CACHE_TTL });
      return result;
    } catch (err) {
      this.logger.warn(`Geolocation lookup failed for ${ip}: ${err}`);
      return { city: null, country: null };
    }
  }
}
