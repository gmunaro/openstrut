// Resumo de aço e concreto: volume de concreto, área de forma e peso de aço
// ESTIMADO por tipo de elemento. Na aba Resultados, o total da obra com a
// memória; no relatório, por pavimento (com repetições) e o total. As tabelas
// de aço por bitola (obra, vigas, lajes, pilares) saem do detalhamento
// (DetalhamentoContexto).
// NB-1/78: as vigas saem do quadro do DESINIT e lajes e pilares da regra da V2, que
// não existe no SISTRUT (Quantitativos.fonte; docs/MODO-CALCULO.md). A tela e o
// relatório mostram os mesmos números.
import { Fragment, useContext } from "react";
import type { LinhaTabelaAco, TabelaAco } from "../../calculo/detalhamento/tabelaAco";
import {
  taxaAco,
  type FonteQuantidade,
  type Quantidades,
  type Quantitativos,
} from "../../calculo/quantitativos";
import { formatarNumero } from "../formato";
import { ListaAvisos } from "./avisos";
import { LinhaElemento } from "./memoria";
import { Cabecalho, Corpo, Linha, Tabela, Td, Th, TituloBloco } from "./tabela";
import { DetalhamentoContexto, type DetalhamentoObra } from "../detalhamento";

const TIPOS = [
  ["lajes", "Lajes"],
  ["vigas", "Vigas"],
  ["pilares", "Pilares"],
] as const;

export const NOTA_ESTIMATIVA =
  "Aço do resumo: estimativa pelas barras adotadas, com comprimentos convencionais (ancoragens e emendas aproximadas). A tabela de aço é outra conta, a soma das barras detalhadas, e pode dar outro total.";

function CabecalhoQuant({ primeira }: { primeira: string }) {
  return (
    <Cabecalho>
      <Linha>
        <Th>{primeira}</Th>
        <Th num unidade="m³">
          Concreto
        </Th>
        <Th num unidade="m²">
          Forma
        </Th>
        <Th num unidade="kg">
          Aço (estimativa)
        </Th>
        <Th num unidade="kg/m³">
          Taxa de aço
        </Th>
      </Linha>
    </Cabecalho>
  );
}

function Celulas({ q }: { q: Quantidades }) {
  return (
    <>
      <Td num>{formatarNumero(q.concreto)}</Td>
      <Td num>{formatarNumero(q.forma)}</Td>
      <Td num>{formatarNumero(q.aco, 0)}</Td>
      <Td num>{formatarNumero(taxaAco(q), 0)}</Td>
    </>
  );
}

const ROTULO_TIPO = { lajes: "Lajes", vigas: "Vigas", pilares: "Pilares" } as const;
const GRANDEZA = { concreto: "concreto", forma: "fôrma", aco: "aço" } as const;
type Tipo = keyof typeof ROTULO_TIPO;
type Grandeza = keyof typeof GRANDEZA;

/** De onde vem cada número, no texto da nota. Lajes e pilares: o SISTRUT não os calcula. */
const ORIGEM: Record<FonteQuantidade, string> = {
  sistrut: "como no SISTRUT (detalhamento do DESINIT)",
  misto:
    "como no SISTRUT (detalhamento do DESINIT), menos as vigas que o DESINIT não detalha, que seguem a regra da OpenStrut",
  v2: "regra da OpenStrut",
};

/** "concreto e fôrma", "aço" (na ordem de GRANDEZA). */
const listaGrandezas = (gs: Grandeza[]) =>
  gs
    .map((g) => GRANDEZA[g])
    .join(", ")
    .replace(/, ([^,]*)$/, " e $1");

/**
 * Nota das fontes no NB-1/78, uma frase por origem: "Vigas: como no SISTRUT (detalhamento
 * do DESINIT). Lajes e pilares: regra da OpenStrut (o SISTRUT não calcula)." Um tipo com
 * grandezas de origens diferentes (vigas no corrigido) sai grandeza a grandeza. Nada na
 * NBR 6118 (tudo é da OpenStrut).
 */
