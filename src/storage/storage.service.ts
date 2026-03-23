import { randomUUID } from 'node:crypto';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BLOG_TEMP_PREFIX } from '../blog/blog.constants';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(config: ConfigService) {
    const accountId = config.getOrThrow<string>('R2_ACCOUNT_ID');

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('R2_SECRET_ACCESS_KEY'),
      },
    });

    this.bucket = config.getOrThrow<string>('R2_BUCKET_NAME');
    this.publicUrl = config.getOrThrow<string>('R2_PUBLIC_URL');
  }

  getPublicUrl(): string {
    return this.publicUrl;
  }

  async upload(buffer: Buffer, filename: string, mimeType: string, prefix = ''): Promise<string> {
    const key = [prefix, `${randomUUID()}-${filename}`].filter(Boolean).join('/');

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        CacheControl: 'public, max-age=0, must-revalidate',
      }),
    );

    return `${this.publicUrl}/${key}`;
  }

  async move(sourceUrl: string, destKey: string): Promise<string> {
    const sourceKey = this.urlToKey(sourceUrl);
    if (!sourceKey) return sourceUrl;

    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destKey,
        MetadataDirective: 'REPLACE',
        CacheControl: 'public, max-age=0, must-revalidate',
      }),
    );

    // copy 성공 확인 후 원본 삭제
    await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: destKey }));
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: sourceKey }));

    return `${this.publicUrl}/${destKey}`;
  }

  async delete(url: string): Promise<void> {
    const key = this.urlToKey(url);
    if (!key) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async cleanupTempFiles(maxAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    let deleted = 0;

    let continuationToken: string | undefined;
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: `${BLOG_TEMP_PREFIX}/`,
          ContinuationToken: continuationToken,
        }),
      );

      const keysToDelete: { Key: string }[] = [];
      for (const obj of response.Contents ?? []) {
        if (obj.Key && obj.LastModified && obj.LastModified < cutoff) {
          keysToDelete.push({ Key: obj.Key });
        }
      }

      if (keysToDelete.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keysToDelete },
          }),
        );
        deleted += keysToDelete.length;
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    if (deleted > 0) this.logger.log(`Cleaned up ${deleted} temp files`);
    return deleted;
  }

  private urlToKey(url: string): string | null {
    const prefix = `${this.publicUrl}/`;
    if (!url.startsWith(prefix)) return null;
    return url.slice(prefix.length);
  }
}
