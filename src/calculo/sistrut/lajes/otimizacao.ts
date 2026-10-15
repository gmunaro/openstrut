// Otimização dos momentos negativos (LAJECALC opção 6). Especificação:
// livros_laje.md 1.14; PLANO L5 e R3 (U32-025, U32-026).
//
// Para cada laje com H e M+ > 0 e cada bordo engastado com continuidade, compara o
// negativo dos dois lados; o lado maior reduz a relação Mneg/Mpos para
// INT(100·coef·M2/M1)/100 (≥ mínimo, tolerância 10 %), regrava o código do bordo,
// recalcula a laje e repete o bordo. Com armadura imposta na continuidade, reduz a
// relação até a imposta bastar (1,03·As_imp ≥ As_nec).
//
// Defeito R3: o original reduz o coeficiente com 2 casas e grava o código com 1
// (CINT(coef·10 + 2), ao par). Se o código não muda, o momento não muda e o mesmo
// bordo se repete sem fim (ex.: 0,40 × 0,89 → 0,35 → CINT(5,5) = 6 → 0,40).
// - original: o mesmo algoritmo; onde o original entraria em laço, lança
//   `NaoConvergeOtimizacao` com o estado da tela (v2par_laje_r3: piso 0,35, CINT(5,4999999)
//   = 5 = código atual).
// - corrigido: grava o código 2 + 10·coef sem arredondar (coef com 2 casas, que
//   sempre cai), então a redução converge.
import type { Etapa } from "../../tipos";
import { atribuicao, qbCint, qbInt } from "../base/f32";
import type {
  CodigoBordo,
  Continuidade,
  EsforcosLajes,
  LajeSistrut,
  MomentosDeLaje,
  OtimizaNegativos,
} from "../base/tipos";
import { barraImpostaNaContinuidade } from "./barras";
import { flexaoLaje } from "./flexao";

const REF = "LAJECALC.BAS:2021-2230; livros_laje.md 1.14";

/** Lado de uma continuidade como a tela da otimização o mostra (LAJECALC.BAS:2059-2097):
 *  M− em t·cm/m, As (−1 se a seção não passa) e Mneg/Mpos. */
export interface LadoOtimizacao {
  laje: string;
  lado: number;
  mTcm: number;
  as: number;
  relacao: number;
}

/** Ponto em que o SISTRUT original entra em laço (defeito R3): a relação nova grava o
 *  mesmo código, o momento não muda e o mesmo bordo se repete sem fim
 *  (LAJECALC.BAS:2113-2145, 2199-2207). `estado` = o que a tela mostra parada. */
export class NaoConvergeOtimizacao extends Error {
  readonly estado: {
    laje: string;
    lado: number;
    relacaoNova: number;
    codigo: number;
    lados: LadoOtimizacao[];
  };
  constructor(estado: NaoConvergeOtimizacao["estado"]) {
    super(
      `Otimização dos negativos não converge: ${estado.laje}, lado ${estado.lado + 1}, relação ` +
        `Mneg/Mpos alterada para ${estado.relacaoNova}, mas o código gravado continua ${estado.codigo} ` +
        "(CINT(coef·10 + 2)); o SISTRUT original repete este bordo sem fim (defeito R3).",
    );
    this.name = "NaoConvergeOtimizacao";
    this.estado = estado;
  }
}
/** Teto de passos por bordo: só protege contra laço; o algoritmo converge antes. */
const MAXIMO_PASSOS = 1000;

/** Primeira continuidade do bordo (A_11e0 lado B ou lado A; LAJECALC.BAS:2025-2032). */
const continuidadeDoBordo = (continuidades: readonly Continuidade[], laje: string, bordo: number) =>
  continuidades.find(
    (c) => (c.lajeB === laje && c.bordoB === bordo) || (c.lajeA === laje && c.bordoA === bordo),
  );

/**
 * Otimização dos negativos sobre os esforços do painel (LAJECALC.BAS:2005-2230).
 * `recalcula(laje)` refaz os momentos da laje com os códigos novos (o
 * `MomentosLaje` da T1). Devolve os esforços com códigos, momentos, coeficientes e
 * fatores atualizados, e uma etapa de memória por alteração. No modo original, lança
 * `NaoConvergeOtimizacao` onde o original travaria (R3).
 * v2par_laje_assim: L3 lado 3 22 → 16 e L4 lado 1 22 → 15; v2par_laje_otim: 22 → 5 (piso).
 * E2E: os dois lados de cada continuidade têm o mesmo negativo e nada muda
 * (caso_a_laje: As 2,13/1,68 antes e depois).
 */
