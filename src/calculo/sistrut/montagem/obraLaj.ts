// Leitor do arquivo de obra .LAJ do original (texto gravado pelo LAJEGRAV,
// LAJEGRAV.BAS:484-626) para a entrada da montagem: lajes (polígono, códigos finais
// de bordo, tipo, cargas, ângulo e μ do polígono, H), cargas por área, alvenarias,
// pilares, vigas e continuidades. Uso: testes contra as obras gravadas pelo original
// nos runs do oráculo e o importador de obra do SISTRUT (armazenamento/sistrut/laje.ts).
import type { EixoViga, LajeSistrut, PainelLajes, Ponto, TipoLaje } from "../base/tipos";

/** Tipo de laje do A_10cc(·,1) (LAJEGEOM.BAS:3489), ou undefined se não é um dos quatro. */
const tipoDeLaje = (t: number | undefined): TipoLaje | undefined =>
  t === 0 || t === 1 || t === 2 || t === 3 ? t : undefined;

/** Obra lida do .LAJ, pronta para `montaPavimento`. */
export interface ObraLaj {
  painel: PainelLajes;
  /** Área de cada laje (A_10cc(·,2)), por nome. */
  areas: Record<string, number>;
  eixos: EixoViga[];
  /** Pilares (A_1156): o ponto x1, y1 e, no pilar-parede, a outra ponta x2, y2. */
  pilares: { nome: string; x: number; y: number; fim?: Ponto }[];
  /** Nome da obra (linha "Obra - X" do cabeçalho). */
  nome: string;
  /** Espessura mínima do LAJECALC 3 (A_12ca), cm, por nome; ausente se não calculada. */
  hMinimos: Record<string, number>;
  /** Painéis marcados como buraco no LAJEGEOM (tipo 2, LAJEGEOM.BAS:3887): não são laje. */
  buracos: number;
  /** O que o leitor não entendeu (tipo de laje desconhecido). */
  avisos: string[];
}

/** Lê o .LAJ. `apoiosEmViga` diz, por viga e ponto ("V5@8,0"), a viga em que ela se
 *  apoia nos cruzamentos sem pilar (a escolha "Vx apoia em Vy" do LAJEMONT, que não
 *  fica no .LAJ). Pilares: o ponto do eixo a menos de 0,005 m de um pilar. */
