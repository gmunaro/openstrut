// Esforços de todas as lajes de um pavimento (LAJECALC opções 1, 2 e 5 e, se
// injetada, a otimização dos negativos da opção 6).
import { num } from "../../texto";
import type { Etapa } from "../../tipos";
import type {
  CoeficienteCarga,
  EsforcosDoPainel,
  EsforcosDoPainelCom,
  EsforcosLajes,
  LajePreparada,
  LajeSistrut,
  ModoSistrut,
  MomentosDeLaje,
  PainelLajes,
  ParametrosLaje,
} from "../base/tipos";
import { ErroNaoConverge, ErroQB } from "../base/f32";
import { EstadoLajecalc, S_4019b, areaLajegeom } from "./charneiras";
import {
  S_50187,
  S_578ad,
  carregaLaje,
  coeficienteDoEstado,
  preparadaDoEstado,
} from "./coeficiente";
import { continuidadeAutomatica } from "./continuidade";
import { coeficientesDosBordos, direcaoMu, momentosComCoeficiente } from "./momentos";

/** Recálculos por laje antes de declarar que a otimização não converge
 *  (`ErroNaoConverge`): no original é o laço sem fim do defeito R3 (LAJECALC.BAS:2113,
 *  2123, 2145; v2par_laje_r3, piso 0,35). No
 *  v2par_laje_otim a L1 converge em 4 (código 22 → 7 → 6 → 5). */
export const LIMITE_RECALCULOS = 100;

/** O que não depende de H: preparação, padrão e coeficiente de carga, na mesma
 *  máquina e na ordem do original (S_50187, S_4019b, S_578ad; LAJECALC.BAS:616-620). */
function calculaSemH(
  laje: LajeSistrut,
  painel: PainelLajes,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
): { preparada: LajePreparada; coeficiente: CoeficienteCarga } {
  if (areaLajegeom(laje.vertices) <= 0) {
    // o LAJEGEOM não cria laje com área ≤ 0 (LAJEGEOM.BAS:3113)
    throw new Error("polígono no sentido anti-horário; o original só aceita o horário");
  }
  const g = new EstadoLajecalc(parametros, modo);
  carregaLaje(g, laje, painel);
  S_50187(g);
  const preparada = preparadaDoEstado(g, laje, parametros, modo);
  S_4019b(g);
  S_578ad(g);
  return { preparada, coeficiente: coeficienteDoEstado(g) };
}

/** Laje que o LAJECALC calcula: tipos 0 e 3 (o 1 é pulado na opção 5,
 *  LAJECALC.BAS:605; o 2 é vazio). */
const calculavel = (l: LajeSistrut) => l.tipo === 0 || l.tipo === 3;

/** Esforços do painel com a otimização dos negativos injetada (ou sem ela).
 *  1. Continuidade (opção 1): automática se `painel.continuidades` vier vazio e
 *     não confirmado (`continuidadesConfirmadas`); senão valem os códigos e as
 *     continuidades do painel.
 *  2. Direção (opção 2): μ pelas cordas (`direcaoMu`) nas lajes do tipo 0 com
 *     μ ≤ 0 (não informado); μ > 0 é o informado pelo usuário e fica.
 *  3. Por laje calculável: preparação, coeficiente de carga e fatores por bordo;
 *     com H, os momentos (opção 5).
 *  4. Com `otimiza`, a otimização dos negativos (opção 6), que recalcula as lajes
 *     cujo código mudou. */
