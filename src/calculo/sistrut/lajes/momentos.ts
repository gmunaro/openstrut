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
import { potencia, raiz } from "../base/x87";
import { EstadoLajecalc, S_23341, carregaPadrao, padraoDeCharneiras } from "./charneiras";
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
  const pot = potencia(modo);
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
  const l = raiz(modo)(pot(a1.y - a0.y, 2) + pot(a1.x - a0.x, 2));
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
  const padrao = padraoDeCharneiras(preparada.poligono, laje.codigos, parametros, modo, laje.tipo);
  carregaPadrao(g, padrao.bruto);
  S_578ad(g);
  const coeficiente = coeficienteDoEstado(g);
  return momentosComCoeficiente(
    laje,
    preparada.alvenaria,
    preparada.cargaArea,
    preparada.area,
    h,
    coeficiente,
    parametros,
    modo,
  );
};

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
): MomentosDeLaje {
  const s = atribuicao(modo);
  const pot = potencia(modo);
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
      avisos: [
        `${laje.nome}: H ${h} cm recusado (inteiro entre ${parametros.hMin} e ${parametros.hMax})`,
      ],
    };
  }
  if (laje.tipo !== 0 && laje.tipo !== 3) {
    return {
      laje,
      avisos: [`${laje.nome}: imposição de H só vale para laje maciça e laje comum não calculada`],
    };
  }
  const pesoProprio = s((potencia(modo)(1, 2) / (100 * 1)) * hS * s(parametros.densidade));
  return { laje: { ...laje, h: hS, pesoProprio }, avisos: [] };
};

// ===== TRADUÇÃO MECÂNICA de LAJECALC.BAS (gerada por traduz.py; não editar à mão) =====

