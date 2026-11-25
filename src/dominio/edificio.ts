// Obra de demonstração maior que o sobrado da tela inicial: um edifício residencial de nove
// níveis (1º pavimento, tipo × 6, cobertura e casa de máquinas) em planta em L, com vãos de
// 2,4 a 5,2 m, varandas em balanço e pilares cuja seção muda com a posição na planta e com
// o pavimento. Serve ao link de demonstração (?exemplo=edificio, telas/demo.ts) e mostra a
// vista 3D, o Nk acumulado nos pilares e as camadas numa obra de porte real. A planta é
// montada com as funções do editor (lajeNova + gerarEstrutura); todo número mostrado sai do
// cálculo do app.
import { lajeNova, obraNova, pavimentoNovo, type Retangulo } from "./criar";
import { gerarEstrutura, TOL } from "./gerar";
import type { Laje, Obra, Pavimento, Pilar, Viga } from "./obra";

export const NOME_EDIFICIO = "Edifício exemplo";

/** Eixos da planta, m. Em y, a faixa de 5,2 a 7,6 m é o corredor. */
const X = [0, 4.6, 9.2, 12.8, 17.4] as const;
const Y = [0, 5.2, 7.6, 12.8] as const;

/** Retângulo entre os eixos X[i]..X[i+1] e Y[j]..Y[j+1]. */
const celula = (i: number, j: number): Retangulo => ({
  x: X[i] ?? 0,
  y: Y[j] ?? 0,
  lx: (X[i + 1] ?? 0) - (X[i] ?? 0),
  ly: (Y[j + 1] ?? 0) - (Y[j] ?? 0),
});

/** Profundidade das varandas em balanço, m. */
const VARANDA = 1.4;

/** Lajes do andar-tipo: a grade 4 × 3 sem o canto de cima à direita (planta em L). */
const CELULAS: [number, number][] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [0, 1],
  [1, 1],
  [2, 1],
  [3, 1],
  [0, 2],
  [1, 2],
  [2, 2],
];

/** Uso de cada faixa em y: sobrecarga, kN/m² (NBR 6120:2019, tabela 10: dormitórios e
 *  salas 1,5; corredores de uso comum 3,0) e espessura da laje, cm. */
const FAIXAS = [
  { sobrecarga: 1.5, h: 12 },
  { sobrecarga: 3, h: 10 },
  { sobrecarga: 1.5, h: 12 },
] as const;

/** Seções dos pilares por porte do pavimento, cm: [menor, maior] no canto, na borda e
 *  no interior da planta. Na borda o lado maior fica perpendicular à fachada, na direção
 *  das vigas que chegam nela. A cobertura e a casa de máquinas usam as do tipo. */
const SECOES = {
  base: { canto: [35, 50], borda: [25, 60], interno: [30, 70] },
  tipo: { canto: [30, 45], borda: [25, 45], interno: [25, 60] },
} as const;
type Porte = keyof typeof SECOES;

/** Células sob a casa de máquinas (o corredor e o hall do meio). */
const CASA: [number, number][] = [
  [1, 1],
  [1, 2],
];
const naCasa = (i: number, j: number) => CASA.some(([a, b]) => a === i && b === j);
/** Piso da casa de máquinas, kN/m²: o mínimo da NBR 6120:1980, tabela 2, com o peso das
 *  máquinas. */
const SOBRECARGA_CASA = 7.5;
/** Paredes da casa de máquinas sobre as vigas da cobertura, kN/m: as 5 kN/m dos 3 m dos
 *  apartamentos, proporcionais aos 2,6 m dela. */
const PAREDES_CASA = 4.3;

/** Viga da planta no contorno da casa de máquinas (x 4,6 a 9,2; y 5,2 a 12,8). */
function noContornoDaCasa(v: Viga) {
  const [x0, x1] = [X[1], X[2]];
  const [y0, y1] = [Y[1], Y[3]];
  const sobre = (a: number, b: number, lo: number, hi: number) =>
    Math.min(a, b) < hi - TOL && Math.max(a, b) > lo + TOL;
  if (Math.abs(v.x1 - v.x2) <= TOL)
    return (Math.abs(v.x1 - x0) <= TOL || Math.abs(v.x1 - x1) <= TOL) && sobre(v.y1, v.y2, y0, y1);
  return (Math.abs(v.y1 - y0) <= TOL || Math.abs(v.y1 - y1) <= TOL) && sobre(v.x1, v.x2, x0, x1);
}

/** As lajes (sem as varandas) que têm o ponto no contorno. */
function lajesNoPonto(lajes: readonly Laje[], p: { x: number; y: number }) {
  return lajes.filter(
    (l) =>
      !Object.values(l.vinculos).includes("livre") &&
      p.x >= l.x - TOL &&
      p.x <= l.x + l.lx + TOL &&
      p.y >= l.y - TOL &&
      p.y <= l.y + l.ly + TOL,
  );
}

/** Seção do pilar pela posição: canto (1 laje), borda (2 lajes, lado maior perpendicular
 *  à fachada) ou interior (3 ou 4 lajes, lado maior em y, a direção dos vãos maiores). */
