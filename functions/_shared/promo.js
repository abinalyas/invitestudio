// Promo codes (supabase/migrations/202611200002_promo_codes.sql). A code unlocks publishing without a payment. Codes are made on the
// admin page, long and random, so they cannot be guessed; the database function redeem_promo_code is the only thing that spends one.
import { ApiError } from './api.js';

// No 0/O or 1/I/L: a code that is read out or typed from a message is not mistaken.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// "is-abcd efgh-2345" -> "IS-ABCD-EFGH-2345". Anything that cannot be a code is '' (and is never sent to the database).
export function normalizeCode(value) {
  if (typeof value !== 'string') return '';
  const text = value.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(text) && text.length >= 8 && text.length <= 40 ? text : '';
}

// IS-XXXX-XXXX-XXXX: 12 characters from 31 symbols, about 59 bits, from the platform's secure random source.
export function generateCode() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const symbols = [];
  for (const byte of bytes) if (byte < 248 && symbols.length < 12) symbols.push(ALPHABET[byte % ALPHABET.length]);
  while (symbols.length < 12) symbols.push(ALPHABET[crypto.getRandomValues(new Uint8Array(1))[0] % ALPHABET.length]);
  return `IS-${symbols.slice(0, 4).join('')}-${symbols.slice(4, 8).join('')}-${symbols.slice(8, 12).join('')}`;
}

// PostgREST answers with the JSON itself; the local test stand-in wraps it as [{ function_name: ... }].
export function unwrap(answer, name) {
  return Array.isArray(answer) ? answer[0]?.[name] ?? answer[0] : answer;
}

// What the database said about a redemption, as the error the page shows (or null when the website is unlocked).
export function promoProblem(status) {
  switch (status) {
    case 'unlocked':
    case 'already':
      return null;
    case 'expired':
      return new ApiError('This promo code has expired.', 422, 'PROMO_EXPIRED');
    case 'used_up':
      return new ApiError('This promo code has already been used.', 422, 'PROMO_USED_UP');
    case 'too_many':
      return new ApiError('Too many wrong codes. Please wait an hour, or contact us.', 429, 'PROMO_TOO_MANY');
    default:
      return new ApiError('That promo code is not valid. Check it and try again.', 422, 'PROMO_INVALID');
  }
}
