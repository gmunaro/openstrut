// Resumo de aço e concreto: volume de concreto, área de forma e peso de aço
// ESTIMADO por tipo de elemento. Na aba Resultados, o total da obra com a
// memória; no relatório, por pavimento (com repetições) e o total. As tabelas
// de aço por bitola (obra, vigas, lajes, pilares) saem do detalhamento
// (DetalhamentoContexto).
// Volume e forma do total: a tela mostra volumeTela/formaTela e o relatório
// volumeRelatorio/formaRelatorio. No modo "original" eles diferem de propósito
// (reproduzem o SISTRUT de 1991; docs/MODO-CALCULO.md, F e G) e um aviso dá o valor certo.
import { Fragment, useContext } from "react";
import type { LinhaTabelaAco, TabelaAco } from "../../calculo/detalhamento/tabelaAco";
import type { ResultadoObra } from "../../calculo/fluxo";
import {
  calcularQuantitativos,
  taxaAco,
  type Quantidades,
  type Quantitativos,
} from "../../calculo/quantitativos";
import type { Obra } from "../../dominio/obra";
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
  "O peso de aço é estimativa pelas barras adotadas com comprimentos convencionais (ancoragens e emendas aproximadas). As tabelas de aço por bitola saem do detalhamento das barras.";

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

type VolumeForma = Pick<Quantidades, "concreto" | "forma">;

/** Volume e forma certos (regra do modo corrigido), para o aviso do modo original.
 *  Concreto e forma saem só da geometria da obra, então serve o resultado do
 *  cálculo no modo original. */
export const volumeFormaCertos = (obra: Obra, r: ResultadoObra): VolumeForma => {
  const { concreto, forma } = calcularQuantitativos({ ...obra, modoCalculo: "corrigido" }, r).total;
  return { concreto, forma };
};

const m3 = (v: number) => `${formatarNumero(v)} m³`;
const m2 = (v: number) => `${formatarNumero(v)} m²`;

/** Aviso do modo original ao lado do total: tela e relatório diferem de propósito;
 *  diz quanto dá cada um e o valor certo. */
export function AvisoVolumeOriginal({
  quant,
  certo,
  onde,
}: {
  quant: Quantitativos;
  certo: VolumeForma;
  onde: "tela" | "relatorio";
}) {
  const tela = `${m3(quant.volumeTela)} e ${m2(quant.formaTela)}`;
  const relatorio = `${m3(quant.volumeRelatorio)} e ${m2(quant.formaRelatorio)}`;
  return (
    <p role="note" className="text-aviso mt-2 max-w-3xl text-xs">
      <span className="font-semibold">Modo como o SISTRUT original:</span>{" "}
      {onde === "tela"
        ? `o total de concreto e forma (${tela}) segue o editor de formas do SISTRUT, que esquece os pilares; as linhas por tipo e o relatório seguem a impressão (${relatorio}), que conta duas vezes a laje sobre as vigas.`
        : `concreto e forma (${relatorio}) seguem a impressão do SISTRUT, que conta duas vezes a laje sobre as vigas; a tela mostra ${tela}, pelo editor de formas, que esquece os pilares.`}{" "}
      Os dois diferem de propósito. O certo (modo corrigido) é {m3(certo.concreto)} e{" "}
      {m2(certo.forma)}.
    </p>
  );
}

/** Bloco curto da aba Resultados: total da obra por tipo; a linha Total abre a memória.
 *  O total usa volumeTela/formaTela; `certo` (volume e forma do modo corrigido) vai
 *  no aviso do modo original. */
export function ResumoQuantitativos({
  quant,
  certo,
}: {
  quant: Quantitativos;
  certo?: VolumeForma | undefined;
}) {
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
            <Celulas q={{ ...quant.total, concreto: quant.volumeTela, forma: quant.formaTela }} />
          </LinhaElemento>
        </Corpo>
      </Tabela>
      {quant.modoCalculo === "original" && certo && (
        <AvisoVolumeOriginal quant={quant} certo={certo} onde="tela" />
      )}
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
        nota={`vigas, lajes e pilares detalhados, ${NOTA_TABELA}`}
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

/** Tabela do relatório: cada pavimento (já multiplicado pelas repetições) e o total,
 *  com volumeRelatorio/formaRelatorio; `certo` como em ResumoQuantitativos. */
export function TabelaQuantitativos({
  quant,
  certo,
}: {
  quant: Quantitativos;
  certo?: VolumeForma | undefined;
}) {
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
            <Celulas
              q={{ ...quant.total, concreto: quant.volumeRelatorio, forma: quant.formaRelatorio }}
            />
          </Linha>
        </Corpo>
      </Tabela>
      {quant.modoCalculo === "original" && certo && (
        <AvisoVolumeOriginal quant={quant} certo={certo} onde="relatorio" />
      )}
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
