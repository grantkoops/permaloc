import Chat from "./Chat";

export const metadata = { title: "Permaloc Assistant" };

export default async function EmbedPage({ searchParams }: { searchParams: Promise<{ standalone?: string }> }) {
  const { standalone } = await searchParams;
  return <Chat embedded={standalone === undefined} />;
}
