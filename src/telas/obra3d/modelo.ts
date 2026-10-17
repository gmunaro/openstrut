// Modelo 3D da obra: níveis empilhados, sólidos de cada laje, viga, pilar, escada e
// fundação, as colunas de pilares e os eixos da planta. Puro (sem three.js nem DOM),
// em metros, com z para cima e x, y da planta. A cena (cena.ts) só triangula estes
// sólidos; as regras de onde cada peça fica estão aqui e em docs/VISTA-3D.md.
import { type GeometriaViga, geometriaDasVigas } from "../../calculo/montagem";
import type { Laje, Obra, Pavimento, Pilar, Ponto, Viga } from "../../dominio/obra";
import { pavimentoAvulso, posicionarEscadas } from "./escada";

export type TipoElemento = "laje" | "viga" | "pilar" | "escada" | "fundacao";

export interface Ponto3 {
  x: number;
  y: number;
  z: number;
}

/** Sólido, m. Prisma vertical: polígono da planta (anti-horário) de z0 a z1. Barra: o
 *  eixo da face de cima vai de `a` a `b` (pode inclinar, como na escada); a seção tem
 *  `largura` na horizontal, perpendicular ao eixo, e `altura` na vertical, para baixo. */
export type Solido =
  | { tipo: "prisma"; base: Ponto[]; z0: number; z1: number }
  | { tipo: "barra"; a: Ponto3; b: Ponto3; largura: number; altura: number };

/** Um nível da obra: cada repetição de um pavimento-tipo é um nível. A cota é a da face
 *  de cima da laje do pavimento; o lance de pilar do nível vai de `cotaPiso` a `cota`. */
export interface Nivel {
  chave: string;
  pavimentoId: string;
  nome: string;
  /** 1 = a repetição mais baixa (a numeração do motor, sistrut/obra.ts). */
  repeticao: number;
  /** 0 = o primeiro acima da fundação. */
  indice: number;
  cotaPiso: number;
  cota: number;
}

export interface Elemento3D {
  /** Única no modelo: tipo, nível e id. */
  chave: string;
  tipo: TipoElemento;
  /** Id na obra (laje, viga ou pilar; na fundação, o do pilar). */
  id: string;
  nome: string;
  pavimentoId: string;
  /** Índice do nível; a fundação fica no 0 e a escada no nível de baixo dela. */
  nivel: number;
  repeticao: number;
  solidos: Solido[];
  /** Seção em texto, cm. */
  secao: string;
  /** Coluna do pilar (pilar e fundação). */
  coluna?: string;
  /** Notas que a vista mostra com o elemento (ex.: pilar que nasce em transição). */
  notas: string[];
}

/** Lances de um pilar empilhados, da base ao topo (chaves de Elemento3D). */
export interface Coluna {
  id: string;
  nome: string;
  chaves: string[];
  /** O lance mais baixo não está no primeiro nível: nasce sobre uma viga. */
  nasceEmTransicao: boolean;
}

/** Linha da planta com vigas (pórtico): x = c (vigas verticais) ou y = c (horizontais). */
export interface Eixo3D {
  chave: string;
  direcao: "x" | "y";
  c: number;
  vigas: string[];
}

export interface Modelo3D {
  niveis: Nivel[];
  elementos: Elemento3D[];
  colunas: Coluna[];
  eixos: Eixo3D[];
  /** O que a montagem deduziu ou não conseguiu (escada sem posição etc.). */
  avisos: string[];
  caixa: { min: Ponto3; max: Ponto3 };
}

/** Distância para casar o lance de um pilar com o de baixo pelo nome, m (pilar deslocado). */
export const TOL_MESMO_NOME = 0.5;
/** Distância para casar lances de nomes diferentes, m. */
export const TOL_POSICAO = 0.15;
/** Bloco que marca a fundação: folga em volta da seção e altura, m. */
const FOLGA_FUNDACAO = 0.25;
const ALTURA_FUNDACAO = 0.5;

