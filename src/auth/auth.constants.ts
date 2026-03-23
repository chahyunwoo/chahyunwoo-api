export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const SESSION_TIMEOUT_COOKIE = 'session_timeout';

export const ACCESS_TOKEN_EXPIRES_MINUTES = 15;
export const ACCESS_TOKEN_MAX_AGE = ACCESS_TOKEN_EXPIRES_MINUTES * 60; // seconds
export const ACCESS_TOKEN_JWT_EXPIRES = `${ACCESS_TOKEN_EXPIRES_MINUTES}m`;

export const REFRESH_TOKEN_EXPIRES_DAYS = 7;
export const REFRESH_TOKEN_MAX_AGE = REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60; // seconds

export const SESSION_TIMEOUT = 60 * 60; // 60 minutes (seconds)
