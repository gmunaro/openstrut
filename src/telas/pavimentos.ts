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
  if (n === "") return "Digite um nome para o pavimento.";
  if (obra.pavimentos.some((p) => p.id !== id && p.nome.trim() === n))
    return `Já existe um pavimento "${n}". Escolha outro nome.`;
  return null;
}

export const renomearPavimento = (obra: Obra, id: string, nome: string) =>
  problemaNomePavimento(obra, id, nome) !== null
    ? obra
    : trocarPavimento(obra, id, (p) => (p.nome === nome.trim() ? p : { ...p, nome: nome.trim() }));

/** Problema com o pé-direito (m, > 0), ou null se serve. */
export function problemaPeDireito(n: number) {
  return !(n > 0) || !Number.isFinite(n)
    ? "O pé-direito precisa ser maior que zero, em metros (ex.: 2,80)."
    : null;
}

/** Problema com as repetições (inteiro ≥ 1), ou null se servem. */
export function problemaRepeticoes(n: number) {
  return !Number.isInteger(n) || n < 1 ? "Use um número inteiro de 1 ou mais." : null;
}

/** Pé-direito em m. Valor com `problemaPeDireito` não muda nada. */
export const alterarPeDireito = (obra: Obra, id: string, peDireito: number) =>
  problemaPeDireito(peDireito) !== null
    ? obra
    : trocarPavimento(obra, id, (p) => (p.peDireito === peDireito ? p : { ...p, peDireito }));

/** Repetições. Valor com `problemaRepeticoes` não muda nada. */
export const alterarRepeticoes = (obra: Obra, id: string, repeticoes: number) =>
  problemaRepeticoes(repeticoes) !== null
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

/**
 * Substitui a planta do destino por uma cópia da planta da origem, com ids novos: lajes,
 * vigas, pilares, pilares removidos e os dados do SISTRUT (cargas de ocupação,
 * alvenarias, trechos de pilar-parede e continuidades das lajes). As referências por id
 * (Viga.apoiaEm, TrechoPilar.pilar, ContinuidadeLajes.lajeA/lajeB) passam a apontar para
 * os elementos da cópia. Nome, pé-direito e repetições do destino ficam.
 */
export function copiarPlanta(obra: Obra, origemId: string, destinoId: string) {
  const origem = obra.pavimentos.find((p) => p.id === origemId);
  if (!origem || origemId === destinoId) return obra;
  const ids = new Map<string, string>();
  /** Cópia profunda do elemento com id novo, guardando o par antigo → novo. */
  const copia = <T extends { id: string }>(e: T): T => {
    const id = novoId();
    ids.set(e.id, id);
    return { ...structuredClone(e), id };
  };
  const lajes = origem.lajes.map(copia);
  const pilares = origem.pilares.map(copia);
  const vigas = origem.vigas.map(copia);
  const novoDe = (antigo: string) => ids.get(antigo) ?? antigo;
  const extras: Partial<Pavimento> = {};
  if (origem.cargasOcupacao) extras.cargasOcupacao = structuredClone(origem.cargasOcupacao);
  if (origem.alvenarias) extras.alvenarias = structuredClone(origem.alvenarias);
  if (origem.trechosPilares)
    extras.trechosPilares = origem.trechosPilares.map((t) => ({
      ...structuredClone(t),
      pilar: novoDe(t.pilar),
    }));
  if (origem.continuidadesLajes)
    extras.continuidadesLajes = origem.continuidadesLajes.map((c) => ({
      ...c,
      lajeA: novoDe(c.lajeA),
      ...(c.lajeB === undefined ? {} : { lajeB: novoDe(c.lajeB) }),
    }));
  return trocarPavimento(obra, destinoId, (p) => {
    // a planta do destino sai inteira, inclusive os dados do SISTRUT dela
    const {
      cargasOcupacao: _ocupacao,
      alvenarias: _alvenarias,
      trechosPilares: _trechos,
      continuidadesLajes: _continuidades,
      ...resto
    } = p;
    return {
      ...resto,
      lajes,
      vigas: vigas.map((v) => (v.apoiaEm ? { ...v, apoiaEm: v.apoiaEm.map(novoDe) } : v)),
      pilares,
      pilaresRemovidos: structuredClone(origem.pilaresRemovidos),
      ...extras,
    };
  });
}

/** Nome livre para a cópia de um pavimento: "<nome> (cópia)", "<nome> (cópia 2)"… */
function nomeDaCopia(obra: Obra, nome: string) {
  const usados = new Set(obra.pavimentos.map((p) => p.nome.trim()));
  let candidato = `${nome} (cópia)`;
  for (let n = 2; usados.has(candidato); n++) candidato = `${nome} (cópia ${n})`;
  return candidato;
}

/** Pavimento novo, logo acima do `id`, com a mesma planta (ids novos), o mesmo pé-direito
 *  e as mesmas repetições. Devolve a obra e o pavimento criado (undefined se `id` não existe). */
export function duplicarPavimento(obra: Obra, id: string) {
  const i = obra.pavimentos.findIndex((p) => p.id === id);
  const origem = obra.pavimentos[i];
  if (!origem) return { obra, pavimento: undefined };
  const novo = pavimentoNovo(nomeDaCopia(obra, origem.nome), origem.peDireito, origem.repeticoes);
  const pavimentos = [...obra.pavimentos];
  pavimentos.splice(i, 0, novo);
  const comCopia = copiarPlanta({ ...obra, pavimentos }, origem.id, novo.id);
  return { obra: comCopia, pavimento: comCopia.pavimentos[i] };
}
