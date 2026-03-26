import { Spinner } from "@/components/ui/Spinner";

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0c0c0c] text-[#F5F5F0]">
      <div className="flex items-center gap-3 text-[#CC0000]">
        <Spinner className="h-6 w-6" />
        <span className="text-sm font-medium text-[#F5F5F0]/80">Loading items...</span>
      </div>
    </div>
  );
}
