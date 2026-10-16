// Pilares por nível (do topo para a base): carga acumulada, esbeltez,
// momentos de cálculo, armadura e estribo. Depois, o detalhamento de cada pilar
// (posições por lance, traspasse e grampos), do DetalhamentoContexto.
import { Fragment, useContext } from "react";
import type { ResultadoObra, ResultadoPilar } from "../../calculo/fluxo";
import { rotuloNivel } from "../calculo";
import { DetalhamentoContexto, type DetalhamentoPilarObra } from "../detalhamento";
import {
  formatarBarraEspacada,
  formatarBarras,
  formatarGrandeza,
  formatarNumero,
  unidade,
} from "../formato";
import { useUnidades } from "../sessao";
import { LinhaElemento } from "./memoria";
import { textoErro } from "./motorSistrut";
import { Cabecalho, Corpo, Linha, Tabela, Td, Th, TituloBloco } from "./tabela";
import { AvisosDetalhamento, MemoriaDetalhamento, TabelaPosicoes } from "./vigas";

const COLUNAS = 14;

/** Pilares agrupados por nível, na ordem do motor (topo → base). */
function porNivel(r: ResultadoObra) {
  const grupos = new Map<string, ResultadoPilar[]>();
  for (const p of r.pilares) {
    const nivel = rotuloNivel(r, p);
    const lista = grupos.get(nivel);
    if (lista) lista.push(p);
    else grupos.set(nivel, [p]);
  }
  return [...grupos.entries()];
}

export function TabelaPilares({
  resultado,
  comMemoria,
}: {
  resultado: ResultadoObra;
  comMemoria: boolean;
}) {
  const s = useUnidades();
  if (resultado.pilares.length === 0)
    return (
      <>
        <TituloBloco>Pilares</TituloBloco>
        <p className="text-muted-foreground text-xs">Nenhum pilar na obra.</p>
      </>
    );
  const uF = unidade("forca", s);
  const uM = unidade("momento", s);
  return (
    <>
      <TituloBloco
        extra={
          <span className="text-muted-foreground text-xs">
            Nk acumulada na base do lance; Md na seção crítica
          </span>
        }
      >
        Pilares por nível
      </TituloBloco>
      <Tabela>
        <Cabecalho>
          <Linha>
            <Th>Pilar</Th>
            <Th num unidade="cm">
              b × h
            </Th>
            <Th num unidade={uF}>
              Nk
            </Th>
            <Th num unidade={uF}>
              Nd
            </Th>
            <Th num>λx</Th>
            <Th num>λy</Th>
            <Th num unidade={uM}>
              Mdx
            </Th>
            <Th num unidade={uM}>
              Mdy
            </Th>
            <Th num unidade="cm²">
              As nec.
            </Th>
            <Th num unidade="cm²">
              As ef.
            </Th>
            <Th>Barras</Th>
            <Th num unidade="%">
              Taxa
            </Th>
            <Th>Estribo</Th>
            <Th num unidade="m">
              Lance
            </Th>
          </Linha>
        </Cabecalho>
        <Corpo>
          {porNivel(resultado).map(([nivel, pilares]) => (
            <Fragment key={nivel}>
              <Linha className="bg-muted/40 hover:bg-muted/40">
                <Td colSpan={COLUNAS} className="font-semibold">
                  {nivel}
                </Td>
              </Linha>
              {pilares.map((p) => {
                const r = p.resultado;
                const pe = resultado.pavimentos.find((rp) => rp.pavimento.nome === p.pavimento)
                  ?.pavimento.peDireito;
                return (
                  <LinhaElemento
                    key={`${nivel}-${p.pilar.id}`}
                    nome={p.pilar.nome}
                    avisos={r.avisos}
                    memoria={[{ titulo: `Pilar ${p.pilar.nome} em ${nivel}`, etapas: r.memoria }]}
                    colunas={COLUNAS}
                    comMemoria={comMemoria}
                  >
                    <Td
                      num
                    >{`${formatarNumero(p.pilar.b, 0)} × ${formatarNumero(p.pilar.h, 0)}`}</Td>
                    <Td num>{formatarGrandeza(p.nk, "forca", s)}</Td>
                    <Td num>{formatarGrandeza(r.nd, "forca", s)}</Td>
                    <Td num>{formatarNumero(r.lambdaX, 1)}</Td>
                    <Td num>{formatarNumero(r.lambdaY, 1)}</Td>
                    <Td num>{formatarGrandeza(r.mdX, "momento", s)}</Td>
                    <Td num>{formatarGrandeza(r.mdY, "momento", s)}</Td>
                    <Td num>{formatarNumero(r.asNecessaria)}</Td>
                    <Td num>{formatarNumero(r.barras.area)}</Td>
                    <Td>{formatarBarras(r.barras)}</Td>
                    <Td num>{formatarNumero(r.taxa)}</Td>
                    <Td>{formatarBarraEspacada(r.estribo)}</Td>
                    <Td num>{formatarNumero(pe)}</Td>
                  </LinhaElemento>
                );
              })}
            </Fragment>
          ))}
        </Corpo>
      </Tabela>
      <VerificacoesPilares resultado={resultado} />
      <PredimensionamentosPilares resultado={resultado} />
      <DetalhamentosPilares comMemoria={comMemoria} />
    </>
  );
}

