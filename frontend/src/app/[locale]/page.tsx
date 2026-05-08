import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import HomePageClient from "@/components/HomePage";

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://tietiephish.vercel.app';

  return {
    title: "TieTiePhish — AI-Powered Cybersecurity Detection Platform",
    description: "Enterprise-grade phishing, fraud, and malicious URL detection powered by machine learning. Protect your organization with real-time analysis and automated response.",
    keywords: ["phishing detection", "cybersecurity", "AI threat detection", "URL analysis", "malware protection", "enterprise security"],
    authors: [{ name: "TieTiePhish Team" }],
    creator: "TieTiePhish",
    publisher: "TieTiePhish",
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    metadataBase: new URL(baseUrl),
    alternates: {
      canonical: `/${params.locale}`,
      languages: {
        'en': '/en',
        'hi': '/hi',
      },
    },
    openGraph: {
      title: "TieTiePhish — AI-Powered Cybersecurity Detection Platform",
      description: "Enterprise-grade phishing, fraud, and malicious URL detection powered by machine learning.",
      url: `/${params.locale}`,
      siteName: "TieTiePhish",
      images: [
        {
          url: "/og-image.jpg",
          width: 1200,
          height: 630,
          alt: "TieTiePhish - AI-Powered Threat Detection",
        },
      ],
      locale: params.locale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "TieTiePhish — AI-Powered Cybersecurity Detection Platform",
      description: "Enterprise-grade phishing, fraud, and malicious URL detection powered by machine learning.",
      images: ["/og-image.jpg"],
      creator: "@tietiephish",
    },
    robots: {
      index: true,
      follow: true,
      nocache: true,
      googleBot: {
        index: true,
        follow: true,
        noimageindex: false,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    verification: {
      google: "UfofqfLf2AbY9mx6fsr1N3L1zbXrUcIK0rQU-2OutLc",
    },
  };
}

export default function HomePage() {
  return <HomePageClient />;
}