export function NotaFontes({ quant }: { quant: Quantitativos }) {
  const fontes = Object.entries(quant.fonte) as [Tipo, Record<Grandeza, FonteQuantidade>][];
  if (fontes.every(([, f]) => Object.values(f).every((x) => x === "v2"))) return null;
  const maiuscula = (t: string) => `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
  // tipos inteiros com a mesma origem se juntam ("Lajes e pilares"); os outros, por grandeza
  const inteiros = new Map<FonteQuantidade, Tipo[]>();
  const partes: { origem: FonteQuantidade; texto: string }[] = [];
  for (const [tipo, f] of fontes) {
    const origens = [...new Set(Object.values(f))];
    if (origens.length === 1 && origens[0]) {
      inteiros.set(origens[0], [...(inteiros.get(origens[0]) ?? []), tipo]);
      continue;
    }
    for (const origem of origens) {
      const gs = (Object.keys(f) as Grandeza[]).filter((g) => f[g] === origem);
      const sujeito = `${listaGrandezas(gs)} das ${ROTULO_TIPO[tipo].toLowerCase()}`;
      partes.push({ origem, texto: `${maiuscula(sujeito)}: ${ORIGEM[origem]}.` });
    }
  }
  for (const [origem, tipos] of inteiros) {
    const nomes = tipos.map((t) => ROTULO_TIPO[t].toLowerCase()).join(" e ");
    const naoCalcula = origem === "v2" && !tipos.includes("vigas");
    partes.push({
      origem,
      texto: `${maiuscula(nomes)}: ${ORIGEM[origem]}${naoCalcula ? " (o SISTRUT não calcula)" : ""}.`,
    });
  }
  // o que vem do SISTRUT primeiro, a regra da OpenStrut por último
  const ordem: Record<FonteQuantidade, number> = { sistrut: 0, misto: 1, v2: 2 };
  partes.sort((a, b) => ordem[a.origem] - ordem[b.origem]);
  return (
    <p role="note" className="text-muted-foreground mt-2 max-w-3xl text-xs">
      {partes.map((p) => p.texto).join(" ")}
    </p>
  );
}

/** Bloco curto da aba Resultados: total da obra por tipo; a linha Total abre a memória. */
export function ResumoQuantitativos({ quant }: { quant: Quantitativos }) {
  const memoria = [
    { titulo: "Convenções", etapas: quant.memoria },
    ...quant.pavimentos.map((p) => ({
      titulo: p.repeticoes > 1 ? `${p.nome} (× ${p.repeticoes})` : p.nome,
      etapas: p.memoria,
    })),
  ];
  return (
    <section className="mt-6">
      <h2 className="border-b pb-1 text-base font-semibold">Resumo de aço e concreto</h2>
      <TituloBloco extra={<span className="text-muted-foreground text-xs">{NOTA_ESTIMATIVA}</span>}>
        Total da obra
      </TituloBloco>
      <Tabela className="w-auto">
        <CabecalhoQuant primeira="Elemento" />
        <Corpo>
          {TIPOS.map(([k, rotulo]) => (
            <Linha key={k}>
              <Td className="font-medium">{rotulo}</Td>
              <Celulas q={quant[k]} />
            </Linha>
          ))}
          <LinhaElemento
            nome="Total"
            avisos={quant.avisos}
            memoria={memoria}
            colunas={5}
            comMemoria
          >
            <Celulas q={quant.total} />
          </LinhaElemento>
        </Corpo>
      </Tabela>
      <NotaFontes quant={quant} />
      <TabelasAcoDoContexto />
    </section>
  );
}

function TabelasAcoDoContexto() {
  const det = useContext(DetalhamentoContexto);
  return det ? <TabelasAco det={det} /> : null;
}

const nomeAco = (aco: LinhaTabelaAco["aco"]) => aco ?? "—";
const phiTexto = (phi: number) => formatarNumero(phi, phi % 1 === 0 ? 0 : 1);

const NOTA_TABELA = "com as repetições dos pavimentos; massa linear π φ²/4 · 7850 kg/m³";

/** Tabelas de aço do detalhamento: a da obra inteira (vigas + lajes + pilares)
 *  e a de cada origem. */
export function TabelasAco({ det }: { det: DetalhamentoObra }) {
  return (
    <>
      <BlocoTabelaAco
        titulo="Tabela de aço (obra)"
        nota={`soma das barras detalhadas de vigas, lajes e pilares, ${NOTA_TABELA}`}
        tabela={det.tabelaObra}
      />
      <BlocoTabelaAco
        titulo="Tabela de aço (vigas)"
        nota={`pelo detalhamento das vigas, ${NOTA_TABELA}`}
        tabela={det.tabela}
      />
      <BlocoTabelaAco
        titulo="Tabela de aço (lajes)"
        nota={`pelo detalhamento das lajes, ${NOTA_TABELA}`}
        tabela={det.lajes.tabela}
      />
      <BlocoTabelaAco
        titulo="Tabela de aço (pilares)"
        nota="pelo detalhamento dos pilares, um lance por nível (as repetições já são lances)"
        tabela={det.pilares.tabela}
      />
    </>
  );
}

/** Uma tabela de aço por categoria e bitola, com a massa sem perda, a perda e o total. */
export function BlocoTabelaAco({
  titulo,
  nota,
  tabela,
}: {
  titulo: string;
  nota: string;
  tabela: TabelaAco;
}) {
  const perda = `${formatarNumero(tabela.perda * 100, 0)} %`;
  return (
    <>
      <TituloBloco extra={<span className="text-muted-foreground text-xs">{nota}</span>}>
        {titulo}
      </TituloBloco>
      <Tabela className="w-auto">
        <Cabecalho>
          <Linha>
            <Th>Aço</Th>
            <Th num unidade="mm">
              φ
            </Th>
            <Th num unidade="m">
              Comprimento
            </Th>
            <Th num unidade="kg/m">
              Massa linear
            </Th>
            <Th num unidade="kg">
              Massa
            </Th>
          </Linha>
        </Cabecalho>
        <Corpo>
          {tabela.linhas.map((l) => (
            <Linha key={`${l.aco}|${l.phi}`}>
              <Td>{nomeAco(l.aco)}</Td>
              <Td num>{phiTexto(l.phi)}</Td>
              <Td num>{formatarNumero(l.comprimento)}</Td>
              <Td num>{formatarNumero(l.massaLinear, 3)}</Td>
              <Td num>{formatarNumero(l.massa, 1)}</Td>
            </Linha>
          ))}
          <Linha>
            <Td colSpan={2} className="font-medium">
              Total sem perda
            </Td>
            <Td num>{formatarNumero(tabela.comprimentoTotal)}</Td>
            <Td />
            <Td num>{formatarNumero(tabela.massa, 1)}</Td>
          </Linha>
          <Linha>
            <Td colSpan={4}>Perda ({perda})</Td>
            <Td num>{formatarNumero(tabela.massaComPerda - tabela.massa, 1)}</Td>
          </Linha>
          <Linha className="font-semibold">
            <Td colSpan={4}>Total com perda</Td>
            <Td num>{formatarNumero(tabela.massaComPerda, 1)}</Td>
          </Linha>
        </Corpo>
      </Tabela>
    </>
  );
}

/** Tabela do relatório: cada pavimento (já multiplicado pelas repetições) e o total. */
export function TabelaQuantitativos({ quant }: { quant: Quantitativos }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="border-b pb-1 text-base font-semibold">Resumo de aço e concreto</h2>
      <p className="text-aviso mt-2 text-xs font-semibold">{NOTA_ESTIMATIVA}</p>
      <p className="text-muted-foreground mt-1 text-xs">
        Geometria pelos eixos. Viga: concreto e forma abaixo da laje (fundo + 2 laterais). Aço:
        lajes com +10 % de ancoragens e emendas; vigas com negativas em 0,25 do vão; pilares com
        emenda de 40φ; estribos sem ganchos. Peso por metro: π φ²/4 · 7850 kg/m³.
      </p>
      <Tabela className="mt-2 w-auto">
        <CabecalhoQuant primeira="Pavimento / elemento" />
        <Corpo>
          {quant.pavimentos.map((p, i) => (
            <Fragment key={i}>
              <Linha className="bg-muted/40 hover:bg-muted/40">
                <Td colSpan={5} className="font-semibold">
                  {p.nome}
                  {p.repeticoes > 1 ? ` (× ${p.repeticoes} repetições)` : ""}
                </Td>
              </Linha>
              {TIPOS.map(([k, rotulo]) => (
                <Linha key={k}>
                  <Td className="pl-4">{rotulo}</Td>
                  <Celulas q={p[k]} />
                </Linha>
              ))}
              <Linha>
                <Td className="pl-4 font-medium">Subtotal</Td>
                <Celulas q={p.total} />
              </Linha>
            </Fragment>
          ))}
          <Linha className="bg-muted/40 hover:bg-muted/40">
            <Td colSpan={5} className="font-semibold">
              Total da obra
            </Td>
          </Linha>
          {TIPOS.map(([k, rotulo]) => (
            <Linha key={k}>
              <Td className="pl-4">{rotulo}</Td>
              <Celulas q={quant[k]} />
            </Linha>
          ))}
          <Linha className="font-semibold">
            <Td className="pl-4">Total</Td>
            <Celulas q={quant.total} />
          </Linha>
        </Corpo>
      </Tabela>
      <NotaFontes quant={quant} />
      {quant.avisos.length > 0 && (
        <div className="mt-2">
          <ListaAvisos
            avisos={quant.pavimentos.flatMap((p) =>
              p.avisos.map((texto) => ({ local: p.nome, elemento: "", texto })),
            )}
          />
        </div>
      )}
    </section>
  );
}
