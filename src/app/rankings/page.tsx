import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { connection } from "next/server";
import { listPartyAcronyms, listUfs, rankMembers, rankParties } from "@/lib/queries";
import { EIXOS, eixoPorSlug, type Eixo } from "@/lib/eixos";
import { fmtNum, plural } from "@/lib/format";
import { NotaLegislatura } from "@/components/legislatura-vigente";
import { Breadcrumb, Card, PageSkeleton, PageTitle, Tag, buttonClass, inputClass, tableClass } from "@/components/ui";
import { RankingParticipacao } from "@/components/ranking-participacao";

export const metadata = { title: "Rankings — Poder em Xeque" };

const PAGE = 25;
/** Partidos com menos votos contados que isto recebem aviso de amostra pequena. */
const AMOSTRA_PEQUENA = 50;

const COR_BARRA: Record<string, string> = { estado: "bg-iv-left", mercado: "bg-iv-right", privilegios: "bg-iv-privilege" };

type Params = { eixo: string; tipo: "parlamentares" | "partidos"; casa?: "camara" | "senado"; partido?: string; uf?: string; pagina: number };

function href(p: Params, over: Partial<Params> = {}): string {
  const m = { ...p, ...over };
  const q = new URLSearchParams();
  q.set("eixo", m.eixo);
  if (m.tipo !== "parlamentares") q.set("tipo", m.tipo);
  if (m.tipo === "parlamentares") {
    if (m.casa) q.set("casa", m.casa);
    if (m.partido) q.set("partido", m.partido);
    if (m.uf) q.set("uf", m.uf);
    if (m.pagina > 1) q.set("pagina", String(m.pagina));
  }
  return `/rankings?${q}`;
}

