import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { stats } from "@/lib/queries";
import { fmtData, fmtNum } from "@/lib/format";
import { Card, PageSkeleton, buttonClass, inputClass } from "@/components/ui";

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="rounded-md bg-brand-deep px-6 py-10 text-white sm:px-10">
        <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">Como o Congresso realmente vota?</h1>
        <p className="mt-3 max-w-2xl text-white/80">
          Votos nominais de todos os deputados federais e senadores, por pessoa e por partido. Compare partidos, veja quantas
          vezes um parlamentar votou com qualquer partido e conheça o perfil de votação de cada um: Estado, Mercado e Privilégios.
        </p>
        <form action="/busca" className="mt-6 flex max-w-lg gap-2">
          <label htmlFor="q" className="sr-only">
            Buscar projeto ou parlamentar
          </label>
          <input id="q" name="q" placeholder="Buscar projeto ou parlamentar…" className={`${inputClass} flex-1 border-transparent`} />
          <button className="inline-flex items-center rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#1351b4] hover:bg-[#dbe8fb]">
            Buscar
          </button>
        </form>
      </section>

      <Suspense fallback={<PageSkeleton />}>
        <Stats />
      </Suspense>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Parlamentares">
          <p className="text-sm text-muted">Histórico de votos, quantas vezes votou com cada partido e perfil de votação.</p>
          <Link className={`${buttonClass.secondary} mt-4`} href="/membros">
            Ver parlamentares
          </Link>
        </Card>
        <Card title="Partidos">
          <p className="text-sm text-muted">Coesão e o que cada partido apoia e rejeita.</p>
          <Link className={`${buttonClass.secondary} mt-4`} href="/partidos">
            Ver partidos
          </Link>
        </Card>
        <Card title="Comparar">
          <p className="text-sm text-muted">Quantas vezes o partido A votou com — ou contra — o partido B?</p>
          <Link className={`${buttonClass.secondary} mt-4`} href="/comparar">
            Abrir a matriz
          </Link>
        </Card>
        <Card title="História">
          <p className="text-sm text-muted">Como cada partido votou ao longo das legislaturas, desde 2003.</p>
          <Link className={`${buttonClass.secondary} mt-4`} href="/historia">
            Ver a linha do tempo
          </Link>
        </Card>
        <Card title="Mandatos">
          <p className="text-sm text-muted">Mandatos passados e atuais, como terminaram e a participação em cada um.</p>
          <Link className={`${buttonClass.secondary} mt-4`} href="/mandatos">
            Consultar mandatos
          </Link>
        </Card>
        <Card title="Participação">
          <p className="text-sm text-muted">Quem mais registrou voto, presença nas sessões e motivos de ausência no Senado.</p>
          <Link className={`${buttonClass.secondary} mt-4`} href="/rankings?eixo=participacao">
            Ver participação
          </Link>
        </Card>
        <Card title="Rankings">
          <p className="text-sm text-muted">Quem mais votou pelo Estado, pelo Mercado e por privilégios de políticos, e quem mais participou das votações.</p>
          <Link className={`${buttonClass.secondary} mt-4`} href="/rankings">
            Ver rankings
          </Link>
        </Card>
      </section>
    </div>
  );
}

async function Stats() {
  await connection();
  const s = stats();
  const items = [
    ["Votações nominais", fmtNum(s.votacoes)],
    ["Parlamentares", fmtNum(s.members)],
    ["Votos individuais", fmtNum(s.votes)],
    ["Período", s.first ? `${fmtData(s.first)} → ${fmtData(s.last)}` : "–"],
  ];
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-md border border-line bg-surface p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{k}</dt>
          <dd className="mt-1 text-xl font-extrabold tabular-nums text-ink-strong">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
