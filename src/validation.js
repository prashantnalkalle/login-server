const { z } = require('zod');

// New passwords must be strong; login accepts any previously set password.
const newPassword = z.string()
  .min(12, 'Use at least 12 characters')
  .max(128, 'Use no more than 128 characters')
  .regex(/[a-z]/, 'Add a lowercase letter')
  .regex(/[A-Z]/, 'Add an uppercase letter')
  .regex(/[0-9]/, 'Add a number')
  .regex(/[^A-Za-z0-9]/, 'Add a symbol');

// Normalize email addresses so lookups treat different casing consistently.
const email = z.string()
  .trim()
  .email('Enter a valid email address')
  .max(254)
  .transform((value) => value.toLowerCase());

// Strict schemas reject unexpected fields in client requests.
module.exports = {
  register: z.object({
    email,
    password: newPassword,
    role: z.enum(['buyer', 'admin', 'superAdmin'])
  }).strict(),

  login: z.object({
    email,
    password: z.string().min(1).max(128)
  }).strict(),

  forgot: z.object({ email }).strict(),

  reset: z.object({
    token: z.string().min(32).max(512),
    password: newPassword
  }).strict(),

  createUser: z.object({
    email,
    password: newPassword,
    role: z.string().trim().min(2).max(50)
  }).strict(),

  createRole: z.object({
    name: z.string()
      .trim()
      .min(2)
      .max(50)
      .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, 'Use letters, numbers, _ or -')
  }).strict()
};
