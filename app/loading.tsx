import { Spinner } from "@/components/ui/Spinner";

export default function Loading() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0c0c0c] text-[#F5F5F0]">
      <div className="flex items-center gap-3 text-brand">
        <Spinner className="h-6 w-6" />
        <span className="text-sm font-medium text-[#F5F5F0]/80">Loading items...</span>
      </div>
    </main>
  );
}
