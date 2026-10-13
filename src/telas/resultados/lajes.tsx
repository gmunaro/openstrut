// Tabelas de lajes de um pavimento: esforços (vínculos, momentos, reações,
// flecha) e armaduras (cm²/m e barras), positivos e negativos por bordo.
// Depois, o detalhamento de cada laje (posições N1, N2…), do DetalhamentoContexto.
import { useContext } from "react";
import type { PosicaoLaje } from "../../calculo/detalhamento/lajes";
import type { ResultadoLaje } from "../../calculo/fluxo";
import { BORDOS, type Bordo, type Vinculo } from "../../dominio/obra";
import { avisosLaje } from "../calculo";
import { DetalhamentoContexto, type DetalhamentoLajeObra } from "../detalhamento";
import { formatarBarraEspacada, formatarGrandeza, formatarNumero, unidade } from "../formato";
import { useUnidades } from "../sessao";
import { LinhaElemento } from "./memoria";
import { Cabecalho, Corpo, Linha, Tabela, Td, Th, TituloBloco } from "./tabela";
import {
  AvisosDetalhamento,
  MemoriaDetalhamento,
  TabelaPosicoes,
  type ColunaPosicao,
} from "./vigas";

const ABREV: Record<Bordo, string> = {
  esquerdo: "esq",
  inferior: "inf",
  direito: "dir",
  superior: "sup",
};
const LETRA_VINCULO: Record<Vinculo, string> = { engastado: "E", apoiado: "A", livre: "L" };

const memoriaLaje = (r: ResultadoLaje) => [
  { titulo: "Esforços", etapas: r.esforcos.memoria },
  { titulo: "Armaduras", etapas: r.armadura.memoria },
];

export function TabelasLajes({
  lajes,
  comMemoria,
}: {
  lajes: ResultadoLaje[];
  comMemoria: boolean;
}) {
  const s = useUnidades();
  if (lajes.length === 0)
    return (
      <>
        <TituloBloco>Lajes</TituloBloco>
        <p className="text-muted-foreground text-xs">Nenhuma laje neste pavimento.</p>
      </>
    );
  const uMl = unidade("momentoLinear", s);
  const colunasEsforcos = 19;
  return (
    <>
      <TituloBloco
        extra={
          <span className="text-muted-foreground text-xs">
            valores característicos; vínculos E engastado, A apoiado, L livre (esq, inf, dir, sup)
          </span>
        }
      >
        Lajes: esforços
      </TituloBloco>
      <Tabela>
        <Cabecalho>
          <Linha>
            <Th rowSpan={2}>Laje</Th>
            <Th rowSpan={2} num unidade="m">
              lx
            </Th>
            <Th rowSpan={2} num unidade="m">
              ly
            </Th>
            <Th rowSpan={2} num unidade="cm">
              h
            </Th>
            <Th rowSpan={2} num unidade={unidade("cargaArea", s)}>
              g
            </Th>
            <Th rowSpan={2} num unidade={unidade("cargaArea", s)}>
              q
            </Th>
            <Th rowSpan={2}>Vínculos</Th>
            <Th rowSpan={2} num unidade={uMl}>
              mx
            </Th>
            <Th rowSpan={2} num unidade={uMl}>
              my
            </Th>
            <Th colSpan={4} className="text-center">
              Momento negativo ({uMl})
            </Th>
            <Th colSpan={4} className="text-center">
              Reação na viga ({unidade("cargaLinear", s)})
            </Th>
            <Th rowSpan={2} num unidade="cm">
              Flecha
            </Th>
            <Th rowSpan={2} num unidade="cm">
              Limite
            </Th>
          </Linha>
          <Linha>
            {BORDOS.map((b) => (
              <Th key={`x${b}`} num>
                {ABREV[b]}
              </Th>
            ))}
            {BORDOS.map((b) => (
              <Th key={`r${b}`} num>
                {ABREV[b]}
              </Th>
            ))}
          </Linha>
        </Cabecalho>
        <Corpo>
          {lajes.map((r) => {
            const e = r.esforcos;
            const flechaExcede = e.flecha > e.flechaLimite;
            return (
              <LinhaElemento
                key={r.laje.id}
                nome={r.laje.nome}
                avisos={avisosLaje(r)}
                memoria={memoriaLaje(r)}
                colunas={colunasEsforcos}
                comMemoria={comMemoria}
              >
                <Td num>{formatarNumero(r.entrada.lx)}</Td>
                <Td num>{formatarNumero(r.entrada.ly)}</Td>
                <Td num>{formatarNumero(r.entrada.h, 1)}</Td>
                <Td num>{formatarGrandeza(r.entrada.g, "cargaArea", s)}</Td>
                <Td num>{formatarGrandeza(r.entrada.q, "cargaArea", s)}</Td>
                <Td className="font-mono">
                  {BORDOS.map((b) => LETRA_VINCULO[r.entrada.vinculos[b]]).join(" ")}
                </Td>
                <Td num>{formatarGrandeza(e.mx, "momentoLinear", s)}</Td>
                <Td num>{formatarGrandeza(e.my, "momentoLinear", s)}</Td>
                {BORDOS.map((b) => (
                  <Td key={`x${b}`} num>
                    {e.negativos[b] > 0
                      ? formatarGrandeza(e.negativos[b], "momentoLinear", s)
                      : "—"}
                  </Td>
                ))}
                {BORDOS.map((b) => (
                  <Td key={`r${b}`} num>
                    {formatarGrandeza(e.reacoes[b], "cargaLinear", s)}
                  </Td>
                ))}
                <Td num className={flechaExcede ? "text-destructive font-semibold" : undefined}>
                  {formatarNumero(e.flecha, 3)}
                </Td>
                <Td num>{formatarNumero(e.flechaLimite, 3)}</Td>
              </LinhaElemento>
            );
          })}
        </Corpo>
      </Tabela>

      <TituloBloco>Lajes: armaduras</TituloBloco>
      <Tabela>
        <Cabecalho>
          <Linha>
            <Th rowSpan={2}>Laje</Th>
            <Th colSpan={2} className="text-center">
              Positiva x
            </Th>
            <Th colSpan={2} className="text-center">
              Positiva y
            </Th>
            {BORDOS.map((b) => (
              <Th key={b} colSpan={2} className="text-center">
                Negativa {ABREV[b]}
              </Th>
            ))}
          </Linha>
          <Linha>
            {Array.from({ length: 6 }, (_, i) => [
              <Th key={`a${i}`} num unidade="cm²/m">
                As
              </Th>,
              <Th key={`b${i}`}>Barras</Th>,
            ])}
          </Linha>
        </Cabecalho>
        <Corpo>
          {lajes.map((r) => {
            const a = r.armadura;
            return (
              <Linha key={r.laje.id}>
                <Td className="font-medium">{r.laje.nome}</Td>
                <Td num>{formatarNumero(a.asx)}</Td>
                <Td>{formatarBarraEspacada(a.barrasX)}</Td>
                <Td num>{formatarNumero(a.asy)}</Td>
                <Td>{formatarBarraEspacada(a.barrasY)}</Td>
                {BORDOS.map((b) => {
                  const as = a.asNegativos[b];
                  return [
                    <Td key={`a${b}`} num>
                      {as > 0 ? formatarNumero(as) : "—"}
                    </Td>,
                    <Td key={`b${b}`}>
                      {as > 0 ? formatarBarraEspacada(a.barrasNegativos[b]) : "—"}
                    </Td>,
                  ];
                })}
              </Linha>
            );
          })}
        </Corpo>
      </Tabela>
      <DetalhamentosLajes lajes={lajes} comMemoria={comMemoria} />
    </>
  );
}

