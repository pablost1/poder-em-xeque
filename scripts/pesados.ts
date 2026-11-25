/**
 * Lista as votações classificadas que mais pesam nas barras de uma legislatura, para conferência humana.
 *   npm run tags:pesados -- --legislatura 56 [--limite 25]
 * A conferência e a correção são feitas em /revisar?tipo=pesados&legislatura=56 (servidor com ADMIN=1).
 */
import { openDb } from "../src/lib/db";
import { useDb as ligarBanco, votosPesados } from "../src/lib/queries";

function opt(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const leg = Number(opt("legislatura"));
if (!Number.isInteger(leg)) throw new Error("Use --legislatura N");
const limite = Number(opt("limite")) || 25;
ligarBanco(openDb(true));
const num = (x: number) => x.toFixed(1).replace(".", ",").replace("-", "−");
for (const r of votosPesados(leg, limite, 0)) {
  console.log(
    `${String(Math.round(r.influencia)).padStart(5)} | ${r.sv} | ${r.bill_label ?? "—"} | e ${num(r.economic)} p ${num(r.privilege)} c ${r.confidence} | ${(r.rationale ?? "").slice(0, 90)}`,
  );
}
