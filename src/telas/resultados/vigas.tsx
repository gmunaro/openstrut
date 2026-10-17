// Tabela de vigas de um pavimento, uma linha por tramo: esforços
// característicos da envoltória e o dimensionamento (flexão, cortante, barras).
// Depois da tabela, o detalhamento de cada viga: posições N1, N2… e o esquema
// das barras ao longo dela. O detalhamento vem do DetalhamentoContexto, que a
// tela da obra preenche com detalharObra. A tabela de posições, os avisos e a
// memória do detalhamento também servem aos blocos de lajes e pilares.
import { useContext, type ReactNode } from "react";
import type { ResultadoViga, SecaoViga } from "../../calculo/fluxo";
import type { VigaMontada } from "../../calculo/montagem";
import type { Etapa } from "../../calculo/tipos";
import { cn } from "@/lib/utils";
import { avisosViga } from "../calculo";
import { DetalhamentoContexto, type DetalhamentoVigaObra } from "../detalhamento";
import {
  formatarBarraEspacada,
  formatarBarras,
  formatarGrandeza,
  formatarNumero,
  unidade,
} from "../formato";
import { useUnidades } from "../sessao";
import { EsquemaViga } from "./desenhos";
import { MOSTRA_TUDO, useFiltro } from "./filtro";
import { LinhaElemento, Memoria, type GrupoMemoria } from "./memoria";
import { Cabecalho, Corpo, Linha, Tabela, Td, Th, TituloBloco, useOrdenacao } from "./tabela";

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

type ColunaViga = "nome" | "vao" | "mPos" | "mNegEsq" | "mNegDir" | "v";

/** Valor de cada coluna ordenável da tabela de vigas: o maior entre os tramos (a viga
 *  inteira se move, com os tramos juntos). Sem análise, null (vai para o fim). */
function valorViga(r: ResultadoViga, k: ColunaViga) {
  if (k === "nome") return r.viga.nome;
  const t = r.analise.ok ? r.analise.tramos : [];
  if (t.length === 0) return null;
  const maior = (f: (x: (typeof t)[number]) => number) => Math.max(...t.map(f));
  if (k === "vao") return maior((x) => x.comprimento);
  if (k === "mPos") return maior((x) => x.mPos);
  if (k === "mNegEsq") return maior((x) => Math.abs(x.mNegEsq));
  if (k === "mNegDir") return maior((x) => Math.abs(x.mNegDir));
  return maior((x) => Math.max(x.vEsq, x.vDir));
}

const asSecao = (s: SecaoViga) => (s.flexao ? formatarNumero(s.flexao.as) : "—");
const barrasSecao = (s: SecaoViga) =>
  s.flexao ? `${formatarBarras(s.barras)}${s.barras && !s.barras.cabe ? " *" : ""}` : "—";

export function TabelaVigas({
  vigas: todas,
  naoCalculadas: todasNaoCalculadas,
  gamaF,
  comMemoria,
  interrompidas,
}: {
  vigas: ResultadoViga[];
  naoCalculadas: VigaMontada[];
  gamaF: number;
  comMemoria: boolean;
  /** Nomes das vigas que o motor SISTRUT parou no DESDIM (modo original). */
  interrompidas?: ReadonlySet<string> | undefined;
}) {
  const s = useUnidades();
  const uM = unidade("momento", s);
  const mostra = useFiltro();
  const ord = useOrdenacao<ColunaViga>();
  const vigas = ord.ordenar(
    todas.filter((r) => mostra(r.viga.nome)),
    valorViga,
  );
  const naoCalculadas = todasNaoCalculadas.filter((v) => mostra(v.nome));
  const haviaVigas = todas.length + todasNaoCalculadas.length > 0;
  if ((haviaVigas || mostra !== MOSTRA_TUDO) && vigas.length + naoCalculadas.length === 0)
    return null;
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
        copiar="Vigas"
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
            <Th rowSpan={2} ordenar={ord.coluna("nome", false)}>
              Viga
            </Th>
            <Th rowSpan={2} num>
              Tramo
            </Th>
            <Th rowSpan={2} num unidade="cm">
              bw × h
            </Th>
            <Th rowSpan={2} num unidade="cm">
              d
            </Th>
            <Th rowSpan={2} num unidade="m" ordenar={ord.coluna("vao")}>
              Vão
            </Th>
            <Th rowSpan={2} num unidade={uM} ordenar={ord.coluna("mPos")}>
              M+
            </Th>
            <Th rowSpan={2} num unidade={uM} ordenar={ord.coluna("mNegEsq")}>
              M− esq
            </Th>
            <Th rowSpan={2} num unidade={uM} ordenar={ord.coluna("mNegDir")}>
              M− dir
            </Th>
            <Th rowSpan={2} num unidade={unidade("forca", s)} ordenar={ord.coluna("v")}>
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
                    {a?.balanco ? " (balanço)" : ""}
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
      <DetalhamentosDoPavimento
        vigas={vigas}
        comMemoria={comMemoria}
        interrompidas={interrompidas}
      />
    </>
  );
}

/** Blocos "Detalhamento" das vigas deste pavimento, na ordem da tabela. */
function DetalhamentosDoPavimento({
  vigas,
  comMemoria,
  interrompidas,
}: {
  vigas: ResultadoViga[];
  comMemoria: boolean;
  interrompidas?: ReadonlySet<string> | undefined;
}) {
  const det = useContext(DetalhamentoContexto);
  if (!det) return null;
  // `vigas` já vem filtrada e ordenada pela tabela
  const doPavimento = vigas.flatMap((r) => det.vigas.find((d) => d.vigaId === r.viga.id) ?? []);
  return doPavimento.map((d) => (
    <BlocoDetalhamento
      key={d.vigaId}
      d={d}
      comMemoria={comMemoria}
      interrompida={interrompidas?.has(d.nome) ?? false}
    />
  ));
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

/** Bloco do detalhamento de uma viga. `interrompida`: no modo original o SISTRUT para a
 *  viga no DESDIM e não a detalha; o bloco fica marcado como regra da V2. */
function BlocoDetalhamento({
  d,
  comMemoria,
  interrompida,
}: {
  d: DetalhamentoVigaObra;
  comMemoria: boolean;
  interrompida: boolean;
}) {
  const { posicoes, avisos, memoria } = d.detalhamento;
  return (
    <section
      aria-label={`Detalhamento ${d.nome}`}
      className={cn(
        "break-inside-avoid",
        interrompida && "border-aviso/60 mt-2 border-l-2 pl-3 opacity-90",
      )}
    >
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
      {interrompida && (
        <p role="note" className="text-aviso mb-1 max-w-3xl text-xs font-medium">
          No SISTRUT original a {d.nome} para no DESDIM e fica sem detalhamento. Este detalhamento
          segue as regras da OpenStrut e serve só de referência.
        </p>
      )}
      <AvisosDetalhamento avisos={avisos} />
      <div className="flex flex-wrap items-start gap-4">
        <TabelaPosicoes posicoes={posicoes} />
        <EsquemaViga d={d} />
      </div>
      <MemoriaDetalhamento
        titulo={`Detalhamento ${d.nome}`}
        etapas={memoria}
        comMemoria={comMemoria}
      />
    </section>
  );
}
