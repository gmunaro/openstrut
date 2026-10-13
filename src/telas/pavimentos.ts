// Edições puras da lista de pavimentos (Obra → Obra), usadas pela barra de
// pavimentos via useObra.editar. Devolvem a mesma obra quando nada muda, para
// não sujar o histórico de desfazer.
import { nomeLivre, novoId, pavimentoNovo } from "../dominio/criar";
import type { Obra, Pavimento } from "../dominio/obra";

const trocarPavimento = (obra: Obra, id: string, f: (p: Pavimento) => Pavimento): Obra => {
  let mudou = false;
  const pavimentos = obra.pavimentos.map((p) => {
    if (p.id !== id) return p;
    const novo = f(p);
    if (novo !== p) mudou = true;
    return novo;
  });
  return mudou ? { ...obra, pavimentos } : obra;
};

/** Pavimento vazio com o próximo nome "Pavimento <n>" livre, inserido na posição
 *  `indice` (0 = topo). Devolve a obra e o pavimento criado. */
export function adicionarPavimento(obra: Obra, indice = 0) {
  const nome = nomeLivre(
    "Pavimento ",
    obra.pavimentos.map((p) => p.nome),
  );
  const pavimento = pavimentoNovo(nome);
  const pavimentos = [...obra.pavimentos];
  pavimentos.splice(Math.max(0, Math.min(indice, pavimentos.length)), 0, pavimento);
  return { obra: { ...obra, pavimentos }, pavimento };
}

/** Problema com o nome proposto para o pavimento `id`, ou null se serve.
 *  O nome identifica o pavimento na acumulação de cargas dos pilares, por isso é único. */
export function problemaNomePavimento(obra: Obra, id: string, nome: string) {
  const n = nome.trim();
  if (n === "") return "O nome não pode ficar vazio.";
  if (obra.pavimentos.some((p) => p.id !== id && p.nome.trim() === n))
    return `Já existe um pavimento "${n}".`;
  return null;
}

export const renomearPavimento = (obra: Obra, id: string, nome: string) =>
  problemaNomePavimento(obra, id, nome) !== null
    ? obra
    : trocarPavimento(obra, id, (p) => (p.nome === nome.trim() ? p : { ...p, nome: nome.trim() }));

/** Pé-direito em m (> 0). Valor inválido não muda nada. */
export const alterarPeDireito = (obra: Obra, id: string, peDireito: number) =>
  !(peDireito > 0) || !Number.isFinite(peDireito)
    ? obra
    : trocarPavimento(obra, id, (p) => (p.peDireito === peDireito ? p : { ...p, peDireito }));

/** Repetições: inteiro ≥ 1. Valor inválido não muda nada. */
export const alterarRepeticoes = (obra: Obra, id: string, repeticoes: number) =>
  !Number.isInteger(repeticoes) || repeticoes < 1
    ? obra
    : trocarPavimento(obra, id, (p) => (p.repeticoes === repeticoes ? p : { ...p, repeticoes }));

/** Move o pavimento `delta` posições (−1 sobe para o topo, +1 desce para a base). */
export function moverPavimento(obra: Obra, id: string, delta: number) {
  const i = obra.pavimentos.findIndex((p) => p.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= obra.pavimentos.length || delta === 0) return obra;
  const pavimentos = [...obra.pavimentos];
  const [p] = pavimentos.splice(i, 1);
  if (!p) return obra;
  pavimentos.splice(j, 0, p);
  return { ...obra, pavimentos };
}

/** Apaga o pavimento; a obra fica sempre com pelo menos um. */
export function apagarPavimento(obra: Obra, id: string) {
  if (obra.pavimentos.length <= 1 || !obra.pavimentos.some((p) => p.id === id)) return obra;
  return { ...obra, pavimentos: obra.pavimentos.filter((p) => p.id !== id) };
}

/** Substitui a planta (lajes, vigas, pilares e pilares removidos) do destino por uma cópia da planta
 *  da origem, com ids novos. Nome, pé-direito e repetições do destino ficam. */
export function copiarPlanta(obra: Obra, origemId: string, destinoId: string) {
  const origem = obra.pavimentos.find((p) => p.id === origemId);
  if (!origem || origemId === destinoId) return obra;
  return trocarPavimento(obra, destinoId, (p) => ({
    ...p,
    lajes: origem.lajes.map((l) => ({ ...l, vinculos: { ...l.vinculos }, id: novoId() })),
    vigas: origem.vigas.map((v) => ({ ...v, id: novoId() })),
    pilares: origem.pilares.map((x) => ({ ...x, id: novoId() })),
    pilaresRemovidos: origem.pilaresRemovidos.map((r) => ({ ...r })),
  }));
}
