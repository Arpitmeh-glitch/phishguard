import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

// ─────────────────────────────────────────────────────────────────────────────
// Supported locales
// ─────────────────────────────────────────────────────────────────────────────
export const locales = ["en", "hi"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// ─────────────────────────────────────────────────────────────────────────────
// WHY a static import map instead of a dynamic template literal
// ─────────────────────────────────────────────────────────────────────────────
// Webpack (used by Next.js) performs static analysis at build time on every
// `import()` call.  When it sees:
//
//   import(`../messages/${locale}.json`)
//
// it needs to know which directory to bundle.  When `request.ts` lives at
// src/i18n/request.ts, the path `../messages/` resolves correctly at
// *runtime* (Node.js) but webpack resolves paths relative to the project root
// during the compilation phase — and the two differ.  The result is the error:
//
//   Module not found: Can't resolve '../messages'
//   Error: Cannot find module './en.json'
//
// The fix: give webpack fully-static import() calls that it can analyse
// unambiguously at build time.  A locale→loader map achieves this because each
// entry is a plain, non-template import() that webpack can trace to a real
// file on disk during the bundle step.
// ─────────────────────────────────────────────────────────────────────────────

type MessageLoader = () => Promise<{ default: Record<string, unknown> }>;

const messageLoaders: Record<Locale, MessageLoader> = {
  en: () => import("../messages/en.json"),
  hi: () => import("../messages/hi.json"),
};

// ─────────────────────────────────────────────────────────────────────────────
// getRequestConfig — called by next-intl on every server render
// ─────────────────────────────────────────────────────────────────────────────
export default getRequestConfig(async () => {
  // Read the locale that the LanguageSwitcher persisted in the cookie.
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;

  // Validate: fall back to English if the cookie holds an unsupported value.
  const locale: Locale =
    cookieLocale && (locales as readonly string[]).includes(cookieLocale)
      ? (cookieLocale as Locale)
      : defaultLocale;

  // Load messages — fall back to English if the target file somehow fails.
  const loader = messageLoaders[locale] ?? messageLoaders[defaultLocale];
  const messages = await loader()
    .then((m) => m.default)
    .catch(async () => (await messageLoaders[defaultLocale]()).default);

  return { locale, messages };
});