export default function RankingsPage(props: PageProps<"/rankings">) {
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Rankings" }]} />
      <PageTitle sub="Quem mais votou em cada direção, entre os votos que foram marcados. Um ranking para cada eixo do perfil de votação.">
        Rankings
      </PageTitle>
      <NotaLegislatura />
      <Suspense fallback={<PageSkeleton />}>
        <Rankings searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Rankings({ searchParams }: Pick<PageProps<"/rankings">, "searchParams">) {
  await connection();
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const participacao = s("eixo") === "participacao";
  const eixo: Eixo = eixoPorSlug(s("eixo") ?? "") ?? EIXOS[0];
  const p: Params = {
    eixo: eixo.slug,
    tipo: s("tipo") === "partidos" ? "partidos" : "parlamentares",
    casa: s("casa") === "senado" ? "senado" : s("casa") === "camara" ? "camara" : undefined,
    partido: s("partido") || undefined,
    uf: s("uf") || undefined,
    pagina: Math.max(1, Number(s("pagina")) || 1),
  };

  return (
    <>
      <div role="tablist" aria-label="Eixo do ranking" className="flex flex-wrap gap-1 border-b border-line">
        {EIXOS.map((e) => (
          <Link
            key={e.slug}
            href={href(p, { eixo: e.slug, pagina: 1 })}
            role="tab"
            aria-selected={e.slug === eixo.slug && !participacao}
            className={`border-b-4 px-4 py-2 text-sm font-semibold ${
              e.slug === eixo.slug && !participacao ? "border-brand text-brand" : "border-transparent text-ink hover:border-line"
            }`}
          >
            {e.rotulo}
          </Link>
        ))}
        <Link
          href="/rankings?eixo=participacao"
          role="tab"
          aria-selected={participacao}
          className={`border-b-4 px-4 py-2 text-sm font-semibold ${participacao ? "border-brand text-brand" : "border-transparent text-ink hover:border-line"}`}
        >
          Participação
        </Link>
      </div>

      {participacao ? (
        <RankingParticipacao sp={sp} />
      ) : (
        <>
      <Card title={eixo.tituloRanking}>
        <p className="text-sm text-muted">{eixo.descricao}</p>
        <p className="mt-2 text-xs text-muted">
          O ranking mostra apenas o alinhamento nos votos que foram marcados, com o número de votos contados em cada linha. Não é
          um julgamento de valor nem uma nota oficial, e depende das marcações descritas na{" "}
          <Link href="/metodologia">metodologia</Link>. Entram no ranking de parlamentares apenas quem tem pelo menos{" "}
          {eixo.minimoRanking} votos contados neste eixo; empates dividem a mesma posição.
          {eixo.slug !== "privilegios" &&
            " Estado e Mercado somam 100 para cada pessoa: os dois rankings são o inverso um do outro."}
        </p>
      </Card>

      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        {(["parlamentares", "partidos"] as const).map((t) => (
          <Link
            key={t}
            href={href(p, { tipo: t, pagina: 1 })}
            className={`rounded-full border px-4 py-1.5 ${
              p.tipo === t ? "border-brand-solid bg-brand-solid text-on-brand" : "border-line text-ink hover:border-brand"
            }`}
          >
            {t === "parlamentares" ? "Parlamentares" : "Partidos"}
          </Link>
        ))}
      </div>

      {p.tipo === "parlamentares" ? <TabelaParlamentares p={p} eixo={eixo} /> : <TabelaPartidos p={p} eixo={eixo} />}
        </>
      )}
    </>
  );
}

function Barra({ slug, valor }: { slug: string; valor: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 w-full min-w-24 overflow-hidden rounded-full bg-iv-empty" role="img" aria-label={`${Math.round(valor)} de 100`}>
        <div className={`h-full ${COR_BARRA[slug]}`} style={{ width: `${valor}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-bold tabular-nums text-ink-strong">{Math.round(valor)}</span>
    </div>
  );
}

function TabelaParlamentares({ p, eixo }: { p: Params; eixo: Eixo }) {
  const chamber = p.casa === "camara" ? "C" : p.casa === "senado" ? "S" : undefined;
  const { rows, total } = rankMembers(eixo, { chamber, party: p.partido, uf: p.uf, limit: PAGE, offset: (p.pagina - 1) * PAGE });
  const ultima = Math.max(1, Math.ceil(total / PAGE));
  const partidos = listPartyAcronyms();
  const ufs = listUfs();

  return (
    <>
      <form className="flex flex-wrap items-end gap-2 text-xs">
        <input type="hidden" name="eixo" value={eixo.slug} />
        <label className="grid gap-1 font-semibold">
          Casa
          <select name="casa" defaultValue={p.casa ?? ""} className={inputClass}>
            <option value="">Câmara e Senado</option>
            <option value="camara">Câmara</option>
            <option value="senado">Senado</option>
          </select>
        </label>
        <label className="grid gap-1 font-semibold">
          Partido
          <select name="partido" defaultValue={p.partido ?? ""} className={inputClass}>
            <option value="">Todos</option>
            {partidos.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 font-semibold">
          UF
          <select name="uf" defaultValue={p.uf ?? ""} className={inputClass}>
            <option value="">Todas</option>
            {ufs.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <button className={buttonClass.primary}>Filtrar</button>
      </form>
      <p className="text-xs text-muted">
        {plural(total, "parlamentar com nota", "parlamentares com nota")} · página {fmtNum(p.pagina)} de {fmtNum(ultima)}
      </p>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className={tableClass.table}>
          <thead className={tableClass.head}>
            <tr>
              <th className="px-4 py-2.5">#</th>
              <th className="px-4 py-2.5">Parlamentar</th>
              <th className="px-4 py-2.5">Partido</th>
              <th className="px-4 py-2.5">UF</th>
              <th className="w-1/4 px-4 py-2.5">{eixo.rotulo}</th>
              <th className="px-4 py-2.5 text-right">Votos contados</th>
            </tr>
          </thead>
          <tbody className={tableClass.body}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 font-bold tabular-nums">{fmtNum(r.rk)}</td>
                <td className="px-4 py-2">
                  <Link href={`/membro/${r.id.replace(":", "-")}/barras/${eixo.slug}`} className="flex items-center gap-2 font-bold">
                    {r.photo_url ? (
                      <Image src={r.photo_url} alt="" width={28} height={36} unoptimized className="h-9 w-7 rounded object-cover" />
                    ) : (
                      <span className="h-9 w-7 rounded bg-surface-2" />
                    )}
                    <span>
                      {r.name}
                      <span className="block text-xs font-normal text-muted">{r.chamber === "C" ? "Deputado(a)" : "Senador(a)"}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-2">{r.party ?? "–"}</td>
                <td className="px-4 py-2">{r.uf ?? "–"}</td>
                <td className="px-4 py-2">
                  <Barra slug={eixo.slug} valor={r.score} />
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtNum(r.n)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted">
                  Nenhum parlamentar com nota para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between text-sm font-semibold">
        {p.pagina > 1 ? <Link href={href(p, { pagina: p.pagina - 1 })}>← Anterior</Link> : <span />}
        {p.pagina < ultima && <Link href={href(p, { pagina: p.pagina + 1 })}>Próxima →</Link>}
      </div>
    </>
  );
}

function TabelaPartidos({ eixo }: { p: Params; eixo: Eixo }) {
  const rows = rankParties(eixo);
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className={tableClass.table}>
        <thead className={tableClass.head}>
          <tr>
            <th className="px-4 py-2.5">#</th>
            <th className="px-4 py-2.5">Partido</th>
            <th className="w-1/3 px-4 py-2.5">{eixo.rotulo}</th>
            <th className="px-4 py-2.5 text-right">Parlamentares</th>
            <th className="px-4 py-2.5 text-right">Votos contados</th>
          </tr>
        </thead>
        <tbody className={tableClass.body}>
          {rows.map((r) => (
            <tr key={r.party}>
              <td className="px-4 py-2 font-bold tabular-nums">{fmtNum(r.rk)}</td>
              <td className="px-4 py-2">
                <Link className="font-bold" href={`/partido/${encodeURIComponent(r.party)}`}>
                  {r.party}
                </Link>
                {r.n < AMOSTRA_PEQUENA && <Tag className="ml-2">amostra pequena</Tag>}
              </td>
              <td className="px-4 py-2">
                <Barra slug={eixo.slug} valor={r.score} />
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{fmtNum(r.members)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmtNum(r.n)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
