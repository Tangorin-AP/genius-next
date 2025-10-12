
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

export default async function Home() {
  const decks = await prisma.deck.findMany({ orderBy: { createdAt: 'desc' } });
  if (decks.length === 1) redirect(`/deck/${decks[0].id}`);
  return (
    <main className="wrap">
      <div className="toolbar aqua">
        <div className="title">Genius (Web • Next.js)</div>
      </div>
      <div className="boxed">
        <div className="header grid-1">
          <div className="th qcol">Decks</div>
        </div>
        <div className="list">
          {decks.map(d => (
            <Link className="row linkrow" key={d.id} href={`/deck/${d.id}`}>{d.name}</Link>
          ))}
        </div>
      </div>
    </main>
  );
}
