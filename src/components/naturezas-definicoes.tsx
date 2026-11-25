import { connection } from "next/server";
import Link from "next/link";
import { NATUREZA_INFO, NATUREZAS_DESFECHO } from "@/lib/mandato";
import { mandatosPorNatureza } from "@/lib/queries";
import { fmtNum } from "@/lib/format";
import { NaturezaMandato } from "@/components/natureza-mandato";

/** Definições da natureza do mandato, com as contagens atuais. Aparece na metodologia. */
export async function NaturezasDefinicoes() {
  await connection();
  const contagem = new Map(mandatosPorNatureza().map((r) => [r.natureza, r.n]));
  if (contagem.size === 0) return null;
  return (
    <div className="rounded-md border border-line bg-surface p-4 text-sm">
      <h3 className="font-bold text-ink-strong">Natureza do mandato</h3>
      <p className="mt-2">
        Cada mandato (uma pessoa numa legislatura) recebe uma etiqueta que diz como ele terminou, ou se continua. Ela vem do
        <strong> motivo registrado nas fontes oficiais</strong> (histórico do parlamentar na Câmara e mandatos no Senado), com as
        palavras da fonte. Não é um julgamento nosso: quando o motivo não é reconhecido, a etiqueta é &quot;situação não registrada&quot;
        e o texto oficial aparece na página do mandato.
      </p>
      <ul className="mt-3 divide-y divide-line-soft">
        {NATUREZAS_DESFECHO.map((k) => (
          <li key={k} className="flex flex-wrap items-start gap-3 py-2">
            <span className="w-56 shrink-0">
              <NaturezaMandato natureza={k} />
            </span>
            <span className="min-w-0 flex-1 text-muted">{NATUREZA_INFO[k].explicacao}</span>
            <span className="w-16 text-right text-xs tabular-nums text-muted">{fmtNum(contagem.get(k) ?? 0)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        <strong className="text-ink">Cassado</strong> só aparece quando a fonte registra &quot;Perda de Mandato por Resolução&quot;, isto é,
        decidida pela Casa. &quot;Ato da Mesa&quot;, &quot;recontagem de votos&quot; e &quot;decisão judicial&quot; são registros diferentes e têm etiquetas próprias.
        A coluna da direita é o número de mandatos em cada categoria. Quem está no cargo hoje não entra aqui: a situação de hoje é indicada pela legislatura (a atual é o padrão) e pelo botão &quot;Só legislatura vigente&quot;. Consulte todos em <Link href="/mandatos">Mandatos</Link>.
      </p>
    </div>
  );
}