/** Verificações de seção (PILAR opção 6) de cada lance: um caso por linha, com o
 *  atuante (com ea) e o resistente da 2ª ordem. Some sem verificações na obra. */
export function VerificacoesPilares({ resultado }: { resultado: ResultadoObra }) {
  const s = useUnidades();
  const verificacoes = resultado.pilares.flatMap((p) =>
    (p.verificacoes ?? []).map((v) => ({ p, v })),
  );
  if (verificacoes.length === 0) return null;
  const uF = unidade("forca", s);
  const uM = unidade("momento", s);
  return (
    <>
      <TituloBloco
        extra={
          <span className="text-muted-foreground text-xs">
            PILAR opção 6: barras e esforços dados na obra; M = atuante, MR = resistente
          </span>
        }
      >
        Verificações de seção
      </TituloBloco>
      <Tabela>
        <Cabecalho>
          <Linha>
            <Th>Pilar</Th>
            <Th>Esforços</Th>
            <Th>Verif.</Th>
            <Th num unidade={uF}>
              Nk
            </Th>
            <Th num>λx</Th>
            <Th num>λy</Th>
            <Th>Caso</Th>
            <Th num unidade={uM}>
              Mx
            </Th>
            <Th num unidade={uM}>
              My
            </Th>
            <Th num unidade={uM}>
              M total
            </Th>
            <Th num unidade={uM}>
              MRx
            </Th>
            <Th num unidade={uM}>
              MRy
            </Th>
            <Th num unidade={uM}>
              MR total
            </Th>
            <Th>Veredito</Th>
          </Linha>
        </Cabecalho>
        <Corpo>
          {verificacoes.map(({ p, v }) => {
            const chave = `${p.pilar.id}-${p.pavimentoId}-${v.indice}`;
            const esforcos = v.esforcosDoLance ? "do lance" : "digitados";
            if (v.casos.length === 0)
              return (
                <Linha key={chave}>
                  <Td>{`${p.pilar.nome} · ${p.pavimento}`}</Td>
                  <Td>{esforcos}</Td>
                  <Td>{v.indice + 1}</Td>
                  <Td num>{formatarGrandeza(v.nk, "forca", s)}</Td>
                  <Td colSpan={COLUNAS - 4}>{v.situacao ?? "Sem casos calculados."}</Td>
                </Linha>
              );
            return v.casos.map((c) => (
              <Linha key={`${chave}-${c.rotulo}`}>
                <Td>{`${p.pilar.nome} · ${p.pavimento}`}</Td>
                <Td>{esforcos}</Td>
                <Td>{v.indice + 1}</Td>
                <Td num>{formatarGrandeza(v.nk, "forca", s)}</Td>
                <Td num>{formatarNumero(v.lambdaX, 1)}</Td>
                <Td num>{formatarNumero(v.lambdaY, 1)}</Td>
                <Td>{c.rotulo}</Td>
                <Td num>{formatarGrandeza(c.mx, "momento", s)}</Td>
                <Td num>{formatarGrandeza(c.my, "momento", s)}</Td>
                <Td num>{formatarGrandeza(c.mTotal, "momento", s)}</Td>
                <Td num>{formatarGrandeza(c.mrX, "momento", s)}</Td>
                <Td num>{formatarGrandeza(c.mrY, "momento", s)}</Td>
                <Td num>{formatarGrandeza(c.mrTotal, "momento", s)}</Td>
                <Td>{c.erro ? textoErro(c.erro) : c.veredito}</Td>
              </Linha>
            ));
          })}
        </Corpo>
      </Tabela>
      {verificacoes.map(({ p, v }) =>
        v.avisos.length > 0 ? (
          <ul
            key={`avisos-${p.pilar.id}-${p.pavimentoId}-${v.indice}`}
            className="text-muted-foreground mb-2 list-disc pl-5 text-xs"
          >
            {v.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : null,
      )}
    </>
  );
}

/** Predimensionamento da coluna (PILAREDI 3.1), no lance de baixo de cada coluna.
 *  Some quando a obra não liga `parametrosPilar.predimensionamento`. */
export function PredimensionamentosPilares({ resultado }: { resultado: ResultadoObra }) {
  const s = useUnidades();
  const predimensionados = resultado.pilares.flatMap((p) =>
    p.predimensionamento ? [{ p, pd: p.predimensionamento }] : [],
  );
  if (predimensionados.length === 0) return null;
  const uTensao = unidade("tensao", s);
  const uF = unidade("forca", s);
  return (
    <>
      <TituloBloco
        extra={
          <span className="text-muted-foreground text-xs">
            Tensões normal e de flexão da coluna contra as admissíveis; carga = "CARGA" do PILAREDI
          </span>
        }
      >
        Predimensionamento
      </TituloBloco>
      <Tabela>
        <Cabecalho>
          <Linha>
            <Th>Pilar</Th>
            <Th>Opção</Th>
            <Th num unidade="cm">
              Lado
            </Th>
            <Th num unidade={uTensao}>
              σ normal
            </Th>
            <Th num unidade={uTensao}>
              σ normal adm.
            </Th>
            <Th num unidade={uTensao}>
              σ flexão
            </Th>
            <Th num unidade={uTensao}>
              σ flexão adm.
            </Th>
            <Th num unidade={uF}>
              Carga
            </Th>
          </Linha>
        </Cabecalho>
        <Corpo>
          {predimensionados.map(({ p, pd }) => (
            <Linha key={`${p.pilar.id}-${p.pavimentoId}`}>
              <Td>{`${p.pilar.nome} · ${p.pavimento}`}</Td>
              <Td>{pd.modo === "tensoes" ? "tensões" : "seção"}</Td>
              <Td num>{formatarNumero(pd.lado, 0)}</Td>
              <Td num>{formatarGrandeza(pd.tensoes?.normal, "tensao", s)}</Td>
              <Td num>{formatarGrandeza(pd.tensoes?.normalAdmissivel, "tensao", s)}</Td>
              <Td num>{formatarGrandeza(pd.tensoes?.flexao, "tensao", s)}</Td>
              <Td num>{formatarGrandeza(pd.tensoes?.flexaoAdmissivel, "tensao", s)}</Td>
              <Td num>{formatarGrandeza(pd.carga, "forca", s)}</Td>
            </Linha>
          ))}
        </Corpo>
      </Tabela>
      {predimensionados.map(({ p, pd }) =>
        pd.avisos.length > 0 ? (
          <ul
            key={`avisos-${p.pilar.id}-${p.pavimentoId}`}
            className="text-muted-foreground mb-2 list-disc pl-5 text-xs"
          >
            {pd.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : null,
      )}
    </>
  );
}

/** Blocos "Detalhamento" de cada pilar (todos os lances), do DetalhamentoContexto. */
function DetalhamentosPilares({ comMemoria }: { comMemoria: boolean }) {
  const det = useContext(DetalhamentoContexto);
  if (!det) return null;
  return det.pilares.pilares.map((d) => (
    <BlocoPilar key={`${d.chave}|${d.lances[0]?.nivel}`} d={d} comMemoria={comMemoria} />
  ));
}

/** Título do lance na tabela de posições: nível, pé-direito, seção, barras por
 *  face (o arranjo que o cálculo verificou), traspasse e grampos. */
function tituloLance(d: DetalhamentoPilarObra, i: number) {
  const l = d.lances[i];
  if (!l) return "";
  const grampos = d.detalhamento.posicoes
    .filter((p) => p.tramo === i && p.tipo === "grampo")
    .reduce((s, p) => s + p.quantidade, 0);
  return [
    `Lance ${i + 1}: ${l.nivel}`,
    `pé-direito ${formatarNumero(l.peDireito, 0)} cm`,
    `${formatarNumero(l.b, 0)} × ${formatarNumero(l.h, 0)} cm`,
    `${l.porFaceX} barras por face de ${formatarNumero(l.h, 0)} e ${l.porFaceY} por face de ${formatarNumero(l.b, 0)}`,
    l.traspasse === null ? "sem traspasse" : `traspasse ${formatarNumero(l.traspasse, 0)} cm`,
    grampos > 0 ? `${formatarNumero(grampos, 0)} grampos` : "sem grampos",
  ].join(" · ");
}

function BlocoPilar({ d, comMemoria }: { d: DetalhamentoPilarObra; comMemoria: boolean }) {
  const { posicoes, avisos, memoria } = d.detalhamento;
  const arranjoPadrao = d.lances.some((l) => l.arranjo === "padrao");
  return (
    <section aria-label={`Detalhamento ${d.nome}`} className="break-inside-avoid">
      <TituloBloco
        extra={
          <span className="text-muted-foreground text-xs">
            {d.lances.length} lance(s), da base para o topo · cobrimento{" "}
            {formatarNumero(d.cobrimento, 1)} cm · quantidades de cada lance
          </span>
        }
      >
        Detalhamento {d.nome}
      </TituloBloco>
      <AvisosDetalhamento avisos={avisos} />
      {arranjoPadrao && (
        <p className="text-muted-foreground mb-1 text-xs">
          Barras por face pela distribuição padrão do motor (arranjoBarras da V1): o arranjo do
          cálculo não fecha com o número de barras, e esta distribuição pode não ser a verificada.
        </p>
      )}
      {posicoes.length > 0 ? (
        <TabelaPosicoes
          posicoes={posicoes}
          grupo={(p) => ({ chave: p.tramo, titulo: tituloLance(d, p.tramo) })}
        />
      ) : (
        <p className="text-muted-foreground text-xs">Sem barras a detalhar.</p>
      )}
      <MemoriaDetalhamento
        titulo={`Detalhamento ${d.nome}`}
        etapas={memoria}
        comMemoria={comMemoria}
      />
    </section>
  );
}
