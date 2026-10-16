// Estado limite último do pilar no SISTRUT: busca do equilíbrio por domínios,
// laço de curvatura, ajuste do ângulo da linha neutra, 2ª ordem pela curvatura e
// veredito. Duas variantes, como no original: a do PILAR (verificação de seção
// dada) e a do PILAREDI (dimensionamento).
//
// Fonte: PILAR.BAS:5015-5534 (L_33b0f) e 5574-5600 (Nmax); PILAREDI.BAS:5053-5425
// (L_482e8). Livro: livros_viga_pilar.md 2.8-2.11 e 2.13 item 6-7 (U49-007..015,
// U53-061, U53-062).
//
// Laço sem fim (D-2) e divisão por Nk = 0 (D-3): o original trava ou divide por
// zero. Aqui, nos dois modos, a busca para depois de LIMITE_INTEGRACOES
// integrações e o caso sai com `erro: "nao-converge"`; Nk = 0 no original sai com
// `erro: "nk-nulo"` sem calcular. No corrigido, a tolerância de 0,5 % passa a ser
// sobre max(|Nk|, 1 t).
import { ErroNaoConverge, qbCint, qbClng, qbInt } from "../base/f32";
import type { CasoPilar, VereditoPilar } from "../base/tipos";
import { type Contexto, type Estado, integra, normal, posiciona } from "./secao";

/** Teto de integrações por caso; o original não tem (U49-009, caso trava). */
export const LIMITE_INTEGRACOES = 400_000;

/** Erro de convergência da busca do equilíbrio: o original ficaria em laço (D-2). */
export const naoConverge = () =>
  new ErroNaoConverge("Busca do equilíbrio sem convergência (o original fica em laço sem fim)");

/** Esforços atuantes de um caso, como o ELU recebe. */
export interface AtuanteCaso {
  nk: number;
  /** Totais por direção e total CLNG, tm; ângulo do vetor, graus. */
  mx: number;
  my: number;
  mtot: number;
  angulo: number;
  lambdaX: number;
  lambdaY: number;
  /** Comprimentos de flambagem, m. */
  lex: number;
  ley: number;
  /** λ a partir do qual há 2ª ordem (V_0e72 = 40). */
  lambda2a: number;
}

/** Testa o equilíbrio: |Ns − Nk + Nc|/|Nk| > 0,5 % (PILAR.BAS:5078, 5147). O
 *  PILAREDI divide por Nk com sinal (PILAREDI.BAS:5105). Corrigido: max(|Nk|, 1). */
function foraDoEquilibrio(ctx: Contexto, est: Estado, nk: number, comSinal: boolean) {
  if (ctx.integracoes > LIMITE_INTEGRACOES) throw naoConverge();
  const div = ctx.modo === "corrigido" ? Math.max(Math.abs(nk), 1) : comSinal ? nk : Math.abs(nk);
  return Math.abs(est.ns - nk + est.nc) / div > ctx.k.c0005;
}

/** κ, ξ inicial (= sup) e faixa de ξ de um domínio 2-6 (PILAR.BAS:5031-5066). */
function iniciaDominio(ctx: Contexto, est: Estado, dom: number) {
  const { s, k, mat } = ctx;
  const eyd = (mat.aco === "B" ? k.c002 : 0) + (mat.coefTensao / (mat.csa * 2100)) * mat.fyk;
  const xiLim = s(1 / (eyd / k.c0035 + 1));
  const d = est.d;
  const h = est.altura;
  if (dom === 2) {
    est.kappa = s(k.c0135 / d);
    est.xi = k.xi23;
    return { inf: k.c001, sup: est.xi };
  }
  if (dom === 3) {
    est.kappa = s((eyd + k.c0035) / d);
    est.xi = xiLim;
    return { inf: k.xi23, sup: est.xi };
  }
  if (dom === 4) {
    est.kappa = s(k.c0035 / d);
    est.xi = 1;
    return { inf: xiLim, sup: 1 };
  }
  if (dom === 5) {
    est.kappa = s(k.c0035 / h);
    est.xi = s(h / d);
    return { inf: 1, sup: est.xi };
  }
  est.kappa = s((k.c002 / ((13 / (h * k.c37)) * d - 1) + k.c002) / (d * 13));
  est.xi = 13;
  return { inf: s(h / d), sup: 13 };
}

