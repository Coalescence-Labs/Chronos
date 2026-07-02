import type { Metadata } from "next";
import { RepoScreen } from "@/components/repo/RepoScreen";
import { AppShell } from "@/components/shell/AppShell";
import { repoMetadata } from "@/lib/seo";

interface RepoPageProps {
  params: Promise<{ owner: string; repo: string }>;
}

export async function generateMetadata({ params }: RepoPageProps): Promise<Metadata> {
  const { owner, repo } = await params;
  return repoMetadata(decodeURIComponent(owner), decodeURIComponent(repo));
}

export default async function RepoPage({ params }: RepoPageProps) {
  const { owner, repo } = await params;
  return (
    <AppShell>
      <RepoScreen owner={decodeURIComponent(owner)} repo={decodeURIComponent(repo)} />
    </AppShell>
  );
}