/** Blocos "Detalhamento" das lajes deste pavimento, na ordem da tabela. */
function DetalhamentosLajes({
  lajes,
  comMemoria,
}: {
  lajes: ResultadoLaje[];
  comMemoria: boolean;
}) {
  const det = useContext(DetalhamentoContexto);
  if (!det) return null;
  const doPavimento = lajes.flatMap(
    (r) => det.lajes.lajes.find((d) => d.lajeId === r.laje.id) ?? [],
  );
  return doPavimento.map((d) => <BlocoLaje key={d.lajeId} d={d} comMemoria={comMemoria} />);
}

const COLUNAS_LAJE: ColunaPosicao<PosicaoLaje>[] = [
  { titulo: "Direção", valor: (p) => p.direcao },
  { titulo: "Bordo", valor: (p) => (p.bordo ? ABREV[p.bordo] : "—") },
];

function BlocoLaje({ d, comMemoria }: { d: DetalhamentoLajeObra; comMemoria: boolean }) {
  const { posicoes, avisos, memoria } = d.detalhamento;
  return (
    <section aria-label={`Detalhamento ${d.nome}`} className="break-inside-avoid">
      <TituloBloco
        extra={
          <span className="text-muted-foreground text-xs">
            {formatarNumero(d.lx)} × {formatarNumero(d.ly)} m · h = {formatarNumero(d.h, 0)} cm ·
            cobrimento {formatarNumero(d.cobrimento, 1)} cm · quantidades de um pavimento
            {d.negativoNaVizinha.length > 0
              ? ` · negativa ${d.negativoNaVizinha.map((b) => ABREV[b]).join(", ")} na laje vizinha`
              : ""}
          </span>
        }
      >
        Detalhamento {d.nome}
      </TituloBloco>
      <AvisosDetalhamento avisos={avisos} />
      {posicoes.length > 0 ? (
        <TabelaPosicoes posicoes={posicoes} extras={COLUNAS_LAJE} />
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
