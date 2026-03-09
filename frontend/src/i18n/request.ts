import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";

// ---------------------------------------------------------------------------
// Supported locales
// ---------------------------------------------------------------------------
export const locales = ["en", "hi"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// ---------------------------------------------------------------------------
// WHY a static import map
// ---------------------------------------------------------------------------
// Webpack performs static analysis on every import() at build time.
// A dynamic template literal:
//
//   import(`../messages/${locale}.json`)
//
// causes webpack to mis-resolve the directory when the file lives in a
// subdirectory (src/i18n/), producing "Cannot find module './en.json'".
//
// Explicit static imports in a lookup table give webpack concrete paths it
// can trace directly to disk — fully resolving the build error.
// ---------------------------------------------------------------------------

type MessageImport = { default: Record<string, unknown> };

const messageLoaders: Record<Locale, () => Promise<MessageImport>> = {
  en: () => import("../messages/en.json"),
  hi: () => import("../messages/hi.json"),
};

// ---------------------------------------------------------------------------
// getRequestConfig
// ---------------------------------------------------------------------------
// With localePrefix: "as-needed" the middleware rewrites /  → /en and
// passes the locale as a route segment parameter.  next-intl reads it from
// the [locale] segment and injects it as `requestLocale` here.
// ---------------------------------------------------------------------------

export default getRequestConfig(async ({ requestLocale }) => {
  // `requestLocale` is a Promise in next-intl v3 — await it.
  const requested = await requestLocale;

  // Validate — reject unknown locale values with a 404 instead of crashing.
  if (!requested || !(locales as readonly string[]).includes(requested)) {
    notFound();
  }

  const locale = requested as Locale;

  // Load messages with a safe English fallback if the file is somehow absent.
  const loader = messageLoaders[locale] ?? messageLoaders[defaultLocale];
  const messages = await loader()
    .then((m) => m.default)
    .catch(async () => (await messageLoaders[defaultLocale]()).default);

  return { locale, messages };
});
