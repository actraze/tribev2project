import { AppHeader } from "@/components/AppHeader";
import { ResultsDashboard } from "@/components/ResultsDashboard";

export default async function ResultsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="min-h-screen">
      <AppHeader active="results" />
      <ResultsDashboard id={id} />
    </main>
  );
}
