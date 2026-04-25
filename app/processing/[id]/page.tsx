import { AppHeader } from "@/components/AppHeader";
import { ProcessingClient } from "@/components/ProcessingClient";

export default async function ProcessingPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="min-h-screen">
      <AppHeader active="processing" />
      <ProcessingClient id={id} />
    </main>
  );
}
