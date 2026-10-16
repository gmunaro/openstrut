// Aba Relatório: página para imprimir (ou salvar em PDF pelo navegador) com o
// resumo da obra, materiais, pavimentos, as tabelas de resultados, os avisos e
// a frase de conferência, com o detalhamento (vigas, lajes, pilares) e as
// tabelas de aço da obra e de cada origem. O cabeçalho traz a norma e o modo de
// cálculo. O @media print do index.css troca o tema para papel.
import { Printer } from "lucide-react";
import { useContext, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { calcularQuantitativos } from "../../calculo/quantitativos";
import type { Obra } from "../../dominio/obra";
import {
  AVISO_CONFERENCIA,
  coletarAvisos,
  coletarFalhas,
  NOME_MODO,
  NOME_NORMA,
  type Calculo,
} from "../calculo";
import { formatarGrandeza, formatarNumero, unidade } from "../formato";
import { AVISO_RECONSTRUCAO, NOME_APP } from "../marca";
import { ListaAvisos, ListaFalhas } from "../resultados/avisos";
import { DetalhamentoContexto, detalharObra } from "../detalhamento";
import { TabelaQuantitativos, TabelasAco } from "../resultados/quantitativos";
import { SemCalculo, TabelasObra } from "../resultados/Resultados";
import { Cabecalho, Corpo, Linha, Tabela, Td, Th, TituloBloco } from "../resultados/tabela";
import { useUnidades } from "../sessao";

export function Relatorio({ obra, calculo }: { obra: Obra; calculo: Calculo }) {
  const s = useUnidades();
  const m = obra.materiais;
  const mc = calculo.tipo === "ok" ? calculo.resultado.materiais : null;
  const uT = unidade("tensao", s);
  const quant = useMemo(
    () => (calculo.tipo === "ok" ? calcularQuantitativos(obra, calculo.resultado) : null),
    [obra, calculo],
  );
  // o detalhamento da obra fica no contexto (preenchido pela tela da obra); o
  // relatório solto calcula o seu, e os blocos de TabelasObra o leem do provedor abaixo
  const doContexto = useContext(DetalhamentoContexto);
  const detalhamento = useMemo(
    () => doContexto ?? (calculo.tipo === "ok" ? detalharObra(calculo.resultado, obra) : null),
    [doContexto, obra, calculo],
  );
  const data = new Date().toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" });

  return (
    <DetalhamentoContexto value={detalhamento}>
      <article className="mx-auto max-w-[1200px] pb-10 print:max-w-none print:p-0">
        {/* o conteúdo inteiro vai numa tabela só: o <thead> é repetido pelo Chrome em cada página
            impressa (identificação da obra, modo e data). Na tela fica escondido. É tabela de
            layout: role="presentation" tira dela (e das linhas e células) os papéis de tabela,
            para que só as tabelas de dados de dentro apareçam como tabelas aos leitores de tela. */}
        <table role="presentation" className="w-full">
          <thead className="hidden print:table-header-group">
            <tr>
              <th className="text-muted-foreground p-0 pb-1 text-left text-[8pt] font-normal">
                <div className="border-b pb-1">
                  {obra.nome || "(obra sem nome)"} · Modo: {NOME_MODO[obra.modoCalculo]} · emitido
                  em {data}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-0 align-top">
                <div className="mb-4 flex justify-end print:hidden">
                  <Button onClick={() => window.print()}>
                    <Printer /> Imprimir
                  </Button>
                </div>

                <header className="border-b pb-3">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">
                    {NOME_APP} · relatório de cálculo
                  </p>
                  <h1 className="text-xl font-semibold">{obra.nome || "(obra sem nome)"}</h1>
                  <p className="text-muted-foreground text-xs">
                    Norma:{" "}
                    {calculo.tipo === "ok" ? calculo.resultado.norma.nome : NOME_NORMA[obra.norma]}{" "}
                    · unidades {s === "si" ? "SI (kN, m, MPa)" : "técnicas (tf, m, kgf/cm²)"} ·
                    emitido em {data}
                  </p>
                  <p
                    className={
                      obra.modoCalculo === "original"
                        ? "text-aviso text-xs font-semibold"
                        : "text-muted-foreground text-xs"
                    }
                  >
                    Modo de cálculo: {NOME_MODO[obra.modoCalculo]}
                    {obra.modoCalculo === "original" &&
                      " — reproduz o SISTRUT 4.0 número a número, inclusive os defeitos."}
                  </p>
                  <p className="text-aviso mt-2 text-sm font-semibold">{AVISO_CONFERENCIA}</p>
                </header>

                <div className="mt-2 grid gap-6 md:grid-cols-2 print:grid-cols-2">
                  <section>
                    <TituloBloco>Materiais</TituloBloco>
                    <Tabela>
                      <Cabecalho>
                        <Linha>
                          <Th>Grandeza</Th>
                          <Th num>Valor</Th>
                          <Th>Unidade</Th>
                        </Linha>
                      </Cabecalho>
                      <Corpo>
                        <LinhaValor
                          rotulo="fck"
                          valor={formatarGrandeza(m.fck, "tensao", s, 1)}
                          unidade={uT}
                        />
                        {mc && (
                          <LinhaValor
                            rotulo="fcd"
                            valor={formatarGrandeza(mc.fcd, "tensao", s)}
                            unidade={uT}
                          />
                        )}
                        <LinhaValor rotulo="Aço longitudinal" valor={m.aco} unidade="" />
                        {/* só a NB-1/78 tem classes de aço (A ou B); a NBR 6118:2023 não */}
                        {obra.norma === "nb1-78" && (
                          <LinhaValor rotulo="Classe do aço" valor={m.classeAco} unidade="" />
                        )}
                        {mc && (
                          <LinhaValor
                            rotulo="fyd"
                            valor={formatarGrandeza(mc.fyd, "tensao", s, 1)}
                            unidade={uT}
                          />
                        )}
                        <LinhaValor rotulo="Aço do estribo" valor={m.acoEstribo} unidade="" />
                        {mc && (
                          <LinhaValor
                            rotulo="fywd"
                            valor={formatarGrandeza(mc.fywd, "tensao", s, 1)}
                            unidade={uT}
                          />
                        )}
                        {mc && (
                          <LinhaValor
                            rotulo="Ecs"
                            valor={formatarGrandeza(mc.ecs, "tensao", s, 0)}
                            unidade={uT}
                          />
                        )}
                        <LinhaValor
                          rotulo="Classe de agressividade"
                          valor={["I", "II", "III", "IV"][m.caa - 1] ?? String(m.caa)}
                          unidade=""
                        />
                        <LinhaValor
                          rotulo="Cobrimento laje"
                          valor={formatarNumero(m.cobrimentoLaje, 1)}
                          unidade="cm"
                        />
                        <LinhaValor
                          rotulo="Cobrimento viga"
                          valor={formatarNumero(m.cobrimentoViga, 1)}
                          unidade="cm"
                        />
                        <LinhaValor
                          rotulo="Cobrimento pilar"
                          valor={formatarNumero(m.cobrimentoPilar, 1)}
                          unidade="cm"
                        />
                      </Corpo>
                    </Tabela>
                  </section>
                  <section>
                    <TituloBloco>Pavimentos (do topo para a base)</TituloBloco>
                    <Tabela>
                      <Cabecalho>
                        <Linha>
                          <Th>Pavimento</Th>
                          <Th num unidade="m">
                            Pé-direito
                          </Th>
                          <Th num>Repetições</Th>
                          <Th num>Lajes</Th>
                          <Th num>Vigas</Th>
                          <Th num>Pilares</Th>
                        </Linha>
                      </Cabecalho>
                      <Corpo>
                        {obra.pavimentos.map((p) => (
                          <Linha key={p.id}>
                            <Td className="font-medium">{p.nome}</Td>
                            <Td num>{formatarNumero(p.peDireito)}</Td>
                            <Td num>{p.repeticoes}</Td>
                            <Td num>{p.lajes.length}</Td>
                            <Td num>{p.vigas.length}</Td>
                            <Td num>{p.pilares.length}</Td>
                          </Linha>
                        ))}
                      </Corpo>
                    </Tabela>
                  </section>
                </div>

                <section className="mt-6">
                  <h2 className="border-b pb-1 text-base font-semibold">Avisos</h2>
                  <div className="mt-2">
                    {calculo.tipo === "ok" ? (
                      <>
                        <ListaFalhas falhas={coletarFalhas(calculo.resultado)} />
                        <ListaAvisos avisos={coletarAvisos(calculo.resultado, detalhamento)} />
                      </>
                    ) : (
                      <SemCalculo calculo={calculo} />
                    )}
                  </div>
                </section>

                {calculo.tipo === "ok" && (
                  <div className="relatorio-obra">
                    <TabelasObra resultado={calculo.resultado} comMemoria={false} />
                  </div>
                )}

                {quant && (
                  <div className="relatorio-secao">
                    <TabelaQuantitativos quant={quant} />
                  </div>
                )}

                {detalhamento && (
                  <div className="relatorio-secao">
                    <section className="mt-6 break-inside-avoid">
                      <h2 className="border-b pb-1 text-base font-semibold">Tabela de aço</h2>
                      <TabelasAco det={detalhamento} />
                    </section>
                  </div>
                )}

                <footer className="mt-8 border-t pt-2 text-xs">
                  <p className="font-semibold">{AVISO_CONFERENCIA}</p>
                  <p className="text-muted-foreground">
                    Gerado pelo {NOME_APP}. Valores característicos salvo indicação; armaduras com
                    os coeficientes da norma indicada. O peso de aço do resumo é estimativa.
                  </p>
                  <p className="text-muted-foreground">{AVISO_RECONSTRUCAO}</p>
                </footer>
              </td>
            </tr>
          </tbody>
        </table>
      </article>
    </DetalhamentoContexto>
  );
}

function LinhaValor({
  rotulo,
  valor,
  unidade: u,
}: {
  rotulo: string;
  valor: string;
  unidade: string;
}) {
  return (
    <Linha>
      <Td>{rotulo}</Td>
      <Td num>{valor}</Td>
      <Td>{u}</Td>
    </Linha>
  );
}
