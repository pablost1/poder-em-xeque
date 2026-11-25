import Link from "next/link";
import { Suspense } from "react";
import { Breadcrumb, PageTitle } from "@/components/ui";
import { ConsistenciaCard } from "@/components/consistencia-card";
import { NaturezasDefinicoes } from "@/components/naturezas-definicoes";
import { ValidacaoLegislaturas } from "@/components/validacao-legislaturas";

export const metadata = { title: "Metodologia — Poder em Xeque" };

const h2 = "pt-4 text-lg font-bold text-ink-strong";

export default function MethodologyPage() {
  return (
    <article className="max-w-3xl space-y-3 text-sm leading-relaxed">
      <Breadcrumb items={[{ label: "Metodologia" }]} />
      <PageTitle>Metodologia</PageTitle>

      <h2 className={h2}>Dados</h2>
      <p>
        Os votos vêm das APIs de dados abertos da Câmara dos Deputados e do Senado Federal, para as votações nominais em
        plenário da legislatura atual (desde fevereiro de 2023). Entram apenas votações <em>nominais</em>, em que a escolha de
        cada parlamentar é registrada. Votações simbólicas (quando a presidência apenas conta as mãos levantadas) e votações{" "}
        <em>secretas</em>, como a aprovação de autoridades, não têm registro por parlamentar e ficam de fora. No Senado, registros
        como &quot;presente, não registrou voto&quot;, licença, missão e o presidente da sessão não contam como voto. A ausência não
        é registrada pelas APIs, então a &quot;participação&quot; é votos dados ÷ votações nominais realizadas na casa.
      </p>

      <p>
        Sempre que aparece a identificação de uma proposição (por exemplo, &quot;PEC 45/2019&quot;), ela é um link com o símbolo ↗
        para a página oficial no site da Câmara ou do Senado, com tramitação, texto e votações. O link abre em uma nova aba.
      </p>

      <h2 className={h2}>Posição do partido, concordância e coesão</h2>
      <p>
        A <strong>posição</strong> de um partido numa votação é a maioria dos seus parlamentares que votaram Sim ou Não. Empates, e
        partidos com menos de dois votantes, ficam sem posição. A <strong>concordância</strong> entre dois partidos é a parcela das
        votações, entre aquelas em que ambos têm posição, em que as posições coincidem. A <strong>coesão</strong> é a parcela média
        dos votantes de um partido que ficou do lado da maioria do próprio partido. O partido de um parlamentar é o registrado na
        própria votação, então trocas de partido são respeitadas.
      </p>
      <p>
        <strong>Parlamentar × partido</strong> conta, para cada partido, as votações em que o parlamentar votou Sim ou Não e esse
        partido teve posição, e quantas vezes o parlamentar ficou do lado da maioria do partido. Para o próprio partido, o voto do
        parlamentar é retirado da contagem do partido antes, para que ele não concorde parcialmente consigo mesmo.
      </p>

      <h2 className={h2}>Perfil de votação</h2>
      <p>
        O perfil de votação tem três barras — <strong>Estado / Esquerda</strong>, <strong>Mercado / Direita</strong> e{" "}
        <strong>Privilégios</strong>. É uma <strong>interpretação</strong>, não uma nota oficial nem uma medida do valor de um
        político: descreve apenas como a pessoa votou nas medidas que foram marcadas de uma determinada maneira.
      </p>
      <p>
        <strong>Marcação.</strong> Cada votação nominal é marcada pelo <em>efeito de votar Sim</em>, porque Sim nem sempre significa
        &quot;a favor do projeto&quot; (por exemplo, numa emenda que suprime um artigo). A marcação tem um valor econômico de −1
        (um Sim empurra para o Estado: gasto público, regulação, proteção ao trabalho, impostos sobre o capital) a +1 (para o
        mercado: corte de impostos, desregulamentação, privatização, flexibilização trabalhista), um valor de privilégio de −1
        (um Sim reduz privilégios de políticos) a +1 (um Sim os amplia: benefícios, imunidade, fundos partidários, menos
        responsabilização), uma confiança e uma justificativa de uma linha. Temas sociais e de costumes têm valor econômico 0.
        Votações puramente procedimentais ficam de fora. O roteiro completo está em <code>docs/rubric.md</code>.
      </p>
      <p>
        <strong>Quem marcou.</strong> As marcações foram feitas por um modelo de IA (Claude) a partir da ementa oficial de cada
        projeto e da descrição da votação, <em>sem ler o texto completo dos projetos</em>, e podem estar erradas. Muitas votações
        — sobretudo as votações em separado de partes de um projeto, cuja descrição vem cortada — não podem ser avaliadas com essa
        informação; essas ficam neutras e não têm peso. Uma pessoa pode corrigir qualquer marcação, e a correção tem prioridade.
      </p>
      <p>
        <strong>Cálculo.</strong> O Sim de um parlamentar conta como o valor da marcação e o Não como o oposto; abstenções, obstrução
        e ausências são ignoradas. Cada voto é ponderado por |valor| × confiança, e só contam marcações com |econômico| ≥ 0,2 ou
        |privilégio| ≥ 0,3. <em>Estado</em> e <em>Mercado</em> são as parcelas dos votos econômicos ponderados do parlamentar que
        empurraram para o Estado ou para o mercado (somam 100). <em>Privilégios</em> é a parcela dos votos ponderados sobre
        privilégios em que ele empurrou para mais privilégios. Uma barra só aparece com pelo menos 10 votos econômicos contados (5
        para privilégios); o número de votos é sempre exibido e cada barra leva aos votos que a sustentam.
      </p>
      <p>
        <strong>Como ler.</strong> As barras são relativas: 50/50 entre Estado e Mercado significa que os votos marcados se
        dividiram igualmente, não que a pessoa seja &quot;de centro&quot;. Como só uma parte dos votos pode ser marcada com clareza,
        trate pequenas diferenças como ruído.
      </p>

      <Suspense fallback={null}>
        <ConsistenciaCard />
      </Suspense>

      <h2 className={h2}>Participação e presença</h2>
      <p>
        <strong>Participação nas votações nominais</strong> é a parcela das votações em que a pessoa registrou voto (Sim, Não, Abstenção ou
        Obstrução). Só entram as votações do período em que ela estava em exercício: as datas de posse, licença, suplência e saída vêm
        do histórico oficial de cada parlamentar, então licenças e suplência não contam como falta. O dia de início entra e o dia de
        saída não, o que pode errar em um dia nas pontas. Se a pessoa votou numa votação fora do período, ela entra na conta, para que
        o número de votos nunca passe do número de votações.
      </p>
      <p>
        <strong>Presença nas sessões deliberativas</strong> (só a Câmara) é a parcela das sessões deliberativas do Plenário com presença
        registrada, nos mesmos períodos. É outra coisa: quem está presente pode não votar, e quem vota depois de registrar presença
        conta nas duas. Sessões solenes, reuniões de comissão e audiências não entram.
      </p>
      <p>
        <strong>Quem preside não vota.</strong> Na Câmara, o Presidente preside todas as sessões do seu período, e essas votações saem da
        conta (aparecem como &quot;presidiu&quot;). Os demais membros da Mesa Diretora presidem de vez em quando, e isso não se distingue de
        uma falta, por isso levam uma marca e ficam fora da posição e do ranking. No Senado, as votações em que o senador presidiu a
        sessão ou o dispositivo não foi citado também saem da conta.
      </p>
      <p>
        <strong>Motivo da ausência.</strong> O Senado informa, em cada votação, o motivo de quem não votou (atividade parlamentar,
        licença, missão, não compareceu, presente sem registrar voto), e mostramos o texto oficial. A Câmara não informa o motivo de uma
        ausência em votação: só sabemos se houve voto ou não.
      </p>
      <p>
        <strong>Votações apertadas</strong> são as decididas por menos de 10% dos votos Sim e Não. <strong>Votações importantes</strong> são
        as classificadas com direção no perfil de votação. A comparação e a posição consideram só quem esteve em exercício em pelo menos
        30% das votações da legislatura e não é da Mesa Diretora.
      </p>
      <p>
        <strong>O que o número não mede.</strong> Não é uma nota de qualidade do trabalho. Uma ausência pode ser justificada, e quem está
        em comissão, em missão oficial ou numa reunião externa pode faltar ao Plenário sem faltar ao trabalho. Em ano eleitoral o
        Congresso costuma ter menos votações e menos presença.
      </p>

      <h2 className={h2}>Mandatos e legislaturas</h2>
      <p>
        Os votos de cada legislatura (período de quatro anos que começa em 1º de fevereiro) são tratados separadamente. As páginas
        principais do site mostram a legislatura em andamento e só quem está no cargo hoje, segundo as listas oficiais; quem votou mas
        já saiu aparece como ex-parlamentar. O histórico vai de 2003 até hoje e cada mandato tem página própria.
      </p>
      <Suspense fallback={null}>
        <NaturezasDefinicoes />
      </Suspense>
      <Suspense fallback={null}>
        <ValidacaoLegislaturas />
      </Suspense>

      <h2 className={h2}>Autoria e comissões</h2>
      <p>
        Na página de cada mandato de deputado aparecem os projetos (leis, emendas à Constituição, decretos, medidas provisórias e resoluções) de que a pessoa é autora, com as demais proposições contadas à parte e as comissões de que participou. A
        autoria vem dos arquivos em lote da Câmara e conta quem propôs de fato (o autor proponente), não quem só assinou como apoiador;
        cada projeto é ligado à legislatura da data de apresentação, e só entra se a pessoa tinha mandato nela. Autoria não diz se o
        projeto andou ou foi aprovado. As comissões incluem as permanentes, as especiais e outros órgãos; a Mesa Diretora tem registro
        à parte. Para o Senado essas informações não estão disponíveis, porque não há fonte de dados abertos utilizável.
      </p>

      <p>
        Os discursos vêm das APIs da Câmara e do Senado, mandato por mandato. Guardamos só a data, o tipo, o resumo e o link para o texto
        oficial, nunca a transcrição. Separamos os <strong>pronunciamentos</strong> (tempo próprio de fala, como breves comunicações e
        grande expediente) das <strong>intervenções</strong> (pela ordem, encaminhamento de votação, discussão, como líder), e as falas
        de quem dirige a sessão ficam fora das contas. Quantidade de discursos não mede qualidade nem volume de trabalho, já que boa
        parte dele acontece em comissões e fora do Plenário.
      </p>

      <p>
        A <strong>taxa de projetos que viraram lei</strong> é o número de projetos de autoria cujo último andamento registrado pela Câmara é
        &quot;Transformado em Norma Jurídica&quot;, dividido pelo total de projetos propostos pela pessoa no mandato. Também mostramos a
        situação dos demais (aguardando o Senado, vetados, arquivados, retirados, ainda tramitando) e a parcela de cada tipo de proposição.
        Cuidados: a maioria dos projetos de qualquer deputado não vira lei, e muita lei nasce do Executivo, de comissões e da Mesa, que não
        entram na autoria de um deputado; projeto apensado a outro conta como tramitando, mesmo que a ideia seja aproveitada; projetos
        recentes ainda tramitam, então a taxa de uma legislatura em andamento tende a subir; a coautoria conta para cada coautor. A taxa
        não mede produtividade nem qualidade do trabalho.
      </p>

      <h2 className={h2}>Alinhamento com a orientação do Governo</h2>
      <p>
        Na Câmara, o líder do Governo orienta a bancada em muitas votações. Para cada parlamentar, contamos as votações em que o
        Governo deu orientação clara de <em>Sim</em> ou <em>Não</em> e o parlamentar também votou Sim ou Não, e quantas vezes ele votou
        como o Governo orientou. Orientações &quot;liberado&quot;, de obstrução e de abstenção ficam de fora. O número de um partido
        soma os votos dos seus parlamentares. O Senado não tem essas orientações nos dados abertos, então a medida não existe para
        senadores. Votar com o Governo não é bom nem ruim: só mede a proximidade com a orientação dele. Não calculamos o alinhamento
        com o líder do próprio partido, porque a Câmara registra orientação por partido só para alguns; a maioria aparece dentro de
        blocos e federações, e a comparação ficaria injusta.
      </p>

      <h2 className={h2}>Mapa de votos: um teste independente</h2>
      <p>
        O <Link href="/mapa">mapa de votos</Link> posiciona cada parlamentar apenas a partir de quem votou com quem, sem usar nenhuma
        marcação nossa. Montamos uma tabela de parlamentares por votações (Sim = +1, Não = −1, ausência neutra, cada votação centrada),
        mantemos as votações que dividiram a casa (minoria de pelo menos 2,5%) e os parlamentares com votos suficientes, e extraímos as
        duas direções de maior variação (decomposição em valores singulares). O sinal é fixado só por convenção: o PL fica do lado
        positivo e o PT do negativo da primeira dimensão.
      </p>
      <p>
        Comparamos essas duas dimensões com as notas do perfil de votação usando a correlação de Spearman (1 = mesma ordem, −1 = ordem
        inversa). Resultado na Câmara: a primeira dimensão acompanha de perto a nota de Estado e quase coincide com o alinhamento ao
        Governo, e a segunda se relaciona mais com a nota de Privilégios. Isso é um bom sinal de que as barras captam um padrão real
        dos votos. Mas tem um limite importante: nesta legislatura &quot;governo × oposição&quot; e &quot;Estado × mercado&quot; andam
        juntos, então os votos sozinhos não conseguem separar as duas coisas, e o teste não prova que as marcações estão certas, só que
        não estão contrariando o padrão dos votos. No Senado, com poucas votações nominais, as correlações são bem mais fracas e o mapa
        deve ser lido como ilustração. Os números atuais aparecem na página do mapa.
      </p>

      <h2 className={h2}>Páginas de votação, projeto e busca</h2>
      <p>
        Cada votação tem uma página com o placar, como cada partido votou, as orientações de bancada (Câmara) e todos os votos
        individuais. Cada projeto tem uma página com suas votações nominais. A busca encontra projetos pela identificação, ementa,
        resumo e palavras-chave (estas, da Câmara), e parlamentares pelo nome, ignorando acentos e diferença entre maiúsculas e minúsculas.
        Só aparecem projetos que tiveram votação nominal.
      </p>

      <h2 className={h2}>Rankings</h2>
      <p>
        Há um ranking para cada barra, de parlamentares e de partidos. Ordena-se da maior para a menor nota; empates dividem a
        mesma posição e o desempate de ordem é pelo número de votos contados. Só entram parlamentares com pelo menos 20 votos econômicos contados (8 na barra de Privilégios), um
        mínimo mais exigente que o da barra, para que uma amostra pequena não lidere a lista; quem não atinge o mínimo mantém a barra
        na sua página, mas sem posição. Como <em>Estado</em> e <em>Mercado</em> somam 100, os dois rankings são o inverso um do outro. O ranking
        de <em>Privilégios</em> mostra quem mais votou por medidas que ampliam benefícios de políticos, entre os votos marcados — não
        é uma acusação contra ninguém. Em partidos pequenos e no Senado, onde há menos votações nominais, a amostra é menor e a
        linha traz o aviso &quot;amostra pequena&quot;.
      </p>
    </article>
  );
}
