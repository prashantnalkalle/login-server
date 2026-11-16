# Angular Login API

Express authentication backend with MongoDB persistence, password reset, short lived JWT access tokens, and role management.

## Run it

Requires Node.js 20 or later.

1. Start MongoDB locally or create a MongoDB Atlas database.
2. Copy `.env.example` to `.env`. Set `MONGODB_URI`, a unique `JWT_SECRET` (at least 32 characters), and initial superadmin credentials.
3. Run `npm install`.
4. Run `npm start` (or `npm run dev` during development).

The first startup creates the built-in roles and creates a superadmin only when the database has no users. After that, remove the bootstrap password from `.env`. A local MongoDB URI is set in `.env.example`; for Atlas, use the connection URI provided by your cluster.

## Code layout

- `src/storage.js` connects to MongoDB and creates the built-in roles.
- `src/models.js` defines the MongoDB user and role collections.
- `src/app.js` defines the HTTP routes and middleware.
- `src/auth.js` verifies JWTs and checks superadmin access.
- `src/validation.js` defines request-body rules.
- `src/server.js` bootstraps the first superadmin and starts the HTTP server.

The API allows requests from all browser origins through CORS. For production, configure HTTPS at the reverse proxy, use a strong secret manager value for `JWT_SECRET`, and configure SMTP. CORS does not replace authentication: protected routes still require a valid JWT. Never expose the API directly over plain HTTP on the public internet. Reset links use `APP_URL/reset-password?token=...`.

## Roles and account provisioning

The built-in roles are `buyer`, `admin`, and `superAdmin`. Anyone can create an account through `POST /api/auth/register` or `POST /api/users`, choose one of those three roles, and receive an access token. This role choice is intended for temporary development use: public users can grant themselves admin or superadmin privileges. `POST /api/roles` remains superadmin-only. Role names are returned to authenticated users through `GET /api/roles` so the Angular app can display them; that endpoint does not grant any role-management permission.

## Endpoints

All routes are under `/api`. JSON request and response bodies are used.

| Method and path | Access | Request |
| --- | --- | --- |
| `GET /health` | Public | — |
| `POST /auth/register` | Public, rate limited | `{ "email": "buyer@example.com", "password": "...", "role": "buyer" }` (`buyer`, `admin`, or `superAdmin`) |
| `POST /auth/login` | Public, rate limited | `{ "email": "buyer@example.com", "password": "..." }` |
| `POST /auth/forgot-password` | Public, rate limited | `{ "email": "buyer@example.com" }` |
| `POST /auth/reset-password` | Public, rate limited | `{ "token": "...", "password": "..." }` |
| `GET /auth/me` | Bearer JWT | — |
| `GET /roles` | Bearer JWT | — |
| `POST /roles` | Superadmin JWT | `{ "name": "supportAgent" }` |
| `POST /users` | Public, rate limited | `{ "email": "...", "password": "...", "role": "buyer" }` (`buyer`, `admin`, or `superAdmin`) |

The login response contains `accessToken`, `tokenType`, `expiresIn`, `userRole`, and `user` (`id`, `email`, `role`). Send it as `Authorization: Bearer <accessToken>`. Angular should keep the access token in memory where practical and use an HTTP interceptor to attach it; this service does not issue refresh tokens.

Forgot-password always returns the same success message whether an account exists. With SMTP configured, the reset URL is emailed. In development without SMTP, the link is printed to the server console; in production, configure SMTP. Reset tokens are random, stored only as SHA-256 hashes, expire after the configured interval, and are single use. Rate limits apply to login and password reset requests.

Passwords must be 12–128 characters and include an uppercase letter, lowercase letter, number, and symbol. On reset, the new password is compared with the current password and the previous four hashes (the last five passwords overall). Passwords use bcrypt. Responses do not expose password hashes or reset tokens.

## Error response

Errors have this shape; validation errors add a `details` array with field names and messages:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email or password is incorrect."
  }
}
```

Common codes include `VALIDATION_ERROR` (400, with one detail per invalid field), `EMAIL_NOT_FOUND` (404), `PASSWORD_INCORRECT` (401), `ACCOUNT_DISABLED` (403), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `CONFLICT` (409), `PASSWORD_REUSED` (400), `RESET_TOKEN_INVALID` (400), and `RATE_LIMITED` (429). The Angular app can switch on `error.code` and display `error.message`; validation errors also include `error.details` with each field and its message. Use a generic fallback for network/server failures.
