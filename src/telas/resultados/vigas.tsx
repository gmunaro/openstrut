// Tabela de vigas de um pavimento, uma linha por tramo: esforços
// característicos da envoltória e o dimensionamento (flexão, cortante, barras).
// Depois da tabela, o detalhamento de cada viga: posições N1, N2… e o esquema
// das barras ao longo dela. O detalhamento vem do DetalhamentoContexto, que a
// tela da obra preenche com detalharObra. A tabela de posições, os avisos e a
// memória do detalhamento também servem aos blocos de lajes e pilares.
import { useContext, type ReactNode } from "react";
import type { PosicaoArmadura } from "../../calculo/detalhamento/vigas";
import type { ResultadoViga, SecaoViga } from "../../calculo/fluxo";
import type { VigaMontada } from "../../calculo/montagem";
import type { Etapa } from "../../calculo/tipos";
import { avisosViga } from "../calculo";
import { DetalhamentoContexto, rotuloPosicao, type DetalhamentoVigaObra } from "../detalhamento";
import {
  formatarBarraEspacada,
  formatarBarras,
  formatarGrandeza,
  formatarNumero,
  unidade,
} from "../formato";
import { useUnidades } from "../sessao";
import { LinhaElemento, Memoria, type GrupoMemoria } from "./memoria";
import { Cabecalho, Corpo, Linha, Tabela, Td, Th, TituloBloco } from "./tabela";

const COLUNAS = 18;

/** Avisos do tramo `i` (o dimensionamento os prefixa com "<viga> tramo <i>:");
 *  os da análise e os sem tramo vão para o primeiro tramo. */
function avisosDoTramo(r: ResultadoViga, i: number) {
  const prefixo = (k: number) => `${r.viga.nome} tramo ${k + 1}:`;
  const todos = avisosViga(r);
  if (i === 0) return todos.filter((a) => a.startsWith(prefixo(0)) || !/ tramo \d+:/.test(a));
  return todos.filter((a) => a.startsWith(prefixo(i)));
}

function memoriaDoTramo(r: ResultadoViga, i: number): GrupoMemoria[] {
  const t = r.tramos[i];
  const grupos: GrupoMemoria[] = [];
  if (i === 0) grupos.push({ titulo: `Viga contínua ${r.viga.nome}`, etapas: r.analise.memoria });
  if (!t) return grupos;
  const flexao = (titulo: string, s: SecaoViga) => {
    if (s.flexao) grupos.push({ titulo, etapas: s.flexao.memoria });
  };
  flexao("Flexão: momento positivo", t.positivo);
  flexao("Flexão: negativo esquerdo", t.negativoEsq);
  flexao("Flexão: negativo direito", t.negativoDir);
  grupos.push({ titulo: "Cortante", etapas: t.cortante.memoria });
  return grupos;
}

const asSecao = (s: SecaoViga) => (s.flexao ? formatarNumero(s.flexao.as) : "—");
const barrasSecao = (s: SecaoViga) =>
  s.flexao ? `${formatarBarras(s.barras)}${s.barras && !s.barras.cabe ? " *" : ""}` : "—";

