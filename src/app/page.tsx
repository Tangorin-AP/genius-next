
import Link from 'next/link';
import { prisma } from '@/lib/prisma';

export default async function Home() {
  const decks = await prisma.deck.findMany({ orderBy: { createdAt: 'desc' } });
  return (
    <main className="wrap">
      <div className="toolbar">
        <div className="left">
          <h1>Genius (Web • Next.js)</h1>
        </div>
      </div>
      <div className="boxed">
        <div className="header">Decks</div>
        <div className="list">
          {decks.map(d => (
            <Link className="row" key={d.id} href={`/deck/${d.id}`}>{d.name}</Link>
          ))}
        </div>
      </div>
    </main>
  );
}
