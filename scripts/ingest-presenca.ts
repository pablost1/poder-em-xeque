/**
 * Importa a presença dos deputados nas sessões deliberativas do Plenário.
 *   npm run history:presenca                     # 2023 até o ano atual (padrão: legislatura atual)
 *   npm run history:presenca -- --from 2019 --to 2022
 * O arquivo do ano em curso é baixado de novo quando o tamanho no servidor muda. Retomável e idempotente.
 */
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "../src/lib/db";
import { legislaturaDaData, periodoDaLegislatura, LEG_ATUAL } from "../src/lib/legislaturas";
import { baixar } from "./ingest-historico";
import { lerRegistros } from "./lib/parse-camara-bulk";
import { montarSessoes, type EventoBulk, type PresencaBulk } from "./lib/parse-presenca";

type OrgaoDeputado = { siglaOrgao: string; cargo: string; dataInicio: string; dataFim: string | null; uriDeputado: string };

/** Cargos na Mesa Diretora de uma legislatura (arquivo orgaosDeputados-L{n}.json). Só linhas de cargo de verdade. */
export async function ingestMesa(db: DatabaseSync, legislatura: number): Promise<number> {
  const arq = await baixar("orgaosDeputados", `L${legislatura}`, legislatura === LEG_ATUAL);
  if (!arq) return 0;
  const ins = db.prepare("INSERT INTO mesa_cargo (member_id, legislatura, cargo, inicio, fim) VALUES (?, ?, ?, ?, ?)");
  let n = 0;
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM mesa_cargo WHERE legislatura = ?").run(legislatura);
    for await (const r of lerRegistros<OrgaoDeputado>(arq)) {
      if (r.siglaOrgao !== "MESA" || r.cargo === "Titular" || r.cargo === "Suplente") continue;
      const id = r.uriDeputado.split("/").pop();
      if (!id) continue;
      ins.run(`C:${id}`, legislatura, r.cargo, r.dataInicio.slice(0, 10), r.dataFim ? r.dataFim.slice(0, 10) : null);
      n++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return n;
}

export async function ingestPresencaAno(db: DatabaseSync, ano: number, atualizar = false): Promise<{ sessoes: number; semLista: number; presencas: number } | null> {
  const [fEv, fPr] = await Promise.all([baixar("eventos", ano, atualizar), baixar("eventosPresencaDeputados", ano, atualizar)]);
  if (!fEv || !fPr) return null;
  const eventos: EventoBulk[] = [];
  for await (const e of lerRegistros<EventoBulk>(fEv)) eventos.push(e);
  const presencas: PresencaBulk[] = [];
  for await (const p of lerRegistros<PresencaBulk>(fPr)) presencas.push(p);
  const sessoes = montarSessoes(eventos, presencas);

  const delPres = db.prepare("DELETE FROM presenca_sessao WHERE sessao_id = ?");
  const insSessao = db.prepare("INSERT OR REPLACE INTO sessao_plenario (id, data, hora, com_presenca) VALUES (?, ?, ?, ?)");
  const insPres = db.prepare("INSERT OR IGNORE INTO presenca_sessao (member_id, sessao_id) VALUES (?, ?)");
  let n = 0;
  db.exec("BEGIN");
  try {
    // sessões do ano que deixaram de existir no arquivo (ex.: reclassificadas) saem do banco
    const ids = new Set(sessoes.map((s) => s.id));
    for (const r of db.prepare("SELECT id FROM sessao_plenario WHERE substr(data, 1, 4) = ?").all(String(ano)) as { id: number }[]) {
      if (!ids.has(r.id)) {
        delPres.run(r.id);
        db.prepare("DELETE FROM sessao_plenario WHERE id = ?").run(r.id);
      }
    }
    for (const s of sessoes) {
      insSessao.run(s.id, s.data, s.hora, s.comPresenca ? 1 : 0);
      delPres.run(s.id);
      for (const d of s.presentes) {
        insPres.run(`C:${d}`, s.id);
        n++;
      }
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { sessoes: sessoes.length, semLista: sessoes.filter((s) => !s.comPresenca).length, presencas: n };
}

if (require.main === module) {
  const arg = (nome: string, padrao: number) => {
    const i = process.argv.indexOf(`--${nome}`);
    return i >= 0 ? Number(process.argv[i + 1]) : padrao;
  };
  const de = arg("from", Number(periodoDaLegislatura(LEG_ATUAL).inicio.slice(0, 4)));
  const ate = arg("to", new Date().getFullYear());
  const db = openDb();
  (async () => {
    for (let leg = legislaturaDaData(`${de}-03-01`); leg <= LEG_ATUAL; leg++) console.log(`  Mesa Diretora da ${leg}ª legislatura: ${await ingestMesa(db, leg)} cargos`);
    for (let ano = de; ano <= ate; ano++) {
      const r = await ingestPresencaAno(db, ano, ano === new Date().getFullYear());
      console.log(r ? `  ${ano}: ${r.sessoes} sessões deliberativas realizadas (${r.semLista} sem lista de presença), ${r.presencas} presenças` : `  ${ano}: sem arquivo no servidor`);
    }
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
