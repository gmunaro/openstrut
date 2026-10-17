// Tabelas do orçamento que a aba Orçamento e o relatório impresso mostram: resumo com
// indicadores, custo por pavimento, por tipo e por insumo, e a comparação entre os
// modos de cálculo. `secaoOrcamento` monta a seção opcional do relatório (ligação em
// docs/ORCAMENTO.md).
import { CircleAlert } from "lucide-react";
import { diferenca, rotuloPapel, type Grupo, type Orcamento } from "../../dominio/orcamento";
import { formatarNumero } from "../formato";
import { Cabecalho, Corpo, Linha, Tabela, Td, Th, TituloBloco } from "../resultados/tabela";
import { textoComposicao, type ResultadoOrcamento } from "./estado";
import { AVISO_ORCAMENTO, textoDesoneracao, textoMes, type Comparacao } from "./exportar";

/** Valor em reais sem o símbolo ("1.234,56"; "—" sem valor): o "R$" vai na unidade da
 *  coluna, como nas outras tabelas do app. */
export const reais = (v: number | null | undefined) => formatarNumero(v, 2);

/** Aviso fixo: estimativa, não orçamento executivo. */
export function AvisoOrcamento() {
  return (
    <p
      role="note"
      className="border-aviso/50 bg-aviso/10 text-aviso flex items-start gap-2 rounded-md border p-2 text-xs"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{AVISO_ORCAMENTO}</span>
    </p>
  );
}

/** Tabela de preços em uma linha: nome, mês, UF, desoneração e fonte. */
export function OrigemPrecos({ r }: { r: ResultadoOrcamento }) {
  const t = r.tabela;
  const partes = [
    t.referencia && `referência ${textoMes(t.referencia)}`,
    t.uf && `UF ${t.uf}`,
    textoDesoneracao(t).toLowerCase(),
  ].filter(Boolean);
  return (
    <p className="text-muted-foreground text-xs [overflow-wrap:anywhere]">
      Preços: <span className="text-foreground font-medium">{t.nome}</span>
      {partes.length > 0 && ` (${partes.join(", ")})`}. Fonte: {t.fonte}
    </p>
  );
}

/** Custo direto, BDI, total e indicadores; lista os insumos sem preço. */
export function Resumo({ r }: { r: ResultadoOrcamento }) {
  const { orc } = r;
  const i = orc.indicadores;
  const linhas: [string, string, string][] = [
    ["Custo direto", reais(orc.custoDireto), "R$"],
    [`BDI (${formatarNumero(orc.bdi * 100, 2)} %)`, reais(orc.total - orc.custoDireto), "R$"],
    ["Total com BDI", reais(orc.total), "R$"],
    ["Área construída", formatarNumero(i.areaConstruida, 2), "m²"],
    ["Custo por área", reais(i.custoPorArea), "R$/m²"],
    ["Taxa de aço", formatarNumero(i.acoPorConcreto, 1), "kg/m³"],
    ["Fôrma por concreto", formatarNumero(i.formaPorConcreto, 2), "m²/m³"],
  ];
  return (
    <>
      <Tabela className="w-auto">
        <Corpo>
          {linhas.map(([rotulo, valor, un]) => (
            <Linha key={rotulo} className={rotulo === "Total com BDI" ? "font-semibold" : ""}>
              <Td>{rotulo}</Td>
              <Td num data-rotulo={rotulo}>
                {valor}
              </Td>
              <Td className="text-muted-foreground">{un}</Td>
            </Linha>
          ))}
        </Corpo>
      </Tabela>
      <p className="text-aviso mt-1 text-xs font-medium">
        Estimativa da estrutura: não substitui o orçamento executivo.
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        Área construída: área das lajes pelos eixos × repetições. Taxa de aço: aço sem perda (barras
        do detalhamento) por m³ de concreto.
      </p>
      {orc.semPreco.length > 0 && (
        <p role="alert" className="text-aviso mt-1 text-xs font-medium">
          Total parcial: sem preço para {orc.semPreco.map(rotuloPapel).join("; ")}. Preencha o preço
          ou a composição.
        </p>
      )}
      {orc.avisos.map((a) => (
        <p key={a} className="text-aviso mt-1 text-xs">
          {a}
        </p>
      ))}
    </>
  );
}

/** Custo direto e com BDI de cada grupo (pavimento ou tipo), com o total. */
export function TabelaGrupos({
  titulo,
  primeira,
  grupos,
  orc,
}: {
  titulo: string;
  primeira: string;
  grupos: readonly Grupo[];
  orc: Orcamento;
}) {
  return (
    <div className="min-w-0">
      <TituloBloco>{titulo}</TituloBloco>
      <Tabela className="w-auto">
        <Cabecalho>
          <Linha>
            <Th>{primeira}</Th>
            <Th num unidade="R$">
              Custo direto
            </Th>
            <Th num unidade="R$">
              Com BDI
            </Th>
            <Th num unidade="%">
              Parte
            </Th>
          </Linha>
        </Cabecalho>
        <Corpo>
          {grupos.map((g) => (
            <Linha key={g.chave}>
              <Td>
                {g.rotulo}
                {g.semPreco > 0 && <span className="text-aviso"> (parcial)</span>}
              </Td>
              <Td num>{reais(g.custo)}</Td>
              <Td num>{reais(g.custo * (1 + orc.bdi))}</Td>
              <Td num>
                {formatarNumero(orc.custoDireto > 0 ? (100 * g.custo) / orc.custoDireto : NaN, 1)}
              </Td>
            </Linha>
          ))}
          <Linha className="font-semibold">
            <Td>Total</Td>
            <Td num>{reais(orc.custoDireto)}</Td>
            <Td num>{reais(orc.total)}</Td>
            <Td num>{formatarNumero(100, 1)}</Td>
          </Linha>
        </Corpo>
      </Tabela>
    </div>
  );
}

