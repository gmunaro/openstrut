// Montagem lajes → vigas do SISTRUT 4.0 (LAJEGEOM opção 7 + LAJEMONT; livros_laje.md
// 1.15 e 2.6; PLANO 3.2, M1-M4). Para cada laje (tipo ≠ 2): o padrão de charneiras em
// coordenadas reais com o i de cada bordo (charneiras.ts), a região de cada bordo não
// livre (regioes.ts), a alvenaria e a carga por área da região (cargas.ts) e o apoio;
// na viga a carga é UNIFORME q·A/L no trecho do bordo (sem triângulo nem trapézio).
// Saem as reações por bordo, o .VIG (q total e q acidental por divisão, J bruto, peso
// próprio em kg/m inteiro, viga sobre viga indexada) e os totais do relatório.
//
// Modo corrigido: o mesmo algoritmo em float64 (o PLANO 4.2 não lista defeito da
// montagem; R4, peso digitado ≠ H, não se aplica na V2).
import type {
  ApoioDeBordo,
  EixoViga,
  EsforcosLajes,
  MontaPavimento,
  MontagemPavimento,
  ModoSistrut,
  PainelLajes,
  ParametrosLaje,
  PesoProprioVigas,
  ReacaoDeBordo,
} from "../base/tipos";
import { atribuicao, sng } from "../base/f32";
import type { Etapa } from "../../tipos";
import { lajeMontagem, PadraoMontagem } from "./charneiras";
import {
  alvenariaNaRegiao,
  areaCargaNaRegiao,
  type PoligonoCarga,
  type TrechoAlvenaria,
} from "./cargas";
import { distancia, type Tolerancias } from "./geometria";
import { regiaoDoBordo } from "./regioes";
import {
  alvenariaNoTrecho,
  dadosViga,
  divisaoDoTrecho,
  montaPontos,
  montaTramos,
  resolveIndexacao,
  tabelaPilares,
  totalDivisoes,
  trechoDaDivisao,
  type DadosVigaMontagem,
  type VigaMontagem,
} from "./vigas";

/** `MontagemPavimento` com o que o contrato não tem: J bruto de todos os apoios e os
 *  totais "nominais" do relatório (antes do "Total Considerado"). */
export interface MontagemPavimentoSistrut extends MontagemPavimento {
  vigas: DadosVigaMontagem[];
  totais: MontagemPavimento["totais"] & {
    /** "Total das Cargas por Area": Σ área do polígono × total, t. */
    cargasPorAreaNominal: number;
    /** "Total das Cargas Lineares": Σ comprimento × carga das alvenarias, t. */
    alvenariasNominal: number;
  };
}

/** Limiar dos avisos de 3 % (o SINGLE 0,0299999993; LAJEMONT.BAS:427, 2742). */
const TRES_POR_CENTO = sng(0.03);

/** Acha o trecho j → j+1 de viga que coincide (exato, nos dois sentidos) com o bordo
 *  (x1, y1)-(x2, y2) (L_29f44..L_2a2a9, LAJEMONT.BAS:3931-3948). */
function trechoDoBordo(
  vigas: readonly VigaMontagem[],
  so: string | undefined,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  for (const v of vigas) {
    if (so !== undefined && v.nome !== so) continue;
    for (let j = 1; j < v.x.length - 1; j++) {
      const a = { x: v.x[j] ?? 0, y: v.y[j] ?? 0 };
      const b = { x: v.x[j + 1] ?? 0, y: v.y[j + 1] ?? 0 };
      const ida = y2 === b.y && x2 === b.x && y1 === a.y && x1 === a.x;
      const volta = y1 === b.y && x1 === b.x && y2 === a.y && x2 === a.x;
      if (ida || volta) return { viga: v, j, a, b };
    }
  }
  return undefined;
}

/** Montagem do pavimento (contrato `MontaPavimento`, base/tipos.ts T6). Bordo do
 *  `apoiosDosBordos` e de `ReacaoDeBordo.bordo` com índice 0-based em `vertices`.
 *  Apoio null: procura a viga com um trecho igual ao bordo, como o original; sem
 *  viga, a carga vai para o total dos pilares (como o original faz com apoio em
 *  branco) e sai um aviso. */
