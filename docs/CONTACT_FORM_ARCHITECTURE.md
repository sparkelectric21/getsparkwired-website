# Contact Form Architecture

## Request flow and endpoint contract

The Contact page sends JSON to `POST /api/contact` with `fetch`, without navigation. The Vercel Node Function validates the request, applies abuse checks, builds plain-text and escaped HTML email, and calls Cloudflare Email Service. Only a confirmed Cloudflare success produces HTTP 200 and the success message. Provider failures produce a generic non-2xx response and preserve the browser form.

The JSON fields are `name`, `email`, `phone`, `city`, `service`, `message`, `website` (honeypot), `startedAt` (browser Unix time in milliseconds), and `originatingPage`. Name, email, phone, service, and message are required. The endpoint returns 200 for success; 400/413/415/422 for invalid requests; 405 for unsupported methods; 429 for a local rate limit; and 502 for delivery/configuration failures. Public errors never contain provider details.

## Environment variables and email configuration

Configure these server-side Vercel environment variables for Production and Preview as appropriate:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_EMAIL_API_TOKEN` with Email Sending permission
- `CONTACT_FROM_EMAIL`, using an address on the onboarded sending domain
- `CONTACT_TO_EMAIL`, using the internal destination address

Do not set `CONTACT_EMAIL_MODE` in production. Placeholder examples are in `.env.example`.

In Cloudflare, onboard the sending domain under Email Service > Email Sending and allow its DNS authentication records to propagate. The implementation follows Cloudflare's REST contract: `POST /client/v4/accounts/{account_id}/email/sending/send` with Bearer authentication and a JSON email builder containing `to`, `from`, `reply_to`, `subject`, `text`, and `html`.

## Local testing

Run `npm test`. API tests use `CONTACT_EMAIL_MODE=test`, which reports successful delivery without network traffic. Browser tests intercept `/api/contact` and verify both confirmed success and failure behavior. To exercise a local function without sending email, place placeholder local variables in an ignored `.env.local` and set `CONTACT_EMAIL_MODE=test`. `CONTACT_EMAIL_MODE=fail` safely simulates provider failure.

## Deployment setup

Vercel discovers `api/contact.js` as a Node Function; no route rewrite or dependency is needed. Before deployment, configure all four production variables, verify Cloudflare domain onboarding, run the validation commands, and obtain Founder review and approval. This change must not be deployed before that approval.

## Spam protections and limitations

Protection includes a hidden honeypot, a minimum completion time, strict content type and payload shape checks, body and field limits, a service allowlist, and a per-IP in-memory rolling limit of five attempts per ten minutes. The memory limit is best-effort only: serverless instances do not share state and may be recycled. Durable cross-instance rate limiting requires an external store and has intentionally not been introduced without approval. A visible CAPTCHA can be considered later if operational evidence warrants it.

## Troubleshooting

For a 502 response, confirm all four Vercel variables, the token's Email Sending permission, the account ID, sender-domain onboarding, and the destination address. Review Vercel logs for the short failure reason; logs intentionally omit customer form content, email addresses, credentials, and raw provider responses. For 400/422 responses, inspect the browser payload shape, timestamp, honeypot, and allowed service value. For 429 responses, wait for the local ten-minute window; repeated limits across all instances would require a durable store.

## Rollback

Roll back the release in Vercel to the last known-good deployment or revert this change in source control. Do not restore the former third-party form action. If email delivery must be paused, keep the endpoint returning failure so the Contact page displays the approved phone/email fallback rather than presenting a false success.
