import { ApiProperty } from '@nestjs/swagger';

/**
 * auth 도메인의 응답 스키마.
 *
 * **토큰은 응답 본문이 아니라 쿠키로 나간다.** 컨트롤러가 `setTokenCookies()`로
 * `access_token`/`refresh_token`/`session_timeout`을 HttpOnly 쿠키에 실으므로,
 * 본문에는 확인용 메시지만 담긴다. 프론트가 응답에서 토큰을 꺼내려 하면 안 된다.
 */

/** 쿠키를 설정한 뒤 돌려주는 확인용 응답. */
export class MessageResponseDto {
  @ApiProperty({ example: 'Login successful' })
  message: string;
}

/**
 * 2FA가 켜져 있을 때의 로그인 응답.
 *
 * 이때는 쿠키가 설정되지 않는다. 받은 `twoFactorToken`을 TOTP 코드와 함께
 * `POST /api/auth/2fa/verify`로 보내야 그때 쿠키가 나간다.
 */
export class TwoFactorRequiredDto {
  @ApiProperty({ example: true })
  requiresTwoFactor: boolean;

  @ApiProperty({ description: '5분간 유효. 2fa/verify에 그대로 넘긴다.' })
  twoFactorToken: string;
}

export class TwoFactorStatusDto {
  @ApiProperty({ example: false })
  enabled: boolean;
}

/**
 * `POST /api/auth/2fa/setup` — 이미 설정돼 있으면 `{ configured, message }`,
 * 아니면 `{ qrCode, uri }`를 돌려준다. 두 경우의 키가 다르므로 전부 선택 항목이다.
 */
export class TwoFactorSetupDto {
  @ApiProperty({ required: false, description: 'data URI 형태의 QR 이미지 (신규 설정 시)' })
  qrCode?: string;

  @ApiProperty({ required: false, description: 'otpauth:// URI (신규 설정 시)' })
  uri?: string;

  @ApiProperty({ required: false, example: true, description: '이미 설정돼 있을 때만' })
  configured?: boolean;

  @ApiProperty({ required: false, example: '2FA is already configured' })
  message?: string;
}

/** `POST /api/auth/2fa/enable`, `POST /api/auth/2fa/disable`. */
export class TwoFactorToggleDto {
  @ApiProperty({ example: true })
  enabled: boolean;

  @ApiProperty({
    required: false,
    example: '2FA is not enabled',
    description: '이미 그 상태일 때만',
  })
  message?: string;
}

/** `POST /api/auth/session/extend` — 연장된 세션 타임아웃(ms). */
export class SessionExtendDto {
  @ApiProperty({ example: 3600000, description: '밀리초' })
  timeout: number;
}

/** `POST /api/auth/preview-token` — 미발행 글 미리보기용 임시 토큰. */
export class PreviewTokenDto {
  @ApiProperty({ description: '미리보기 URL의 쿼리로 붙인다' })
  token: string;

  @ApiProperty({ example: 1800, description: '초 단위' })
  expiresIn: number;
}

/** `GET /api/auth/verify-preview` — 유효하지 않으면 401이므로 200이면 항상 true다. */
export class PreviewValidDto {
  @ApiProperty({ example: true })
  valid: boolean;
}
