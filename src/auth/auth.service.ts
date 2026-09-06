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

  // 로그아웃은 미리보기 토큰을 건드리지 않는다.
  //
  // 예전에는 여기서 revokeAllPreviewTokens() 를 불렀다. 어드민만 발급하던 시절에는
  // 말이 됐지만, 지금은 무인 발행 파이프라인도 발급한다 — 사람이 로그아웃할 때마다
  // 파이프라인이 만든 승인 링크가 죽으면 안 된다. 미리보기 토큰은 어드민 세션과
  // 수명이 무관하고, slug 에 묶여 미발행 글 하나만 여는 별개의 자격이다.
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
  }

  async logoutAll(username: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { username } });
  }

  /**
   * 만료된 토큰을 치운다. 리프레시 토큰과 미리보기 토큰 **둘 다** 본다 —
   * 미리보기 토큰은 개수 상한이 없으므로 이 정리가 유일한 회수 경로다.
   */
  async cleanupExpiredTokens(): Promise<number> {
    const [refresh, preview] = await Promise.all([
      this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      this.cleanupPreviewTokens(),
    ]);
    return refresh.count + preview;
  }

  // ─── Preview Token ────────────────────────────────────────────────────────

  private static readonly PREVIEW_TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24시간

  /**
   * 미리보기 토큰을 발급한다.
   *
   * slug 에 묶는 이유: 예전에는 만료시각만 저장해 한 번 발급된 토큰으로 **모든**
   * 비공개 글을 열 수 있었다. 토큰이 새면 피해가 그 글 하나로 그치게 한다.
   *
   * DB 에 저장하는 이유: 예전에는 프로세스 메모리(Map)라 **배포·재시작마다 전부
   * 사라졌다.** 파이프라인이 초안을 올리고 사람이 다음 날 승인하는 흐름에서는
   * 그 사이 배포가 한 번만 있어도 링크가 죽는다.
   *
   * 개수 상한을 두지 않는다. 예전의 MAX 10 + FIFO 축출은 `keys().next().value` 로
   * **가장 먼저 삽입된 것**을 버려서, 초안이 쌓이면 아직 몇 시간 남은 토큰이 방금
   * 만든 것 때문에 밀려났다. 만료분은 cleanupExpiredTokens 가 치운다.
   */
  async createPreviewToken(slug: string): Promise<{ token: string; expiresIn: number }> {
    const token = randomBytes(32).toString('hex');
    const ttl = AuthService.PREVIEW_TOKEN_TTL_SECONDS;

    await this.prisma.previewToken.create({
      data: { token, slug, expiresAt: new Date(Date.now() + ttl * 1000) },
    });

    // TTL 에서 유도한다. 예전에는 1800 이 하드코딩돼 있어 상수를 고쳐도 응답값이
    // 30분 그대로였다 — 파이프라인이 그 값으로 만료 시각을 안내하면 거짓말이 된다.
    return { token, expiresIn: ttl };
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

  /**
   * `slug` 를 넘기면 그 글에 대해 발급된 토큰인지까지 확인한다.
   * 넘기지 않으면 유효성(존재·만료)만 본다 — 어드민의 토큰 상태 확인용이다.
   */
  async verifyPreviewToken(token: string, slug?: string): Promise<boolean> {
    if (!token) return false;

    const entry = await this.prisma.previewToken.findUnique({ where: { token } });
    if (!entry) return false;

    // Date.now() 로 읽는다 — new Date() 를 쓰면 테스트가 시계를 못 옮겨
    // 만료 검사가 사실상 검증되지 않는다(실제로 그래서 한 번 놓쳤다).
    if (entry.expiresAt.getTime() < Date.now()) {
      await this.prisma.previewToken.delete({ where: { token } }).catch(() => undefined); // 동시 요청이 이미 지웠을 수 있다
      return false;
    }

    if (slug !== undefined && entry.slug !== slug) return false;
    return true;
  }

  private async cleanupPreviewTokens(): Promise<number> {
    const result = await this.prisma.previewToken.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now()) } },
    });
    return result.count;
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
