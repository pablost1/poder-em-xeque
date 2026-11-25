/**
 * Gera uma cópia enxuta do banco para publicar, sem mexer no original.
 *   npm run db:slim                          # grava data/congresso.prod.db
 *   npm run db:slim -- --out caminho.db
 * Corta o que o site não mostra: ementa e link das proposições de autoria que não são projetos (requerimentos, emendas,
 * pareceres… só entram na contagem) e encurta os resumos de discurso. As contagens e as páginas continuam iguais.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DB_PATH } from "../src/lib/db";
import { TIPOS_PROJETO } from "../src/lib/queries";

const i = process.argv.indexOf("--out");
const saida = i >= 0 ? process.argv[i + 1] : path.join(path.dirname(DB_PATH), "congresso.prod.db");
const RESUMO_MAX = 280;

const mb = (arq: string) => (fs.statSync(arq).size / 1048576).toFixed(0);
const antes = mb(DB_PATH);
if (fs.existsSync(saida)) fs.unlinkSync(saida);

const origem = new DatabaseSync(DB_PATH, { readOnly: true });
origem.exec(`VACUUM INTO '${saida.replaceAll("'", "''")}'`); // cópia consistente, mesmo com o banco em uso
origem.close();

const db = new DatabaseSync(saida);
const tipos = TIPOS_PROJETO.map((t) => `'${t}'`).join(",");
const a = db.prepare(`UPDATE autoria SET ementa = NULL, url = NULL WHERE tipo IS NULL OR tipo NOT IN (${tipos})`).run();
const d = db.prepare(`UPDATE discurso SET sumario = SUBSTR(sumario, 1, ${RESUMO_MAX}) || CASE WHEN LENGTH(sumario) > ${RESUMO_MAX} THEN '…' ELSE '' END WHERE LENGTH(sumario) > ${RESUMO_MAX}`).run();
console.log(`  autoria sem ementa/link: ${a.changes} linhas · resumos de discurso encurtados: ${d.changes}`);
db.exec("PRAGMA journal_mode = DELETE");
db.exec("ANALYZE");
db.exec("VACUUM");
db.close();
console.log(`  ${antes} MB → ${mb(saida)} MB (${saida})`);
