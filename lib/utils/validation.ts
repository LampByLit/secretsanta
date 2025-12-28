/**
 * Input validation utilities
 * Simple email format validation (weak passwords allowed for low friction)
 */

/**
 * Basic email format validation
 * Simple regex check - allows most common email formats
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  // Basic email regex - allows most common formats
  // More permissive than RFC 5322 but good enough for low friction
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  return emailRegex.test(email.trim());
}

/**
 * Validate email and return error message if invalid
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email) {
    return { valid: false, error: 'Email is required' };
  }
  
  if (typeof email !== 'string') {
    return { valid: false, error: 'Email must be a string' };
  }
  
  const trimmed = email.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, error: 'Email cannot be empty' };
  }
  
  if (trimmed.length > 254) {
    return { valid: false, error: 'Email is too long' };
  }
  
  if (!isValidEmail(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  return { valid: true };
}

