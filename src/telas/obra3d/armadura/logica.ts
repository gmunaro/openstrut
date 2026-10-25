// Lógica pura da camada "Armadura": o que desenhar para a seleção, o tubo de cada barra
// (malha mesclada por material) e as linhas do Painel. Sem three.js e sem DOM, testada
// em logica.test.ts. A posição das barras não é daqui: sai pronta de `ctx.barrasDe`
// (dominio/armaduraGeometria.ts).
import type { ArmaduraNaCena, Modelo3D, PosicaoGeometria } from "../api";

export type TipoBarra = PosicaoGeometria["tipo"];

/** Cor de cada tipo de posição (tons 600 do Tailwind, legíveis no fundo claro e no
 *  escuro e fora das cores de situação da vista). */
export const COR_TIPO: Record<TipoBarra, string> = {
  positiva: "#2563eb",
  negativa: "#db2777",
  "porta-estribos": "#9333ea",
  pele: "#0d9488",
  construtiva: "#ca8a04",
  longitudinal: "#ea580c",
  estribo: "#64748b",
  grampo: "#16a34a",
};

export const NOME_TIPO: Record<TipoBarra, string> = {
  positiva: "positiva",
  negativa: "negativa",
  "porta-estribos": "porta-estribos",
  pele: "pele",
  construtiva: "construtiva",
  longitudinal: "longitudinal",
  estribo: "estribo",
  grampo: "grampo",
};

/** Ordem da legenda e das malhas. */
export const TIPOS: readonly TipoBarra[] = [
  "positiva",
  "negativa",
  "porta-estribos",
  "pele",
  "construtiva",
  "longitudinal",
  "grampo",
  "estribo",
];

/** O que a seleção pede: uma viga (ou viga da escada), a coluna inteira de um pilar ou
 *  fundação, ou nada, com o motivo. */
export type Alvo =
  | { tipo: "viga"; chaves: [string]; nome: string }
  | { tipo: "coluna"; chaves: string[]; nome: string }
  | { tipo: "nenhum"; motivo: string };

export function alvoDaSelecao(
  modelo: Pick<Modelo3D, "elementos" | "colunas">,
  chave: string | null,
): Alvo {
  if (!chave) return { tipo: "nenhum", motivo: "Selecione uma viga, um pilar ou uma fundação." };
  const e = modelo.elementos.find((x) => x.chave === chave);
  if (!e) return { tipo: "nenhum", motivo: "Selecione uma viga, um pilar ou uma fundação." };
  if (e.tipo === "viga" || e.tipo === "escada")
    return {
      tipo: "viga",
      chaves: [e.chave],
      nome: `${e.tipo === "escada" ? "Escada" : "Viga"} ${e.nome}`,
    };
  if (e.tipo === "pilar" || e.tipo === "fundacao") {
    const col = modelo.colunas.find((c) => c.id === e.coluna || c.chaves.includes(e.chave));
    if (!col || col.chaves.length === 0)
      return { tipo: "nenhum", motivo: `O pilar ${e.nome} não está numa coluna do modelo.` };
    return { tipo: "coluna", chaves: [...col.chaves], nome: `Coluna ${col.nome}` };
  }
  return {
    tipo: "nenhum",
    motivo: "A armadura das lajes ainda não é desenhada. Selecione uma viga ou um pilar.",
  };
}

/** Malha mesclada: posições, normais (x, y, z por vértice) e índices dos triângulos. */
export interface MalhaTubos {
  posicoes: number[];
  normais: number[];
  indices: number[];
}

export const malhaTubosVazia = (): MalhaTubos => ({ posicoes: [], normais: [], indices: [] });

type V = { x: number; y: number; z: number };
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V, b: V): V => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norma = (a: V): V => {
  const n = Math.hypot(a.x, a.y, a.z);
  return n > 0 ? { x: a.x / n, y: a.y / n, z: a.z / n } : { x: 0, y: 0, z: 0 };
};

/** Acrescenta à malha o tubo de raio `raio` em volta da polilinha, com `lados` faces e
 *  cantos em meia-esquadria (o anel de cada vértice fica no plano da bissetriz, então a
 *  seção é o círculo de raio `raio` em cada trecho reto). Pontas abertas. Pontos repetidos
 *  são ignorados; com menos de 2 pontos distintos não acrescenta nada. */
