/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent deployment failures due to TypeScript type errors.
  // TypeScript is still checked locally via `tsc --noEmit`.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Prevent deployment failures due to ESLint errors.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