export function TabelaVigas({
  vigas,
  naoCalculadas,
  gamaF,
  comMemoria,
}: {
  vigas: ResultadoViga[];
  naoCalculadas: VigaMontada[];
  gamaF: number;
  comMemoria: boolean;
}) {
  const s = useUnidades();
  const uM = unidade("momento", s);
  if (vigas.length === 0 && naoCalculadas.length === 0)
    return (
      <>
        <TituloBloco>Vigas</TituloBloco>
        <p className="text-muted-foreground text-xs">Nenhuma viga neste pavimento.</p>
      </>
    );
  return (
    <>
      <TituloBloco
        extra={
          <span className="text-muted-foreground text-xs">
            M e V característicos (envoltória); As com γf = {formatarNumero(gamaF, 2)}; * = barras
            não cabem em uma camada
          </span>
        }
      >
        Vigas
      </TituloBloco>
      <Tabela>
        <Cabecalho>
          <Linha>
            <Th rowSpan={2}>Viga</Th>
            <Th rowSpan={2} num>
              Tramo
            </Th>
            <Th rowSpan={2} num unidade="cm">
              bw × h
            </Th>
            <Th rowSpan={2} num unidade="cm">
              d
            </Th>
            <Th rowSpan={2} num unidade="m">
              Vão
            </Th>
            <Th rowSpan={2} num unidade={uM}>
              M+
            </Th>
            <Th rowSpan={2} num unidade={uM}>
              M− esq
            </Th>
            <Th rowSpan={2} num unidade={uM}>
              M− dir
            </Th>
            <Th rowSpan={2} num unidade={unidade("forca", s)}>
              V máx
            </Th>
            <Th colSpan={2} className="text-center">
              Positiva
            </Th>
            <Th colSpan={2} className="text-center">
              Negativa esq
            </Th>
            <Th colSpan={2} className="text-center">
              Negativa dir
            </Th>
            <Th rowSpan={2} num unidade="cm²">
              As′ máx
            </Th>
            <Th rowSpan={2} num unidade="cm²/m">
              Asw
            </Th>
            <Th rowSpan={2}>Estribo</Th>
          </Linha>
          <Linha>
            {[0, 1, 2].map((i) => [
              <Th key={`a${i}`} num unidade="cm²">
                As
              </Th>,
              <Th key={`b${i}`}>Barras</Th>,
            ])}
          </Linha>
        </Cabecalho>
        <Corpo>
          {vigas.map((r) => {
            const secao = `${formatarNumero(r.viga.bw, 0)} × ${formatarNumero(r.viga.h, 0)}`;
            if (!r.analise.ok || r.tramos.length === 0)
              return (
                <LinhaElemento
                  key={r.viga.id}
                  nome={r.viga.nome}
                  avisos={avisosViga(r)}
                  memoria={[{ titulo: `Viga contínua ${r.viga.nome}`, etapas: r.analise.memoria }]}
                  colunas={COLUNAS}
                  comMemoria={comMemoria}
                >
                  <Td />
                  <Td num>{secao}</Td>
                  <Td colSpan={COLUNAS - 3} className="text-destructive">
                    não calculada: {avisosViga(r).join(" ") || "análise sem solução"}
                  </Td>
                </LinhaElemento>
              );
            const tramos = r.analise.tramos;
            return r.tramos.map((t, i) => {
              const a = tramos[i];
              const asComp = Math.max(
                ...[t.positivo, t.negativoEsq, t.negativoDir].map(
                  (x) => x.flexao?.asComprimida ?? 0,
                ),
              );
              return (
                <LinhaElemento
                  key={`${r.viga.id}-${i}`}
                  nome={i === 0 ? r.viga.nome : ""}
                  avisos={avisosDoTramo(r, i)}
                  memoria={memoriaDoTramo(r, i)}
                  colunas={COLUNAS}
                  comMemoria={comMemoria}
                >
                  <Td num>
                    {i + 1}
                    {a?.balanco ? " (bal.)" : ""}
                  </Td>
                  <Td num>{i === 0 ? secao : ""}</Td>
                  <Td num>{i === 0 ? formatarNumero(r.d, 1) : ""}</Td>
                  <Td num>{formatarNumero(a?.comprimento)}</Td>
                  <Td num>{formatarGrandeza(a?.mPos, "momento", s)}</Td>
                  <Td num>{formatarGrandeza(a?.mNegEsq, "momento", s)}</Td>
                  <Td num>{formatarGrandeza(a?.mNegDir, "momento", s)}</Td>
                  <Td num>{formatarGrandeza(a ? Math.max(a.vEsq, a.vDir) : null, "forca", s)}</Td>
                  <Td num>{asSecao(t.positivo)}</Td>
                  <Td>{barrasSecao(t.positivo)}</Td>
                  <Td num>{asSecao(t.negativoEsq)}</Td>
                  <Td>{barrasSecao(t.negativoEsq)}</Td>
                  <Td num>{asSecao(t.negativoDir)}</Td>
                  <Td>{barrasSecao(t.negativoDir)}</Td>
                  <Td num>{asComp > 0 ? formatarNumero(asComp) : "—"}</Td>
                  <Td
                    num
                    className={t.cortante.bielaOk ? undefined : "text-destructive font-semibold"}
                  >
                    {formatarNumero(t.cortante.asw)}
                  </Td>
                  <Td>{formatarBarraEspacada(t.estribo)}</Td>
                </LinhaElemento>
              );
            });
          })}
          {naoCalculadas.map((v) => (
            <Linha key={v.id}>
              <Td className="font-medium">{v.nome}</Td>
              <Td />
              <Td num>{`${formatarNumero(v.bw, 0)} × ${formatarNumero(v.h, 0)}`}</Td>
              <Td colSpan={COLUNAS - 3} className="text-destructive">
                não calculada (apoios insuficientes ou ciclo de apoios)
              </Td>
            </Linha>
          ))}
        </Corpo>
      </Tabela>
      <DetalhamentosDoPavimento vigas={vigas} comMemoria={comMemoria} />
    </>
  );
}

