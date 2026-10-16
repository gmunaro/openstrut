// Números nos textos que o usuário lê (avisos, falhas e memória de cálculo): vírgula
// decimal, como no resto da interface em pt-BR. Sem separador de milhar, para o número
// do texto ser o mesmo da tabela.

/** `v` com `casas` decimais fixas: num(17.5, 1) = "17,5". */
export const num = (v: number, casas: number) => v.toFixed(casas).replace(".", ",");

/** `v` com até `casas` decimais, sem zeros à direita: numAte(4, 2) = "4" e
 *  numAte(0.3499999940395355, 2) = "0,35" (o SINGLE que o original grava, formatado). */
export const numAte = (v: number, casas = 3) => String(Number(v.toFixed(casas))).replace(".", ",");