/** κ para o ξ corrente dentro do domínio (PILAR.BAS:5091-5108). */
function curvaturaDoDominio(ctx: Contexto, est: Estado, dom: number) {
  const { s, k } = ctx;
  const d = est.d;
  if (dom === 2) return s(k.c001 / ((1 - est.xi) * d));
  if (dom >= 3 && dom <= 5) return s(k.c0035 / (est.xi * d));
  return s((k.c002 / ((d / (est.altura * k.c37)) * est.xi - 1) + k.c002) / (est.xi * d));
}

/** Busca por domínios o (ξ, κu) com N = Nk, a partir do domínio 2 (PILAR.BAS:5031-5117;
 *  PILAREDI.BAS:5069-5135). `true` se convergiu; `false` se nem o domínio 6 alcança Nk. */
function buscaDominios(ctx: Contexto, est: Estado, nk: number, comSinal: boolean) {
  const { s } = ctx;
  for (let dom = 2; dom <= 6; dom++) {
    const { inf, sup } = iniciaDominio(ctx, est, dom);
    let passo = s((sup - inf) / 5);
    let refinando = false;
    for (;;) {
      integra(ctx, est);
      if (!refinando && !(normal(est) > nk)) break;
      if (!foraDoEquilibrio(ctx, est, nk, comSinal)) return true;
      if (normal(est) > nk) {
        est.xi = s(est.xi - passo);
        if (est.xi < inf) est.xi = inf;
      } else {
        passo = s(passo / 2);
        est.xi = s(est.xi + passo);
        if (est.xi > sup) est.xi = sup;
      }
      est.kappa = curvaturaDoDominio(ctx, est, dom);
      refinando = true;
    }
  }
  return false;
}

/** Momentos resistentes de 1ª ordem no sistema da seção, t·cm (PILAR.BAS:5183-5184). */
function momentosResistentes(ctx: Contexto, est: Estado) {
  const { s, k } = ctx;
  const ang = (est.theta * k.pi) / 180;
  const mx = est.mcx + est.msx;
  const my = est.mcy + est.msy;
  return {
    mrx: s(my * Math.cos(ang) - mx * Math.sin(ang)),
    mry: s(mx * Math.cos(ang) + my * Math.sin(ang)),
  };
}

/** Momentos de 2ª ordem pela curvatura: M2 = |(100·le)²·cos/sin(θ − 270°)/π²·Nk·κ|,
 *  só com λ ≥ 40 na direção, t·cm (PILAR.BAS:5206-5214; P5, U49-007). */
function segundaOrdem(ctx: Contexto, est: Estado, a: AtuanteCaso) {
  const { s, pot, k } = ctx;
  let m2x = 0;
  let m2y = 0;
  if (a.lambdaY >= a.lambda2a || a.lambdaX >= a.lambda2a) {
    const ang = s(((est.theta - 270) * k.pi) / 180);
    if (a.lambdaX >= a.lambda2a)
      m2x = s(Math.abs(((pot(100 * a.lex, 2) * Math.cos(ang)) / pot(k.pi, 2)) * a.nk * est.kappa));
    if (a.lambdaY >= a.lambda2a)
      m2y = s(Math.abs(((pot(100 * a.ley, 2) * Math.sin(ang)) / pot(k.pi, 2)) * a.nk * est.kappa));
  }
  return { m2x, m2y };
}

/** MR reduzido de M2 na direção do zero e o seu ângulo em graus, por quadrante; se
 *  M2 inverte o sinal de uma componente, o ângulo é o alvo θ0 (PILAR.BAS:5215-5257). */
function reduzido(
  ctx: Contexto,
  mrx: number,
  mry: number,
  m2x: number,
  m2y: number,
  theta0: number,
  anterior: number,
) {
  const { s, k } = ctx;
  const rx = mrx < 0 ? s(mrx + m2x) : s(mrx - m2x);
  const ry = mry < 0 ? s(mry + m2y) : s(mry - m2y);
  let a = anterior;
  if (ry > 0 && rx >= 0) a = s(2 * k.pi - Math.atan(rx / ry));
  if (ry > 0 && rx < 0) a = s(Math.atan(Math.abs(rx) / ry));
  if (ry <= 0 && rx <= 0) a = rx === 0 ? k.pi : s(k.pi / 2 + Math.atan(ry / rx));
  if (ry <= 0 && rx > 0) a = s((3 * k.pi) / 2 - Math.atan(Math.abs(ry) / rx));
  if (mry * ry < 0 || mrx * rx < 0) a = s((theta0 * k.pi) / 180);
  a = s((180 * a) / k.pi);
  if (theta0 < 180 && theta0 >= 0 && theta0 + 180 < a) a = s(a - 360);
  if (theta0 < 360 && theta0 >= 180 && a + 180 < theta0) a = s(a + 360);
  return { rx, ry, angulo: a };
}

