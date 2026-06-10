// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://f1326c8ea4987411e7ec54e0c394450a@o4511226767802368.ingest.us.sentry.io/4511226769113088",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 0.1,

  // Do NOT forward console logs to Sentry: error paths in this app log phone
  // numbers and other PII, which must not leave our infrastructure.
  enableLogs: false,

  // Do NOT send user PII (cookies, IP, headers) to a third party — this app
  // handles student PII and publishes a "no third parties" posture.
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: false,
});