export const esforcosDoPainelCom: EsforcosDoPainelCom = (otimiza, paraNaPrimeiraFalha) => {
  return (painel, parametros, modo) => {
    const avisos: string[] = [];
    const memoria: Etapa[] = [];
    let lajes = painel.lajes.map((l) => ({ ...l, codigos: [...l.codigos] }));
    let continuidades = painel.continuidades;
    if (continuidades.length === 0 && !painel.continuidadesConfirmadas) {
      const auto = continuidadeAutomatica(lajes, parametros);
      lajes = auto.lajes;
      continuidades = auto.continuidades;
      memoria.push({
        descricao: `Continuidade automática: ${continuidades.length} trecho(s) com i = ${parametros.relacaoNegPosMax}`,
        ref: "LAJECALC.BAS:3690-3731",
      });
    }
    lajes = lajes.map((l) => {
      if (l.tipo !== 0 || l.mu > 0) return l;
      const { razao, mu } = direcaoMu(l.vertices, l.angulo, parametros, modo);
      memoria.push({
        descricao: `${l.nome}: relação das cordas ${num(razao, 3)} → μ`,
        valor: mu,
        ref: "LAJECALC.BAS:4801-4971",
      });
      return { ...l, mu };
    });

    const preparadas: Record<string, LajePreparada> = {};
    const coeficientes: Record<string, CoeficienteCarga> = {};
    const bordos: EsforcosLajes["bordos"] = {};
    const momentos: Record<string, MomentosDeLaje> = {};
    const momentosDe = (laje: LajeSistrut, preparada: LajePreparada, coef: CoeficienteCarga) =>
      laje.h === undefined
        ? undefined
        : momentosComCoeficiente(
            laje,
            preparada.alvenaria,
            preparada.cargaArea,
            preparada.area,
            laje.h,
            coef,
            parametros,
            modo,
          );
    // laje em que a opção 5 "todas" do original parou (`paraNaPrimeiraFalha`)
    let parou: string | undefined;
    const para = (laje: LajeSistrut, e: unknown) => {
      if (paraNaPrimeiraFalha && e instanceof ErroQB) parou = laje.nome;
    };
    for (const laje of lajes) {
      if (!calculavel(laje)) continue;
      if (parou !== undefined) {
        avisos.push(
          `${laje.nome}: não calculada: a opção 5 "todas" do original para na laje ${parou} (erro de execução, volta ao menu).`,
        );
        continue;
      }
      let calculada: ReturnType<typeof calculaSemH>;
      try {
        calculada = calculaSemH(laje, painel, parametros, modo);
      } catch (e) {
        avisos.push(`${laje.nome}: não calculada (${e instanceof Error ? e.message : String(e)})`);
        para(laje, e);
        continue;
      }
      const { preparada, coeficiente } = calculada;
      preparadas[laje.nome] = preparada;
      coeficientes[laje.nome] = coeficiente;
      bordos[laje.nome] = coeficientesDosBordos(laje, modo).bordos;
      memoria.push({
        descricao: `${laje.nome}: coeficiente de carga (M+ = q/c)`,
        formula: "c = (l1a + l32 + (1 + cantos)·l2a − 2·l22)/(l1e/3 + l2e − l26/3)",
        valor: coeficiente.coeficiente,
        ref: "LAJECALC.BAS:8408",
      });
      if (laje.h === undefined) {
        avisos.push(`${laje.nome}: sem H; momentos não calculados`);
        continue;
      }
      try {
        const m = momentosDe(laje, preparada, coeficiente);
        if (m) momentos[laje.nome] = m;
      } catch (e) {
        avisos.push(
          `${laje.nome}: momentos não calculados (${e instanceof Error ? e.message : String(e)})`,
        );
        para(laje, e);
      }
    }

    const resultado: EsforcosLajes = {
      lajes,
      continuidades,
      preparadas,
      coeficientes,
      bordos,
      momentos,
      avisos,
      memoria,
    };
    if (!otimiza) return resultado;
    const recalculos = new Map<string, number>();
    const recalcula = (laje: LajeSistrut) => {
      const n = (recalculos.get(laje.nome) ?? 0) + 1;
      recalculos.set(laje.nome, n);
      if (n > LIMITE_RECALCULOS) {
        throw new ErroNaoConverge(
          `${laje.nome}: a otimização dos negativos não converge (${LIMITE_RECALCULOS} recálculos; ` +
            `códigos ${laje.codigos.join(", ")}). No original o laço não termina.`,
        );
      }
      const { preparada, coeficiente } = calculaSemH(laje, painel, parametros, modo);
      const m = momentosDe(laje, preparada, coeficiente);
      if (!m) throw new Error(`${laje.nome}: recálculo sem H`);
      return m;
    };
    return otimiza(resultado, recalcula);
  };
};

/** Esforços do painel sem a otimização dos negativos (opções 1, 2 e 5). Para o
 *  modo original completo, use `esforcosDoPainelCom` com a otimização da T2. */
export const esforcosDoPainel: EsforcosDoPainel = esforcosDoPainelCom();
