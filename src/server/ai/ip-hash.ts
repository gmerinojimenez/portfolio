import { createHmac } from 'node:crypto';

/**
 * Pseudonymous IP: HMAC-SHA256 with a secret salt (SST secret `IpHashSalt`),
 * shortened to 32 hex chars. Without the salt the hash cannot be reversed by
 * trying all ~4 billion IPv4 addresses.
 */
export function hashIp(ip: string, salt: string): string {
  if (!salt) throw new Error('IpHashSalt is empty');
  return createHmac('sha256', salt).update(ip).digest('hex').slice(0, 32);
}