function secao(pilar: Pilar, lajes: readonly Laje[], porte: Porte): Pick<Pilar, "b" | "h"> {
  const s = SECOES[porte];
  const juntas = lajesNoPonto(lajes, pilar);
  if (juntas.length <= 1) return { b: s.canto[0], h: s.canto[1] };
  if (juntas.length >= 3) return { b: s.interno[0], h: s.interno[1] };
  // duas lajes lado a lado em x: a fachada é horizontal e o pilar se alonga em y
  const [a, b] = juntas;
  const ladoALado = a && b && Math.abs(a.y - b.y) <= TOL;
  return ladoALado ? { b: s.borda[0], h: s.borda[1] } : { b: s.borda[1], h: s.borda[0] };
}

interface OpcoesPlanta {
  celulas: readonly [number, number][];
  /** Sobrecarga da célula (i, j), kN/m²; sem ela, a de FAIXAS. */
  sobrecarga?: (i: number, j: number) => number;
  varandas: boolean;
  porte: Porte;
  /** Alvenaria sobre cada viga, kN/m. */
  paredes: (v: Viga) => number;
}

/** Pavimento com as lajes das células, as varandas, a estrutura gerada, vigas de 15 cm e
 *  os pilares com as seções do porte. */
function planta(nome: string, peDireito: number, repeticoes: number, o: OpcoesPlanta) {
  const pav: Pavimento = pavimentoNovo(nome, peDireito, repeticoes);
  // lajeNova nomeia pelas lajes que já estão no pavimento: uma de cada vez
  for (const [i, j] of o.celulas) {
    const faixa = FAIXAS[j] ?? FAIXAS[0];
    pav.lajes.push(
      lajeNova(pav, celula(i, j), {
        h: faixa.h,
        sobrecarga: o.sobrecarga?.(i, j) ?? faixa.sobrecarga,
      }),
    );
  }
  if (o.varandas)
    for (const i of [0, 1])
      pav.lajes.push(
        lajeNova(
          pav,
          { x: X[i] ?? 0, y: -VARANDA, lx: (X[i + 1] ?? 0) - (X[i] ?? 0), ly: VARANDA },
          {
            h: 12,
            sobrecarga: 2.5,
            // balanço: engastada na laje de dentro, livre nos outros três lados
            vinculos: {
              superior: "engastado",
              inferior: "livre",
              esquerdo: "livre",
              direito: "livre",
            },
          },
        ),
      );
  const gerado = gerarEstrutura(pav);
  return {
    ...gerado,
    vigas: gerado.vigas.map((v) => ({ ...v, bw: 15, cargaLinear: o.paredes(v) })),
    pilares: gerado.pilares.map((p) => ({ ...p, ...secao(p, gerado.lajes, o.porte) })),
  };
}

/**
 * Edifício de demonstração pela NBR 6118:2023 (C30, CAA II), de cima para baixo:
 * - casa de máquinas sobre o corredor e o hall (2 lajes), 2,6 m: laje de cima sem acesso
 *   (0,5 kN/m²) e platibanda baixa de 1 kN/m;
 * - cobertura sem acesso (0,5 kN/m²), platibanda de 2 kN/m nas vigas, 3,0 m. Sob a casa de
 *   máquinas, o piso dela (7,5 kN/m²) e, nas vigas do contorno, as paredes (+4,3 kN/m na
 *   viga inteira: a carga linear é uma por viga, e fica a favor da segurança onde a casa
 *   só cobre parte dela);
 * - andar-tipo repetido 6 vezes, com as varandas, 3,0 m;
 * - 1º pavimento, com os pilares mais robustos, 3,5 m.
 * Alvenaria de 5 kN/m nas vigas dos andares com apartamentos.
 */
export function obraEdificio(): Obra {
  const obra = obraNova(NOME_EDIFICIO, "nbr6118-2023");
  const apartamentos = { celulas: CELULAS, varandas: true, paredes: () => 5 } as const;
  const cobertura = planta("Cobertura", 3, 1, {
    celulas: CELULAS,
    sobrecarga: (i, j) => (naCasa(i, j) ? SOBRECARGA_CASA : 0.5),
    varandas: false,
    porte: "tipo",
    // platibanda de 2 kN/m; no contorno da casa de máquinas, mais as paredes dela
    paredes: (v) => (noContornoDaCasa(v) ? 2 + PAREDES_CASA : 2),
  });
  const casa = planta("Casa de máquinas", 2.6, 1, {
    celulas: CASA,
    sobrecarga: () => 0.5,
    varandas: false,
    porte: "tipo",
    paredes: () => 1,
  });
  // os pilares da casa nascem dos da cobertura e seguem com a mesma seção
  const debaixo = (p: Pilar) =>
    cobertura.pilares.find((q) => Math.abs(q.x - p.x) <= TOL && Math.abs(q.y - p.y) <= TOL);
  casa.pilares = casa.pilares.map((p) => {
    const q = debaixo(p);
    return q ? { ...p, b: q.b, h: q.h } : p;
  });
  return {
    ...obra,
    materiais: { ...obra.materiais, fck: 30 },
    pavimentos: [
      casa,
      cobertura,
      planta("Tipo", 3, 6, { ...apartamentos, porte: "tipo" }),
      planta("1º pavimento", 3.5, 1, { ...apartamentos, porte: "base" }),
    ],
  };
}
