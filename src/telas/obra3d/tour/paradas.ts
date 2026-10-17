// Paradas do tour guiado, a partir do modelo e dos dados da vista (lógica pura, testada em
// paradas.test.ts): o prédio inteiro, cada nível de baixo para cima, as peças com falha e
// as afetadas por defeito do SISTRUT original. Cada peça entra uma vez só. Num nível com
// mais de LIMITE_POR_NIVEL peças do mesmo motivo, elas viram uma parada só (o tour de uma
// obra de 20 pavimentos não passa de 61 paradas).
import type { DadosElemento, Elemento3D, Modelo3D, TipoElemento } from "../api";

export type Parada =
  | { tipo: "todo" }
  | { tipo: "nivel"; nivel: number }
  | { tipo: "peca"; chave: string; motivo: "falha" | "defeito" }
  /** As peças de um nível com o mesmo motivo, juntas, na ordem das peças. */
  | { tipo: "grupo"; nivel: number; motivo: "falha" | "defeito"; chaves: string[] };

/** Peças do mesmo motivo num nível acima das quais elas viram uma parada só. */
export const LIMITE_POR_NIVEL = 3;

const ORDEM_TIPO: Record<TipoElemento, number> = {
  fundacao: 0,
  pilar: 1,
  viga: 2,
  laje: 3,
  escada: 4,
};

export const NOME_TIPO: Record<TipoElemento, string> = {
  laje: "Laje",
  viga: "Viga",
  pilar: "Pilar",
  escada: "Escada",
  fundacao: "Fundação",
};

/** De baixo para cima; no nível, fundação, pilares, vigas, lajes e escada; no tipo, pelo
 *  nome com os números em ordem (V2 antes de V10). */
function ordemDasPecas(a: Elemento3D, b: Elemento3D) {
  return (
    a.nivel - b.nivel ||
    ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo] ||
    a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })
  );
}

/** As paradas na ordem do tour. Os níveis sem laje, viga nem pilar ficam de fora (a vista
 *  não tem caixa para eles). */
export function montarParadas(
  modelo: Pick<Modelo3D, "niveis" | "elementos">,
  dados: ReadonlyMap<string, DadosElemento>,
): Parada[] {
  const paradas: Parada[] = [{ tipo: "todo" }];
  const comPecas = new Set(
    modelo.elementos
      .filter((e) => e.tipo === "laje" || e.tipo === "viga" || e.tipo === "pilar")
      .map((e) => e.nivel),
  );
  for (const n of modelo.niveis)
    if (comPecas.has(n.indice)) paradas.push({ tipo: "nivel", nivel: n.indice });
  const pecas = [...modelo.elementos].sort(ordemDasPecas);
  const falhas = pecas.filter((e) => dados.get(e.chave)?.estado === "falha");
  const vistas = new Set(falhas.map((e) => e.chave));
  const defeitos = pecas.filter(
    (e) => !vistas.has(e.chave) && (dados.get(e.chave)?.defeitos.length ?? 0) > 0,
  );
  for (const [lista, motivo] of [
    [falhas, "falha"],
    [defeitos, "defeito"],
  ] as const)
    for (const n of new Set(lista.map((e) => e.nivel))) {
      const doNivel = lista.filter((e) => e.nivel === n);
      if (doNivel.length > LIMITE_POR_NIVEL)
        paradas.push({ tipo: "grupo", nivel: n, motivo, chaves: doNivel.map((e) => e.chave) });
      else for (const e of doNivel) paradas.push({ tipo: "peca", chave: e.chave, motivo });
    }
  return paradas;
}

const SITUACAO: Record<DadosElemento["estado"], string> = {
  ok: "sem avisos",
  aviso: "com aviso",
  falha: "com falha",
  sem: "sem cálculo",
};

const metros = (m: number) =>
  `+${m.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;

/** Título e linhas de texto da parada, para a legenda na tela e o Painel. */
export function descreverParada(
  p: Parada,
  modelo: Pick<Modelo3D, "niveis" | "elementos">,
  dados: ReadonlyMap<string, DadosElemento>,
): { titulo: string; linhas: string[] } {
  const contarFalhas = (f: (e: Elemento3D) => boolean) =>
    modelo.elementos.filter((e) => f(e) && dados.get(e.chave)?.estado === "falha").length;
  if (p.tipo === "todo") {
    const falhas = contarFalhas(() => true);
    return {
      titulo: "Prédio inteiro",
      linhas: [
        `${modelo.niveis.length} ${modelo.niveis.length === 1 ? "nível" : "níveis"}, ${modelo.elementos.length} peças`,
        falhas === 0
          ? "Nenhuma peça com falha"
          : `${falhas} ${falhas === 1 ? "peça" : "peças"} com falha`,
      ],
    };
  }
  if (p.tipo === "nivel") {
    const n = modelo.niveis[p.nivel];
    const doNivel = (e: Elemento3D) => e.nivel === p.nivel;
    const pecas = modelo.elementos.filter(
      (e) => doNivel(e) && (e.tipo === "laje" || e.tipo === "viga" || e.tipo === "pilar"),
    ).length;
    const falhas = contarFalhas(doNivel);
    return {
      titulo: n ? `${n.nome} (${metros(n.cota)})` : "Nível",
      linhas: [
        `${pecas} peças (lajes, vigas e pilares)`,
        falhas === 0 ? "Nenhuma com falha" : `${falhas} com falha`,
      ],
    };
  }
  if (p.tipo === "grupo") {
    const nomes = p.chaves.flatMap((k) => {
      const e = modelo.elementos.find((x) => x.chave === k);
      return e ? [`${NOME_TIPO[e.tipo]} ${e.nome}`] : [];
    });
    const mostrar = 12;
    return {
      titulo: `${modelo.niveis[p.nivel]?.nome ?? "Nível"}: ${p.chaves.length} peças ${
        p.motivo === "falha" ? "com falha" : "afetadas por defeito do original"
      }`,
      linhas: [
        nomes.slice(0, mostrar).join(", ") +
          (nomes.length > mostrar ? ` e mais ${nomes.length - mostrar}` : ""),
      ],
    };
  }
  const e = modelo.elementos.find((x) => x.chave === p.chave);
  if (!e) return { titulo: "Peça que não existe mais", linhas: [] };
  const d = dados.get(e.chave);
  const linhas = [`${modelo.niveis[e.nivel]?.nome ?? "—"} · ${SITUACAO[d?.estado ?? "sem"]}`];
  if (d?.principal) linhas.push(d.principal);
  if (p.motivo === "falha" && d?.mensagens[0]) linhas.push(d.mensagens[0]);
  if (d?.defeitos[0]) linhas.push(`Defeito do original: ${d.defeitos[0]}`);
  return { titulo: `${NOME_TIPO[e.tipo]} ${e.nome}`, linhas };
}