export function lerObraLaj(texto: string, apoiosEmViga: Record<string, string> = {}): ObraLaj {
  // o formato de entrada da V1 ("SISTRUT40","LAJ",1,…) não tem polígonos nem montagem:
  // quem o lê é `importarV1` (armazenamento/importarV1.ts), pelo `importarLaj`
  if (texto.trimStart().startsWith('"SISTRUT40"'))
    throw new Error(
      'o .LAJ está no formato de entrada ("SISTRUT40"), sem a geometria que a montagem lê',
    );
  const linhas = texto.split(/\r?\n/);
  const nomeObra = (linhas[1] ?? "").replace(/^\s*Obra\s*-\s*/, "").trim();
  let i = 3;
  const num = () => Number(linhas[i++] ?? "");
  const txt = () => (linhas[i++] ?? "").trim();
  num();
  num();
  // eixos (A_0f8a), arquitetura (A_0fb8)
  for (const _ of [0, 1]) {
    const c = num();
    for (let k = 0; k < c; k++) num();
  }
  if (num() === 1) {
    const c = num();
    for (let k = 0; k < c * 4; k++) num();
  }
  const alvenarias: PainelLajes["alvenarias"] = [];
  const cargasPorArea: PainelLajes["cargasPorArea"] = [];
  if (num() === 1) {
    const c = num();
    for (let k = 0; k < c; k++) {
      const [x1, y1, x2, y2, carga] = [num(), num(), num(), num(), num()];
      alvenarias.push({ inicio: { x: x1, y: y1 }, fim: { x: x2, y: y2 }, carga });
    }
    // A_1014(0,0) é a próxima linha livre e A_1014(0,1) o número de áreas; o LAJEGRAV
    // grava as linhas 1..A_1014(0,0), a livre inclusive (LAJEGRAV.BAS:542-547). A livre
    // não é área: guarda o ponto de fechamento da última desenhada (LAJEGEOM.BAS:8181,
    // 8209) ou lixo de uma apagada (8572-8581), e o original só lê A_1014(0,1) áreas
    // (LAJEGEOM.BAS:890, LAJEMONT.BAS:406 e 3456, LAJECALC.BAS:7954)
    const linhasCarga = num();
    const nAreas = num();
    const rows: [number, number][] = [];
    for (let k = 0; k < linhasCarga; k++) rows.push([num(), num()]);
    // A_1014: linha f = nº de vértices; f+1 = total, acidental; f+2.. = vértices; o
    // polígono fecha no 1º vértice (LAJEMONT.BAS:3468)
    for (let f = 0, a = 0; a < nAreas && f < rows.length; a++) {
      const n = rows[f]?.[0] ?? 0;
      if (n <= 0) break;
      const [total, acidental] = rows[f + 1] ?? [0, 0];
      const vertices = rows.slice(f + 2, f + 2 + n).map(([x, y]) => ({ x, y }));
      cargasPorArea.push({ vertices, total, acidental });
      f += n + 2;
    }
  }
  if (num() === 1) {
    const c = num();
    for (let k = 0; k < c * 4; k++) num();
  }
  const nivel = num();
  const prefixo = txt();
  num();
  const vertices: Ponto[] = [];
  const lajes: LajeSistrut[] = [];
  const areas: Record<string, number> = {};
  const avisos: string[] = [];
  /** Laje de cada linha p de A_10cc (1-based; null = vazio, tipo 2) e o polígono dela. */
  const daLinha: ({ laje: LajeSistrut; poligono: number } | null)[] = [null];
  let buracos = 0;
  if (num() === 1) {
    // A_1070(0,0) e depois os pares k = 0..n (o par 0 repete a contagem)
    const nv = num();
    num();
    num();
    vertices.push({ x: 0, y: 0 });
    for (let k = 0; k < nv; k++) vertices.push({ x: num(), y: num() });
    const np = num();
    const polis: { idx: number[]; cod: number[] }[] = [];
    for (let p = 0; p < np; p++) {
      const m = num();
      const idx: number[] = [];
      const cod: number[] = [];
      for (let j = 0; j < m; j++) {
        idx.push(num());
        cod.push(num());
      }
      // o último repete o primeiro
      polis.push({ idx: idx.slice(0, m - 1), cod: cod.slice(0, m - 1) });
    }
    let ordem = 0;
    for (let p = 0; p < np; p++) {
      const r: number[] = [];
      for (let j = 0; j < 9; j++) r.push(num());
      const [poli, tipo, area, grupo, perm, pp] = r;
      const pol = polis[(poli ?? 1) - 1];
      if (!pol || tipo === 2) {
        if (tipo === 2) buracos += 1;
        daLinha.push(null);
        continue;
      }
      ordem += 1;
      const nome = `${prefixo}${nivel + ordem}`;
      areas[nome] = area ?? 0;
      const t = tipoDeLaje(tipo);
      if (t === undefined)
        avisos.push(`${nome}: tipo de laje ${tipo} desconhecido; lido como maciça.`);
      // pré-moldada: a coluna 5 é a inclinação das nervuras e o peso dela já está na
      // permanente (coluna 4) (LAJEGEOM.BAS:3383-3386, 3521-3532; LAJEMONT 2331, 2514)
      const preMoldada = t === 1;
      const laje: LajeSistrut = {
        nome,
        tipo: t ?? 0,
        vertices: pol.idx.map((k) => vertices[k] ?? { x: 0, y: 0 }),
        indicesVertices: pol.idx,
        grupo: grupo ?? 0,
        codigos: pol.cod,
        // ângulo e μ são do polígono, lidos no fim (A_1210(A_10cc(i,0)))
        angulo: preMoldada ? (pp ?? 0) : 0,
        mu: 1,
        cargaPermanente: perm ?? 0,
        pesoProprio: preMoldada ? 0 : (pp ?? 0),
      };
      lajes.push(laje);
      daLinha.push({ laje, poligono: poli ?? 1 });
    }
  }
  const pilares: ObraLaj["pilares"] = [];
  if (num() === 1) {
    const c = num();
    num();
    for (let k = 0; k < c; k++) {
      // A_1156: x1, y1, x2, y2 (pilar pontual: as duas pontas iguais) e o nome
      const x = num();
      const y = num();
      const x2 = num();
      const y2 = num();
      const parede = x2 !== x || y2 !== y;
      pilares.push({ nome: `P${txt()}`, x, y, ...(parede ? { fim: { x: x2, y: y2 } } : {}) });
    }
  }
  const eixos: EixoViga[] = [];
  if (num() === 1) {
    const desloc = num();
    const pv = txt();
    const c = num();
    num();
    for (let k = 0; k < c; k++) {
      const nome = `${pv}${Number(txt()) + desloc}`;
      const m = num();
      const pontos: Ponto[] = [];
      for (let j = 0; j < m; j++) pontos.push(vertices[num()] ?? { x: 0, y: 0 });
      const apoios = pontos.map((p) => {
        const pil = pilares.find((q) => Math.abs(q.x - p.x) < 0.005 && Math.abs(q.y - p.y) < 0.005);
        if (pil) return { pilar: pil.nome };
        const v = apoiosEmViga[`${nome}@${p.x},${p.y}`];
        return v ? { viga: v } : null;
      });
      eixos.push({
        nome,
        pontos,
        apoios,
        balancoInicio: apoios[0] === null,
        balancoFim: apoios[apoios.length - 1] === null,
      });
    }
  }
  // continuidades (A_11e0, linhas 0..n; a 0 é a contagem): laje A (linha de A_10cc),
  // lado A (1-based), laje B (−1 = trecho engastado sem vizinha), lado B, armadura
  // imposta (LAJEGRAV.BAS:613-620)
  const continuidades: PainelLajes["continuidades"] = [];
  // com a seção, as continuidades são as confirmadas no LAJECALC 1
  const continuidadesConfirmadas = num() === 1;
  if (continuidadesConfirmadas) {
    const n = num();
    for (let c = 0; c <= n; c++) {
      const [la, ba, lb, bb, arm] = [num(), num(), num(), num(), num()];
      const a = c > 0 ? daLinha[la]?.laje : undefined;
      if (!a) continue;
      const b = lb > 0 ? daLinha[lb]?.laje : undefined;
      continuidades.push({
        lajeA: a.nome,
        bordoA: ba - 1,
        lajeB: b?.nome ?? null,
        bordoB: (b ? bb : ba) - 1,
        ...(arm !== 0 ? { armaduraImposta: arm } : {}),
      });
    }
  }
  // ângulo e μ por POLÍGONO (A_1210(p, 0..1), p = 0..nº de polígonos; LAJEGRAV.BAS:622-626)
  const anguloMu: [number, number][] = [];
  if (num() === 1) for (let p = 0; p < daLinha.length; p++) anguloMu.push([num(), num()]);
  // por LAJE (linha de A_10cc): espessura mínima (A_12ca) e H com as positivas (A_12fc)
  const hMinimos: Record<string, number> = {};
  if (num() === 1)
    for (let p = 0; p < daLinha.length; p++) {
      const h = num();
      const l = daLinha[p]?.laje;
      if (l && h > 0) hMinimos[l.nome] = h;
    }
  if (num() === 1)
    for (let p = 0; p < daLinha.length; p++) {
      const [h, , principal, secundaria] = [num(), num(), num(), num()];
      const l = daLinha[p]?.laje;
      if (l && h > 0) l.h = h;
      // positivas impostas pelo usuário no LAJEPROC: código negativo (LAJEPROC.BAS:451)
      if (l && (principal < 0 || secundaria < 0))
        l.armaduraImposta = {
          ...(principal < 0 ? { principal } : {}),
          ...(secundaria < 0 ? { secundaria } : {}),
        };
    }
  for (const d of daLinha) {
    const am = d ? anguloMu[d.poligono] : undefined;
    if (!d || !am) continue;
    // na pré-moldada o A_1210(·,0) é −1 (LAJECALC.BAS:4548): vale o das nervuras
    if (d.laje.tipo !== 1) d.laje.angulo = am[0];
    d.laje.mu = am[1];
  }
  return {
    painel: { lajes, cargasPorArea, alvenarias, continuidades, continuidadesConfirmadas },
    areas,
    eixos,
    pilares,
    nome: nomeObra,
    hMinimos,
    buracos,
    avisos,
  };
}
