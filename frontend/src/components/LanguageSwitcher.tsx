"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Globe } from "lucide-react";

// ---------------------------------------------------------------------------
// LanguageSwitcher
// ---------------------------------------------------------------------------
// With URL-based locale routing (/en/..., /hi/...) the switcher must navigate
// to the equivalent path in the target locale rather than just setting a
// cookie and refreshing.
//
// Strategy:
//   Current path: /en/dashboard  → switch to hi → /hi/dashboard
//   Current path: /dashboard     → switch to hi → /hi/dashboard
//   Current path: /hi/dashboard  → switch to en → /dashboard  (en has no prefix)
//
// usePathname() returns the full path including any locale prefix.
// We strip the leading locale segment (if present) then prepend the new one.
// ---------------------------------------------------------------------------

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const switchLocale = (next: string) => {
    if (next === locale) return;

    // Strip the current locale prefix from the path (if present).
    // e.g. "/hi/dashboard" with locale="hi" → "/dashboard"
    //      "/dashboard"    with locale="en" → "/dashboard"
    const stripped = pathname.startsWith(`/${locale}`)
      ? pathname.slice(`/${locale}`.length) || "/"
      : pathname;

    // Prepend new locale prefix — but "en" is the default locale so it uses
    // no prefix (localePrefix: "as-needed").
    const nextPath = next === "en" ? stripped : `/${next}${stripped}`;

    startTransition(() => {
      router.push(nextPath);
    });
  };

  return (
    <div
      className="flex items-center gap-1 px-2 py-1.5 rounded-lg border"
      style={{
        borderColor: "rgba(0,245,255,0.2)",
        background: "rgba(0,245,255,0.04)",
      }}
      title="Switch language"
    >
      <Globe
        className="w-3.5 h-3.5 shrink-0"
        style={{ color: "#00f5ff", opacity: isPending ? 0.4 : 1 }}
      />
      <button
        onClick={() => switchLocale("en")}
        disabled={isPending}
        className="text-xs font-mono transition-colors px-1"
        style={{
          color: locale === "en" ? "#00f5ff" : "#8892b0",
          fontWeight: locale === "en" ? 600 : 400,
          cursor: isPending ? "not-allowed" : "pointer",
          background: "none",
          border: "none",
          padding: "0 4px",
        }}
        aria-label="Switch to English"
        aria-pressed={locale === "en"}
      >
        EN
      </button>
      <span style={{ color: "#1a2540", fontSize: "10px" }}>|</span>
      <button
        onClick={() => switchLocale("hi")}
        disabled={isPending}
        className="text-xs font-mono transition-colors px-1"
        style={{
          color: locale === "hi" ? "#00f5ff" : "#8892b0",
          fontWeight: locale === "hi" ? 600 : 400,
          cursor: isPending ? "not-allowed" : "pointer",
          background: "none",
          border: "none",
          padding: "0 4px",
          fontFamily:
            locale === "hi"
              ? "'Noto Sans Devanagari', sans-serif"
              : "inherit",
        }}
        aria-label="हिंदी में बदलें"
        aria-pressed={locale === "hi"}
      >
        हि
      </button>
    </div>
  );
}