const cm = (v: number) => v / 100;
const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString("pt-BR");

/** Níveis da obra da fundação (cota 0) para cima: as cotas são a soma dos pés-direitos
 *  (o importador do SISTRUT converte as cotas do .COL em pé-direito). Os pavimentos de
 *  vigas avulsas (escada calculada à parte) não são níveis. */
export function niveisDaObra(obra: Obra): Nivel[] {
  const niveis: Nivel[] = [];
  let cota = 0;
  for (const p of obra.pavimentos.toReversed()) {
    if (pavimentoAvulso(p)) continue;
    const n = Math.max(1, p.repeticoes);
    for (let r = 1; r <= n; r++) {
      const piso = cota;
      cota += p.peDireito;
      niveis.push({
        chave: `${p.id}#${r}`,
        pavimentoId: p.id,
        nome: n > 1 ? `${p.nome} (${r}/${n})` : p.nome,
        repeticao: r,
        indice: niveis.length,
        cotaPiso: piso,
        cota,
      });
    }
  }
  return niveis;
}

/** Torna o polígono anti-horário (área com sinal positiva). */
export function antiHorario(p: readonly Ponto[]): Ponto[] {
  let dobro = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    dobro += a.x * b.y - b.x * a.y;
  }
  return dobro < 0 ? p.toReversed() : [...p];
}

/** Contorno da seção do pilar na planta, m, centrado em (x, y). Retângulo b × h (b em x)
 *  girado de `rotacao` graus (anti-horário) em torno do centro; circular como polígono de
 *  `segmentos` lados (o vazado não aparece); poligonal com o centro da caixa no ponto. */