/** Faixa do ajuste do ângulo da LN (V_11de, V_11e2, V_11e6, V_11ea, V_11fa). */
interface Faixa {
  abaixoTheta: number;
  abaixoAng: number;
  acimaTheta: number;
  acimaAng: number;
  passo: number;
}
const novaFaixa = (): Faixa => ({
  abaixoTheta: -1000,
  abaixoAng: -1000,
  acimaTheta: 1000,
  acimaAng: 1000,
  passo: 10,
});

/** Corrige θ quando o MR reduzido sai mais de 2° do alvo; devolve o novo θ ou
 *  null (PILAR.BAS:5258-5322; PILAREDI.BAS:5300-5345). O PILAREDI não ajusta a
 *  circular (`ajusta` falso).
 *
 *  Defeito D-17 (laço sem fim, v2par_pilar_trava): no ramo "ângulo acima do alvo"
 *  o passo cai à metade a CADA volta assim que há limite inferior (PILAR.BAS:5286;
 *  PILAREDI.BAS:5323), e o limite superior só é trocado por um ângulo menor
 *  (5261). A soma dos passos fica limitada (≤ 2·passo), θ converge para um ponto
 *  que não é a raiz, a faixa em θ nunca fica ≤ 1° (5280), o passo cai abaixo do
 *  ulp do SINGLE e o GOTO L_33c77 (5315) refaz a busca para sempre. Corrigido:
 *  bissecção na faixa assim que ela existe (o lado trocado é sempre o do sinal de
 *  ângulo − alvo); a faixa cai à metade a cada volta e o critério de 1° fecha
 *  em poucas voltas (teorema do valor intermediário; Burden e Faires, Análise
 *  Numérica, cap. 2). */
function ajustaAngulo(
  ctx: Contexto,
  f: Faixa,
  theta: number,
  theta0: number,
  angulo: number,
  ajusta = true,
) {
  const { s, k } = ctx;
  if (!(Math.abs(angulo - theta0) > 2)) return null;
  const corrigido = ctx.modo === "corrigido";
  if (angulo > theta0) {
    if (f.acimaAng > angulo || corrigido) {
      f.acimaAng = angulo;
      f.acimaTheta = theta;
    }
  } else if (f.abaixoAng < angulo || corrigido) {
    f.abaixoAng = angulo;
    f.abaixoTheta = theta;
  }
  const v1270 =
    f.acimaTheta + 180 < f.abaixoTheta && f.acimaTheta < 180 && f.acimaTheta >= 0 ? 360 : 0;
  const v1274 = f.acimaAng + 180 < f.abaixoAng && f.acimaAng < 180 && f.acimaAng >= 0 ? 360 : 0;
  if (
    !(
      ajusta &&
      Math.abs(f.acimaAng - (f.abaixoAng - v1274)) > 2 &&
      Math.abs(f.acimaTheta - (f.abaixoTheta - v1270)) > 1
    )
  )
    return null;
  if (corrigido && f.abaixoTheta !== -1000 && f.acimaTheta !== 1000)
    return normalizaAngulo(ctx, (f.acimaTheta + (f.abaixoTheta - v1270)) / 2);
  const limite = s(Math.abs(f.acimaTheta - f.abaixoTheta) * k.c09);
  let novo: number;
  if (angulo > theta0) {
    if (f.abaixoTheta !== -1000) f.passo = s(f.passo * 0.5);
    f.passo = f.passo < limite ? f.passo : limite;
    const dif = s(angulo - theta0);
    novo = s(theta - (f.passo < dif ? f.passo : dif));
  } else {
    f.passo = f.passo < limite ? f.passo : limite;
    const dif = s(theta0 - angulo);
    novo = s(theta + (f.passo < dif ? f.passo : dif));
  }
  return normalizaAngulo(ctx, novo);
}

