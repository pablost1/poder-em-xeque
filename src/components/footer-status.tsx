import { connection } from "next/server";
import { getStatus } from "@/lib/queries";
import { fmtData, plural } from "@/lib/format";

/** Linha do rodapé com a data dos dados e quantas votações ainda não foram marcadas. */
export async function FooterStatus() {
  await connection();
  let s;
  try {
    s = getStatus();
  } catch {
    return null; // banco sem a tabela de controle: não mostra nada
  }
  return (
    <p className="text-white/60">
      {s.atualizadoEm && <>Dados atualizados em {fmtData(s.atualizadoEm)}. </>}
      {s.ultimaVotacao && <>Última votação nominal importada: {fmtData(s.ultimaVotacao)}. </>}
      {s.pendentes > 0 && <>{plural(s.pendentes, "votação nominal ainda sem marcação", "votações nominais ainda sem marcação")}.</>}
    </p>
  );
}
