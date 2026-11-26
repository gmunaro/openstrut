// Os atos do tour guiado que contam a estrutura com o cálculo da obra (lógica pura,
// testada em historia.test.ts): a obra subindo, o caminho das cargas pela coluna mais
// carregada, a armadura de um lance dela e o Nk de todos os pilares. Nada é inventado: os
// valores são os de `dados` (o mesmo Nk da aba Resultados) e as etapas, as da sequência
// construtiva 4D.
import type { DadosElemento, Modelo3D } from "../api";

/** Lance de pilar no caminho das cargas: chave, nível e o Nk do cálculo (SI, kN). */
export interface LanceCarga {
  chave: string;
  nivel: number;
  nk: number;
}

/** A coluna mais carregada: a de maior Nk no lance de baixo (o que leva a carga de todos
 *  os pavimentos acima até a fundação). `lances` vai de cima para baixo, na ordem em que a
 *  carga desce; `fundacao` é a chave do bloco dela, se houver. */
export interface CaminhoCargas {
  nome: string;
  lances: LanceCarga[];
  fundacao: string | undefined;
}

/** O caminho das cargas da coluna mais carregada, ou undefined sem pilar calculado. Uma
 *  coluna entra só com Nk em todos os lances. */
export function caminhoDasCargas(
  modelo: Pick<Modelo3D, "colunas" | "elementos">,
  dados: ReadonlyMap<string, DadosElemento>,
): CaminhoCargas | undefined {
  let melhor: CaminhoCargas | undefined;
  for (const c of modelo.colunas) {
    const lances = c.chaves.flatMap((chave) => {
      const e = modelo.elementos.find((x) => x.chave === chave);
      const nk = dados.get(chave)?.grandeza;
      return e && nk !== undefined && Number.isFinite(nk) ? [{ chave, nivel: e.nivel, nk }] : [];
    });
    if (lances.length === 0 || lances.length !== c.chaves.length) continue;
    const base = lances[0]!.nk;
    if (melhor && base <= (melhor.lances.at(-1)?.nk ?? 0)) continue;
    const fundacao = modelo.elementos.find((e) => e.tipo === "fundacao" && e.coluna === c.id);
    melhor = { nome: c.nome, lances: lances.reverse(), fundacao: fundacao?.chave };
  }
  return melhor;
}

/** "Nk = 1.877,30 kN" do resultado principal do pilar, já na unidade da tela (dados.ts
 *  monta "Nk = …, Nd = …"). */
export function textoNk(d: DadosElemento | undefined): string | undefined {
  return d?.principal?.match(/^(Nk = .+?), Nd =/)?.[1];
}

/** Fração t (0 a 1) do Nk na faixa dos pilares, para a rampa de cor. */
export function fracaoNk(nk: number, faixa: { min: number; max: number }) {
  return faixa.max > faixa.min ? (nk - faixa.min) / (faixa.max - faixa.min) : 1;
}
