// Leitor do arquivo de obra .LAJ do original (texto gravado pelo LAJEGRAV,
// LAJEGRAV.BAS:484-626) para a entrada da montagem: lajes (polígono, códigos finais
// de bordo, tipo, cargas), cargas por área, alvenarias, pilares e vigas. Uso: testes
// contra as obras gravadas pelo original nos runs do oráculo.
import type { EixoViga, LajeSistrut, PainelLajes, Ponto } from "../base/tipos";

/** Obra lida do .LAJ, pronta para `montaPavimento`. */
export interface ObraLaj {
  painel: PainelLajes;
  /** Área de cada laje (A_10cc(·,2)), por nome. */
  areas: Record<string, number>;
  eixos: EixoViga[];
  pilares: { nome: string; x: number; y: number }[];
}

/** Lê o .LAJ. `apoiosEmViga` diz, por viga e ponto ("V5@8,0"), a viga em que ela se
 *  apoia nos cruzamentos sem pilar (a escolha "Vx apoia em Vy" do LAJEMONT, que não
 *  fica no .LAJ). Pilares: o ponto do eixo a menos de 0,005 m de um pilar. */
export function lerObraLaj(texto: string, apoiosEmViga: Record<string, string> = {}): ObraLaj {
  const linhas = texto.split(/\r?\n/);
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
    const linhasCarga = num();
    num();
    const rows: [number, number][] = [];
    for (let k = 0; k < linhasCarga; k++) rows.push([num(), num()]);
    // A_1014: linha f = nº de vértices; f+1 = total, acidental; f+2.. = vértices
    for (let f = 0; f < rows.length;) {
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
      const [poli, tipo, area, , perm, pp] = r;
      const pol = polis[(poli ?? 1) - 1];
      if (!pol) continue;
      if (tipo === 2) continue;
      ordem += 1;
      const nome = `${prefixo}${nivel + ordem}`;
      areas[nome] = area ?? 0;
      lajes.push({
        nome,
        tipo: (tipo ?? 0) as LajeSistrut["tipo"],
        vertices: pol.idx.map((k) => vertices[k] ?? { x: 0, y: 0 }),
        indicesVertices: pol.idx,
        grupo: 0,
        codigos: pol.cod,
        angulo: 0,
        mu: 1,
        cargaPermanente: perm ?? 0,
        pesoProprio: pp ?? 0,
      });
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
      num();
      num();
      pilares.push({ nome: `P${txt()}`, x, y });
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
  return {
    painel: { lajes, cargasPorArea, alvenarias, continuidades: [] },
    areas,
    eixos,
    pilares,
  };
}