export function montaPavimentoSistrut(
  esforcos: EsforcosLajes,
  painel: PainelLajes,
  eixos: readonly EixoViga[],
  apoiosDosBordos: (laje: string, bordo: number) => ApoioDeBordo | null,
  pesoProprio: PesoProprioVigas,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
): MontagemPavimentoSistrut {
  const s = atribuicao(modo);
  const t: Tolerancias = {
    s,
    tol: parametros.toleranciaComprimento,
    eps: parametros.toleranciaAngulo,
  };
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const lajes = esforcos.lajes;

  // S_3014b e S_2a7a8: eixos, tramos, J e peso próprio das vigas
  const pilares = tabelaPilares(eixos);
  const vigas = montaPontos(
    eixos,
    lajes.flatMap((l) => l.vertices),
    pilares,
    pesoProprio,
    t,
    avisos,
  );
  let ppVigas = 0; // V_19ea
  for (const v of vigas) ppVigas = montaTramos(v, pilares, t, ppVigas);
  resolveIndexacao(vigas);
  let totVigas = ppVigas; // V_19f6
  let totPilares = 0; // V_19fa

  const alvenarias: TrechoAlvenaria[] = painel.alvenarias.map((a) => ({
    x1: s(a.inicio.x),
    y1: s(a.inicio.y),
    x2: s(a.fim.x),
    y2: s(a.fim.y),
    carga: s(a.carga),
  }));
  const cargas: PoligonoCarga[] = painel.cargasPorArea.map((c) => ({
    x: c.vertices.map((p) => s(p.x)),
    y: c.vertices.map((p) => s(p.y)),
    total: s(c.total),
    acidental: s(c.acidental),
  }));

  // alvenaria sobre as vigas (L_2ccb2..L_2d58e)
  let totAlv = 0; // V_19e2
  let totCargaArea = 0; // V_19e6
  for (const v of vigas) {
    for (let k = 1; k <= totalDivisoes(v); k++) {
      const j = trechoDaDivisao(v, k);
      if (j < 0) continue;
      const x1 = v.x[j] ?? 0;
      const y1 = v.y[j] ?? 0;
      const x2 = v.x[j + 1] ?? 0;
      const y2 = v.y[j + 1] ?? 0;
      const carga = alvenariaNoTrecho(x1, y1, x2, y2, alvenarias, t);
      if (!(carga > 0)) continue;
      const L = distancia(x1, y1, x2, y2);
      v.ac6[k] = s(carga / L + (v.ac6[k] ?? 0));
      v.af4[k] = s(carga / L + (v.af4[k] ?? 0));
      totAlv = s(totAlv + carga);
      totVigas = s(totVigas + carga);
    }
  }

  // lajes: S_401b9 + S_20146 por laje
  const reacoes: ReacaoDeBordo[] = [];
  let ppLajes = 0; // V_19ee
  let estrutura = 0; // V_19f2
  for (const laje of lajes) {
    if (laje.tipo === 2) continue;
    const lm = lajeMontagem(
      laje.vertices.map((p) => ({ x: s(p.x), y: s(p.y) })),
      laje.codigos,
      laje.tipo,
      laje.angulo,
    );
    const padrao = new PadraoMontagem(lm, t);
    padrao.executa();
    const perm = s(laje.cargaPermanente);
    const pp = laje.tipo !== 1 ? s(laje.pesoProprio) : 0;
    let somaAreas = 0; // L_BPde
    for (let k = 1; k <= lm.n; k++) {
      if ((lm.codigos[k] ?? 0) === 1) continue;
      const reg = regiaoDoBordo(lm, padrao, k, t);
      const A = reg.area;
      somaAreas = s(somaAreas + A);
      if (!(A > t.tol)) continue;
      const poli = reg.poligono;
      const alv = alvenariaNaRegiao(lm, poli, alvenarias, t);
      totAlv = s(alv + totAlv);
      let cargaArea = 0; // L_BP112
      let cargaAcid = 0; // L_BP116
      for (const c of cargas) {
        const a = Math.abs(areaCargaNaRegiao(poli, A, c, t));
        if (!(a > 0)) continue;
        cargaArea = s(a * c.total + cargaArea);
        cargaAcid = s(a * c.acidental + cargaAcid);
        totCargaArea = s(a * c.total + totCargaArea);
      }
      const x1 = poli.x[1] ?? 0;
      const y1 = poli.y[1] ?? 0;
      const x2 = poli.x[poli.n - 1] ?? 0;
      const y2 = poli.y[poli.n - 1] ?? 0;
      const indicado = apoiosDosBordos(laje.nome, k - 1);
      const trecho =
        indicado?.tipo === "pilar"
          ? undefined
          : trechoDoBordo(vigas, indicado?.viga, x1, y1, x2, y2);
      if (trecho) {
        const Lx = distancia(trecho.a.x, trecho.a.y, trecho.b.x, trecho.b.y);
        const L = s(Lx);
        const v = trecho.viga;
        const d = divisaoDoTrecho(v, trecho.j);
        v.af4[d] = s((alv + cargaArea) / Lx + (v.af4[d] ?? 0));
        v.b22[d] = s(cargaAcid / Lx + (v.b22[d] ?? 0));
        v.af4[d] = s(((pp + perm) / Lx) * A + (v.af4[d] ?? 0));
        totVigas = s(alv + totVigas + cargaArea + perm * A + pp * A);
        reacoes.push({
          laje: laje.nome,
          bordo: k - 1,
          apoio: { tipo: "viga", viga: v.nome },
          comprimento: L,
          area: A,
          linear: s(alv / Lx),
          cargaArea: s(cargaArea / Lx),
          estrutura: s((perm * A) / L),
          peso: s((pp * A) / L),
          acidental: s(cargaAcid / Lx),
        });
        continue;
      }
      totPilares = s(alv + totPilares + cargaArea + perm * A + pp * A);
      if (indicado?.tipo === "pilar") {
        reacoes.push({
          laje: laje.nome,
          bordo: k - 1,
          apoio: indicado,
          comprimento: s(distancia(x1, y1, x2, y2)),
          area: A,
          linear: alv,
          cargaArea,
          estrutura: s(perm * A),
          peso: s(pp * A),
          acidental: cargaAcid,
        });
      } else {
        avisos.push(
          `Laje ${laje.nome}, bordo ${k}: nenhuma viga com trecho igual ao bordo; a carga ` +
            `(${s(alv + cargaArea + perm * A + pp * A).toFixed(2)} t) foi para o total dos pilares, como no original.`,
        );
      }
    }
    const areaLaje = esforcos.preparadas[laje.nome]?.area ?? areaPoligono(laje.vertices, s);
    if (Math.abs(somaAreas - areaLaje) / areaLaje > TRES_POR_CENTO)
      avisos.push(
        `A soma das áreas parciais da laje ${laje.nome} (${somaAreas.toFixed(2)} m²) difere ` +
          `em mais de 3 % da área total (${areaLaje.toFixed(2)} m²) (LAJEMONT.BAS:2742).`,
      );
    memoria.push({
      descricao: `Laje ${laje.nome}: soma das áreas de influência`,
      valor: somaAreas,
      unidade: "m²",
      ref: "LAJEMONT.BAS:2711-2742; livros_laje.md 2.6",
    });
    if (laje.tipo !== 1) ppLajes = s(areaLaje * pp + ppLajes);
    estrutura = s(areaLaje * perm + estrutura);
  }

  // totais nominais e avisos de 3 % (programa principal, LAJEMONT.BAS:387-440)
  let alvNominal = 0;
  for (const a of alvenarias)
    alvNominal = s(distancia(a.x1, a.y1, a.x2, a.y2) * a.carga + alvNominal);
  if (alvNominal > 0 && Math.abs((totAlv - alvNominal) / alvNominal) > TRES_POR_CENTO)
    avisos.push(
      `A soma das cargas de alvenaria consideradas nas lajes e nas vigas (${totAlv.toFixed(2)} t) ` +
        `difere em mais de 3 % da carga total das alvenarias (${alvNominal.toFixed(2)} t).`,
    );
  let cargaNominal = 0;
  for (const c of cargas) {
    let a = 0;
    const n = c.x.length;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      a = s(a + (((c.x[k] ?? 0) + (c.x[j] ?? 0)) * ((c.y[k] ?? 0) - (c.y[j] ?? 0))) / 2);
    }
    cargaNominal = s(Math.abs(a) * c.total + cargaNominal);
  }
  if (cargaNominal > 0 && Math.abs((totCargaArea - cargaNominal) / cargaNominal) > TRES_POR_CENTO)
    avisos.push(
      `A soma das cargas por área aplicadas nas lajes (${totCargaArea.toFixed(2)} t) difere em ` +
        `mais de 3 % da carga total por área (${cargaNominal.toFixed(2)} t).`,
    );
  const painelTotal = s(totAlv + totCargaArea + ppVigas + ppLajes + estrutura);
  const totais = {
    cargasPorArea: totCargaArea,
    pesoProprioVigas: ppVigas,
    pesoProprioLajes: ppLajes,
    estrutura,
    alvenarias: totAlv,
    painel: painelTotal,
    vigas: totVigas,
    pilares: totPilares,
    cargasPorAreaNominal: cargaNominal,
    alvenariasNominal: alvNominal,
  };
  memoria.push(
    {
      descricao: "Total das cargas no painel",
      valor: painelTotal,
      unidade: "t",
      ref: "LAJEMONT.BAS:466",
    },
    {
      descricao: "Total das cargas aplicadas nas vigas",
      valor: totVigas,
      unidade: "t",
      ref: "LAJEMONT.BAS:468",
    },
  );
  return {
    reacoes,
    vigas: vigas.map((v) => dadosViga(v, vigas, pilares)),
    totais,
    avisos,
    memoria,
  };
}

/** Área do polígono da laje pelos trapézios (só quando `esforcos.preparadas` não a traz). */
function areaPoligono(vs: readonly { x: number; y: number }[], s: (x: number) => number) {
  let a = 0;
  for (let k = 0; k < vs.length; k++) {
    const p = vs[k];
    const q = vs[(k + 1) % vs.length];
    if (!p || !q) continue;
    a = s(a + ((s(p.x) + s(q.x)) * (s(p.y) - s(q.y))) / 2);
  }
  return Math.abs(a);
}

/** Contrato T6 (base/tipos.ts). */
export const montaPavimento: MontaPavimento = montaPavimentoSistrut;