function normalizaAngulo(ctx: Contexto, theta: number) {
  let t = theta;
  if (t < 0) t = ctx.s(360 + t);
  if (t > 360) t = ctx.s(t - 360);
  return t;
}

/** Resultado do ELU de um caso, sem os campos de atuante (que vêm de esforcos.ts). */
export type ResistenteCaso = Omit<
  CasoPilar,
  "rotulo" | "mxa" | "mya" | "mx" | "my" | "mTotal" | "anguloAtuante"
>;

/** Campos do estado final de um caso: ln, 1/r, x, deformações (PILAR.BAS:5440-5470). */
function situacaoFinal(ctx: Contexto, est: Estado) {
  const { s } = ctx;
  return {
    anguloLN: s(qbCint(10 * est.theta) / 10),
    curvatura: est.kappa,
    xLN: s(est.xi * est.d),
    xd: est.xi,
    deformacaoConcreto: s(1000 * est.epsC),
    deformacaoAco: s(1000 * est.epsAcoMax),
  };
}

/** ELU do PILAR (verificação NB1, PILAR.BAS:5015-5534) para um caso: θ0 = ângulo do
 *  atuante − 90; teste de Nmax (ξ = 12, κ = 0); busca de κu; laço κ = κu/10 + 8
 *  passos guardando o estado de maior |MR|; 2ª ordem; ajuste do ângulo; avanço de
 *  κ enquanto o MR reduzido não cobre o atuante; instabilidade (fator 1,03 e 1 t·cm)
 *  e "ok" com as três comparações ESTRITAS (D-7: ≥ no corrigido). */
export function eluPilar(ctx: Contexto, est: Estado, a: AtuanteCaso): ResistenteCaso {
  const { s, pot, raiz, raizS } = ctx;
  const vazio = (veredito: VereditoPilar): ResistenteCaso => ({
    ...situacaoFinal(ctx, est),
    mrx: 0,
    mry: 0,
    m2x: 0,
    m2y: 0,
    mrxReduzido: 0,
    mryReduzido: 0,
    mrTotal: 0,
    veredito,
  });
  if (ctx.modo === "original" && a.nk === 0) return { ...vazio("NAO"), erro: "nk-nulo" };
  let theta = s(a.angulo - 90);
  if (theta < 0) theta = s(360 + theta);
  const theta0 = theta;
  const faixa = novaFaixa();
  posiciona(ctx, est, theta);
  est.kappa = 0;
  est.xi = 12;
  integra(ctx, est);
  if (normal(est) < a.nk) return vazio("ESFORCOS SUPERIORES AOS MAXIMOS");
  ctx.integracoes = 0;
  // variáveis que o original mantém entre as voltas (V_120a, V_1212, V_1216...)
  let kU = 0;
  let dK = 0;
  let melhorXi = 0;
  let melhorK = 0;
  let melhorX = 0;
  let melhorY = 0;
  let melhor = -1;
  let marcou = false;
  let anguloMR = 0;
  try {
    for (;;) {
      const convergiu = buscaDominios(ctx, est, a.nk, false);
      if (convergiu) {
        const k0 = s(est.kappa / 10);
        kU = est.kappa;
        dK = s((kU - k0) / 8);
        est.kappa = k0;
        melhorXi = 0;
        melhorK = 0;
        melhor = -1;
        marcou = false;
      }
      let reinicia = false;
      for (let curvatura = convergiu; ;) {
        if (curvatura)
          lacoXi(ctx, est, a.nk, kU, () => {
            est.kappa = s(est.kappa + dK);
            if (est.kappa > kU) est.kappa = kU;
          });
        curvatura = true;
        // L_34740
        let { mrx, mry } = momentosResistentes(ctx, est);
        if (raiz(pot(mrx, 2) + pot(mry, 2)) > melhor) {
          melhorXi = est.xi;
          melhorK = est.kappa;
          melhorX = mrx;
          melhorY = mry;
          melhor = raizS(pot(mrx, 2) + pot(mry, 2));
          marcou = true;
        }
        if (
          (mry !== melhorY || mrx !== melhorX || est.xi !== melhorXi || est.kappa !== melhorK) &&
          melhor !== -1
        ) {
          mrx = melhorX;
          mry = melhorY;
          est.kappa = melhorK;
          est.xi = melhorXi;
          integra(ctx, est);
          marcou = false;
        }
        const { m2x, m2y } = segundaOrdem(ctx, est, a);
        const red = reduzido(ctx, mrx, mry, m2x, m2y, theta0, anguloMR);
        anguloMR = red.angulo;
        const novo = ajustaAngulo(ctx, faixa, est.theta, theta0, red.angulo);
        if (novo !== null) {
          posiciona(ctx, est, novo);
          reinicia = true;
          break;
        }
        est.theta = normalizaAngulo(ctx, est.theta);
        const mrAbs = raiz(pot(mrx, 2) + pot(mry, 2));
        const cobreX = (Math.abs(mrx) - m2x) / 100 < Math.abs(a.mx);
        const cobreY = (Math.abs(mry) - m2y) / 100 < Math.abs(a.my);
        const rTot = raiz(pot(Math.abs(mrx) - m2x, 2) + pot(Math.abs(mry) - m2y, 2));
        if (marcou && mrAbs / 100 < a.mtot) {
          if (est.kappa < kU) {
            est.kappa = s(est.kappa + dK);
            if (est.kappa > kU) est.kappa = kU;
            continue;
          }
        } else if (marcou && (cobreY || cobreX || rTot / 100 < a.mtot)) {
          if (est.kappa < kU) {
            est.kappa = s(est.kappa + dK);
            if (est.kappa > kU) est.kappa = kU;
            continue;
          }
        }
        return veredito(ctx, est, a, { mrx, mry, m2x, m2y, rx: red.rx, ry: red.ry });
      }
      if (!reinicia) break;
    }
  } catch (e) {
    if (e instanceof ErroNaoConverge) return { ...vazio("NAO"), erro: "nao-converge" };
    throw e;
  }
  return vazio("NAO");
}

