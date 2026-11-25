import { memberVsParty } from "@/lib/queries";
import { Card, VoteChip, pct } from "@/components/ui";
import { fmtData, fmtNum } from "@/lib/format";
import { BillLabel } from "@/components/bill-link";
import { VotacaoLink } from "@/components/votacao-link";

/** Resumo + lista de evidências de "quantas vezes <parlamentar> votou com <partido>". Componente de servidor. */
export function MemberVsPartyView({
  memberId,
  memberName,
  memberParty,
  party,
}: {
  memberId: string;
  memberName: string;
  memberParty: string | null;
  party: string;
}) {
  const { shared, same, votes } = memberVsParty(memberId, party);
  const own = memberParty === party;
  return (
    <Card title={`${memberName} × ${party}`}>
      {shared === 0 ? (
        <p className="text-sm text-muted">
          Nenhuma votação em que {memberName} votou Sim/Não e o {party} teve posição clara.
        </p>
      ) : (
        <>
          <p className="mb-1 text-sm">
            {memberName} votou com a maioria do {party} em <strong>{fmtNum(same)}</strong> de <strong>{fmtNum(shared)}</strong>{" "}
            votações em comum (<strong>{pct(same / shared)}</strong>) e contra ela em <strong>{fmtNum(shared - same)}</strong>.
          </p>
          <p className="mb-3 text-xs text-muted">
            Contam só as votações em que o parlamentar votou Sim ou Não e o partido teve posição majoritária.
            {own && " No caso do próprio partido, o voto do parlamentar é retirado da contagem do partido."}
          </p>
          <p className="mb-2 text-xs text-muted">
            Divergências primeiro{votes.length < shared ? ` (mostrando ${fmtNum(votes.length)} de ${fmtNum(shared)})` : ""}.
          </p>
          <ul className="divide-y divide-line-soft">
            {votes.map((v) => (
              <li key={v.sv} className="flex items-start gap-3 py-2.5 text-sm">
                <div className="flex w-40 shrink-0 flex-col gap-1 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-20 truncate font-semibold">Parlamentar</span> <VoteChip vote={v.member_vote} />
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-20 truncate font-semibold">{party}</span> <VoteChip vote={v.party_pos} />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-ink-strong">
                    <BillLabel billId={v.bill_id} label={v.bill_label} fallback="Votação procedimental" />
                  </div>
                  <div className="line-clamp-2 text-xs text-ink">{v.description}</div>
                  <div className="line-clamp-1 text-xs text-muted">{v.ementa}</div>
                  <div className="text-xs text-muted">
                    {fmtData(v.date)} · <VotacaoLink sv={v.sv} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
