'use client';

import Link from "next/link";
import { Shield, ArrowLeft, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-8">
      <div className="max-w-md mx-auto text-center">
        <div className="mb-8">
          <Shield size={64} className="mx-auto mb-4" style={{ color: "#00e5ff" }} />
          <h1 className="font-display font-bold text-4xl mb-2" style={{ color: "#e2e8f8" }}>
            404
          </h1>
          <h2 className="font-display font-bold text-xl mb-4" style={{ color: "#7986a8" }}>
            Page Not Found
          </h2>
          <p className="font-body text-sm" style={{ color: "#7986a8" }}>
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="btn-primary inline-flex items-center gap-2"
          >
            <Home size={16} />
            Go Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}