/** Custo por insumo, só leitura (o relatório; a aba edita a composição). */
export function TabelaInsumos({ orc }: { orc: Orcamento }) {
  return (
    <>
      <TituloBloco>Custo por insumo</TituloBloco>
      <Tabela className="w-auto">
        <Cabecalho>
          <Linha>
            <Th>Insumo</Th>
            <Th>Composição</Th>
            <Th num>Quantidade</Th>
            <Th>Un</Th>
            <Th num unidade="R$">
              Preço unitário
            </Th>
            <Th num unidade="R$">
              Custo direto
            </Th>
          </Linha>
        </Cabecalho>
        <Corpo>
          {orc.porInsumo.map((g) => (
            <Linha key={g.papel}>
              <Td>{g.rotulo}</Td>
              <Td className="max-w-64 truncate font-mono">
                {textoComposicao(g.componentes) || "—"}
              </Td>
              <Td num>{formatarNumero(g.quantidade, 2)}</Td>
              <Td>{g.unidade}</Td>
              <Td num>{reais(g.preco)}</Td>
              <Td num className={g.semPreco > 0 ? "text-aviso" : ""}>
                {g.semPreco > 0 ? "sem preço" : reais(g.custo)}
              </Td>
            </Linha>
          ))}
        </Corpo>
      </Tabela>
    </>
  );
}

/** Original × corrigido (NB-1/78): custo direto por tipo, total e carga na fundação. */
export function TabelaComparacao({ comp }: { comp: Comparacao }) {
  const d = diferenca(comp.a, comp.b);
  const difCarga = comp.cargaA === null || comp.cargaB === null ? null : comp.cargaB - comp.cargaA;
  return (
    <section aria-label="Comparação entre os modos de cálculo">
      <TituloBloco
        extra={
          <span className="text-muted-foreground text-xs">
            mesma tabela e mesmos parâmetros; diferença = {comp.rotulos[1].toLowerCase()} −{" "}
            {comp.rotulos[0].toLowerCase()}
          </span>
        }
      >
        Quanto custa o erro do original
      </TituloBloco>
      <Tabela className="w-auto">
        <Cabecalho>
          <Linha>
            <Th>Custo direto</Th>
            <Th num unidade="R$">
              {comp.rotulos[0]}
            </Th>
            <Th num unidade="R$">
              {comp.rotulos[1]}
            </Th>
            <Th num unidade="R$">
              Diferença
            </Th>
          </Linha>
        </Cabecalho>
        <Corpo>
          {d.porTipo.map((x) => (
            <Linha key={x.tipo}>
              <Td>{x.rotulo}</Td>
              <Td num>{reais(x.a)}</Td>
              <Td num>{reais(x.b)}</Td>
              <Td num>{reais(x.dif)}</Td>
            </Linha>
          ))}
          <Linha className="font-semibold">
            <Td>Total com BDI</Td>
            <Td num>{reais(comp.a.total)}</Td>
            <Td num>{reais(comp.b.total)}</Td>
            <Td num data-rotulo="diferenca-total">
              {reais(d.total)}
            </Td>
          </Linha>
          <Linha>
            <Td>Carga na fundação (tf)</Td>
            <Td num>{formatarNumero(comp.cargaA, 2)}</Td>
            <Td num>{formatarNumero(comp.cargaB, 2)}</Td>
            <Td num data-rotulo="diferenca-carga">
              {formatarNumero(difCarga, 2)}
            </Td>
          </Linha>
        </Corpo>
      </Tabela>
      <p className="text-muted-foreground mt-1 max-w-3xl text-xs">
        O app não dimensiona a fundação. A carga na fundação é o resumo do SISTRUT (colunas que
        nascem na fundação). Um pilar que nasce sobre viga e continua a coluna de baixo leva a carga
        dele à fundação duas vezes no original. Para pôr preço nessa diferença, dê uma composição à
        fundação (R$ por tf) na aba Orçamento.
      </p>
    </section>
  );
}

/**
 * Seção opcional do relatório impresso: aviso, origem dos preços, resumo, custo por
 * pavimento, por tipo e por insumo e, na NB-1/78, a comparação entre os modos.
 * Uso no relatório: `const { atual } = useOrcamento(obra, resultado, detalhamento)` e
 * `{incluir && atual && secaoOrcamento(atual)}` (docs/ORCAMENTO.md).
 */
export function secaoOrcamento(r: ResultadoOrcamento, comp: Comparacao | null = null) {
  return (
    <section className="mt-6 break-inside-avoid" aria-label="Orçamento da estrutura">
      <h2 className="border-b pb-1 text-base font-semibold">Orçamento da estrutura (estimativa)</h2>
      <div className="mt-2 grid gap-2">
        <AvisoOrcamento />
        <OrigemPrecos r={r} />
      </div>
      <Resumo r={r} />
      <div className="flex flex-wrap gap-x-8">
        <TabelaGrupos
          titulo="Por pavimento"
          primeira="Pavimento"
          grupos={r.orc.porPavimento}
          orc={r.orc}
        />
        <TabelaGrupos titulo="Por tipo" primeira="Tipo" grupos={r.orc.porTipo} orc={r.orc} />
      </div>
      <TabelaInsumos orc={r.orc} />
      {comp && <TabelaComparacao comp={comp} />}
    </section>
  );
}
