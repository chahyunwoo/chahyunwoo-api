import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_TOKEN_JWT_EXPIRES, REFRESH_TOKEN_EXPIRES_DAYS } from './auth.constants';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {
    const jwtSecret = config.getOrThrow<string>('JWT_SECRET');
    this.encryptionKey = createHash('sha256').update(jwtSecret).digest();
  }

  private static readonly TOTP_ACTIVE_KEY = 'totp_secret';
  private static readonly TOTP_PENDING_KEY = 'totp_secret_pending';
  private readonly twoFactorTokens = new Map<
    string,
    { username: string; expiresAt: number; attempts: number }
  >();
  private static readonly TWO_FACTOR_TOKEN_TTL = 5 * 60 * 1000; // 5 minutes
  private static readonly MAX_2FA_ATTEMPTS = 5;
  private static readonly MAX_2FA_TOKENS = 10;

  async login(username: string, password: string, ipAddress?: string) {
    const adminUsername = this.config.getOrThrow<string>('ADMIN_USERNAME');
    const adminPasswordHash = this.config.getOrThrow<string>('ADMIN_PASSWORD_HASH');

    if (username !== adminUsername) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const isValid = await bcrypt.compare(password, adminPasswordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const totpSecret = await this.getActiveTotpSecret();
    if (totpSecret) {
      this.cleanup2faTokens();
      if (this.twoFactorTokens.size >= AuthService.MAX_2FA_TOKENS) {
        const oldest = this.twoFactorTokens.keys().next().value;
        if (oldest) this.twoFactorTokens.delete(oldest);
      }

      const token = randomBytes(32).toString('hex');
      this.twoFactorTokens.set(token, {
        username,
        expiresAt: Date.now() + AuthService.TWO_FACTOR_TOKEN_TTL,
        attempts: 0,
      });
      return { requiresTwoFactor: true, twoFactorToken: token };
    }

    const accessToken = this.generateAccessToken(username);
    const refreshToken = await this.createRefreshToken(username, ipAddress);

    return { accessToken, refreshToken };
  }

  async verifyTwoFactor(twoFactorToken: string, code: string, ipAddress?: string) {
    const pending = this.twoFactorTokens.get(twoFactorToken);
    if (!pending || pending.expiresAt < Date.now()) {
      this.twoFactorTokens.delete(twoFactorToken);
      throw new UnauthorizedException('Invalid or expired two-factor token');
    }

    if (pending.attempts >= AuthService.MAX_2FA_ATTEMPTS) {
      this.twoFactorTokens.delete(twoFactorToken);
      throw new UnauthorizedException('Too many failed attempts');
    }

    const totpSecret = await this.getActiveTotpSecret();
    if (!totpSecret) throw new UnauthorizedException('2FA is not configured');

    const isCodeValid = verifySync({ token: code, secret: totpSecret });
    if (!isCodeValid) {
      pending.attempts++;
      throw new UnauthorizedException('Invalid two-factor code');
    }

    this.twoFactorTokens.delete(twoFactorToken);

    const accessToken = this.generateAccessToken(pending.username);
    const refreshToken = await this.createRefreshToken(pending.username, ipAddress);

    return { accessToken, refreshToken };
  }

  async setupTwoFactor() {
    const existing = await this.getActiveTotpSecret();
    if (existing) {
      return { configured: true, message: '2FA is already configured' };
    }

    const secret = generateSecret();
    const adminUsername = this.config.getOrThrow<string>('ADMIN_USERNAME');
    const uri = generateURI({ secret, label: adminUsername, issuer: 'chahyunwoo.dev' });
    const qrCode = await QRCode.toDataURL(uri);

    // pending에 저장 (enable에서 확정)
    await this.prisma.adminSetting.upsert({
      where: { key: AuthService.TOTP_PENDING_KEY },
      create: { key: AuthService.TOTP_PENDING_KEY, value: this.encrypt(secret) },
      update: { value: this.encrypt(secret) },
    });

    return { qrCode, uri };
  }

  async enableTwoFactor(code: string) {
    // pending secret으로 코드 검증
    const pendingSetting = await this.prisma.adminSetting.findUnique({
      where: { key: AuthService.TOTP_PENDING_KEY },
    });
    const pendingSecret = pendingSetting?.value ? this.decrypt(pendingSetting.value) : null;

    if (!pendingSecret) {
      throw new UnauthorizedException('No pending 2FA setup. Call /2fa/setup first.');
    }

    const isValid = verifySync({ token: code, secret: pendingSecret });
    if (!isValid) {
      throw new UnauthorizedException('Invalid code');
    }

    // pending → active로 승격
    await this.prisma.$transaction([
      this.prisma.adminSetting.upsert({
        where: { key: AuthService.TOTP_ACTIVE_KEY },
        create: { key: AuthService.TOTP_ACTIVE_KEY, value: this.encrypt(pendingSecret) },
        update: { value: this.encrypt(pendingSecret) },
      }),
      this.prisma.adminSetting.delete({ where: { key: AuthService.TOTP_PENDING_KEY } }),
    ]);

    return { enabled: true };
  }

  async disableTwoFactor(code: string) {
    const secret = await this.getActiveTotpSecret();
    if (!secret) {
      return { enabled: false, message: '2FA is not enabled' };
    }

    const isValid = verifySync({ token: code, secret });
    if (!isValid) {
      throw new UnauthorizedException('Invalid code');
    }

    await this.prisma.adminSetting
      .delete({
        where: { key: AuthService.TOTP_ACTIVE_KEY },
      })
      .catch(() => {});

    return { enabled: false };
  }

  async getTwoFactorStatus() {
    const secret = await this.getActiveTotpSecret();
    return { enabled: !!secret };
  }

  // ─── 2FA Private ───────────────────────────────────────────────────────────

  private async getActiveTotpSecret(): Promise<string | null> {
    const setting = await this.prisma.adminSetting.findUnique({
      where: { key: AuthService.TOTP_ACTIVE_KEY },
    });
    if (!setting?.value) return null;
    try {
      return this.decrypt(setting.value);
    } catch {
      this.logger.error('Failed to decrypt TOTP secret');
      return null;
    }
  }

  private encrypt(text: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(data: string): string {
    const [ivHex, tagHex, encryptedHex] = data.split(':');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encryptedHex, 'hex')) + decipher.final('utf8');
  }

  private cleanup2faTokens(): void {
    const now = Date.now();
    for (const [token, entry] of this.twoFactorTokens) {
      if (entry.expiresAt < now) this.twoFactorTokens.delete(token);
    }
  }

  async refresh(refreshToken: string, ipAddress?: string) {
    const tokenHash = this.hashToken(refreshToken);

    // 트랜잭션으로 조회+삭제를 원자적으로 처리 (TOCTOU 방지)
    const stored = await this.prisma.$transaction(async tx => {
      const token = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!token) return null;
      await tx.refreshToken.delete({ where: { id: token.id } });
      return token;
    });

    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (stored.ipAddress && stored.ipAddress !== ipAddress) {
      this.logger.warn(
        `IP change detected for ${stored.username}: ${stored.ipAddress} → ${ipAddress}`,
      );
    }

    const accessToken = this.generateAccessToken(stored.username);
    const newRefreshToken = await this.createRefreshToken(stored.username, ipAddress);

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
    this.revokeAllPreviewTokens();
  }

  async logoutAll(username: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { username } });
    this.revokeAllPreviewTokens();
  }

  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }

  // ─── Preview Token ────────────────────────────────────────────────────────

  private readonly previewTokens = new Map<string, number>();
  private static readonly PREVIEW_TOKEN_TTL = 30 * 60 * 1000; // 30 minutes
  private static readonly MAX_PREVIEW_TOKENS = 10;

  createPreviewToken(): { token: string; expiresIn: number } {
    this.cleanupPreviewTokens();

    if (this.previewTokens.size >= AuthService.MAX_PREVIEW_TOKENS) {
      const oldest = this.previewTokens.keys().next().value;
      if (oldest) this.previewTokens.delete(oldest);
    }

    const token = randomBytes(32).toString('hex');
    this.previewTokens.set(token, Date.now() + AuthService.PREVIEW_TOKEN_TTL);

    return { token, expiresIn: 1800 };
  }

  isAuthenticated(token?: string): boolean {
    if (!token) return false;
    try {
      this.jwtService.verify(token);
      return true;
    } catch {
      return false;
    }
  }

  verifyPreviewToken(token: string): boolean {
    const expiresAt = this.previewTokens.get(token);
    if (!expiresAt || expiresAt < Date.now()) {
      this.previewTokens.delete(token);
      return false;
    }
    return true;
  }

  private revokeAllPreviewTokens(): void {
    this.previewTokens.clear();
  }

  private cleanupPreviewTokens(): void {
    const now = Date.now();
    for (const [token, expiresAt] of this.previewTokens) {
      if (expiresAt < now) this.previewTokens.delete(token);
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private generateAccessToken(username: string): string {
    return this.jwtService.sign({ sub: username }, { expiresIn: ACCESS_TOKEN_JWT_EXPIRES });
  }

  private async createRefreshToken(username: string, ipAddress?: string): Promise<string> {
    const token = randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(token);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    await this.prisma.refreshToken.create({
      data: { tokenHash, username, ipAddress: ipAddress ?? null, expiresAt },
    });

    return token;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
