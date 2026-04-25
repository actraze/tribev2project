import { AppHeader } from "@/components/AppHeader";
import { UploadForm } from "@/components/UploadForm";

export default function ScanPage() {
  return (
    <main className="min-h-screen">
      <AppHeader active="scan" />
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center justify-center px-5 py-10 md:px-8">
        <UploadForm />
      </section>
    </main>
  );
}
