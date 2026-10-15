// Direção e μ, carga total, momentos e imposição de H das lajes do SISTRUT 4.0
// (LAJECALC opções 2, 4 e 5). A procura do μ pelas cordas (GOSUB L_3744e) vem
// traduzida comando a comando (ver o cabeçalho de charneiras.ts); o resto é
// curto e está portado à mão, com a linha do LAJECALC.BAS em cada passo.
import type {
  DirecaoMu,
  ImpoeEspessura,
  LajeSistrut,
  ModoSistrut,
  MomentosDeLaje,
  MomentosLaje,
  ParametrosLaje,
} from "../base/tipos";
import { ErroQB, atribuicao, qbCint, qbInt } from "../base/f32";
import { EstadoLajecalc, S_23341, carregaPadrao, padraoPorCodigos, pot } from "./charneiras";
import { S_578ad, coeficienteDoEstado } from "./coeficiente";

/** Direção e μ (GOSUB L_3744e, LAJECALC.BAS:4801-4971; livros_laje.md 1.4): maior
 *  corda em 9 retas paralelas ao ângulo e a +90° (interseções nos vértices não
 *  contam); razão = corda(a)/corda(a + 90°); μ = o da última linha de `relacaoMu`
 *  com relação < razão, sem interpolar. E2E 4 × 5 a 0°: razão 0,80 → μ 0,80. */
export const direcaoMu: DirecaoMu = (vertices, angulo, parametros, modo) => {
  const g = new EstadoLajecalc(parametros, modo);
  const n = vertices.length;
  g.A_1070 = g.matriz("!", [
    [0, n],
    [0, 1],
  ]);
  g.A_109e = g.matriz("%", [
    [0, 1],
    [0, n + 1],
  ]);
  g.A_109e.set(n + 1, 1, 0);
  vertices.forEach((v, k) => {
    g.A_1070.set(v.x, k + 1, 0);
    g.A_1070.set(v.y, k + 1, 1);
    g.A_109e.set(k + 1, 1, k + 1);
  });
  g.A_109e.set(1, 1, n + 1);
  g.A_1210.set(angulo, 1, 0);
  const tabela = parametros.relacaoMu;
  g.A_123e = g.matriz("!", [
    [0, tabela.length],
    [0, 1],
  ]);
  g.A_123e.set(tabela.length, 0, 0);
  tabela.forEach((l, f) => {
    g.A_123e.set(l.relacao, f + 1, 0);
    g.A_123e.set(l.mu, f + 1, 1);
  });
  L_3744e(g);
  return { razao: g.s(g.V_1758 / g.V_175c), mu: g.V_1778 };
};

/** Fator de direção do bordo k (0-based) (GOSUB L_19c3d, LAJECALC.BAS:1906-1934):
 *  1 com μ = 1; senão gira o bordo pelo ângulo e, com a = |dy|/L e b = |dx|/L,
 *  vale μ·b + a (μ < 1) ou a/μ + b (μ > 1). DOUBLE no original (V_0ef4#). Com
 *  ângulo 0 e μ < 1: bordo vertical 1, horizontal μ. */
export function fatorDeDirecao(laje: LajeSistrut, k: number, modo: ModoSistrut) {
  const s = atribuicao(modo);
  const mu = s(laje.mu);
  if (mu === 1) return 1;
  const t = (s(laje.angulo) * Math.PI) / 180;
  const p0 = laje.vertices[k];
  const p1 = laje.vertices[(k + 1) % laje.vertices.length];
  if (!p0 || !p1) throw new Error(`Bordo ${k} inexistente`);
  const gira = (p: { x: number; y: number }) => ({
    x: s(p.x) * Math.cos(t) - s(p.y) * Math.sin(t),
    y: s(p.x) * Math.sin(t) + s(p.y) * Math.cos(t),
  });
  const a0 = gira(p0);
  const a1 = gira(p1);
  const l = Math.sqrt(pot(a1.y - a0.y, 2) + pot(a1.x - a0.x, 2));
  // V_16a8 = |dx|/L e V_16b0 = |dy|/L, trocados pelo SWAP (1a159)
  const a = Math.abs(a1.y - a0.y) / l;
  const b = Math.abs(a1.x - a0.x) / l;
  return mu < 1 ? Math.abs(mu * b + a) : Math.abs(a / mu + b);
}

/** Coeficientes dos bordos: fator de direção e (código − 2)/10·fator nos engastados
 *  (código > 2), 0 nos demais; c_max e c_min entre os engastados, em SINGLE
 *  (LAJECALC.BAS:616-640 e 845-857). Sem engaste, c_min = 0. */
export function coeficientesDosBordos(laje: LajeSistrut, modo: ModoSistrut) {
  const s = atribuicao(modo);
  const bordos = laje.codigos.map((c, k) => {
    const fatorDirecao = fatorDeDirecao(laje, k, modo);
    return { fatorDirecao, coeficiente: c > 2 ? s(((c - 2) * fatorDirecao) / 10) : 0 };
  });
  let maior = 0;
  let menor = -1;
  for (const [k, c] of laje.codigos.entries()) {
    if (c <= 2) continue;
    const v = ((c - 2) * (bordos[k]?.fatorDirecao ?? 0)) / 10;
    if (maior < v) maior = s(v);
    if (menor === -1) menor = s(v);
    if (menor > v) menor = s(v);
  }
  return { bordos, maior, menor: menor === -1 ? 0 : menor };
}

