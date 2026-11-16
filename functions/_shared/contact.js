// The buyer's contact details, asked once before paying: name, email, an optional phone, and an optional tick for tips and
// reminders. Checked here (the browser's check is only for convenience) and stored in customer_contacts, apart from the
// website, so they can never travel with the invitation. They are also passed to Razorpay so its page is already filled in.
import { ApiError } from './api.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function hasContactFields(input) {
  return Boolean(input) && typeof input === 'object' && ['name', 'email', 'phone', 'marketing'].some(key => input[key] !== undefined);
}

function text(value) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''; }

// "+91 95678-82568", "(0044) 7700 900123", "95678 82568" -> digits with an optional leading +; anything else is refused.
export function normalisePhone(value) {
  const raw = text(value).replace(/[\s().-]/g, '').replace(/^00/, '+');
  return raw;
}

export function cleanBuyerContact(input) {
  const fields = {};
  const name = text(input?.name);
  if (!name || name.length > 120) fields.name = 'Enter your name (up to 120 characters).';
  const email = text(input?.email).toLowerCase();
  if (!email || email.length > 254 || !EMAIL.test(email)) fields.email = 'Enter a valid email address.';
  let phone = '';
  if (input?.phone !== undefined && input?.phone !== null && text(input.phone) !== '') {
    phone = normalisePhone(input.phone);
    if (!/^\+?[0-9]{7,15}$/.test(phone)) fields.phone = 'Enter a phone number with 7 to 15 digits, or leave it empty.';
  }
  if (Object.keys(fields).length) throw new ApiError('Please check your details.', 422, 'CONTACT_INVALID', fields);
  return { name, email, phone, marketing: input?.marketing === true };
}

// What Razorpay is told so its page is pre-filled. Its phone must carry a country code; a bare Indian mobile number gets +91,
// and any number we cannot be sure of is left out (the person can type it there) rather than risk Razorpay refusing the link.
export function razorpayCustomer(contact, country) {
  if (!contact?.email) return null;
  const customer = { name: contact.name, email: contact.email };
  const phone = String(contact.phone || '');
  if (/^\+[0-9]{8,15}$/.test(phone)) customer.contact = phone;
  else if (String(country || '').toUpperCase() === 'IN' && /^[6-9][0-9]{9}$/.test(phone)) customer.contact = `+91${phone}`;
  return customer;
}
