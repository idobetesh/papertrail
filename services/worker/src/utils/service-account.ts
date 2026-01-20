/**
 * Service Account utilities
 * Fetches service account information from GCP IAM
 */

import { GoogleAuth } from 'google-auth-library';
import logger from '../logger';

let cachedServiceAccountEmail: string | null = null;

/**
 * Get the current service account email from Google Auth
 * Caches the result for performance
 */
export async function getServiceAccountEmail(): Promise<string> {
  if (cachedServiceAccountEmail) {
    return cachedServiceAccountEmail;
  }

  try {
    const auth = new GoogleAuth();
    const client = await auth.getClient();

    // Get the service account email from the client
    if ('email' in client && typeof client.email === 'string') {
      cachedServiceAccountEmail = client.email;
      logger.info({ email: cachedServiceAccountEmail }, 'Service account email retrieved');
      return cachedServiceAccountEmail;
    }

    // Fallback: try to get from credentials
    const credentials = await auth.getCredentials();
    if (credentials.client_email) {
      cachedServiceAccountEmail = credentials.client_email;
      logger.info(
        { email: cachedServiceAccountEmail },
        'Service account email retrieved from credentials'
      );
      return cachedServiceAccountEmail;
    }

    throw new Error('Could not determine service account email');
  } catch (error) {
    logger.error({ error }, 'Failed to get service account email');
    throw new Error('Failed to retrieve service account email from GCP');
  }
}

/**
 * Clear the cached service account email (useful for testing)
 */
export function clearServiceAccountCache(): void {
  cachedServiceAccountEmail = null;
}