/** Momentos de uma laje com H dado (LAJECALC.BAS:875-880, 616-661; livros_laje.md
 *  1.8 e 2.2): q(H) = (alvenaria + cargaArea)/área + H·densidade/100 + permanente;
 *  M+ = 100·q/coef (t·cm/m, A_12fc(i,1)); M+ secundário = M+·μ (μ ≤ 1) ou M+/μ;
 *  M− = M+·c_max e M+·c_min. O coeficiente sai do padrão de charneiras do polígono
 *  preparado (S_4019b + S_578ad). E2E H 10: q 0,50, coef 2,0180, M+ 24,78. */
export const momentosLaje: MomentosLaje = (entrada, modo) => {
  const { laje, preparada, h, parametros } = entrada;
  const g = new EstadoLajecalc(parametros, modo);
  const padrao = padraoPorCodigos(preparada.poligono, laje.codigos, parametros, modo, laje.tipo);
  carregaPadrao(g, padrao.bruto);
  S_578ad(g);
  const coeficiente = coeficienteDoEstado(g);
  return momentosComCoeficiente(laje, preparada.alvenaria, preparada.cargaArea, preparada.area, h, coeficiente, parametros, modo);
};

/** `MomentosDeLaje` com a carga antes do arredondamento (mudança de contrato pedida
 *  no relatório): o original divide q ainda em precisão estendida pelo coeficiente
 *  e só então grava V_1400! (LAJECALC.BAS:875). */
export interface MomentosDeLajeSistrut extends MomentosDeLaje {
  /** q(H) sem arredondar, t/m². */
  qSemArredondar: number;
  /** p = q/coef (V_1400!, SINGLE no original), t/m; M+ = 100·p em t·cm/m. */
  p: number;
}

/** Momentos com o coeficiente de carga já calculado (o que muda com H). Só aqui
 *  entram a carga e H; `momentosLaje` e o painel usam esta função. */
export function momentosComCoeficiente(
  laje: LajeSistrut,
  alvenaria: number,
  cargaArea: number,
  area: number,
  h: number,
  coeficiente: MomentosDeLaje["coeficiente"],
  parametros: ParametrosLaje,
  modo: ModoSistrut,
): MomentosDeLajeSistrut {
  const s = atribuicao(modo);
  // de8 = dec = 1 (fatores de unidade do padrão, LAJE.BAS:111-118)
  const dec = 1;
  const de8 = 1;
  const ef0 = s(alvenaria + cargaArea); // V_0ef0! (LAJECALC.BAS:8404)
  const hS = s(h);
  const dens = s(parametros.densidade);
  const pesoProprio = s((pot(de8, 2) / (100 * dec)) * hS * dens);
  const qExata = ef0 / area + (pot(de8, 2) / (100 * dec)) * hS * dens + s(laje.cargaPermanente);
  if (coeficiente.coeficiente === 0) {
    // mecanismo sem trabalho interno (ex.: balanço sem engaste): o original para
    // na divisão (LAJECALC.BAS:875)
    throw new ErroQB(11, `${laje.nome}: coeficiente de carga nulo`);
  }
  const p = s(qExata / coeficiente.coeficiente); // V_1400! (875)
  const mPositivo = s(100 * p * dec * de8); // A_12fc(i, 1) (880)
  const mu = s(laje.mu);
  const { bordos, maior, menor } = coeficientesDosBordos(laje, modo);
  return {
    nome: laje.nome,
    h: hS,
    q: s(qExata),
    qSemArredondar: qExata,
    p,
    pesoProprio,
    coeficiente,
    // Com l_1a = 0 (balanço) o coeficiente é negativo e o M+ também: o original
    // imprime max(M+, 0) (LAJECALC.BAS:12417) e dimensiona o negativo com |M+|.
    mPositivoPrincipalTcm: mPositivo,
    // LAJECALC.BAS:12bb3-12dce: M+·μ (μ ≤ 1) ou M+/μ, 0 se M+ ≤ 0
    mPositivoSecundarioTcm: mPositivo > 0 ? (mu <= 1 ? s(mPositivo * mu) : s(mPositivo / mu)) : 0,
    // LAJECALC.BAS:12a3a, 12b0e: |M+|·c_max e |M+|·c_min. A impressão da opção 5
    // usa M+·c (com sinal; 124ac): no balanço sai negativa.
    mNegativoMaiorTcm: s(Math.abs(mPositivo) * maior),
    mNegativoMenorTcm: s(Math.abs(mPositivo) * menor),
    bordos,
  };
}

/** Imposição de H (LAJECALC opção 4, LAJECALC.BAS:1171-1248; livros_laje.md 1.12):
 *  H inteiro em [Hmin, Hmax], só tipos 0 e 3; grava H e regrava o peso próprio
 *  = H·densidade/100. Fora da faixa ou do tipo devolve a laje como veio e um aviso. */
export const impoeEspessura: ImpoeEspessura = (laje, h, parametros, modo) => {
  const s = atribuicao(modo);
  const hS = s(h);
  if (qbInt(hS) !== hS || hS > s(parametros.hMax) || hS < s(parametros.hMin)) {
    return {
      laje,
      avisos: [`${laje.nome}: H ${h} cm recusado (inteiro entre ${parametros.hMin} e ${parametros.hMax})`],
    };
  }
  if (laje.tipo !== 0 && laje.tipo !== 3) {
    return { laje, avisos: [`${laje.nome}: imposição de H só vale para lajes dos tipos 0 e 3`] };
  }
  const pesoProprio = s((pot(1, 2) / (100 * 1)) * hS * s(parametros.densidade));
  return { laje: { ...laje, h: hS, pesoProprio }, avisos: [] };
};

// ===== TRADUÇÃO MECÂNICA de LAJECALC.BAS (gerada por traduz.py; não editar à mão) =====
