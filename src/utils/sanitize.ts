import sanitizeHtml from 'sanitize-html';

/**
 * Sanitization options for user-generated content
 * Allows basic formatting but strips potentially dangerous tags
 */
const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

/**
 * Strict sanitization - removes all HTML tags
 * Use for plain text fields like names, titles, short messages
 */
const strictSanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

/**
 * Sanitize user-generated content that may contain basic formatting
 * Use for descriptions, long messages, notes
 * @param input - The string to sanitize
 * @returns Sanitized string with safe HTML tags only
 */
export function sanitizeContent(input: string | undefined | null): string {
  if (!input) return '';
  return sanitizeHtml(input.trim(), sanitizeOptions);
}

/**
 * Strictly sanitize user input - removes ALL HTML tags
 * Use for plain text fields: names, titles, short messages
 * @param input - The string to sanitize
 * @returns Plain text string with all HTML removed
 */
export function sanitizeText(input: string | undefined | null): string {
  if (!input) return '';
  return sanitizeHtml(input.trim(), strictSanitizeOptions);
}

/**
 * Sanitize an object's string properties recursively
 * @param obj - Object with string properties to sanitize
 * @param strictFields - Array of field names to apply strict sanitization
 * @returns Object with sanitized string values
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  strictFields: string[] = []
): T {
  const sanitized = { ...obj };

  for (const key in sanitized) {
    if (typeof sanitized[key] === 'string') {
      if (strictFields.includes(key)) {
        (sanitized as Record<string, unknown>)[key] = sanitizeText(sanitized[key] as string);
      } else {
        (sanitized as Record<string, unknown>)[key] = sanitizeContent(sanitized[key] as string);
      }
    }
  }

  return sanitized;
}

export default {
  sanitizeContent,
  sanitizeText,
  sanitizeObject,
};
