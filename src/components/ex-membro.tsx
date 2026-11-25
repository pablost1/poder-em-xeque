import Link from "next/link";
import Image from "next/image";
import type { MemberHistorico } from "@/lib/queries";
import { mandatosDoMembro } from "@/lib/queries";
import { MandatosAnteriores } from "@/components/mandatos-anteriores";
import { LEG_ATUAL } from "@/lib/legislaturas";
import { Breadcrumb, Tag } from "@/components/ui";
import { ExParlamentarTag } from "@/components/legislatura-vigente";

/**
 * Página de quem não está em exercício na legislatura atual. Os números do site (perfil, rankings, mapa) são só da
 * legislatura atual, então aqui mostramos o que existe do passado: em que legislaturas votou, por qual partido e quantos votos.
 */
export function ExMembro({ membro }: { membro: MemberHistorico }) {
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ href: "/membros?vigente=0", label: "Parlamentares" }, { label: membro.name }]} />
      <div className="flex items-center gap-4">
        {membro.photo_url && (
          <Image src={membro.photo_url} alt="" width={72} height={92} unoptimized className="h-23 w-18 rounded object-cover" />
        )}
        <div>
          <h1 className="text-2xl font-extrabold text-ink-strong sm:text-3xl">{membro.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Tag className="bg-brand-soft text-brand">{membro.chamber === "C" ? "Deputado(a) federal" : "Senador(a)"}</Tag>
            <ExParlamentarTag ultimaLeg={membro.ultima_leg} ultimoVoto={membro.ultimo_voto} />
          </p>
        </div>
      </div>

      <div role="note" className="rounded-md border border-line bg-surface-2 p-4 text-sm">
        <strong className="text-ink-strong">Esta pessoa não está em exercício hoje.</strong> {membro.ultima_leg === LEG_ATUAL
          ? "Ela votou na legislatura atual, mas deixou o cargo. "
          : ""}O perfil de votação, os rankings e o mapa mostram só quem está no cargo, por isso não aparecem aqui. Abaixo estão as
        legislaturas em que ela votou (votações nominais).
      </div>

      <MandatosAnteriores rawId={membro.id.replace(":", "-")} mandatos={mandatosDoMembro(membro.id)} titulo="Mandatos" incluirAtual />

      <p className="text-xs">
        <Link href="/membros">Voltar para os parlamentares em exercício</Link>
      </p>
    </div>
  );
}