/** Blocos "Detalhamento" das vigas deste pavimento, na ordem da tabela. */
function DetalhamentosDoPavimento({
  vigas,
  comMemoria,
}: {
  vigas: ResultadoViga[];
  comMemoria: boolean;
}) {
  const det = useContext(DetalhamentoContexto);
  if (!det) return null;
  const doPavimento = vigas.flatMap((r) => det.vigas.find((d) => d.vigaId === r.viga.id) ?? []);
  return doPavimento.map((d) => <BlocoDetalhamento key={d.vigaId} d={d} comMemoria={comMemoria} />);
}

export const phiTexto = (phi: number) => formatarNumero(phi, phi % 1 === 0 ? 0 : 1);

/** O que a tabela de posições lê de uma posição de viga, laje ou pilar. */
export interface PosicaoTabela {
  numero: number;
  nome: string;
  phi: number;
  quantidade: number;
  comprimento: number;
  tipo: string;
  espacamento: number | null;
}

/** Coluna a mais na tabela de posições (depois de "Tipo"). */
export interface ColunaPosicao<P> {
  titulo: string;
  valor: (p: P) => string;
}

/**
 * Tabela de posições N1, N2…: φ, quantidade, comprimento e tipo (com o
 * espaçamento), mais as colunas `extras`. Com `grupo`, cada mudança de chave
 * abre uma linha de título que ocupa a tabela toda (os lances do pilar).
 */
export function TabelaPosicoes<P extends PosicaoTabela>({
  posicoes,
  extras = [],
  grupo,
}: {
  posicoes: readonly P[];
  extras?: readonly ColunaPosicao<P>[];
  grupo?: (p: P) => { chave: number | string; titulo: ReactNode };
}) {
  const colunas = 5 + extras.length;
  let chaveAnterior: number | string | null = null;
  return (
    <Tabela className="w-auto">
      <Cabecalho>
        <Linha>
          <Th>N</Th>
          <Th num unidade="mm">
            φ
          </Th>
          <Th num>Quant.</Th>
          <Th num unidade="cm">
            Comprimento
          </Th>
          <Th>Tipo</Th>
          {extras.map((c) => (
            <Th key={c.titulo}>{c.titulo}</Th>
          ))}
        </Linha>
      </Cabecalho>
      <Corpo>
        {posicoes.flatMap((p) => {
          const linhas: ReactNode[] = [];
          const g = grupo?.(p);
          if (g && g.chave !== chaveAnterior) {
            chaveAnterior = g.chave;
            linhas.push(
              <Linha key={`g${g.chave}`} className="bg-muted/40 hover:bg-muted/40">
                <Td colSpan={colunas} className="font-semibold">
                  {g.titulo}
                </Td>
              </Linha>,
            );
          }
          linhas.push(
            <Linha key={p.numero}>
              <Td className="font-medium">{p.nome}</Td>
              <Td num>{phiTexto(p.phi)}</Td>
              <Td num>{formatarNumero(p.quantidade, 0)}</Td>
              <Td num>{formatarNumero(p.comprimento, 0)}</Td>
              <Td>
                {p.tipo}
                {p.espacamento ? ` c/${phiTexto(p.espacamento)}` : ""}
              </Td>
              {extras.map((c) => (
                <Td key={c.titulo}>{c.valor(p)}</Td>
              ))}
            </Linha>,
          );
          return linhas;
        })}
      </Corpo>
    </Tabela>
  );
}

