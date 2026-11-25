/**
 * Importa a atividade dos deputados: comissões (orgaosDeputados-L{n}) e proposições de autoria (proposicoesAutores + proposicoes).
 *   npm run history:atividade                         # 2003 até o ano atual
 *   npm run history:atividade -- --from 2019 --to 2022
 *   npm run history:atividade -- --so-comissoes
 *   npm run history:atividade -- --so-autoria          # reprocessa só a autoria (inclui a situação de cada proposição)
 * Os arquivos são grandes (dezenas de MB por ano) e ficam em data/bulk. Retomável e idempotente: cada ano apaga e regrava só as suas linhas.
 * Autoria do Senado não é importada (não há fonte utilizável).
 */
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "../src/lib/db";
import { legislaturaDaData, LEG_ATUAL, LEG_PRIMEIRA } from "../src/lib/legislaturas";
import { baixar } from "./ingest-historico";
import { lerRegistros } from "./lib/parse-camara-bulk";
import { autoresPorProposicao, cargoDaComissao, ehComissao, grupoDaSituacao, idDoDeputadoAutor, type AutorBulk, type OrgaoBulk, type PropBulk } from "./lib/parse-atividade";

/** Comissões e outros órgãos de uma legislatura. Devolve quantas linhas gravou. */
export async function ingestComissoes(db: DatabaseSync, legislatura: number): Promise<number> {
  const arq = await baixar("orgaosDeputados", `L${legislatura}`, legislatura === LEG_ATUAL);
  if (!arq) return 0;
  const ins = db.prepare("INSERT INTO member_comissao (member_id, legislatura, sigla, nome, cargo, inicio, fim) VALUES (?, ?, ?, ?, ?, ?, ?)");
  let n = 0;
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM member_comissao WHERE legislatura = ?").run(legislatura);
    for await (const r of lerRegistros<OrgaoBulk>(arq)) {
      if (!ehComissao(r)) continue;
      const dep = idDoDeputadoAutor(r.uriDeputado);
      if (!dep || !r.dataInicio) continue;
      ins.run(dep, legislatura, r.siglaOrgao, r.nomePublicacaoOrgao || r.nomeOrgao, cargoDaComissao(r.cargo), r.dataInicio.slice(0, 10), r.dataFim ? r.dataFim.slice(0, 10) : null);
      n++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return n;
}

/** Autoria dos arquivos de um ano. Só entram deputados que existem na base e que tinham mandato na legislatura da apresentação. */
export async function ingestAutoriaAno(db: DatabaseSync, ano: number, atualizar = false): Promise<{ proposicoes: number; linhas: number } | null> {
  const [fAut, fPro] = await Promise.all([baixar("proposicoesAutores", ano, atualizar), baixar("proposicoes", ano, atualizar)]);
  if (!fAut || !fPro) return null;
  const autores: AutorBulk[] = [];
  for await (const a of lerRegistros<AutorBulk>(fAut)) autores.push(a);
  const porProp = autoresPorProposicao(autores);
  const temMandato = new Set((db.prepare("SELECT member_id || '|' || legislatura k FROM mandato").all() as { k: string }[]).map((r) => r.k));
  const ins = db.prepare(
    `INSERT OR REPLACE INTO autoria (member_id, legislatura, prop_id, tipo, numero, ano, ementa, apresentacao, url, coautores, arquivo_ano, situacao, situacao_data, grupo_situacao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let proposicoes = 0;
  let linhas = 0;
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM autoria WHERE arquivo_ano = ?").run(ano);
    for await (const p of lerRegistros<PropBulk>(fPro)) {
      const deps = porProp.get(p.id);
      if (!deps?.length || !p.dataApresentacao) continue;
      const data = p.dataApresentacao.slice(0, 10);
      const leg = legislaturaDaData(data);
      if (leg < LEG_PRIMEIRA) continue;
      let entrou = false;
      for (const dep of deps) {
        if (!temMandato.has(`${dep}|${leg}`)) continue;
        ins.run(dep, leg, p.id, p.siglaTipo, p.numero, p.ano, p.ementa, data, p.urlInteiroTeor, deps.length - 1, ano, p.ultimoStatus?.descricaoSituacao ?? null, p.ultimoStatus?.data?.slice(0, 10) ?? null, grupoDaSituacao(p.ultimoStatus?.descricaoSituacao));
        linhas++;
        entrou = true;
      }
      if (entrou) proposicoes++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { proposicoes, linhas };
}

if (process.argv[1]?.includes("ingest-atividade")) {
  const arg = (k: string) => {
    const i = process.argv.indexOf(`--${k}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const hoje = new Date().getFullYear();
  const de = Number(arg("from")) || 2003;
  const ate = Number(arg("to")) || hoje;
  const db = openDb();
  (async () => {
    if (!process.argv.includes("--so-autoria")) for (let leg = legislaturaDaData(`${de}-03-01`); leg <= LEG_ATUAL; leg++) console.log(`  Comissões da ${leg}ª legislatura: ${await ingestComissoes(db, leg)} participações`);
    if (process.argv.includes("--so-comissoes")) return;
    for (let ano = de; ano <= ate; ano++) {
      const r = await ingestAutoriaAno(db, ano, ano === hoje);
      console.log(r ? `  ${ano}: ${r.proposicoes} proposições de deputados com mandato, ${r.linhas} linhas de autoria` : `  ${ano}: sem arquivo no servidor`);
    }
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