export function tuboDaPolilinha(
  saida: MalhaTubos,
  pontos: readonly V[],
  raio: number,
  lados: number,
) {
  const p: V[] = [];
  for (const q of pontos) {
    const u = p.at(-1);
    if (!u || Math.hypot(q.x - u.x, q.y - u.y, q.z - u.z) > 1e-9) p.push(q);
  }
  if (p.length < 2) return;
  const dirs = p.slice(1).map((q, i) => norma(sub(q, p[i]!)));
  const d0 = dirs[0]!;
  // referencial do primeiro anel: N, B perpendiculares a d0 (N × B = d0)
  const n = norma(cross(Math.abs(d0.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }, d0));
  const b = cross(d0, n);
  let anel: V[] = Array.from({ length: lados }, (_, j) => {
    const a = (2 * Math.PI * j) / lados;
    const [c, s] = [Math.cos(a) * raio, Math.sin(a) * raio];
    return {
      x: p[0]!.x + c * n.x + s * b.x,
      y: p[0]!.y + c * n.y + s * b.y,
      z: p[0]!.z + c * n.z + s * b.z,
    };
  });
  const base = saida.posicoes.length / 3;
  const empilhar = (pts: V[], centro: V) => {
    for (const q of pts) {
      saida.posicoes.push(q.x, q.y, q.z);
      const r = norma(sub(q, centro));
      saida.normais.push(r.x, r.y, r.z);
    }
  };
  empilhar(anel, p[0]!);
  for (let k = 1; k < p.length; k++) {
    const d = dirs[k - 1]!;
    const prox = dirs[k];
    // plano do anel: a bissetriz entre os trechos; na ponta ou numa volta quase de 180°,
    // o plano perpendicular ao trecho
    let m = prox ? norma({ x: d.x + prox.x, y: d.y + prox.y, z: d.z + prox.z }) : d;
    if (dot(d, m) < 0.2) m = d;
    const pk = p[k]!;
    const den = dot(d, m);
    anel = anel.map((q) => {
      const t = dot(sub(pk, q), m) / den;
      return { x: q.x + t * d.x, y: q.y + t * d.y, z: q.z + t * d.z };
    });
    empilhar(anel, pk);
    const a0 = base + (k - 1) * lados;
    const a1 = base + k * lados;
    for (let j = 0; j < lados; j++) {
      const j1 = (j + 1) % lados;
      // (anel anterior j, j+1, anel atual j) e (j+1, atual j+1, atual j): normal para fora
      saida.indices.push(a0 + j, a0 + j1, a1 + j, a0 + j1, a1 + j1, a1 + j);
    }
  }
}

/** Uma posição desenhada, com a peça de onde veio (para o Painel). */
export interface PosicaoDesenhada {
  chave: string;
  nivel: number;
  /** A posição de `ctx.barrasDe` (só os pontos das barras são lidos). */
  posicao: Omit<ArmaduraNaCena, "barras"> & { barras: readonly (readonly V[])[] };
}

/** Barras agrupadas por nível e tipo: cada grupo vira uma malha (um material por tipo,
 *  um grupo por nível para andar com o explodido). As barras vão sem o deslocamento do
 *  explodido do nível (`deslocamento(nivel)` é subtraído de y). */
export interface GrupoMalha {
  nivel: number;
  tipo: TipoBarra;
  malha: MalhaTubos;
  barras: number;
}

/** Raio do tubo, m: o da bitola (φ mm / 2000), com um mínimo de 2 mm para a barra não
 *  sumir de longe. */
export const raioDaBarra = (phi: number) => Math.max(phi, 4) / 2000;

export function agruparPorMaterial(
  itens: readonly PosicaoDesenhada[],
  deslocamento: (nivel: number) => number,
  lados: (tipo: TipoBarra) => number = (t) => (t === "estribo" ? 5 : 8),
): GrupoMalha[] {
  const grupos = new Map<string, GrupoMalha>();
  for (const { nivel, posicao } of itens) {
    const k = `${nivel}|${posicao.tipo}`;
    let g = grupos.get(k);
    if (!g) {
      g = { nivel, tipo: posicao.tipo, malha: malhaTubosVazia(), barras: 0 };
      grupos.set(k, g);
    }
    const dy = deslocamento(nivel);
    for (const barra of posicao.barras) {
      const pts = dy === 0 ? barra : barra.map((q) => ({ x: q.x, y: q.y - dy, z: q.z }));
      tuboDaPolilinha(g.malha, pts, raioDaBarra(posicao.phi), lados(posicao.tipo));
      g.barras++;
    }
  }
  return [...grupos.values()].sort(
    (a, b) => a.nivel - b.nivel || TIPOS.indexOf(a.tipo) - TIPOS.indexOf(b.tipo),
  );
}

/** Linha da lista do Painel: uma posição desenhada. */
export interface LinhaPosicao {
  chave: string;
  /** Rótulo do lance (coluna) ou vazio (viga). */
  lance: string;
  nome: string;
  tipo: TipoBarra;
  /** Bitola, mm. */
  phi: number;
  /** Barras (ou estribos) desenhados. */
  quantidade: number;
  /** Comprimento de cada barra, cm. */
  comprimento: number;
}

export function linhasDoPainel(
  itens: readonly PosicaoDesenhada[],
  rotuloDoLance: (chave: string) => string,
): LinhaPosicao[] {
  return itens.map(({ chave, posicao: p }) => ({
    chave,
    lance: rotuloDoLance(chave),
    nome: p.nome,
    tipo: p.tipo,
    phi: p.phi,
    quantidade: p.barras.length,
    comprimento: p.comprimento,
  }));
}

/** Tipos presentes, na ordem da legenda. */
export const tiposPresentes = (itens: readonly { tipo: TipoBarra }[]) =>
  TIPOS.filter((t) => itens.some((i) => i.tipo === t));

/** Por que a peça não tem barras na cena: `barrasDe` undefined (sem detalhamento) ou
 *  lista vazia (seção poligonal ou sem longitudinais). */
export function motivoSemBarras(
  barras: readonly unknown[] | undefined,
  secao: "circular" | "poligonal" | undefined,
): string | null {
  if (barras === undefined)
    return "sem detalhamento (peça não calculada ou parada no “Continuo… S/N” do original)";
  if (barras.length > 0) return null;
  return secao === "poligonal"
    ? "seção poligonal ou T: a posição das barras não é desenhada"
    : "sem barras longitudinais no detalhamento";
}
