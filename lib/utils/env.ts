/**
 * Environment variable validation
 * Validates required environment variables at startup
 */

const requiredEnvVars = [
  'MAILJET_API_KEY',
  'MAILJET_SECRET_KEY',
  'MAILJET_SENDER_EMAIL',
] as const;

const optionalEnvVars = [
  'NEXT_PUBLIC_BASE_URL',
  'DB_PATH',
] as const;

export function validateEnv(): void {
  const missing: string[] = [];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please check your .env.local file or environment configuration.'
    );
  }
}

// Validate on module load (only in server-side context)
if (typeof window === 'undefined') {
  try {
    validateEnv();
  } catch (error) {
    // In development, log but don't crash - allows for easier testing
    if (process.env.NODE_ENV === 'development') {
      console.warn('Environment validation warning:', (error as Error).message);
    } else {
      // In production, throw to prevent startup with missing config
      throw error;
    }
  }
}

