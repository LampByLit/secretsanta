import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="flex flex-col items-center gap-8 max-w-4xl">
        <div className="text-justify text-sm font-bold text-gray-700 leading-relaxed">
          This tool is based on the following video by Tom7:{" "}
          <a
            href="https://www.youtube.com/watch?v=4pG8_bWpmaE"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            Mathematically extra-complicated Secretest Santa 2025
          </a>
          . This tool provides a cryptographically secure, privacy-focused tool for organizing Secret Santa Gift Exchanges at scale, and is hosted on Railway directly from it's Github repository, from which this tool can be downloaded and verified:{" "}
          <a
            href="https://github.com/LampByLit/secretsanta"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            https://github.com/LampByLit/secretsanta
          </a>
          . All client key generation and decrypting is handled client-side, such that users' identities are never stored unencrypted server-side, and therefore not I nor anybody can access users' private data. Please see my follow-up to Tom7's video here:{" "}
          <span className="text-gray-500">[placeholder WIP]</span>{" "}
          Tom7's Secretest Santa Typescript Unwrapping.
        </div>
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