/** Traducao mecanica de LAJECALC.BAS:4370-4979 (sub-rotina L_3744e). */
export function L_3744e(g: EstadoLajecalc): void {
  let L_BP102 = 0;
  let L_BP106 = 0;
  let L_BP10a = 0;
  let L_BP10e = 0;
  let L_BP112 = 0;
  let L_BP116 = 0;
  let L_BP11a = 0;
  let L_BP28 = 0;
  let L_BP2c = 0;
  let L_BP30 = 0;
  let L_BP34 = 0;
  let L_BPc2 = 0;
  let L_BPc6 = 0;
  let L_BPca = 0;
  let L_BPce = 0;
  let L_BPd2 = 0;
  let L_BPd6 = 0;
  let L_BPda = 0;
  let L_BPde = 0;
  let L_BPe2 = 0;
  let L_BPe6 = 0;
  let L_BPea = 0;
  let L_BPee = 0;
  let L_BPf2 = 0;
  let L_BPf6 = 0;
  let L_BPfa = 0;
  let L_BPfe = 0;
  let L_BP46 = g.matriz("!", []);
  let L_BP5c = g.matriz("!", []);
  let lim0 = 0;
  let passo0 = 0;
  let lim1 = 0;
  let passo1 = 0;
  let lim2 = 0;
  let passo2 = 0;
  let lim3 = 0;
  let passo3 = 0;
  let lim4 = 0;
  let passo4 = 0;
  let lim5 = 0;
  let passo5 = 0;
  let lim6 = 0;
  let passo6 = 0;
  L_BP5c = g.matriz("!", [
    [0, g.V_0e50],
    [0, 7],
  ]);
  const pilha: number[] = [];
  let pc = 0;
  for (;;) {
    switch (pc) {
      case 0:
        pc = 1;
        continue;
      case 1:
        // L_3744e
        g.A_15b0 = g.matriz("!", []); // 4803
        g.A_15de = g.matriz("!", []); // 4804
        g.A_15b0 = g.matriz("!", [[0, g.A_109e.get(qbCint(g.V_177c), 0)]]); // 4805
        g.A_15de = g.matriz("!", [[0, g.A_109e.get(qbCint(g.V_177c), 0)]]); // 4806
        L_BPc2 = g.s(g.A_109e.get(qbCint(g.V_177c), 0)); // 4807
        g.V_0f10 = g.s(1.0); // 4808
        lim0 = g.s(L_BPc2);
        passo0 = g.s(1);
        if (passo0 >= 0 ? g.V_0f10 > lim0 : g.V_0f10 < lim0) {
          pc = 30;
          continue;
        }
        pc = 29;
        continue;
      case 29:
        g.A_15b0.set(
          g.s(g.A_1070.get(g.A_109e.get(qbCint(g.V_177c), qbCint(g.V_0f10)), 0)),
          qbCint(g.V_0f10),
        ); // 4809
        g.A_15de.set(
          g.s(g.A_1070.get(g.A_109e.get(qbCint(g.V_177c), qbCint(g.V_0f10)), 1)),
          qbCint(g.V_0f10),
        ); // 4810
        g.V_0f10 = g.s(g.V_0f10 + passo0); // 4811
        if (passo0 >= 0 ? g.V_0f10 <= lim0 : g.V_0f10 >= lim0) {
          pc = 29;
          continue;
        }
        pc = 30;
        continue;
      case 30:
        L_BP28 = qbCint(0); // 4812
        g.V_1778 = g.s(g.A_1210.get(qbCint(g.V_177c), 0)); // 4813
        g.V_1758 = g.s(0.0); // 4814
        g.V_175c = g.s(0.0); // 4815
        pc = 2;
        continue;
      case 2:
        // L_37644
        if (!(g.V_1778 === 270.0 || g.V_1778 === 90.0)) {
          pc = 5;
          continue;
        } // 4817
        L_BPc6 = g.s(0.0); // 4818
        L_BPca = g.s(0.0); // 4819
        L_BPce = g.s(g.A_15b0.get(1)); // 4820
        L_BPd2 = g.s(g.A_15b0.get(1)); // 4821
        L_BPd6 = g.s(g.A_109e.get(qbCint(g.V_177c), 0)); // 4822
        g.V_0f10 = g.s(2.0); // 4823
        lim1 = g.s(L_BPd6);
        passo1 = g.s(1);
        if (passo1 >= 0 ? g.V_0f10 > lim1 : g.V_0f10 < lim1) {
          pc = 32;
          continue;
        }
        pc = 31;
        continue;
      case 31:
        if (!(g.A_15b0.get(qbCint(g.V_0f10)) < L_BPce)) {
          pc = 3;
          continue;
        } // 4824
        L_BPce = g.s(g.A_15b0.get(qbCint(g.V_0f10))); // 4825
        pc = 3;
        continue;
      case 3:
        // L_37772
        if (!(g.A_15b0.get(qbCint(g.V_0f10)) > L_BPd2)) {
          pc = 4;
          continue;
        } // 4827
        L_BPd2 = g.s(g.A_15b0.get(qbCint(g.V_0f10))); // 4828
        pc = 4;
        continue;
      case 4:
        // L_377ca
        g.V_0f10 = g.s(g.V_0f10 + passo1); // 4830
        if (passo1 >= 0 ? g.V_0f10 <= lim1 : g.V_0f10 >= lim1) {
          pc = 31;
          continue;
        }
        pc = 32;
        continue;
      case 32:
        pc = 8;
        continue; // 4831
      case 5:
        // L_377fe
        L_BPc6 = g.s(
          g.A_15de.get(1) - Math.tan((g.V_1778 * g.V_0e68_pi) / 180.0) * g.A_15b0.get(1),
        ); // 4833
        L_BPca = g.s(
          g.A_15de.get(1) - Math.tan((g.V_1778 * g.V_0e68_pi) / 180.0) * g.A_15b0.get(1),
        ); // 4834
        L_BPce = g.s(0.0); // 4835
        L_BPd2 = g.s(0.0); // 4836
        L_BPda = g.s(g.A_109e.get(qbCint(g.V_177c), 0)); // 4837
        g.V_0f10 = g.s(2.0); // 4838
        lim2 = g.s(L_BPda);
        passo2 = g.s(1);
        if (passo2 >= 0 ? g.V_0f10 > lim2 : g.V_0f10 < lim2) {
          pc = 34;
          continue;
        }
        pc = 33;
        continue;
      case 33:
        if (
          !(
            g.A_15de.get(qbCint(g.V_0f10)) -
              Math.tan((g.V_1778 * g.V_0e68_pi) / 180.0) * g.A_15b0.get(qbCint(g.V_0f10)) <
            L_BPc6
          )
        ) {
          pc = 6;
          continue;
        } // 4839
        L_BPc6 = g.s(
          g.A_15de.get(qbCint(g.V_0f10)) -
            Math.tan((g.V_1778 * g.V_0e68_pi) / 180.0) * g.A_15b0.get(qbCint(g.V_0f10)),
        ); // 4840
        pc = 6;
        continue;
      case 6:
        // L_379b0
        if (
          !(
            g.A_15de.get(qbCint(g.V_0f10)) -
              Math.tan((g.V_1778 * g.V_0e68_pi) / 180.0) * g.A_15b0.get(qbCint(g.V_0f10)) >
            L_BPca
          )
        ) {
          pc = 7;
          continue;
        } // 4842
        L_BPca = g.s(
          g.A_15de.get(qbCint(g.V_0f10)) -
            Math.tan((g.V_1778 * g.V_0e68_pi) / 180.0) * g.A_15b0.get(qbCint(g.V_0f10)),
        ); // 4843
        pc = 7;
        continue;
      case 7:
        // L_37a76
        g.V_0f10 = g.s(g.V_0f10 + passo2); // 4845
        if (passo2 >= 0 ? g.V_0f10 <= lim2 : g.V_0f10 >= lim2) {
          pc = 33;
          continue;
        }
        pc = 34;
        continue;
      case 34:
        pc = 8;
        continue;
      case 8:
        // L_37aa7
        L_BP2c = g.s((L_BPd2 - L_BPce) / 10.0); // 4847
        L_BP30 = g.s((L_BPca - L_BPc6) / 10.0); // 4848
        g.V_1750 = g.s(L_BPce + L_BP2c); // 4849
        g.V_1754 = g.s(L_BPc6 + L_BP30); // 4850
        g.V_0f0c = g.s(1.0); // 4851
        pc = 9;
        continue;
      case 9:
        // L_37b1c
        g.V_17e0 = g.V_1750; // 4853
        g.V_17f0 = g.V_1754; // 4854
        g.V_1678 = (g.V_1778 * g.V_0e68_pi) / 180.0; // 4855
        L_BP34 = g.s(0.0); // 4856
        L_BP46 = g.matriz("!", []); // 4857
        L_BP46 = g.matriz("!", [[0, 20]]); // 4858
        L_BPde = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 4859
        g.V_0f10 = g.s(1.0); // 4860
        lim3 = g.s(L_BPde);
        passo3 = g.s(1);
        if (passo3 >= 0 ? g.V_0f10 > lim3 : g.V_0f10 < lim3) {
          pc = 36;
          continue;
        }
        pc = 35;
        continue;
      case 35:
        g.V_17e8 = g.A_15b0.get(qbCint(g.V_0f10)); // 4861
        g.V_17f8 = g.A_15de.get(qbCint(g.V_0f10)); // 4862
        if (!(g.A_15b0.get(qbCint(g.V_0f10)) === g.A_15b0.get(qbCint(g.V_0f10 + 1.0)))) {
          pc = 10;
          continue;
        } // 4863
        g.V_1680 = g.V_0e68_pi / 2.0; // 4864
        pc = 11;
        continue; // 4865
      case 10:
        // L_37c84
        g.V_1680 = Math.atan(
          (g.A_15de.get(qbCint(g.V_0f10)) - g.A_15de.get(qbCint(g.V_0f10 + 1.0))) /
            (g.A_15b0.get(qbCint(g.V_0f10)) - g.A_15b0.get(qbCint(g.V_0f10 + 1.0))),
        ); // 4867
        pc = 11;
        continue;
      case 11:
        // L_37d15
        g.V_0f20 = "NAO"; // 4869
        S_23341(g); // 4870
        g.V_0f20 = ""; // 4872
        L_BPe2 = g.s(g.A_15b0.get(qbCint(g.V_0f10))); // 4873
        L_BPe6 = g.s(g.A_15b0.get(qbCint(g.V_0f10 + 1.0))); // 4874
        L_BPea = g.s(L_BPe2 < L_BPe6 ? L_BPe2 : L_BPe6); // 4875
        g.A_15b0.set(g.s(L_BPe6), qbCint(g.V_0f10 + 1.0)); // 4877
        g.A_15b0.set(g.s(L_BPe2), qbCint(g.V_0f10)); // 4878
        L_BPee = g.s(g.A_15b0.get(qbCint(g.V_0f10))); // 4879
        L_BPf2 = g.s(g.A_15b0.get(qbCint(g.V_0f10 + 1.0))); // 4880
        L_BPf6 = g.s(L_BPee > L_BPf2 ? L_BPee : L_BPf2); // 4881
        g.A_15b0.set(g.s(L_BPf2), qbCint(g.V_0f10 + 1.0)); // 4883
        g.A_15b0.set(g.s(L_BPee), qbCint(g.V_0f10)); // 4884
        if (!(L_BPf6 >= g.V_0ef4 && L_BPea <= g.V_0ef4)) {
          pc = 15;
          continue;
        } // 4885
        L_BPfa = g.s(g.A_15de.get(qbCint(g.V_0f10))); // 4886
        L_BPfe = g.s(g.A_15de.get(qbCint(g.V_0f10 + 1.0))); // 4887
        L_BP102 = g.s(L_BPfa < L_BPfe ? L_BPfa : L_BPfe); // 4888
        g.A_15de.set(g.s(L_BPfe), qbCint(g.V_0f10 + 1.0)); // 4890
        g.A_15de.set(g.s(L_BPfa), qbCint(g.V_0f10)); // 4891
        L_BP106 = g.s(g.A_15de.get(qbCint(g.V_0f10))); // 4892
        L_BP10a = g.s(g.A_15de.get(qbCint(g.V_0f10 + 1.0))); // 4893
        L_BP10e = g.s(L_BP106 > L_BP10a ? L_BP106 : L_BP10a); // 4894
        g.A_15de.set(g.s(L_BP10a), qbCint(g.V_0f10 + 1.0)); // 4896
        g.A_15de.set(g.s(L_BP106), qbCint(g.V_0f10)); // 4897
        if (!(L_BP10e >= g.V_0efc && L_BP102 <= g.V_0efc)) {
          pc = 14;
          continue;
        } // 4898
        if (
          !(
            (g.A_15de.get(qbCint(g.V_0f10 + 1.0)) === g.V_0efc &&
              g.A_15b0.get(qbCint(g.V_0f10 + 1.0)) === g.V_0ef4) ||
            (g.A_15de.get(qbCint(g.V_0f10)) === g.V_0efc &&
              g.A_15b0.get(qbCint(g.V_0f10)) === g.V_0ef4)
          )
        ) {
          pc = 12;
          continue;
        } // 4899
        pc = 13;
        continue; // 4900
      case 12:
        // L_3813b
        L_BP34 = g.s(L_BP34 + 1.0); // 4902
        L_BP46.set(
          g.raizS(g.pot(g.V_0ef4 - g.V_17e0, 2.0) + g.pot(g.V_0efc - g.V_17f0, 2.0)),
          qbCint(L_BP34),
        ); // 4903
        pc = 13;
        continue;
      case 13:
        // L_381a7
        pc = 14;
        continue;
      case 14:
        // L_381ac
        pc = 15;
        continue;
      case 15:
        // L_381b1
        g.V_0f10 = g.s(g.V_0f10 + passo3); // 4907
        if (passo3 >= 0 ? g.V_0f10 <= lim3 : g.V_0f10 >= lim3) {
          pc = 35;
          continue;
        }
        pc = 36;
        continue;
      case 36:
        L_BP112 = g.s(L_BP34 - 1.0); // 4908
        g.V_0f10 = g.s(1.0); // 4909
        lim4 = g.s(L_BP112);
        passo4 = g.s(1);
        if (passo4 >= 0 ? g.V_0f10 > lim4 : g.V_0f10 < lim4) {
          pc = 38;
          continue;
        }
        pc = 37;
        continue;
      case 37:
        L_BP116 = g.s(L_BP34); // 4910
        g.V_0f04 = g.s(g.V_0f10 + 1.0); // 4911
        lim5 = g.s(L_BP116);
        passo5 = g.s(1);
        if (passo5 >= 0 ? g.V_0f04 > lim5 : g.V_0f04 < lim5) {
          pc = 40;
          continue;
        }
        pc = 39;
        continue;
      case 39:
        if (!(L_BP46.get(qbCint(g.V_0f10)) > L_BP46.get(qbCint(g.V_0f04)))) {
          pc = 16;
          continue;
        } // 4912
        {
          const t = L_BP46.get(qbCint(g.V_0f10));
          L_BP46.set(L_BP46.get(qbCint(g.V_0f04)), qbCint(g.V_0f10));
          L_BP46.set(t, qbCint(g.V_0f04));
        } // 4913
        pc = 16;
        continue;
      case 16:
        // L_3829b
        g.V_0f04 = g.s(g.V_0f04 + passo5); // 4915
        if (passo5 >= 0 ? g.V_0f04 <= lim5 : g.V_0f04 >= lim5) {
          pc = 39;
          continue;
        }
        pc = 40;
        continue;
      case 40:
        g.V_0f10 = g.s(g.V_0f10 + passo4); // 4916
        if (passo4 >= 0 ? g.V_0f10 <= lim4 : g.V_0f10 >= lim4) {
          pc = 37;
          continue;
        }
        pc = 38;
        continue;
      case 38:
        g.V_0f04 = g.s(0.0); // 4917
        L_BP11a = g.s(L_BP34); // 4918
        g.V_0f10 = g.s(1.0); // 4919
        lim6 = g.s(L_BP11a);
        passo6 = g.s(2.0);
        if (passo6 >= 0 ? g.V_0f10 > lim6 : g.V_0f10 < lim6) {
          pc = 42;
          continue;
        }
        pc = 41;
        continue;
      case 41:
        if (!(L_BP46.get(qbCint(g.V_0f10 + 1.0)) - L_BP46.get(qbCint(g.V_0f10)) > g.V_0f04)) {
          pc = 17;
          continue;
        } // 4920
        g.V_0f04 = g.s(L_BP46.get(qbCint(g.V_0f10 + 1.0)) - L_BP46.get(qbCint(g.V_0f10))); // 4921
        L_BP5c.set(
          g.s(Math.abs(Math.cos(g.V_1678) * L_BP46.get(qbCint(g.V_0f10))) + g.V_17e0),
          0,
          0,
        ); // 4922
        L_BP5c.set(
          g.s(
            Math.sin(g.V_1678) *
              L_BP46.get(qbCint(g.V_0f10)) *
              (((3.0 * g.V_0e68_pi) / 2.0 > g.V_1678 && g.V_0e68_pi / 2.0 < g.V_1678 ? -1 : 0) * 2 +
                1) +
              g.V_17f0,
          ),
          0,
          1,
        ); // 4923
        L_BP5c.set(
          g.s(Math.abs(Math.cos(g.V_1678) * L_BP46.get(qbCint(g.V_0f10 + 1.0))) + g.V_17e0),
          0,
          2,
        ); // 4924
        L_BP5c.set(
          g.s(
            Math.sin(g.V_1678) *
              L_BP46.get(qbCint(g.V_0f10 + 1.0)) *
              (((3.0 * g.V_0e68_pi) / 2.0 > g.V_1678 && g.V_0e68_pi / 2.0 < g.V_1678 ? -1 : 0) * 2 +
                1) +
              g.V_17f0,
          ),
          0,
          3,
        ); // 4925
        pc = 17;
        continue;
      case 17:
        // L_3858f
        g.V_0f10 = g.s(g.V_0f10 + passo6); // 4927
        if (passo6 >= 0 ? g.V_0f10 <= lim6 : g.V_0f10 >= lim6) {
          pc = 41;
          continue;
        }
        pc = 42;
        continue;
      case 42:
        if (!(L_BP28 === 0)) {
          pc = 19;
          continue;
        } // 4928
        if (!(g.V_0f04 > g.V_1758)) {
          pc = 18;
          continue;
        } // 4929
        g.V_1758 = g.s(g.V_0f04); // 4930
        L_BP5c.set(g.s(L_BP5c.get(0, 0)), qbCint(g.V_177c), 0); // 4931
        L_BP5c.set(g.s(L_BP5c.get(0, 1)), qbCint(g.V_177c), 1); // 4932
        L_BP5c.set(g.s(L_BP5c.get(0, 2)), qbCint(g.V_177c), 2); // 4933
        L_BP5c.set(g.s(L_BP5c.get(0, 3)), qbCint(g.V_177c), 3); // 4934
        pc = 18;
        continue;
      case 18:
        // L_386e4
        pc = 21;
        continue; // 4936
      case 19:
        // L_386ec
        if (!(g.V_0f04 > g.V_175c)) {
          pc = 20;
          continue;
        } // 4938
        g.V_175c = g.s(g.V_0f04); // 4939
        L_BP5c.set(g.s(L_BP5c.get(0, 0)), qbCint(g.V_177c), 4); // 4940
        L_BP5c.set(g.s(L_BP5c.get(0, 1)), qbCint(g.V_177c), 5); // 4941
        L_BP5c.set(g.s(L_BP5c.get(0, 2)), qbCint(g.V_177c), 6); // 4942
        L_BP5c.set(g.s(L_BP5c.get(0, 3)), qbCint(g.V_177c), 7); // 4943
        pc = 20;
        continue;
      case 20:
        // L_3880b
        pc = 21;
        continue;
      case 21:
        // L_38810
        g.V_1754 = g.s(L_BP30 + g.V_1754); // 4946
        g.V_1750 = g.s(L_BP2c + g.V_1750); // 4947
        g.V_0f0c = g.s(g.V_0f0c + 1.0); // 4948
        if (!(g.V_0f0c >= 10.0)) {
          pc = 9;
          continue;
        } // 4949
        if (!(L_BP28 === 0)) {
          pc = 23;
          continue;
        } // 4950
        L_BP28 = qbCint(1); // 4951
        g.V_1778 = g.s(g.V_1778 + 90.0); // 4952
        if (!(g.V_1778 > 360.0)) {
          pc = 22;
          continue;
        } // 4953
        g.V_1778 = g.s(g.V_1778 - 360.0); // 4954
        pc = 22;
        continue;
      case 22:
        // L_388ca
        pc = 2;
        continue; // 4956
      case 23:
        // L_388d7
        L_BP34 = g.s(g.V_1758 / g.V_175c); // 4958
        g.V_1778 = g.s(g.A_123e.get(1, 1)); // 4959
        g.V_0f0c = g.s(2.0); // 4960
        pc = 24;
        continue;
      case 24:
        // L_38924
        if (!(g.A_123e.get(0, 0) >= g.V_0f0c)) {
          pc = 27;
          continue;
        } // 4962
        if (!(g.A_123e.get(qbCint(g.V_0f0c), 0) < L_BP34)) {
          pc = 25;
          continue;
        } // 4963
        g.V_1778 = g.s(g.A_123e.get(qbCint(g.V_0f0c), 1)); // 4964
        pc = 26;
        continue; // 4965
      case 25:
        // L_389af
        pc = 27;
        continue; // 4967
      case 26:
        // L_389bc
        g.V_0f0c = g.s(g.V_0f0c + 1.0); // 4969
        pc = 24;
        continue; // 4970
      case 27:
        // L_389da
        if (pilha.length === 0) return;
        pc = pilha.pop() ?? 0;
        continue; // 4972
      case 28:
        // L_389e9
        L_BP46 = g.matriz("!", []); // 4976
        L_BP5c = g.matriz("!", []); // 4977
        return;
      default:
        throw new Error(`L_3744e: pc ${pc}`);
    }
  }
}