export const otimizaNegativos: OtimizaNegativos = (
  esforcos,
  recalcula,
  materiais,
  parametros,
  modo,
) => {
  const s = atribuicao(modo);
  const lajes: LajeSistrut[] = esforcos.lajes.map((l) => ({ ...l, codigos: [...l.codigos] }));
  const indice = new Map(lajes.map((l, i) => [l.nome, i]));
  const momentos: Record<string, MomentosDeLaje> = { ...esforcos.momentos };
  const coeficientes = { ...esforcos.coeficientes };
  const bordos = { ...esforcos.bordos };
  const avisos = [...esforcos.avisos];
  const memoria: Etapa[] = [...esforcos.memoria];
  const minimo = parametros.relacaoNegPosMin;

  const laje = (nome: string) => lajes[indice.get(nome) ?? -1];
  /** coef = (código − 2)/10 (LAJECALC.BAS:2045); no corrigido, com 2 casas. */
  const relacao = (codigo: CodigoBordo) =>
    modo === "original" ? s((codigo - 2) / 10) : Math.round(((codigo - 2) / 10) * 100) / 100;
  /** Código gravado: CINT(coef·10 + 2) (LAJECALC.BAS:2124); corrigido (R3): sem CINT. */
  const codigoDe = (coef: number) => (modo === "original" ? qbCint(coef * 10 + 2) : 2 + 10 * coef);
  /** M− do bordo = M+·(código − 2)·fator/10, t·cm/m (LAJECALC.BAS:2043). */
  const momentoNoBordo = (nome: string, bordo: number) => {
    const m = momentos[nome]!;
    const codigo = laje(nome)!.codigos[bordo]!;
    const fator = m.bordos[bordo]?.fatorDirecao ?? 1;
    return s((m.mPositivoPrincipalTcm * (codigo - 2) * fator) / 10);
  };
  /** Lado como a tela o mostra: M−, As da flexão com o H da laje e Mneg/Mpos. */
  const ladoNaTela = (nome: string, bordo: number): LadoOtimizacao => {
    const mTcm = momentoNoBordo(nome, bordo);
    const f = flexaoLaje(
      { mTcm, h: momentos[nome]!.h, negativa: true },
      materiais,
      parametros,
      modo,
    );
    return {
      laje: nome,
      lado: bordo,
      mTcm,
      as: f.passa ? f.as : -1,
      relacao: relacao(laje(nome)!.codigos[bordo]!),
    };
  };
  /** Grava a relação nova no bordo e recalcula a laje (LAJECALC.BAS:2116-2124, 2144-2161).
   *  Código que não muda: no original, laço sem fim (R3), lança `NaoConvergeOtimizacao`;
   *  no corrigido (que não chega aqui), para o bordo com aviso. */
  const grava = (
    nome: string,
    bordo: number,
    coef: number,
    formula: string,
    lados: LadoOtimizacao[],
  ) => {
    const alvo = laje(nome)!;
    const anterior = alvo.codigos[bordo]!;
    const codigo = codigoDe(coef);
    if (codigo === anterior) {
      const erro = new NaoConvergeOtimizacao({
        laje: nome,
        lado: bordo,
        relacaoNova: coef,
        codigo,
        lados,
      });
      if (modo === "original") throw erro;
      avisos.push(erro.message);
      return false;
    }
    alvo.codigos[bordo] = codigo;
    const m = recalcula(alvo);
    momentos[nome] = m;
    coeficientes[nome] = m.coeficiente;
    bordos[nome] = m.bordos;
    memoria.push({
      descricao: `${nome}, lado ${bordo + 1}: relação Mneg/Mpos ${relacao(anterior)} → ${coef} (código ${codigo})`,
      formula,
      valor: coef,
      ref: REF,
    });
    return true;
  };
  const temMomento = (nome: string | null): nome is string => {
    const m = nome === null ? undefined : momentos[nome];
    return m !== undefined && m.mPositivoPrincipalTcm > 0 && m.h > 0;
  };

  /** Compara com o vizinho e reduz o lado maior (LAJECALC.BAS:2032-2161).
   *  "mudou" repete o bordo; "parou" encerra o bordo; "segue" vai à armadura imposta. */
  const comparaVizinho = (nome: string, bordo: number, c: Continuidade) => {
    const ladoA = c.lajeA === nome && c.bordoA === bordo;
    const vizinho = ladoA ? c.lajeB : c.lajeA;
    const bordoVizinho = ladoA ? c.bordoB : c.bordoA;
    if (!temMomento(vizinho) || laje(vizinho) === undefined) return "segue";
    const m1 = momentoNoBordo(nome, bordo);
    const m2 = momentoNoBordo(vizinho, bordoVizinho);
    if (m1 === m2) return "segue";
    const [alvo, bordoAlvo, maior, menor] =
      m1 > m2 ? [nome, bordo, m1, m2] : [vizinho, bordoVizinho, m2, m1];
    const coef = relacao(laje(alvo)!.codigos[bordoAlvo]!);
    // LAJECALC.BAS:2108-2111 e 2127-2130: tolerância de 10 % e relação já no mínimo.
    if ((maior - menor) / maior < s(0.1) || coef === minimo) return "segue";
    const novo = Math.max(s(qbInt((100 * coef * menor) / maior) / 100), minimo);
    const formula = "INT(100·coef·M2/M1)/100 ≥ mínimo; código = CINT(coef·10 + 2)";
    const lados = [ladoNaTela(nome, bordo), ladoNaTela(vizinho, bordoVizinho)];
    return grava(alvo, bordoAlvo, novo, formula, lados) ? "mudou" : "parou";
  };

  /** Armadura imposta na continuidade (LAJECALC.BAS:2165-2221): reduz a relação até
   *  1,03·As_imp ≥ As_nec. "mudou" repete o bordo inteiro. */
  const confereImposta = (nome: string, bordo: number, c: Continuidade) => {
    if (!(c.armaduraImposta !== undefined && c.armaduraImposta > 0)) return "parou";
    const imposta = barraImpostaNaContinuidade(c.armaduraImposta, parametros, modo);
    if (!imposta.ok) return "parou";
    let mudou = false;
    for (let passo = 0; passo < MAXIMO_PASSOS; passo++) {
      const coef = relacao(laje(nome)!.codigos[bordo]!);
      const f = flexaoLaje(
        { mTcm: momentoNoBordo(nome, bordo), h: momentos[nome]!.h, negativa: true },
        materiais,
        parametros,
        modo,
      );
      const asNecessaria = f.passa ? f.as : 0;
      if (!(s(1.03) * imposta.area < asNecessaria)) return mudou ? "mudou" : "parou";
      if (coef === minimo) return "parou";
      const fator = Math.max(s(imposta.area / asNecessaria), s(0.85));
      const novo = Math.max(s(qbInt(100 * coef * fator) / 100), minimo);
      const formula = "INT(100·coef·max(As_imp/As_nec; 0,85))/100 ≥ mínimo";
      if (!grava(nome, bordo, novo, formula, [ladoNaTela(nome, bordo)])) return "parou";
      mudou = true;
    }
    avisos.push(
      `${nome}, lado ${bordo + 1}: armadura imposta sem convergência em ${MAXIMO_PASSOS} passos.`,
    );
    return "parou";
  };

  for (const { nome } of esforcos.lajes) {
    // LAJECALC.BAS:2016: só lajes com H e M+ > 0.
    if (!temMomento(nome)) continue;
    const nBordos = laje(nome)!.codigos.length;
    for (let bordo = 0; bordo < nBordos; bordo++) {
      for (let passo = 0; ; passo++) {
        if (passo >= MAXIMO_PASSOS) {
          avisos.push(
            `${nome}, lado ${bordo + 1}: otimização sem convergência em ${MAXIMO_PASSOS} passos.`,
          );
          break;
        }
        if (!(laje(nome)!.codigos[bordo]! > 2)) break;
        const c = continuidadeDoBordo(esforcos.continuidades, nome, bordo);
        if (c === undefined) {
          avisos.push(
            `${nome}, lado ${bordo + 1}: engastado sem continuidade registrada; não otimizado.`,
          );
          break;
        }
        const vizinho = comparaVizinho(nome, bordo, c);
        if (vizinho === "mudou") continue;
        if (vizinho === "parou") break;
        if (confereImposta(nome, bordo, c) !== "mudou") break;
      }
    }
  }

  return {
    ...esforcos,
    lajes,
    momentos,
    coeficientes,
    bordos,
    avisos,
    memoria,
  } satisfies EsforcosLajes;
};
