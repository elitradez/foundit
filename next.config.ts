import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [];

if (supabaseUrl) {
  try {
    const host = new URL(supabaseUrl).hostname;
    remotePatterns.push({
      protocol: "https",
      hostname: host,
      pathname: "/storage/v1/object/public/**",
    });
  } catch {
    /* ignore invalid env at build time */
  }
}

const nextConfig: NextConfig = {
  images: remotePatterns.length ? { remotePatterns } : undefined,
  async headers() {
    // A conservative Content-Security-Policy: it locks down the directives that
    // are safe to set without per-page testing (clickjacking, <base> injection,
    // form hijacking, plugins) but deliberately does NOT constrain
    // script/style/connect sources, which would require validating every page
    // (Next.js inline bootstrap, Supabase, Sentry, fonts) before tightening.
    // NOTE: no default-src is set on purpose. Setting default-src 'self' would
    // make inline scripts/styles (Next.js hydration bootstrap, inline style
    // attributes used throughout the app) inherit it and break the pages.
    // Directives left unspecified stay unrestricted until script/style/connect
    // sources are validated per-page and tightened in a follow-up.
    const csp = [
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "founditcampus",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  }
});
