import { validateRequest } from "twilio";

/**
 * Returns true only when BOTH NODE_ENV === 'development' AND
 * TWILIO_SKIP_VALIDATION === 'true'. Never skips in production.
 */
export function shouldSkipTwilioValidation(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.TWILIO_SKIP_VALIDATION === "true"
  );
}

/**
 * Validates an inbound Twilio webhook request.
 *
 * Checks in order:
 *   1. params is non-empty (empty body → reject)
 *   2. TWILIO_AUTH_TOKEN is configured
 *   3. X-Twilio-Signature header is present
 *   4. HMAC-SHA1 signature matches (via Twilio SDK — handles with/without port variants)
 *
 * @param req    - The incoming Next.js Request object (used for URL + headers)
 * @param params - The pre-parsed form-body key/value pairs
 */
export function validateTwilioSignature(
  req: Request,
  params: Record<string, string>
): boolean {
  if (Object.keys(params).length === 0) return false;

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;

  const signature = req.headers.get("X-Twilio-Signature");
  if (!signature) return false;

  return validateRequest(authToken, signature, req.url, params);
}