/** Avisos do detalhamento de um elemento, logo abaixo do título do bloco. */
export function AvisosDetalhamento({ avisos }: { avisos: readonly string[] }) {
  if (avisos.length === 0) return null;
  return (
    <ul className="text-aviso mb-1 grid gap-0.5 text-xs">
      {avisos.map((a, i) => (
        <li key={i}>{a}</li>
      ))}
    </ul>
  );
}

/** Memória do detalhamento, recolhida; só na aba Resultados (`comMemoria`). */
export function MemoriaDetalhamento({
  titulo,
  etapas,
  comMemoria,
}: {
  titulo: string;
  etapas: Etapa[];
  comMemoria: boolean;
}) {
  if (!comMemoria || etapas.length === 0) return null;
  return (
    <details className="mt-1 text-xs">
      <summary className="text-muted-foreground cursor-pointer">Memória do detalhamento</summary>
      <Memoria grupos={[{ titulo, etapas }]} />
    </details>
  );
}

function BlocoDetalhamento({ d, comMemoria }: { d: DetalhamentoVigaObra; comMemoria: boolean }) {
  const { posicoes, avisos, memoria } = d.detalhamento;
  return (
    <section aria-label={`Detalhamento ${d.nome}`} className="break-inside-avoid">
      <TituloBloco
        extra={
          <span className="text-muted-foreground text-xs">
            {formatarNumero(d.bw, 0)} × {formatarNumero(d.h, 0)} cm · cobrimento{" "}
            {formatarNumero(d.cobrimento, 1)} cm · quantidades de um pavimento
          </span>
        }
      >
        Detalhamento {d.nome}
      </TituloBloco>
      <AvisosDetalhamento avisos={avisos} />
      <div className="flex flex-wrap items-start gap-4">
        <TabelaPosicoes posicoes={posicoes} />
        <EsquemaBarras d={d} />
      </div>
      <MemoriaDetalhamento
        titulo={`Detalhamento ${d.nome}`}
        etapas={memoria}
        comMemoria={comMemoria}
      />
    </section>
  );
}

/** Largura do esquema e alturas das faixas, px. */
const LARGURA_ESQUEMA = 760;
const MARGEM = 12;
const FAIXA = 20;
const ALTURA_VIGA = 22;
const GANCHO_PX = 6;

const emCima = (p: PosicaoArmadura) => p.tipo === "negativa" || p.tipo === "porta-estribos";

/**
 * Esquema da viga, com escala só na horizontal: barras superiores (negativas e
 * porta-estribos) em faixas acima do contorno, inferiores (positivas e
 * construtivas) abaixo e os estribos na última faixa. Cada barra vai de xInicio
 * a xFim, com um tracinho onde há gancho. Os apoios aparecem com a largura deles.
 */
