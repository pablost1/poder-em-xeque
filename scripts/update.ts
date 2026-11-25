/**
 * Atualização completa, em um comando:  npm run update
 *   1. importa votações novas da Câmara e do Senado (a partir de 7 dias antes da última votação conhecida);
 *   2. completa as proposições novas com palavras-chave e atualiza quem está em exercício (listas oficiais);
 *   3. recalcula as tabelas derivadas (posições, concordância, perfil de votação…);
 *   4. grava a data da atualização e informa quantas votações ainda esperam marcação.
 * Votos novos não ganham marcação sozinhos: rode `npm run tags:export` e marque os lotes (veja o README).
 */
import { openDb } from "../src/lib/db";
import { deriveCore, deriveHistorico, deriveIv, deriveMandatos, deriveMapaLegislatura } from "../src/lib/derive";
import { derivePresenca } from "../src/lib/derive-presenca";
import { ingestCamara } from "./ingest-camara";
import { ingestSenado } from "./ingest-senado";
import { enrichBills } from "./enrich-bills";
import { sincronizarExercicio } from "./sync-exercicio";
import { ingestMesa, ingestPresencaAno } from "./ingest-presenca";
import { LEG_ATUAL } from "../src/lib/legislaturas";

const diasAntes = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() - n * 86400000).toISOString().slice(0, 10);

async function main() {
  const db = openDb();
  const hoje = new Date().toISOString().slice(0, 10);
  const ultima = (db.prepare("SELECT MAX(date) d FROM session_vote").get() as { d: string | null }).d ?? "2023-02-01";
  const from = diasAntes(ultima, 7);
  console.log(`Última votação conhecida: ${ultima}. Importando de ${from} até ${hoje}.`);

  const novasC = await ingestCamara(db, from, hoje);
  const novasS = await ingestSenado(db, from, hoje);
  const completas = await enrichBills(db);
  try {
    const e = await sincronizarExercicio(db);
    console.log(`Em exercício: ${e.camara} deputados, ${e.senado} senadores (${e.mudancas} alterações).`);
  } catch (err) {
    console.warn(`Aviso: não consegui atualizar quem está em exercício (${(err as Error).message}). Mantendo a lista anterior.`);
  }

  try {
    await ingestMesa(db, LEG_ATUAL);
    const p = await ingestPresencaAno(db, new Date().getFullYear(), true);
    if (p) console.log(`Presença: ${p.sessoes} sessões deliberativas do Plenário em ${new Date().getFullYear()}.`);
  } catch (err) {
    console.warn(`Aviso: não consegui atualizar a presença nas sessões (${(err as Error).message}).`);
  }

  console.log("Recalculando tabelas derivadas …");
  deriveCore(db, (n, s) => console.log(`  ${n} (${s.toFixed(1)}s)`));
  deriveIv(db);
  deriveHistorico(db);
  deriveMandatos(db);
  deriveMapaLegislatura(db);
  derivePresenca(db);

  const ultimaVotacao = (db.prepare("SELECT MAX(date) d FROM session_vote WHERE is_nominal = 1").get() as { d: string }).d;
  const pendentes = (
    db.prepare("SELECT COUNT(*) n FROM session_vote WHERE is_nominal = 1 AND id NOT IN (SELECT sv FROM vote_tag)").get() as { n: number }
  ).n;
  const setMeta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  setMeta.run("ultima_atualizacao", new Date().toISOString());
  setMeta.run("ultima_votacao", ultimaVotacao);

  console.log(
    `\nPronto. ${novasC} votações novas na Câmara, ${novasS} no Senado, ${completas} proposições completadas.` +
      `\nÚltima votação: ${ultimaVotacao}. ${pendentes} votações nominais ainda sem marcação` +
      (pendentes ? " — rode `npm run tags:export` para gerar os lotes." : "."),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
