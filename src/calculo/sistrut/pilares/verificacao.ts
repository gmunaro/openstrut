// PILAR.EXE opção 6, "Verificação de Pilares pela NB1": seção e armadura dadas,
// Nk e momentos iniciais característicos, comprimentos de flambagem; λ inteiro,
// casos de excentricidade acidental e ELU de cada caso.
//
// Fonte: PILAR.BAS:4482-5672 (FUN_3000_013c). Livro: livros_viga_pilar.md 2.1-2.11
// e conta à mão 3.2 (caso c). PLANO P1-P7, P16.
import type { Etapa } from "../../tipos";
import type { VerificaPilar, VerificacaoPilar } from "../base/tipos";
import { eluPilar } from "./elu";
import {
  casosExcentricidade,
  esbeltez,
  momentoDirecao,
  momentoTotal,
  situacaoPilar,
} from "./esforcos";
import { criaContexto, inercias, novoEstado, secaoCalculo } from "./secao";

/** Verificação NB1/78 do PILAR (PILAR.BAS:4482-5534). Caso c: 20×20, 4 φ12,5,
 *  Nk 17,37, le 3 → λ 52, "Compressao Centrada", Mx 0,35, MR 0,60 − 0,09 = 0,51, "ok". */
export const verificaPilar: VerificaPilar = (entrada, modo) => {
  const par = entrada.parametros;
  const m = entrada.materiais;
  const ctx = criaContexto(modo, {
    fck: m.fck,
    fyk: m.fyk,
    aco: m.classeAco,
    csf: m.gamaF,
    csc: m.gamaC,
    csa: m.gamaS,
    coefTensao: par.coeficienteTensao,
  });
  const { s, pot, raiz, raizS, k } = ctx;
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const secao = secaoCalculo(entrada.secao, par.bitolas, modo);
  const est = novoEstado(secao);
  // PILAR.BAS:4671-4673: só os fatores de unidade
  const nk = s(entrada.nk * par.coeficienteForca);
  const mxk = s(entrada.mxk * par.coeficienteForca * par.coeficienteMedida);
  const myk = s(entrada.myk * par.coeficienteForca * par.coeficienteMedida);
  const { jx, jy, area } = inercias(ctx, est);
  const lambdaX = esbeltez(modo, entrada.lxe, jy, area);
  const lambdaY = esbeltez(modo, entrada.lye, jx, area);
  const ec = s(raiz(par.coeficienteTensao * m.fck * 1000 + 35) * par.multiplicadorEc * 21);
  const lambdaEuler = raizS(
    (pot(k.pi, 2) / (par.coeficienteTensao * m.fck * k.c085)) * ec * m.gamaC,
  );
  memoria.push(
    { descricao: "Área da seção", valor: area, unidade: "cm²", ref: "PILAR.BAS:4192" },
    { descricao: "Jx", valor: jx, unidade: "cm⁴", ref: "PILAR.BAS:5604-5622" },
    { descricao: "Jy", valor: jy, unidade: "cm⁴", ref: "PILAR.BAS:5604-5622" },
    { descricao: "λx = CINT(Lxe/√(Jy/A)·100)", valor: lambdaX, ref: "PILAR.BAS:5631" },
    { descricao: "λy = CINT(Lye/√(Jx/A)·100)", valor: lambdaY, ref: "PILAR.BAS:5632" },
  );
  if (area < 0)
    avisos.push("Poligonal no sentido anti-horário: área negativa, resultado sem sentido (D-6).");
  const situacao = situacaoPilar(nk, mxk, myk);
  const resultado: VerificacaoPilar = {
    area,
    jx,
    jy,
    lambdaX,
    lambdaY,
    situacao,
    casos: [],
    ec,
    lambdaEuler,
    avisos,
    memoria,
  };
  const lMax = Math.max(lambdaX, lambdaY);
  if (lMax > 140)
    avisos.push(
      `λ = ${lMax} > 140: o original recomenda Csf = ${s(qbIntLocal(lMax - 140) / 100 + k.c14)}.`,
    );
  if (lambdaY > lambdaEuler || lambdaX > lambdaEuler)
    avisos.push("λ acima do λ de Euler (o original mostra F crítico).");
  if (lambdaY > 200 || lambdaX > 200) {
    avisos.push("λ > 200: o original recusa a verificação e volta à entrada (PILAR.BAS:5666).");
    return resultado;
  }
  const simetrica = (secao.tipo === 1 || secao.tipo === 2) && par.secoesSimetricas;
  const sinais = casosExcentricidade(mxk, myk, simetrica, par.excentricidades);
  const parAtuante = {
    excentricidadeMinima: par.excentricidadeMinima,
    verificaH30: par.verificaH30,
    coeficienteFluencia: par.coeficienteFluencia,
    lambdaFluencia: par.lambdaFluencia,
    fatorNkFluencia: par.fatorNkFluencia,
    fatorCargaFluencia: par.fatorCargaFluencia,
    ec,
  };
  sinais.forEach((sinal, i) => {
    const x = momentoDirecao(
      ctx,
      est,
      mxk >= 0 ? 270 : 90,
      nk,
      { mk: mxk, sinal: sinal.x, lambda: lambdaX, le: entrada.lxe, j: jy },
      parAtuante,
    );
    const y = momentoDirecao(
      ctx,
      est,
      myk < 0 ? 180 : 0,
      nk,
      { mk: myk, sinal: sinal.y, lambda: lambdaY, le: entrada.lye, j: jx },
      parAtuante,
    );
    const { mtot, angulo } = momentoTotal(ctx, x.total, y.total);
    ctx.integracoes = 0;
    const r = eluPilar(ctx, est, {
      nk,
      mx: x.total,
      my: y.total,
      mtot,
      angulo,
      lambdaX,
      lambdaY,
      lex: entrada.lxe,
      ley: entrada.lye,
      lambda2a: par.lambda2aOrdem,
    });
    const rotulo = `${i + 1}/${sinais.length}`;
    // onde o original trava (D-2) ou divide por Nk = 0 (D-3), o caso sai com `erro`, e só
    // ali: a tela escreve a situação na linha do caso
    resultado.casos.push({
      rotulo,
      mxa: x.ma + x.mc,
      mya: y.ma + y.mc,
      mx: x.total,
      my: y.total,
      mTotal: mtot,
      anguloAtuante: angulo,
      ...r,
    });
  });
  return resultado;
};

const qbIntLocal = (x: number) => Math.floor(x);