function EsquemaBarras({ d }: { d: DetalhamentoVigaObra }) {
  const ps = d.detalhamento.posicoes;
  const sup = ps.filter(emCima);
  const inf = ps.filter((p) => !emCima(p) && p.tipo !== "estribo");
  const est = ps.filter((p) => p.tipo === "estribo");
  const meia = (k: number) => (d.larguraApoios[k] ?? 0) / 2;
  const xs = [
    ...ps.flatMap((p) => [p.xInicio, p.xFim]),
    ...d.nos.flatMap((x, k) => [x - meia(k), x + meia(k)]),
  ];
  const xMin = Math.min(...xs);
  const escala = (LARGURA_ESQUEMA - 2 * MARGEM) / Math.max(Math.max(...xs) - xMin, 1);
  const px = (x: number) => MARGEM + (x - xMin) * escala;
  const inicioViga = d.nos[0] ?? 0;
  const fimViga = d.nos.at(-1) ?? 0;

  const topoViga = MARGEM + sup.length * FAIXA + 4;
  const baseViga = topoViga + ALTURA_VIGA;
  const altura = baseViga + 4 + (inf.length + est.length) * FAIXA + MARGEM;
  // as de cima empilham a partir da viga para cima; as de baixo, para baixo
  const ySup = (i: number) => topoViga - 4 - (sup.length - 1 - i) * FAIXA;
  const yInf = (i: number) => baseViga + 4 + i * FAIXA + FAIXA / 2;
  const rotulo = (x: number, y: number, p: PosicaoArmadura) => (
    <text x={x} y={y} textAnchor="middle" fontSize={10} className="fill-current">
      {rotuloPosicao(p)}
    </text>
  );

  /** Barra longitudinal na altura y; o gancho desce (gancho > 0) ou sobe. */
  const barra = (p: PosicaoArmadura, y: number, gancho: number) => {
    const [a, b] = [px(p.xInicio), px(p.xFim)];
    const caminho = [
      p.ganchoInicio > 0 ? `M${a},${y + gancho} L${a},${y}` : `M${a},${y}`,
      `L${b},${y}`,
      p.ganchoFim > 0 ? `L${b},${y + gancho}` : "",
    ].join(" ");
    return (
      <g key={p.numero}>
        <path d={caminho} fill="none" strokeWidth={1.5} className="stroke-current" />
        {rotulo((a + b) / 2, y - 3, p)}
      </g>
    );
  };

  return (
    <svg
      role="img"
      aria-label={`Esquema das barras de ${d.nome}`}
      viewBox={`0 0 ${LARGURA_ESQUEMA} ${altura}`}
      width={LARGURA_ESQUEMA}
      height={altura}
      className="text-foreground h-auto max-w-full"
    >
      {d.nos.map((x, k) =>
        meia(k) > 0 ? (
          <rect
            key={`apoio${k}`}
            x={px(x - meia(k))}
            y={topoViga - 3}
            width={Math.max(2 * meia(k) * escala, 2)}
            height={ALTURA_VIGA + 6}
            strokeWidth={0.75}
            className="fill-muted stroke-muted-foreground"
          />
        ) : null,
      )}
      <rect
        x={px(inicioViga)}
        y={topoViga}
        width={(fimViga - inicioViga) * escala}
        height={ALTURA_VIGA}
        fill="none"
        strokeWidth={0.75}
        className="stroke-muted-foreground"
      />
      {sup.map((p, i) => barra(p, ySup(i), GANCHO_PX))}
      {inf.map((p, i) => barra(p, yInf(i), -GANCHO_PX))}
      {est.map((p, i) => {
        const y = yInf(inf.length + i);
        const [a, b] = [px(p.xInicio), px(p.xFim)];
        // um tracinho por estribo (até 60, para não borrar)
        const n = Math.min(p.quantidade, 60);
        return (
          <g key={p.numero}>
            {Array.from({ length: n }, (_, k) => {
              const x = n > 1 ? a + ((b - a) * k) / (n - 1) : a;
              return (
                <line
                  key={k}
                  x1={x}
                  x2={x}
                  y1={y - 4}
                  y2={y + 4}
                  strokeWidth={0.75}
                  className="stroke-current"
                />
              );
            })}
            {rotulo((a + b) / 2, y - 6, p)}
          </g>
        );
      })}
    </svg>
  );
}
