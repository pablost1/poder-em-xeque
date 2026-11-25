import Link from "next/link";

/** "C:2655570-57" → "C-2655570-57" (só o primeiro ":" muda; o resto do id já tem hífens). */
export function votacaoSlug(sv: string): string {
  return sv.replace(":", "-");
}
/** Inverso de votacaoSlug. */
export function votacaoIdDoSlug(slug: string): string {
  return decodeURIComponent(slug).replace("-", ":");
}
export function projetoSlug(billId: string): string {
  return billId.replace(":", "-");
}

/** Link discreto para a página interna da votação (votos de cada partido e parlamentar). */
export function VotacaoLink({ sv, className = "" }: { sv: string; className?: string }) {
  return (
    <Link href={`/votacao/${votacaoSlug(sv)}`} className={`whitespace-nowrap underline-offset-2 hover:underline ${className}`}>
      ver votação
    </Link>
  );
}
