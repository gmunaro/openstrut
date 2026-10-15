// Continuidade automática entre lajes do SISTRUT 4.0 (LAJECALC opção 1, LAGEOCAL).
import type { Continuidade, ContinuidadeAutomatica } from "../base/tipos";
import { qbCint, sng } from "../base/f32";

/** Continuidade automática (LAJECALC.BAS:3690-3731; livros_laje.md 1.3). Nas lajes
 *  do tipo 0, todo código de bordo ≠ 1 (livre) volta a 0 (apoiado). Depois, para
 *  cada par de lajes do tipo 0 do mesmo `grupo`, um lado de uma com os MESMOS dois
 *  `indicesVertices` de um lado da outra (em qualquer sentido), e nenhum dos dois
 *  livre, vira continuidade com o código CINT(relaçãoMáx·10 + 2) nos dois lados
 *  (22 = i 2,0 no padrão). Lado que só coincide em parte não vira continuidade
 *  (defeito D10 do livro, reproduzido). O código é inteiro e igual nos dois modos.
 *  E2E: L1 fica com 0/0/22/22 (x = 0, y = 10, x = 4, y = 5). */
export const continuidadeAutomatica: ContinuidadeAutomatica = (lajes, parametros) => {
  const codigo = qbCint(sng(parametros.relacaoNegPosMax) * 10 + 2);
  const novas = lajes.map((l) =>
    l.tipo === 0 ? { ...l, codigos: l.codigos.map((c) => (c !== 1 ? 0 : c)) } : { ...l },
  );
  const continuidades: Continuidade[] = [];
  const indice = (ind: readonly number[], k: number) => ind[k % ind.length];
  for (let a = 0; a < novas.length; a++) {
    const la = novas[a];
    if (!la || la.tipo !== 0) continue;
    for (let b = a + 1; b < novas.length; b++) {
      const lb = novas[b];
      if (!lb || lb.tipo !== 0 || la.grupo !== lb.grupo) continue;
      for (let f = 0; f < la.codigos.length; f++) {
        for (let h = 0; h < lb.codigos.length; h++) {
          const a0 = indice(la.indicesVertices, f);
          const a1 = indice(la.indicesVertices, f + 1);
          const b0 = indice(lb.indicesVertices, h);
          const b1 = indice(lb.indicesVertices, h + 1);
          const mesmoLado = (a1 === b0 && a0 === b1) || (a1 === b1 && a0 === b0);
          if (!mesmoLado || la.codigos[f] === 1 || lb.codigos[h] === 1) continue;
          continuidades.push({ lajeA: la.nome, bordoA: f, lajeB: lb.nome, bordoB: h });
          la.codigos[f] = codigo;
          lb.codigos[h] = codigo;
        }
      }
    }
  }
  return { lajes: novas, continuidades };
};
