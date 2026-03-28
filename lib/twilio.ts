import twilioSdk from "twilio";

export function getTwilioClient(): ReturnType<typeof twilioSdk> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) {
    throw new Error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
  }
  return twilioSdk(sid, token);
}

export function getTwilioFromNumber(): string {
  const n = process.env.TWILIO_PHONE_NUMBER?.trim();
  if (!n) throw new Error("Missing TWILIO_PHONE_NUMBER");
  return n;
}

export function hasTwilioConfig(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_PHONE_NUMBER?.trim(),
  );
}

export async function sendSms(to: string, body: string): Promise<void> {
  const client = getTwilioClient();
  await client.messages.create({
    body,
    from: getTwilioFromNumber(),
    to,
  });
}
