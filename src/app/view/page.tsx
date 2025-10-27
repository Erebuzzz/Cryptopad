import { Suspense } from "react";
import { MessageViewer } from "@/components/message-viewer";

interface ViewPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export const dynamic = "force-dynamic";

export default function ViewPage({ searchParams }: ViewPageProps) {
  const idParam = searchParams.id;
  const keyParam = searchParams.key;

  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const key = Array.isArray(keyParam) ? keyParam[0] : keyParam;

  return (
    <main className="relative flex min-h-screen flex-col items-center px-4 py-16 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-10 mx-auto h-60 w-60 rounded-full bg-emerald-400/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 bottom-20 mx-auto h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
      <Suspense fallback={<div className="mt-24 text-slate-300">Decrypting...</div>}>
        <MessageViewer id={id} keyParam={key} />
      </Suspense>
    </main>
  );
}
