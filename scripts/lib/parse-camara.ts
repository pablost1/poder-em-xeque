import { normalizeVote } from "../../src/lib/db";
import type { ParsedVotacao } from "./parsed";

/* Formas das respostas da API de dados abertos da Câmara (só os campos que usamos). */
export type Prop = { id: number; siglaTipo: string; numero: number; ano: number; ementa: string | null };
export type VotacaoListItem = { id: string; data: string; siglaOrgao: string };
export type VotacaoDetail = {
  dados:
    | []
    | {
        id: string;
        data: string;
        descricao: string | null;
        aprovacao: number | null;
        descUltimaAberturaVotacao?: string | null;
        proposicoesAfetadas?: Prop[];
        objetosPossiveis?: Prop[];
      };
};
export type VotoItem = {
  tipoVoto: string;
  deputado_: { id: number; nome: string; siglaPartido: string | null; siglaUf: string | null; urlFoto: string | null };
};
export type Orient = {
  orientacaoVoto: string;
  codTipoLideranca: string; // 'P' partido, 'B' bloco / governo / minoria
  siglaPartidoBloco: string;
};

/** Converte as três respostas da API de uma votação no formato interno. */
export function parseVotacaoCamara(
  item: VotacaoListItem,
  detail: VotacaoDetail,
  votos: { dados: VotoItem[] },
  orientacoes: { dados: Orient[] },
): ParsedVotacao {
  // Um detalhe 404 volta como { dados: [] }: cai para os dados da listagem.
  const d = (Array.isArray(detail.dados) ? {} : detail.dados) as Exclude<VotacaoDetail["dados"], []>;
  const prop = d.proposicoesAfetadas?.[0] ?? d.objetosPossiveis?.[0];
  return {
    chamber: "C",
    svId: `C:${item.id}`,
    date: (d.data ?? item.data).slice(0, 10),
    description: d.descUltimaAberturaVotacao ?? d.descricao ?? null,
    result: d.aprovacao === 1 ? "approved" : d.aprovacao === 0 ? "rejected" : null,
    nominal: votos.dados.length > 0,
    bill: prop ? { id: `C:${prop.id}`, label: `${prop.siglaTipo} ${prop.numero}/${prop.ano}`, ementa: prop.ementa } : null,
    members: votos.dados.map((v) => ({
      id: `C:${v.deputado_.id}`,
      name: v.deputado_.nome,
      party: v.deputado_.siglaPartido,
      uf: v.deputado_.siglaUf,
      photo: v.deputado_.urlFoto,
    })),
    votes: votos.dados.map((v) => ({
      memberId: `C:${v.deputado_.id}`,
      party: v.deputado_.siglaPartido,
      vote: normalizeVote(v.tipoVoto),
    })),
    orientations: orientacoes.dados
      .filter((o) => o.orientacaoVoto)
      .map((o) => ({
        key: o.siglaPartidoBloco,
        kind: o.codTipoLideranca === "P" ? ("party" as const) : ("bloc" as const),
        orientation: o.orientacaoVoto,
      })),
  };
}
