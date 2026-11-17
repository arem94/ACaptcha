# ACaptcha

A lightweight numeric CAPTCHA service built with Node.js and Express.

## Requirements

- Node.js 20 or newer
- npm

## Installation

```bash
npm install
cp .env.example .env
npm start
```

The API listens on port `3000` by default. Configure it with environment variables in `.env`.

## API

### Create a CAPTCHA

```http
GET /api/captcha
```

Example response:

```json
{
  "success": true,
  "captchaId": "a UUID",
  "image": "data:image/svg+xml;base64,...",
  "expiresIn": 180
}
```

Display the returned `image` value in an HTML image element:

```html
<img src="CAPTCHA_IMAGE_FROM_API" alt="CAPTCHA" />
```

The answer is never returned by the API.

### Verify a CAPTCHA

```http
POST /api/captcha/verify
Content-Type: application/json
```

Request body:

```json
{
  "captchaId": "UUID_FROM_CREATE_RESPONSE",
  "answer": "123456"
}
```

Successful response:

```json
{
  "success": true,
  "valid": true
}
```

An incorrect answer returns HTTP 400 and the remaining attempt count. After the configured maximum number of incorrect attempts, the CAPTCHA is invalidated and HTTP 429 is returned. Expired, unknown, and already-used IDs return HTTP 410.

A CAPTCHA is single-use: after successful verification, its ID cannot be used again.

### Health check

```http
GET /health
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `CAPTCHA_TTL_SECONDS` | `180` | CAPTCHA lifetime |
| `CAPTCHA_MAX_ATTEMPTS` | `5` | Maximum incorrect answers |
| `CAPTCHA_MAX_ACTIVE` | `10000` | Maximum active CAPTCHA records |
| `CORS_ORIGIN` | `*` | Allowed origins; comma-separated when restricted |
| `CAPTCHA_SECRET` | random per process | HMAC secret used to protect stored answers |

For production, set a strong, private `CAPTCHA_SECRET` and restrict `CORS_ORIGIN` to the origins that need access.

## Tests

```bash
npm test
```

## Deployment note

CAPTCHA state is stored in process memory. This is suitable for a single Node.js instance, but active IDs are lost when the process restarts and are not shared between multiple workers or servers. For a multi-instance deployment, replace the in-memory store with a shared store such as Redis.
