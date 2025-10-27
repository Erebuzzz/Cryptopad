import Link from "next/link";
import { MessageComposer } from "@/components/message-composer";

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-12 mx-auto h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 bottom-10 mx-auto h-64 w-64 rounded-full bg-pink-400/10 blur-3xl" />

      <MessageComposer />

      <section className="mx-auto mt-12 flex w-full max-w-3xl flex-col gap-4 text-center text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-slate-300">
            The Zeabur API keeps encrypted payloads in memory only. Once a note is opened, it is
            wiped immediately.
          </p>
          <p className="mt-2 text-slate-500">
            Tip: For extra paranoia, toggle flight mode before you paste anything sensitive.
          </p>
        </div>
        <Link
          href="/view"
          className="inline-flex items-center justify-center rounded-full border border-indigo-400/30 px-5 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200 transition hover:border-indigo-300 hover:bg-indigo-400/10"
        >
          Peek at a note
        </Link>
      </section>
    </div>
  );
}