/** Laço de ξ numa curvatura fixa (PILAR.BAS:5119-5180): ξ de 0,01 a 0,0035/(d·κ),
 *  primeiro o extremo inferior, depois o superior; sem equilíbrio no superior,
 *  aceita o estado. `avancaK` é chamado quando N > Nk já em ξ mínimo e κ < κu. */
function lacoXi(ctx: Contexto, est: Estado, nk: number, kU: number, avancaK: () => void) {
  const { s, k } = ctx;
  for (;;) {
    const inf = k.c001;
    const sup = s(1 / ((est.d * est.kappa - k.c0035) / k.c0035 + 1));
    est.xi = inf;
    let primeiro = true;
    let passo = s((sup - inf) / 5);
    let novoK = false;
    for (;;) {
      integra(ctx, est);
      if (!foraDoEquilibrio(ctx, est, nk, false)) return;
      if (normal(est) > nk) {
        if (est.xi === inf) {
          if (est.kappa === kU) return;
          avancaK();
          novoK = true;
          break;
        }
        est.xi = s(est.xi - passo);
        if (est.xi < inf) est.xi = inf;
      } else {
        if (est.xi === sup) return;
        if (primeiro && est.xi === inf) {
          est.xi = sup;
          primeiro = false;
        } else {
          passo = s(passo / 2);
          est.xi = s(est.xi + passo);
          if (est.xi > sup) est.xi = sup;
        }
      }
    }
    if (!novoK) return;
  }
}

/** Comparação do "ok" do PILAR: estrita no original (PILAR.BAS:5534, "3 x JBE");
 *  ≥ no corrigido (D-7: com momento nulo numa direção o original só aprova por
 *  ruído de cos 270° em SINGLE, e MR igual ao atuante atende a NB-1/78). */
export const cobre = (modo: Contexto["modo"]) =>
  modo === "original"
    ? (resistente: number, atuante: number) => resistente > atuante
    : (resistente: number, atuante: number) => resistente >= atuante;

