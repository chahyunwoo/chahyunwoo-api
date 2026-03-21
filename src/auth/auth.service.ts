import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_TOKEN_JWT_EXPIRES, REFRESH_TOKEN_EXPIRES_DAYS } from './auth.constants';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

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

    const accessToken = this.generateAccessToken(username);
    const refreshToken = await this.createRefreshToken(username, ipAddress);

    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string, ipAddress?: string) {
    const tokenHash = this.hashToken(refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (stored.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      throw new UnauthorizedException('Refresh token expired');
    }

    // IP 변경 감지 → 로그 남기고 새 IP로 갱신
    if (stored.ipAddress && stored.ipAddress !== ipAddress) {
      this.logger.warn(
        `IP change detected for ${stored.username}: ${stored.ipAddress} → ${ipAddress}`,
      );
    }

    // Token Rotation: 기존 폐기 + 새 발급
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

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

  verifyPreviewToken(token: string): boolean {
    const expiresAt = this.previewTokens.get(token);
    if (!expiresAt || expiresAt < Date.now()) {
      this.previewTokens.delete(token);
      return false;
    }
    return true;
  }

  revokeAllPreviewTokens(): void {
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
