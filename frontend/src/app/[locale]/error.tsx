'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-8">
      <div className="max-w-md mx-auto text-center">
        <h1 className="text-4xl font-bold mb-4" style={{ color: "#e2e8f8" }}>
          Something went wrong
        </h1>
        <p className="mb-8" style={{ color: "#7986a8" }}>
          {error.message || "An unexpected error occurred"}
        </p>
        <button
          onClick={reset}
          className="btn-primary"
        >
          Try again
        </button>
      </div>
    </div>
  );
}