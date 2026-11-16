const test = require('node:test');
const assert = require('node:assert/strict');
const validation = require('../src/validation');

const goodEmail = 'dummy@example.com';
const goodPassword = 'StrongPass123!';
const goodToken = 'a'.repeat(32);

function isValid(schema, value) {
  return schema.safeParse(value).success;
}

test('login validates email and requires a password', () => {
  assert.equal(isValid(validation.login, { email: goodEmail, password: 'anything' }), true);
  assert.equal(isValid(validation.login, { email: 'not-an-email', password: 'anything' }), false);
  assert.equal(isValid(validation.login, { email: goodEmail, password: '' }), false);
  assert.equal(isValid(validation.login, { email: goodEmail }), false);
  assert.equal(isValid(validation.login, { email: goodEmail, password: 'x'.repeat(129) }), false);
});

test('forgot-password accepts only a valid email', () => {
  assert.equal(isValid(validation.forgot, { email: goodEmail }), true);
  assert.equal(isValid(validation.forgot, { email: 'bad-email' }), false);
  assert.equal(isValid(validation.forgot, {}), false);
});

test('reset password requires a valid token and a strong new password', () => {
  assert.equal(isValid(validation.reset, { token: goodToken, password: goodPassword }), true);
  assert.equal(isValid(validation.reset, { token: 'short', password: goodPassword }), false);
  assert.equal(isValid(validation.reset, { token: goodToken, password: 'Aa1!short' }), false);
  assert.equal(isValid(validation.reset, { token: goodToken, password: 'UPPERCASE123!' }), false);
  assert.equal(isValid(validation.reset, { token: goodToken, password: 'lowercase123!' }), false);
  assert.equal(isValid(validation.reset, { token: goodToken, password: 'NoNumbersHere!' }), false);
  assert.equal(isValid(validation.reset, { token: goodToken, password: 'NoSymbols12345' }), false);
  assert.equal(isValid(validation.reset, { token: goodToken, password: 'A'.repeat(129) }), false);
  assert.equal(isValid(validation.reset, { token: goodToken, password: goodPassword, extra: true }), false);
});

test('new users need a valid email, strong password, and role', () => {
  const user = { email: goodEmail, password: goodPassword, role: 'buyer' };
  assert.equal(isValid(validation.createUser, user), true);
  assert.equal(isValid(validation.createUser, { ...user, email: 'invalid' }), false);
  assert.equal(isValid(validation.createUser, { ...user, password: 'weak' }), false);
  assert.equal(isValid(validation.createUser, { ...user, role: '' }), false);
  assert.equal(isValid(validation.createUser, { ...user, extra: 'not allowed' }), false);
});

test('role names must start with a letter and use allowed characters', () => {
  assert.equal(isValid(validation.createRole, { name: 'supportAgent' }), true);
  assert.equal(isValid(validation.createRole, { name: 'team-2' }), true);
  assert.equal(isValid(validation.createRole, { name: '2admins' }), false);
  assert.equal(isValid(validation.createRole, { name: 'bad role' }), false);
  assert.equal(isValid(validation.createRole, { name: 'a' }), false);
});
