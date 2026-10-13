// Ligação viga-pilar de extremidade pelo modelo simplificado de viga contínua da
// NBR 6118:2023, 14.6.6.1 c) (14.6.7.1 na edição de 2014): o tramo extremo é
// tomado biengastado, e o momento de engastamento perfeito Meng se reparte entre a
// viga e os lances superior e inferior do pilar na proporção das rigidezes r = I/ℓ:
//   Mvig = Meng·(rinf + rsup)/(rvig + rinf + rsup)
//   Msup = Meng·rsup/(rvig + rinf + rsup)
//   Minf = Meng·rinf/(rvig + rinf + rsup)
// com ℓ = vão efetivo do tramo extremo para a viga e ℓ = metade da altura do lance
// para o pilar. Fontes: Bastos, Vigas (abr/2024), Eq. 4 a 7, p. 15 a 17; Bastos,
// Pilares (jun/2024), Eq. 88 a 90, p. 59, e exemplos dos pilares P1, P5 e P6,
// p. 155 a 165.
//
// Só os nós extremos da viga apoiados em pilar entram (a norma fala em "apoios
// extremos"). Extremidade livre (balanço) ou apoiada em outra viga fica de fora; o
// pilar vizinho a um balanço não é extremo.
//
// Convenção de sinais dos momentos no pilar: sinal = face tracionada. M > 0
// traciona a face de coordenada maior na direção do momento (+x para Mx, +y para
// My). Topo e base com o mesmo sinal = curvatura simples (MB/MA > 0 em αb), como
// supõe normas/nbr6118-2023/pilares.ts. Unidades: m, cm, kN, kN·m; rigidez em cm³.
import type { VigaMontada } from "../montagem";
import type { ComMemoria, Etapa } from "../tipos";
import type { TramoEntrada } from "./continua";

const REF_VIGA = "6118:2023 14.6.6.1 c) (Bastos, Vigas, Eq. 4 e 7, p. 15 e 17)";
const REF_PILAR =
  "6118:2023 14.6.6.1 c) (Bastos, Vigas, Eq. 5 e 6, p. 17; Pilares, Eq. 88 e 89, p. 59)";
/** Ref. da soma das duas pontas de um lance (momentosDoLance), para a memória do pilar. */
export const REF_LANCE =
  "Bastos, Pilares, Eq. 90, p. 59 (propagação de metade do momento da outra ponta)";

/** s·v sem produzir −0. */
const comSinal = (s: number, v: number) => (v === 0 ? 0 : s * v);

/** Direção do momento no pilar: a do eixo da viga (x = viga horizontal na planta). */
export type Direcao = "x" | "y";

/** Lance de pilar acima ou abaixo do nó. Seção em cm (b na direção x, h na
 *  direção y, como em dominio/obra.ts) e altura do lance (pé-direito) em m. */
export interface LancePilar {
  b: number;
  h: number;
  altura: number;
}

/** Lances do pilar no nível da viga; null quando não há lance (cobertura, fundação). */
export interface LancesDoPilar {
  superior: LancePilar | null;
  inferior: LancePilar | null;
}

/** Momentos de engastamento perfeito (módulo, kN·m) nas pontas de um tramo biengastado. */
export interface MomentosEngastamento {
  esq: number;
  dir: number;
}

/** Repartição de Meng no nó (módulos, kN·m). */
export interface MomentosLigacao {
  viga: number;
  superior: number;
  inferior: number;
}

export interface LigacaoExtremidade {
  /** Índice do nó na viga (0 ou nTramos). */
  no: number;
  pilarId: string;
  pilarNome: string;
  /** kN·m (módulo, carga g + q do tramo extremo). */
  meng: number;
  /** cm³ */
  rViga: number;
  rSuperior: number;
  rInferior: number;
  /** Momento na viga sobre o pilar, kN·m (≤ 0, convenção de continua.ts). */
  mViga: number;
  /** Base do lance superior e topo do lance inferior, kN·m, característicos,
   *  sinal = face tracionada (+ traciona a face de coordenada maior). */
  mBaseSuperior: number;
  mTopoInferior: number;
}

export interface LigacaoVigaPilar extends ComMemoria {
  direcao: Direcao;
  extremidades: LigacaoExtremidade[];
}

/** Rigidez da viga r = I/ℓ, cm³: I = bw·h³/12 (cm⁴), ℓ = vão efetivo do tramo extremo (m). */
export const rigidezViga = (bw: number, h: number, vao: number) => (bw * h ** 3) / 12 / (vao * 100);

/** Rigidez do lance r = I/(ℓ/2), cm³, com a inércia na direção do momento (a
 *  dimensão na direção da viga vai ao cubo); 0 sem lance. */
export function rigidezLance(lance: LancePilar | null, direcao: Direcao) {
  if (!lance) return 0;
  const { b, h, altura } = lance;
  const inercia = direcao === "x" ? (h * b ** 3) / 12 : (b * h ** 3) / 12;
  return inercia / ((altura * 100) / 2);
}

/** Momentos de engastamento perfeito do tramo biengastado com carga distribuída
 *  g + q e concentradas P = g + q a `a` m do início: q·L²/12 + Σ P·a·b²/L² (esquerda) e
 *  q·L²/12 + Σ P·a²·b/L² (direita), b = L − a. */
export function momentosEngastamento(t: TramoEntrada): MomentosEngastamento {
  const L = t.comprimento;
  const md = ((t.g + t.q) * L * L) / 12;
  const conc = (t.concentradas ?? []).map((c) => ({ a: c.a, b: L - c.a, p: c.g + (c.q ?? 0) }));
  return {
    esq: md + conc.reduce((s, { a, b, p }) => s + (p * a * b * b) / (L * L), 0),
    dir: md + conc.reduce((s, { a, b, p }) => s + (p * a * a * b) / (L * L), 0),
  };
}

