export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
}

export class NamespacedCache {
  private readonly trackedKeys = new Set<string>();

  constructor(
    private readonly cache: CacheStore,
    private readonly prefix: string,
  ) {}

  key(name: string): string {
    return `${this.prefix}:${name}`;
  }

  async get<T>(name: string): Promise<T | undefined> {
    return this.cache.get<T>(this.key(name));
  }

  async set<T>(name: string, value: T, ttl?: number): Promise<void> {
    const k = this.key(name);
    this.trackedKeys.add(k);
    await this.cache.set(k, value, ttl);
  }

  async invalidate(): Promise<void> {
    const keys = [...this.trackedKeys];
    this.trackedKeys.clear();
    await Promise.all(keys.map(k => this.cache.del(k)));
  }
}
