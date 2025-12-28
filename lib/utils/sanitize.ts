/**
 * Email content sanitization
 * Prevents email injection and HTML injection in email content
 */

/**
 * Sanitize text content for email use
 * Escapes HTML entities and removes newlines that could be used for header injection
 */
export function sanitizeEmailText(text: string): string {
  if (!text) return '';
  
  // Replace HTML entities
  let sanitized = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  
  // Remove newlines and carriage returns that could be used for header injection
  sanitized = sanitized.replace(/[\r\n]+/g, ' ');
  
  // Trim and limit length (prevent extremely long content)
  sanitized = sanitized.trim().slice(0, 10000);
  
  return sanitized;
}

/**
 * Sanitize email address
 * Basic validation and sanitization
 */
export function sanitizeEmailAddress(email: string): string {
  if (!email) return '';
  
  // Remove whitespace
  let sanitized = email.trim();
  
  // Remove newlines and carriage returns
  sanitized = sanitized.replace(/[\r\n]+/g, '');
  
  // Limit length
  sanitized = sanitized.slice(0, 254); // RFC 5321 limit
  
  return sanitized;
}

