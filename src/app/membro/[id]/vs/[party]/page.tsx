import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getMember } from "@/lib/queries";
import { Breadcrumb, PageSkeleton } from "@/components/ui";
import { MemberVsPartyView } from "@/components/member-vs-party";

export default function MemberVsPartyPage(props: PageProps<"/membro/[id]/vs/[party]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<PageProps<"/membro/[id]/vs/[party]">, "params">) {
  await connection();
  const { id: rawId, party: rawParty } = await params;
  const member = getMember(decodeURIComponent(rawId).replace("-", ":"));
  if (!member) notFound();
  const party = decodeURIComponent(rawParty);
  return (
    <div className="space-y-5">
      <Breadcrumb
        items={[
          { href: "/membros", label: "Parlamentares" },
          { href: `/membro/${rawId}`, label: member.name },
          { label: `vs ${party}` },
        ]}
      />
      <MemberVsPartyView memberId={member.id} memberName={member.name} memberParty={member.party} party={party} />
    </div>
  );
}