/** Reparte Meng entre a viga e os lances (NBR 6118 14.6.6.1 c). Sem rigidez nenhuma, tudo 0. */
export function reparteLigacao(
  meng: number,
  rViga: number,
  rSuperior: number,
  rInferior: number,
): MomentosLigacao {
  const soma = rViga + rSuperior + rInferior;
  if (!(soma > 0)) return { viga: 0, superior: 0, inferior: 0 };
  return {
    viga: (meng * (rSuperior + rInferior)) / soma,
    superior: (meng * rSuperior) / soma,
    inferior: (meng * rInferior) / soma,
  };
}

/** Momentos de 1ª ordem de um lance de pilar, característicos, somando as
 *  ligações das duas pontas com metade do momento da outra ponta (Bastos,
 *  Pilares, Eq. 90). `topo` = soma de mTopoInferior das vigas do nível do topo;
 *  `base` = soma de mBaseSuperior das vigas do nível da base. Na convenção de face
 *  tracionada a parcela propagada troca de sinal: viga do mesmo lado nos dois
 *  níveis dá topo = −base (curvatura dupla, αb = 0,4). */
export function momentosDoLance(topo: number, base: number) {
  return { topo: topo - base / 2, base: base - topo / 2 };
}

/**
 * Momentos de ligação nas extremidades da viga apoiadas em pilar. `lances`
 * traz, por id do pilar, os lances acima e abaixo do nível desta viga. Devolve o
 * momento negativo de extremidade da viga e os momentos nos lances do pilar na
 * direção do eixo da viga.
 */
export function ligacaoVigaPilar(
  viga: VigaMontada,
  lances: Readonly<Record<string, LancesDoPilar>>,
): LigacaoVigaPilar {
  const direcao: Direcao = viga.eixo.horizontal ? "x" : "y";
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const extremidades: LigacaoExtremidade[] = [];
  const n = viga.tramos.length;

  // nó 0: a viga sai do pilar no sentido +; nó n: no sentido −
  for (const [no, iTramo, lado] of [
    [0, 0, 1],
    [n, n - 1, -1],
  ] as const) {
    const apoio = viga.apoios[no];
    const tramo = viga.tramos[iTramo];
    if (n === 0 || !tramo || apoio?.tipo !== "pilar") continue;
    const lp = lances[apoio.id];
    if (!lp) {
      avisos.push(
        `Viga ${viga.nome}: pilar ${apoio.nome} sem dados de lance; ligação de extremidade tratada como rótula.`,
      );
      continue;
    }
    const eng = momentosEngastamento({
      comprimento: tramo.vao,
      g: tramo.g,
      q: tramo.q,
      concentradas: tramo.concentradas.map((c) => ({ a: c.a, g: c.g, q: c.q })),
    });
    const meng = lado === 1 ? eng.esq : eng.dir;
    const rViga = rigidezViga(viga.bw, viga.h, tramo.vao);
    const rSuperior = rigidezLance(lp.superior, direcao);
    const rInferior = rigidezLance(lp.inferior, direcao);
    const m = reparteLigacao(meng, rViga, rSuperior, rInferior);
    // viga saindo no sentido + (lado = 1): a base do lance superior traciona a face
    // do lado da viga (+) e o topo do lance inferior a face oposta (−)
    const ext: LigacaoExtremidade = {
      no,
      pilarId: apoio.id,
      pilarNome: apoio.nome,
      meng,
      rViga,
      rSuperior,
      rInferior,
      mViga: comSinal(-1, m.viga),
      mBaseSuperior: comSinal(lado, m.superior),
      mTopoInferior: comSinal(-lado, m.inferior),
    };
    extremidades.push(ext);

    const onde = `${viga.nome}, pilar ${apoio.nome} (${direcao})`;
    memoria.push(
      {
        descricao: `${onde}: momento de engastamento perfeito do tramo extremo (g + q)`,
        formula: "Meng = (g + q)·ℓ²/12 + Σ P·a·b²/ℓ²",
        valor: meng,
        unidade: "kN·m",
        ref: REF_VIGA,
      },
      {
        descricao: `${onde}: rigidez da viga`,
        formula: "rvig = (bw·h³/12)/ℓef",
        valor: rViga,
        unidade: "cm³",
        ref: REF_VIGA,
      },
      {
        descricao: `${onde}: rigidez do lance superior`,
        formula: "rsup = I/(ℓsup/2)",
        valor: rSuperior,
        unidade: "cm³",
        ref: REF_VIGA,
      },
      {
        descricao: `${onde}: rigidez do lance inferior`,
        formula: "rinf = I/(ℓinf/2)",
        valor: rInferior,
        unidade: "cm³",
        ref: REF_VIGA,
      },
      {
        descricao: `${onde}: momento na viga sobre o pilar`,
        formula: "Mvig = Meng·(rinf + rsup)/(rvig + rinf + rsup)",
        valor: ext.mViga,
        unidade: "kN·m",
        ref: REF_VIGA,
      },
      {
        descricao: `${onde}: momento na base do lance superior`,
        formula: "Msup = Meng·rsup/(rvig + rinf + rsup)",
        valor: ext.mBaseSuperior,
        unidade: "kN·m",
        ref: REF_PILAR,
      },
      {
        descricao: `${onde}: momento no topo do lance inferior`,
        formula: "Minf = Meng·rinf/(rvig + rinf + rsup)",
        valor: ext.mTopoInferior,
        unidade: "kN·m",
        ref: REF_PILAR,
      },
    );
  }
  return { direcao, extremidades, avisos, memoria };
}