/** Instabilidade e veredito do PILAR (PILAR.BAS:5342-5360, 5534; U49-015). */
function veredito(
  ctx: Contexto,
  est: Estado,
  a: AtuanteCaso,
  m: { mrx: number; mry: number; m2x: number; m2y: number; rx: number; ry: number },
): ResistenteCaso {
  const { s, pot, raiz, raizS, k } = ctx;
  const tm = (x: number) => s(x / 100);
  const base = {
    ...situacaoFinal(ctx, est),
    mrx: tm(m.mrx),
    mry: tm(m.mry),
    m2x: tm(m.m2x),
    m2y: tm(m.m2y),
    mrxReduzido: tm(m.rx),
    mryReduzido: tm(m.ry),
    mrTotal: tm(raiz(pot(m.ry, 2) + pot(m.rx, 2))),
  };
  const rTot = raiz(pot(Math.abs(m.mrx) - m.m2x, 2) + pot(Math.abs(m.mry) - m.m2y, 2));
  const quad2 = (pot(m.m2x, 2) + pot(m.m2y, 2)) * k.c103;
  const quad1 = pot(m.mrx, 2) + pot(m.mry, 2);
  let componente: "total" | "x" | "y" | null = null;
  if ((a.lambdaY >= a.lambda2a || a.lambdaX >= a.lambda2a) && (rTot * k.c103) / 100 < a.mtot)
    componente = "total";
  else if (
    Math.abs(m.m2y) - Math.abs(m.mry) > 1 ||
    Math.abs(m.m2x) - Math.abs(m.mrx) > 1 ||
    quad2 > quad1
  )
    componente = quad2 > quad1 ? "total" : Math.abs(m.m2x) - Math.abs(m.mrx) > 1 ? "x" : "y";
  if (componente !== null) {
    const [v1, v2, atuante] =
      componente === "total"
        ? [raizS(quad1), raizS(pot(m.m2x, 2) + pot(m.m2y, 2)), a.mtot]
        : componente === "x"
          ? [m.mrx, m.m2x, a.mx]
          : [m.mry, m.m2y, a.my];
    return {
      ...base,
      veredito: "INSTABILIDADE",
      instabilidade: {
        componente,
        m1: qbClng(v1) / 100,
        m2: qbClng(v2) / 100,
        atuante: s(qbInt(100 * atuante) / 100),
      },
    };
  }
  const maior = cobre(ctx.modo);
  const ok =
    maior((Math.abs(m.mry) - m.m2y) / 100, Math.abs(a.my)) &&
    maior((Math.abs(m.mrx) - m.m2x) / 100, Math.abs(a.mx)) &&
    maior(raiz(pot(m.ry, 2) + pot(m.rx, 2)) / 100, a.mtot);
  return { ...base, veredito: ok ? "ok" : "NAO" };
}

/** Estado do dimensionamento que o PILAREDI carrega de um caso para o outro e entre
 *  tentativas de armadura: ângulo inicial da LN (V_0fd4, −1 = o do atuante), sinal
 *  (V_106e$: "", "NAO", "DIMINUI") e fator de reescala da armadura (V_0ffa). */
export interface ControleDimensionamento {
  anguloInicial: number;
  sinal: "" | "NAO" | "DIMINUI";
  fator: number;
}

/** ELU do PILAREDI para o caso `caso` (1-based) (PILAREDI.BAS:5053-5425, L_482e8).
 *  Diferenças do PILAR: começa no ângulo guardado; laço de κ de 0,0035/(13d) a κu
 *  em 8 passos (5158); ξ entre max(0,01; ε 2 ‰; aço 10 ‰) e 3,5 ‰ (5163-5172); sem
 *  "melhor estado"; não ajusta o ângulo da circular; "NAO" com fator 1,1 (sem
 *  domínio), 1,2 (sem faixa de ξ) ou √(Mtot/MR); critério ≥ (não estrito) e
 *  "DIMINUI" quando todos os casos têm MR ≥ 1,05·Mtot (P8). Devolve null no "NAO". */
