/**
 * Strict Environment Security Configuration
 * Enforces that all cryptographic secrets, database URIs, and authentication
 * keys are strictly provided by the environment. Zero hardcoded fallback secrets.
 */

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `CRITICAL SECURITY ERROR: Environment variable "${name}" is missing or empty. Insecure fallback strings are disabled.`
    );
  }
  return value.trim();
}

/**
 * Returns the verified binary secret for JWT signing and verification.
 * Enforces minimum 32-character length for cryptographic safety.
 */
export function getAuthSecret(): Uint8Array {
  const secret = getRequiredEnv("AUTH_SECRET");
  if (secret.length < 32) {
    throw new Error(
      `CRITICAL SECURITY ERROR: AUTH_SECRET must be at least 32 characters long for cryptographic safety. Provided length: ${secret.length}`
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Returns the verified secret used for securing automated background cron endpoints.
 */
export function getCronSecret(): string {
  return getRequiredEnv("CRON_SECRET");
}

/**
 * Returns the verified MongoDB connection string.
 */
export function getMongoUri(): string {
  return getRequiredEnv("MONGODB_URI");
}
