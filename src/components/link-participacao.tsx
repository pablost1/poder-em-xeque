import Link from "next/link";
import { LEG_ATUAL } from "@/lib/legislaturas";
import { pct } from "@/components/ui";

/**
 * Atalho para a página de participação e presença de uma pessoa, com a taxa quando ela é conhecida.
 * Fica FORA do cartão clicável da lista (um link dentro de outro link não é válido).
 */
export function LinkParticipacao({ memberId, legislatura, taxa, className = "" }: { memberId: string; legislatura?: number; taxa?: number | null; className?: string }) {
  const q = legislatura && legislatura !== LEG_ATUAL ? `?leg=${legislatura}` : "";
  return (
    <Link href={`/membro/${memberId.replace(":", "-")}/participacao${q}`} className={`text-xs ${className}`}>
      Participação e presença{taxa != null ? `: ${pct(taxa)} das votações` : ""} →
    </Link>
  );
}