export function eluPilaredi(
  ctx: Contexto,
  est: Estado,
  a: AtuanteCaso,
  caso: number,
  circular: boolean,
  ctl: ControleDimensionamento,
): ResistenteCaso | null {
  const { s, pot, raiz, raizS, k } = ctx;
  const nao = (fator: number) => {
    ctl.sinal = "NAO";
    ctl.fator = fator;
    return null;
  };
  let theta0 = s(a.angulo - 90);
  if (theta0 < 0) theta0 = s(theta0 + 360);
  const faixa = novaFaixa();
  posiciona(ctx, est, ctl.anguloInicial === -1 ? theta0 : ctl.anguloInicial);
  let anguloMR = 0;
  for (;;) {
    if (!buscaDominios(ctx, est, a.nk, true)) return nao(k.c11);
    const d = est.d;
    const k0 = s(k.c0035 / (d * 13));
    const kU = est.kappa;
    const dK = s((kU - k0) / 8);
    est.kappa = k0;
    const avanca = () => {
      est.kappa = s(dK + est.kappa);
      if (est.kappa > kU) est.kappa = kU;
    };
    let reinicia = false;
    curvatura: for (;;) {
      const e2 = s(1 / ((d * est.kappa - k.c002) / k.c002 + 1));
      const e10 = s(1 / (k.c001 / (d * est.kappa - k.c001) + 1));
      let inf = e2 > e10 ? e2 : e10;
      inf = k.c001 > inf ? k.c001 : inf;
      const sup = s(1 / ((d * est.kappa - k.c0035) / k.c0035 + 1));
      est.xi = inf;
      let primeiro = true;
      let passo = s((sup - inf) / 5);
      if (passo < k.c001) {
        if (est.kappa === kU) return nao(k.c12);
        avanca();
        continue;
      }
      for (;;) {
        integra(ctx, est);
        if (!foraDoEquilibrio(ctx, est, a.nk, true)) break;
        if (normal(est) > a.nk) {
          if (est.xi === inf) {
            if (est.kappa === kU) break;
            avanca();
            continue curvatura;
          }
          est.xi = s(est.xi - passo);
          if (est.xi < inf) est.xi = inf;
        } else {
          if (est.xi === sup) return nao(k.c12);
          if (primeiro && est.xi === inf) {
            est.xi = sup;
            primeiro = false;
          } else {
            passo = s(passo / 2);
            est.xi = s(passo + est.xi);
            if (est.xi > sup) est.xi = sup;
          }
        }
      }
      // L_48f22
      const { mrx, mry } = momentosResistentes(ctx, est);
      const { m2x, m2y } = segundaOrdem(ctx, est, a);
      const red = reduzido(ctx, mrx, mry, m2x, m2y, theta0, anguloMR);
      anguloMR = red.angulo;
      const novo = ajustaAngulo(ctx, faixa, est.theta, theta0, red.angulo, !circular);
      if (novo !== null) {
        posiciona(ctx, est, novo);
        reinicia = true;
        break;
      }
      est.theta = normalizaAngulo(ctx, est.theta);
      ctl.anguloInicial = est.theta;
      const mr = raiz(pot(mrx, 2) + pot(mry, 2));
      if (mr / 100 < a.mtot) {
        if (est.kappa === kU) return nao(raizS((a.mtot / mr) * 100));
        avanca();
        continue;
      }
      const reduzidoTotal = raiz(pot(red.rx, 2) + pot(red.ry, 2));
      if (
        Math.abs(mry) - Math.abs(m2y) < 0 ||
        Math.abs(mrx) - Math.abs(m2x) < 0 ||
        (reduzidoTotal * k.c103) / 100 < a.mtot
      ) {
        if (est.kappa < kU) {
          avanca();
          continue;
        }
        return nao(raizS((a.mtot / Math.abs(mr - raiz(pot(m2x, 2) + pot(m2y, 2)))) * 100));
      }
      const tm = (x: number) => s(x / 100);
      const r: ResistenteCaso = {
        anguloLN: est.theta,
        curvatura: est.kappa,
        xLN: s(est.xi * est.d),
        xd: est.xi,
        deformacaoConcreto: s(1000 * est.epsC),
        deformacaoAco: s(1000 * est.epsAcoMax),
        mrx: tm(mrx),
        mry: tm(mry),
        m2x: tm(m2x),
        m2y: tm(m2y),
        mrxReduzido: tm(red.rx),
        mryReduzido: tm(red.ry),
        mrTotal: tm(raiz(pot(red.ry, 2) + pot(red.rx, 2))),
        veredito: "ok",
      };
      if (!(reduzidoTotal / 100 >= a.mtot)) {
        nao(raizS((a.mtot / reduzidoTotal) * 100));
        return null;
      }
      if (reduzidoTotal / 100 >= a.mtot * k.c105) {
        if (caso === 1) {
          ctl.sinal = "DIMINUI";
          ctl.fator = -1;
        } else if (ctl.sinal !== "DIMINUI") ctl.sinal = "";
        const f = raizS((a.mtot / reduzidoTotal) * 100);
        ctl.fator = ctl.fator > f ? ctl.fator : f;
        r.veredito = "DIMINUI";
      } else ctl.sinal = "";
      return r;
    }
    if (!reinicia) return null;
  }
}
