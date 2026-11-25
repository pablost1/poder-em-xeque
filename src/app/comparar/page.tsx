import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { agreementMatrix, getMember, listMembers, listPartyAcronyms, memberVsMember, pairVotes, type ChamberFilter } from "@/lib/queries";
import { fmtData, fmtNum } from "@/lib/format";
import { Breadcrumb, Card, PageSkeleton, PageTitle, VoteChip, buttonClass, inputClass, pct } from "@/components/ui";
import { MemberVsPartyView } from "@/components/member-vs-party";
import { BillLabel } from "@/components/bill-link";
import { VotacaoLink } from "@/components/votacao-link";

export const metadata = { title: "Comparar — Poder em Xeque" };

export default function ComparePage(props: PageProps<"/comparar">) {
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Comparar" }]} />
      <PageTitle
        sub={
          <>
            A posição de um partido numa votação é a maioria dos seus parlamentares que votaram Sim ou Não. Cada célula mostra
            com que frequência dois partidos tiveram a <em>mesma</em> posição nas votações nominais em que ambos tinham posição.
            Clique numa célula para ver os projetos por trás do número.
          </>
        }
      >
        Comparar
      </PageTitle>
      <Suspense fallback={<PageSkeleton />}>
        <Compare searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

/** 0 = vermelho (sempre opostos) … 1 = verde (sempre juntos). A luminosidade vem do tema (--heat-l). */
function cellColor(share: number): string {
  return `hsl(${Math.round(share * 130)} 55% var(--heat-l))`;
}

async function Compare({ searchParams }: Pick<PageProps<"/comparar">, "searchParams">) {
  await connection();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const mode = str("modo") === "parlamentar" ? "parlamentar" : str("modo") === "parlamentares" ? "parlamentares" : "partido";

  const tabs = (
    <div role="tablist" aria-label="Tipo de comparação" className="flex gap-1 border-b border-line">
      {[
        { id: "partido", label: "Partido × partido", href: "/comparar" },
        { id: "parlamentar", label: "Parlamentar × partido", href: "/comparar?modo=parlamentar" },
        { id: "parlamentares", label: "Parlamentar × parlamentar", href: "/comparar?modo=parlamentares" },
      ].map((t) => (
        <Link
          key={t.id}
          href={t.href}
          role="tab"
          aria-selected={mode === t.id}
          className={`border-b-4 px-4 py-2 text-sm font-semibold ${
            mode === t.id ? "border-brand text-brand" : "border-transparent text-ink hover:border-line"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );

  if (mode === "parlamentares") {
    return (
      <>
        {tabs}
        <MemberMemberCompare q={str("q")} m={str("m")} q2={str("q2")} n={str("n")} />
      </>
    );
  }

  if (mode === "parlamentar") {
    return (
      <>
        {tabs}
        <MemberCompare q={str("q")} m={str("m")} p={str("p")} />
      </>
    );
  }

  const a = str("a");
  const b = str("b");
  const ch: ChamberFilter = str("casa") === "senado" ? "S" : str("casa") === "ambas" ? "ALL" : "C";
  const chQ = ch === "C" ? "" : `&casa=${ch === "S" ? "senado" : "ambas"}`;
  const { parties, rows } = agreementMatrix(ch);
  const lookup = new Map(rows.map((r) => [`${r.a}|${r.b}`, r]));
  const cell = (x: string, y: string) => lookup.get(x < y ? `${x}|${y}` : `${y}|${x}`);

  return (
    <>
      {tabs}
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="text-muted">Casa:</span>
        {(
          [
            ["C", "Câmara", ""],
            ["S", "Senado", "?casa=senado"],
            ["ALL", "Ambas", "?casa=ambas"],
          ] as const
        ).map(([v, label, qs]) => (
          <Link
            key={v}
            href={`/comparar${qs}`}
            className={`rounded-full border px-3 py-1 ${
              ch === v ? "border-brand-solid bg-brand-solid text-on-brand" : "border-line text-ink hover:border-brand"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
      <Card title="Matriz de concordância (maiores partidos)">
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th />
                {parties.map((p) => (
                  <th key={p} className="px-1 py-1 font-bold text-ink-strong [writing-mode:vertical-rl]">
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parties.map((r) => (
                <tr key={r}>
                  <th className="pr-2 text-right font-bold text-ink-strong">{r}</th>
                  {parties.map((c) => {
                    if (r === c) return <td key={c} className="h-7 w-9 bg-surface-2" />;
                    const x = cell(r, c);
                    if (!x || x.shared === 0) return <td key={c} className="h-7 w-9 text-center text-muted">–</td>;
                    const share = x.same / x.shared;
                    return (
                      <td key={c} className="h-7 w-9 p-0 text-center" style={{ background: cellColor(share) }}>
                        <Link
                          href={`/comparar?a=${encodeURIComponent(r)}&b=${encodeURIComponent(c)}${chQ}`}
                          className="block h-full w-full leading-7"
                          style={{ color: "var(--heat-ink)" }}
                          title={`${r} × ${c}: mesma posição em ${fmtNum(x.same)} de ${fmtNum(x.shared)} votações`}
                        >
                          {Math.round(share * 100)}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          Valores em % das votações em comum com a mesma posição (100 = sempre juntos, 0 = sempre opostos).
        </p>
      </Card>

      {a && b && <Pair a={a} b={b} ch={ch} />}
      {a && !b && <p className="text-sm text-muted">Escolha na matriz um segundo partido para comparar com o {a}.</p>}
    </>
  );
}

/** "Quantas vezes este parlamentar votou com aquele partido?" — escolha um parlamentar e depois um partido. */
function MemberCompare({ q, m, p }: { q?: string; m?: string; p?: string }) {
  const member = m ? getMember(m) : undefined;
  const matches = !member && q ? listMembers({ q }).slice(0, 12) : [];
  const parties = listPartyAcronyms();
  return (
    <div className="space-y-4">
      <Card title="1. Escolha um parlamentar">
        {member ? (
          <p className="text-sm">
            <strong>{member.name}</strong> ({member.party ?? "sem partido"}, {member.uf}) ·{" "}
            <Link href={`/comparar?modo=parlamentar${q ? `&q=${encodeURIComponent(q)}` : ""}`}>trocar</Link>
          </p>
        ) : (
          <>
            <form className="flex flex-wrap gap-2">
              <input type="hidden" name="modo" value="parlamentar" />
              <label htmlFor="mq" className="sr-only">
                Nome do parlamentar
              </label>
              <input id="mq" name="q" defaultValue={q} placeholder="Nome do deputado ou senador…" className={`${inputClass} w-72`} />
              <button className={buttonClass.primary}>Buscar</button>
            </form>
            {q && matches.length === 0 && <p className="mt-2 text-sm text-muted">Nenhum parlamentar encontrado para “{q}”.</p>}
            <ul className="mt-3 grid gap-1 sm:grid-cols-2">
              {matches.map((x) => (
                <li key={x.id}>
                  <Link
                    href={`/comparar?modo=parlamentar&q=${encodeURIComponent(q ?? "")}&m=${encodeURIComponent(x.id)}${p ? `&p=${encodeURIComponent(p)}` : ""}`}
                    className="text-sm"
                  >
                    {x.name}{" "}
                    <span className="text-muted">
                      {x.party} · {x.uf} · {x.chamber === "C" ? "deputado(a)" : "senador(a)"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {member && (
        <Card title="2. Escolha um partido">
          <form className="flex flex-wrap gap-2">
            <input type="hidden" name="modo" value="parlamentar" />
            <input type="hidden" name="m" value={member.id} />
            {q && <input type="hidden" name="q" value={q} />}
            <label htmlFor="mp" className="sr-only">
              Partido
            </label>
            <select id="mp" name="p" defaultValue={p ?? member.party ?? ""} className={inputClass}>
              {parties.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <button className={buttonClass.primary}>Comparar</button>
          </form>
        </Card>
      )}

      {member && p && (
        <MemberVsPartyView memberId={member.id} memberName={member.name} memberParty={member.party} party={p} />
      )}
    </div>
  );
}

function Pair({ a, b, ch }: { a: string; b: string; ch: ChamberFilter }) {
  const { summary, votes } = pairVotes(a, b, ch);
  const share = summary.shared ? summary.same / summary.shared : null;
  return (
    <Card title={`${a} × ${b}${ch === "C" ? " (Câmara)" : ch === "S" ? " (Senado)" : ""}`}>
      <p className="mb-3 text-sm">
        Mesma posição em <strong>{fmtNum(summary.same ?? 0)}</strong> de <strong>{fmtNum(summary.shared)}</strong> votações em
        comum ({pct(share)}); posições opostas em <strong>{fmtNum(summary.shared - (summary.same ?? 0))}</strong>.
      </p>
      <p className="mb-2 text-xs text-muted">Divergências primeiro.</p>
      <ul className="divide-y divide-line-soft">
        {votes.map((v) => (
          <li key={v.sv} className="flex items-start gap-3 py-2.5 text-sm">
            <div className="flex w-32 shrink-0 flex-col gap-1 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-14 truncate font-semibold">{a}</span> <VoteChip vote={v.pos_a} />
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-14 truncate font-semibold">{b}</span> <VoteChip vote={v.pos_b} />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-ink-strong">
                <BillLabel billId={v.bill_id} label={v.bill_label} fallback="Votação procedimental" />
              </div>
              <div className="line-clamp-2 text-xs text-ink">{v.description}</div>
              <div className="line-clamp-1 text-xs text-muted">{v.ementa}</div>
              <div className="text-xs text-muted">
                {fmtData(v.date)} · <VotacaoLink sv={v.sv} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Quantas vezes dois parlamentares votaram igual, nas votações em que os dois votaram Sim ou Não. */
function MemberMemberCompare({ q, m, q2, n }: { q?: string; m?: string; q2?: string; n?: string }) {
  const a = m ? getMember(m) : undefined;
  const b = n ? getMember(n) : undefined;
  const matchesA = !a && q ? listMembers({ q }).slice(0, 12) : [];
  const matchesB = a && !b && q2 ? listMembers({ q: q2 }).slice(0, 12) : [];
  const href = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ modo: "parlamentares" });
    for (const [k, v] of Object.entries({ q, m, q2, n, ...o })) if (v) p.set(k, v);
    return `/comparar?${p}`;
  };
  const resultado = a && b ? memberVsMember(a.id, b.id) : null;
  const rotulo = (x: { name: string; party: string | null; uf: string | null }) => `${x.name} (${x.party ?? "sem partido"}, ${x.uf})`;

  return (
    <div className="space-y-4">
      <Card title="1. Escolha o primeiro parlamentar">
        {a ? (
          <p className="text-sm">
            <strong>{rotulo(a)}</strong> · <Link href={href({ m: undefined, n: undefined })}>trocar</Link>
          </p>
        ) : (
          <>
            <form className="flex flex-wrap gap-2">
              <input type="hidden" name="modo" value="parlamentares" />
              <label htmlFor="mq1" className="sr-only">
                Nome do primeiro parlamentar
              </label>
              <input id="mq1" name="q" defaultValue={q} placeholder="Nome do deputado ou senador…" className={`${inputClass} w-72`} />
              <button className={buttonClass.primary}>Buscar</button>
            </form>
            {q && matchesA.length === 0 && <p className="mt-2 text-sm text-muted">Nenhum parlamentar encontrado para &quot;{q}&quot;.</p>}
            <ul className="mt-3 grid gap-1 sm:grid-cols-2">
              {matchesA.map((x) => (
                <li key={x.id}>
                  <Link href={href({ m: x.id })} className="text-sm">
                    {x.name}{" "}
                    <span className="text-muted">
                      {x.party} · {x.uf} · {x.chamber === "C" ? "deputado(a)" : "senador(a)"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {a && (
        <Card title="2. Escolha o segundo parlamentar">
          {b ? (
            <p className="text-sm">
              <strong>{rotulo(b)}</strong> · <Link href={href({ n: undefined })}>trocar</Link>
            </p>
          ) : (
            <>
              <form className="flex flex-wrap gap-2">
                <input type="hidden" name="modo" value="parlamentares" />
                <input type="hidden" name="m" value={a.id} />
                {q && <input type="hidden" name="q" value={q} />}
                <label htmlFor="mq2" className="sr-only">
                  Nome do segundo parlamentar
                </label>
                <input id="mq2" name="q2" defaultValue={q2} placeholder="Nome do deputado ou senador…" className={`${inputClass} w-72`} />
                <button className={buttonClass.primary}>Buscar</button>
              </form>
              {q2 && matchesB.length === 0 && <p className="mt-2 text-sm text-muted">Nenhum parlamentar encontrado para &quot;{q2}&quot;.</p>}
              <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                {matchesB
                  .filter((x) => x.id !== a.id)
                  .map((x) => (
                    <li key={x.id}>
                      <Link href={href({ n: x.id })} className="text-sm">
                        {x.name}{" "}
                        <span className="text-muted">
                          {x.party} · {x.uf} · {x.chamber === "C" ? "deputado(a)" : "senador(a)"}
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {a && b && resultado && (
        <Card title={`${a.name} × ${b.name}`}>
          {a.chamber !== b.chamber && (
            <p className="mb-2 text-xs text-muted">
              Um é deputado e o outro senador: só entram votações em que ambos votaram, o que quase não acontece entre casas.
            </p>
          )}
          {resultado.shared === 0 ? (
            <p className="text-sm text-muted">Nenhuma votação em que os dois votaram Sim ou Não.</p>
          ) : (
            <>
              <p className="mb-3 text-sm">
                Votaram igual em <strong>{fmtNum(resultado.same)}</strong> de <strong>{fmtNum(resultado.shared)}</strong> votações em
                comum (<strong>{pct(resultado.same / resultado.shared)}</strong>) e de forma oposta em{" "}
                <strong>{fmtNum(resultado.shared - resultado.same)}</strong>.
              </p>
              <p className="mb-2 text-xs text-muted">Contam só votações em que os dois votaram Sim ou Não. Divergências primeiro.</p>
              <ul className="divide-y divide-line-soft">
                {resultado.votes.map((v) => (
                  <li key={v.sv} className="flex items-start gap-3 py-2.5 text-sm">
                    <div className="flex w-44 shrink-0 flex-col gap-1 text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="w-24 truncate font-semibold">{a.name}</span> <VoteChip vote={v.vote_a} />
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-24 truncate font-semibold">{b.name}</span> <VoteChip vote={v.vote_b} />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-ink-strong">
                        <BillLabel billId={v.bill_id} label={v.bill_label} fallback="Votação procedimental" />
                      </div>
                      <div className="line-clamp-2 text-xs text-ink">{v.description}</div>
                      <div className="line-clamp-1 text-xs text-muted">{v.ementa}</div>
                      <div className="text-xs text-muted">
                        {fmtData(v.date)} · <VotacaoLink sv={v.sv} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
