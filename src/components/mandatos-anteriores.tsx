import Link from "next/link";
import { aprovacaoDoMandato, atividadeDoMandato, discursosDoMandato, mandatoIv, type MandatoRow } from "@/lib/queries";
import { LEG_ATUAL, rotuloLegislatura } from "@/lib/legislaturas";
import { fmtData, fmtNum } from "@/lib/format";
import { Card } from "@/components/ui";
import { PerfilBarras } from "@/components/perfil-barras";
import { LinkParticipacao } from "@/components/link-participacao";
import { CondicaoMandato, LicencasMandato, NaturezaMandato } from "@/components/natureza-mandato";

/**
 * Lista de mandatos de uma pessoa, um cartão por legislatura, cada um com a natureza do mandato, o partido da época,
 * os votos e o perfil daquela legislatura. Fica na página do parlamentar; o detalhe está em /membro/[id]/mandato/[leg].
 */
export function MandatosAnteriores({ rawId, mandatos, titulo = "Mandatos", incluirAtual = false }: { rawId: string; mandatos: MandatoRow[]; titulo?: string; incluirAtual?: boolean }) {
  const lista = incluirAtual ? mandatos : mandatos.filter((m) => m.legislatura !== LEG_ATUAL);
  if (lista.length === 0) return null;
  return (
    <Card id="mandatos-anteriores" title={titulo} aside={<span className="text-xs text-muted">votos de cada legislatura, separados</span>}>
      <ul className="divide-y divide-line-soft">
        {lista.map((m) => {
          const iv = mandatoIv(m.member_id, m.legislatura);
          const ap = m.member_id.startsWith("C:") ? aprovacaoDoMandato(m.member_id, m.legislatura) : null;
          const dc = discursosDoMandato(m.member_id, m.legislatura);
          const at = m.member_id.startsWith("C:") ? atividadeDoMandato(m.member_id, m.legislatura) : null;
          return (
            <li key={m.legislatura} className="grid gap-3 py-3 md:grid-cols-[1fr_minmax(0,22rem)]">
              <div className="space-y-1.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/membro/${rawId}/mandato/${m.legislatura}`} className="font-bold">
                    {rotuloLegislatura(m.legislatura)}
                  </Link>
                  <NaturezaMandato natureza={m.natureza} motivo={m.motivo} />
                  <CondicaoMandato condicao={m.condicao} />
                </div>
                <p className="text-xs text-muted">
                  {m.partido_sigla ?? "sem partido"}
                  {m.partido && m.partido_sigla && m.partido !== m.partido_sigla ? ` (hoje ${m.partido})` : ""}
                  {" · "}
                  {fmtNum(m.votos)} votos
                  {m.primeira && <> · de {fmtData(m.primeira)} a {fmtData(m.ultima)}</>}
                  {at && (at.projetos > 0 || at.comissoes > 0) && <> · {fmtNum(at.projetos)} projetos de autoria{ap?.coletado && ap.propostos > 0 ? ` (${fmtNum(ap.leis)} viraram lei)` : ""} · {fmtNum(at.comissoes)} comissões</>}
                  {dc.importado && dc.pronunciamentos > 0 && <> · {fmtNum(dc.pronunciamentos)} pronunciamentos</>}
                </p>
                <LicencasMandato licencas={m.licencas} />
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <Link href={`/membro/${rawId}/mandato/${m.legislatura}`}>Ver este mandato: votos, perfil, autoria e comissões →</Link>
                  <LinkParticipacao memberId={m.member_id} legislatura={m.legislatura} />
                </p>
              </div>
              <PerfilBarras iv={iv} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
