import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="flex flex-col items-center gap-8">
        <h1 className="text-4xl font-bold text-gray-900">Secret Santa</h1>
        <Link
          href="/create"
          className="rounded-lg bg-blue-600 px-8 py-4 text-lg font-semibold text-white shadow-md hover:bg-blue-700 transition-colors"
        >
          Create a New Secret Santa Group
        </Link>
      </div>
    </main>
  );
}