export function contornoPilar(p: Pilar, segmentos = 24): Ponto[] {
  const sec = p.secao;
  if (sec?.tipo === "circular") {
    const r = cm(sec.d) / 2;
    return Array.from({ length: segmentos }, (_, k) => {
      const a = (2 * Math.PI * k) / segmentos;
      return { x: p.x + r * Math.cos(a), y: p.y + r * Math.sin(a) };
    });
  }
  if (sec?.tipo === "poligonal") {
    const xs = sec.vertices.map((v) => v.x);
    const ys = sec.vertices.map((v) => v.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    return antiHorario(sec.vertices.map((v) => ({ x: p.x + cm(v.x - cx), y: p.y + cm(v.y - cy) })));
  }
  const a = ((p.rotacao ?? 0) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const bx = cm(p.b) / 2;
  const hy = cm(p.h) / 2;
  return [
    [-bx, -hy],
    [bx, -hy],
    [bx, hy],
    [-bx, hy],
  ].map(([u, v]) => ({ x: p.x + u! * c - v! * s, y: p.y + u! * s + v! * c }));
}

export function textoSecaoPilar(p: Pilar): string {
  if (p.secao?.tipo === "circular")
    return p.secao.dInterno > 0
      ? `Ø ${fmt(p.secao.d)} cm (vazado Ø ${fmt(p.secao.dInterno)})`
      : `Ø ${fmt(p.secao.d)} cm`;
  if (p.secao?.tipo === "poligonal")
    return `poligonal, ${p.secao.vertices.length} vértices (caixa ${fmt(p.b)} × ${fmt(p.h)} cm)`;
  const giro = p.rotacao ? `, girada ${fmt(p.rotacao)}°` : "";
  return `${fmt(p.b)} × ${fmt(p.h)} cm${giro}`;
}

/** Polígono da laje, m: o `poligono` ou o retângulo x, y, lx, ly, anti-horário. */
export function contornoLaje(l: Laje): Ponto[] {
  if (l.poligono && l.poligono.length >= 3) return antiHorario(l.poligono);
  return [
    { x: l.x, y: l.y },
    { x: l.x + l.lx, y: l.y },
    { x: l.x + l.lx, y: l.y + l.ly },
    { x: l.x, y: l.y + l.ly },
  ];
}

/** Rebaixo da laje, m: o `grupo` negativo do SISTRUT, −(Hmáx − H) em cm. A viga fica com
 *  o topo no nível; a laje rebaixada desce (como o rebaixo pe/pd do .FOR). */
export const rebaixoLaje = (l: Laje) => (l.grupo !== undefined && l.grupo < 0 ? cm(-l.grupo) : 0);

/** Trechos da viga com a seção de cada um. Com `secoes.trechos` na mesma quantidade dos
 *  trechos entre os nós (geometriaDasVigas), cada trecho tem a sua; senão, a viga inteira
 *  tem a primeira seção do .SEC (se todas iguais) ou bw × h. */
export function trechosViga(v: Viga, g: GeometriaViga | undefined) {
  const secoes = v.secoes?.trechos ?? [];
  const p1 = { x: v.x1, y: v.y1 };
  const p2 = { x: v.x2, y: v.y2 };
  const naPlanta = (s: number) =>
    g!.eixo.horizontal ? { x: s, y: g!.eixo.c } : { x: g!.eixo.c, y: s };
  if (g && secoes.length > 1 && secoes.length === g.nos.length - 1)
    return secoes.map((s, k) => ({
      de: naPlanta(g.nos[k]!),
      ate: naPlanta(g.nos[k + 1]!),
      secao: s,
    }));
  const s0 = secoes[0];
  const iguais =
    s0 !== undefined &&
    secoes.every((s) => s.bw === s0.bw && s.h === s0.h && s.bf === s0.bf && s.hf === s0.hf);
  return [{ de: p1, ate: p2, secao: iguais ? s0 : { bw: v.bw, h: v.h, bf: 0, hf: 0 } }];
}

export function textoSecaoViga(trechos: ReturnType<typeof trechosViga>): string {
  const textos = [
    ...new Set(
      trechos.map(({ secao: s }) =>
        s.bf > 0 && s.hf > 0
          ? `${fmt(s.bw)} × ${fmt(s.h)} cm, mesa ${fmt(s.bf)} × ${fmt(s.hf)}`
          : `${fmt(s.bw)} × ${fmt(s.h)} cm`,
      ),
    ),
  ];
  return textos.join("; ");
}

/** Sólidos de uma viga com o topo na cota: alma bw × h por trecho e, na seção T, a mesa
 *  bf × hf no topo. */
export function solidosViga(trechos: ReturnType<typeof trechosViga>, cota: number): Solido[] {
  return trechos.flatMap(({ de, ate, secao: s }) => {
    const a = { ...de, z: cota };
    const b = { ...ate, z: cota };
    const alma: Solido = { tipo: "barra", a, b, largura: cm(s.bw), altura: cm(s.h) };
    return s.bf > 0 && s.hf > 0
      ? [alma, { tipo: "barra", a, b, largura: cm(s.bf), altura: cm(s.hf) } satisfies Solido]
      : [alma];
  });
}

/** Casa os lances de pilar de níveis seguidos em colunas: o lance de baixo com o mesmo
 *  nome a menos de TOL_MESMO_NOME (pilar deslocado) ou, sem nome igual, o mais perto a
 *  menos de TOL_POSICAO. Sem lance embaixo fora do primeiro nível, a coluna nasce sobre
 *  uma viga (transição). */
function montarColunas(pilares: Elemento3D[], niveis: Nivel[], porChave: Map<string, Pilar>) {
  const colunas: Coluna[] = [];
  let abaixo: { el: Elemento3D; p: Pilar; coluna: Coluna }[] = [];
  for (const nivel of niveis) {
    const aqui = pilares.filter((e) => e.nivel === nivel.indice);
    const livres = new Set(abaixo);
    const atual: typeof abaixo = [];
    for (const el of aqui) {
      const p = porChave.get(el.chave)!;
      const dist = (o: { p: Pilar }) => Math.hypot(o.p.x - p.x, o.p.y - p.y);
      const candidatos = [...livres].sort((a, b) => dist(a) - dist(b));
      const par =
        candidatos.find((o) => o.p.nome === p.nome && dist(o) <= TOL_MESMO_NOME) ??
        candidatos.find((o) => dist(o) <= TOL_POSICAO);
      let coluna: Coluna;
      if (par) {
        livres.delete(par);
        coluna = par.coluna;
      } else {
        coluna = {
          id: el.chave,
          nome: p.nome,
          chaves: [],
          nasceEmTransicao: nivel.indice > 0 || p.transicao === true,
        };
        colunas.push(coluna);
      }
      coluna.chaves.push(el.chave);
      el.coluna = coluna.id;
      atual.push({ el, p, coluna });
    }
    abaixo = atual;
  }
  return colunas;
}

/** Eixos (pórticos) pelas vigas horizontais e verticais, juntando as que estão a menos
 *  de 5 cm. */
function eixosDaObra(pavs: readonly Pavimento[]): Eixo3D[] {
  const eixos: Eixo3D[] = [];
  for (const p of pavs)
    for (const v of p.vigas) {
      const direcao =
        Math.abs(v.x1 - v.x2) < 1e-6 ? "x" : Math.abs(v.y1 - v.y2) < 1e-6 ? "y" : null;
      if (!direcao) continue;
      const c = direcao === "x" ? v.x1 : v.y1;
      const e = eixos.find((o) => o.direcao === direcao && Math.abs(o.c - c) <= 0.05);
      if (e) {
        if (!e.vigas.includes(v.nome)) e.vigas.push(v.nome);
      } else eixos.push({ chave: `${direcao}=${c.toFixed(3)}`, direcao, c, vigas: [v.nome] });
    }
  return eixos.sort((a, b) =>
    a.direcao === b.direcao ? a.c - b.c : a.direcao < b.direcao ? -1 : 1,
  );
}

function caixaDe(elementos: readonly Elemento3D[]) {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  const pt = (x: number, y: number, z: number) => {
    min.x = Math.min(min.x, x);
    min.y = Math.min(min.y, y);
    min.z = Math.min(min.z, z);
    max.x = Math.max(max.x, x);
    max.y = Math.max(max.y, y);
    max.z = Math.max(max.z, z);
  };
  for (const e of elementos)
    for (const s of e.solidos)
      if (s.tipo === "prisma")
        for (const q of s.base) {
          pt(q.x, q.y, s.z0);
          pt(q.x, q.y, s.z1);
        }
      else {
        pt(s.a.x, s.a.y, s.a.z - s.altura);
        pt(s.b.x, s.b.y, s.b.z);
      }
  if (min.x === Infinity) return { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
  return { min, max };
}

export interface OpcoesModelo {
  /** Lados do polígono dos pilares circulares (LOD: menos em obra grande). */
  segmentosCirculo?: number;
}

/** Monta o modelo 3D da obra (ver o cabeçalho). */
export function montarModelo(obra: Obra, opcoes: OpcoesModelo = {}): Modelo3D {
  const niveis = niveisDaObra(obra);
  const pavPorId = new Map(obra.pavimentos.map((p) => [p.id, p]));
  const totalPilares = niveis.reduce(
    (t, n) => t + (pavPorId.get(n.pavimentoId)?.pilares.length ?? 0),
    0,
  );
  const segmentos = opcoes.segmentosCirculo ?? (totalPilares > 400 ? 12 : 24);
  const elementos: Elemento3D[] = [];
  const pilarDaChave = new Map<string, Pilar>();
  const geometrias = new Map<string, Map<string, GeometriaViga>>();
  const geometriaDe = (p: Pavimento) => {
    let g = geometrias.get(p.id);
    if (!g) {
      g = new Map(geometriaDasVigas(p).vigas.map((x) => [x.viga.id, x]));
      geometrias.set(p.id, g);
    }
    return g;
  };

  for (const n of niveis) {
    const pav = pavPorId.get(n.pavimentoId)!;
    const base = {
      pavimentoId: pav.id,
      nivel: n.indice,
      repeticao: n.repeticao,
      notas: [] as string[],
    };
    for (const l of pav.lajes) {
      const topo = n.cota - rebaixoLaje(l);
      const notas = rebaixoLaje(l) > 0 ? [`Rebaixada ${fmt(rebaixoLaje(l) * 100)} cm.`] : [];
      elementos.push({
        ...base,
        chave: `laje:${n.chave}:${l.id}`,
        tipo: "laje",
        id: l.id,
        nome: l.nome,
        secao: `h = ${fmt(l.h)} cm`,
        solidos: [{ tipo: "prisma", base: contornoLaje(l), z0: topo - cm(l.h), z1: topo }],
        notas,
      });
    }
    const g = geometriaDe(pav);
    for (const v of pav.vigas) {
      const trechos = trechosViga(v, g.get(v.id));
      elementos.push({
        ...base,
        chave: `viga:${n.chave}:${v.id}`,
        tipo: "viga",
        id: v.id,
        nome: v.nome,
        secao: textoSecaoViga(trechos),
        solidos: solidosViga(trechos, n.cota),
        notas: [],
      });
    }
    for (const p of pav.pilares) {
      const chave = `pilar:${n.chave}:${p.id}`;
      pilarDaChave.set(chave, p);
      elementos.push({
        ...base,
        chave,
        tipo: "pilar",
        id: p.id,
        nome: p.nome,
        secao: textoSecaoPilar(p),
        solidos: [
          { tipo: "prisma", base: contornoPilar(p, segmentos), z0: n.cotaPiso, z1: n.cota },
        ],
        notas: [],
      });
    }
  }

  const colunas = montarColunas(
    elementos.filter((e) => e.tipo === "pilar"),
    niveis,
    pilarDaChave,
  );
  for (const c of colunas) {
    const baseCol = elementos.find((e) => e.chave === c.chaves[0])!;
    const p = pilarDaChave.get(baseCol.chave)!;
    if (c.nasceEmTransicao) {
      baseCol.notas.push("Nasce sobre viga de transição (não chega à fundação).");
      continue;
    }
    const contorno = contornoPilar(p, 8);
    const xs = contorno.map((q) => q.x);
    const ys = contorno.map((q) => q.y);
    const [x0, x1] = [Math.min(...xs) - FOLGA_FUNDACAO, Math.max(...xs) + FOLGA_FUNDACAO];
    const [y0, y1] = [Math.min(...ys) - FOLGA_FUNDACAO, Math.max(...ys) + FOLGA_FUNDACAO];
    elementos.push({
      chave: `fundacao:${baseCol.chave}`,
      tipo: "fundacao",
      id: p.id,
      nome: `Fundação de ${p.nome}`,
      pavimentoId: baseCol.pavimentoId,
      nivel: 0,
      repeticao: baseCol.repeticao,
      secao: "marcador (a fundação não é calculada)",
      coluna: c.id,
      notas: [],
      solidos: [
        {
          tipo: "prisma",
          base: [
            { x: x0, y: y0 },
            { x: x1, y: y0 },
            { x: x1, y: y1 },
            { x: x0, y: y1 },
          ],
          z0: -ALTURA_FUNDACAO,
          z1: 0,
        },
      ],
    });
  }

  const avisos: string[] = [];
  const predio = obra.pavimentos.filter((p) => !pavimentoAvulso(p));
  const caixaPredio = caixaDe(elementos);
  for (const avulso of obra.pavimentos.filter(pavimentoAvulso)) {
    const r = posicionarEscadas(avulso, predio, niveis, caixaPredio, geometriaDe);
    elementos.push(...r.elementos);
    avisos.push(...r.avisos);
  }

  return {
    niveis,
    elementos,
    colunas,
    eixos: eixosDaObra(predio),
    avisos,
    caixa: caixaDe(elementos),
  };
}
