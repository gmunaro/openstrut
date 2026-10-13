// Estado da obra aberta: a obra, o pavimento ativo, a seleção e o histórico
// para desfazer/refazer. Toda edição passa por `editar`, com uma função pura
// Obra → Obra (as funções de src/dominio). O rascunho é salvo no IndexedDB
// por src/armazenamento (quem chama decide quando).
import { create } from "zustand";
import type { Obra } from "../dominio/obra";

/** Elemento selecionado na planta do pavimento ativo. */
export type Selecao = { tipo: "laje" | "viga" | "pilar"; id: string } | null;

const LIMITE_HISTORICO = 200;

interface EstadoObra {
  obra: Obra | null;
  pavimentoId: string | null;
  selecao: Selecao;
  passado: Obra[];
  futuro: Obra[];
  /** Abre uma obra (nova ou lida de arquivo) e zera o histórico. */
  abrir: (obra: Obra) => void;
  fechar: () => void;
  /** Aplica uma edição pura e guarda o estado anterior para desfazer. */
  editar: (f: (obra: Obra) => Obra) => void;
  desfazer: () => void;
  refazer: () => void;
  selecionarPavimento: (id: string) => void;
  selecionar: (s: Selecao) => void;
}

export const useObra = create<EstadoObra>()((set, get) => ({
  obra: null,
  pavimentoId: null,
  selecao: null,
  passado: [],
  futuro: [],
  abrir: (obra) =>
    set({
      obra,
      pavimentoId: obra.pavimentos[0]?.id ?? null,
      selecao: null,
      passado: [],
      futuro: [],
    }),
  fechar: () => set({ obra: null, pavimentoId: null, selecao: null, passado: [], futuro: [] }),
  editar: (f) => {
    const { obra, passado, pavimentoId, selecao } = get();
    if (!obra) return;
    const nova = f(obra);
    if (nova === obra) return;
    const pavs = nova.pavimentos;
    set({
      obra: nova,
      passado: [...passado, obra].slice(-LIMITE_HISTORICO),
      futuro: [],
      // o pavimento ativo pode ter sido apagado
      pavimentoId: pavs.some((p) => p.id === pavimentoId) ? pavimentoId : (pavs[0]?.id ?? null),
      selecao: existe(nova, pavimentoId, selecao) ? selecao : null,
    });
  },
  desfazer: () => {
    const { obra, passado, futuro } = get();
    const anterior = passado.at(-1);
    if (!obra || !anterior) return;
    set({
      obra: anterior,
      passado: passado.slice(0, -1),
      futuro: [obra, ...futuro],
      selecao: null,
    });
  },
  refazer: () => {
    const { obra, passado, futuro } = get();
    const proximo = futuro[0];
    if (!obra || !proximo) return;
    set({ obra: proximo, passado: [...passado, obra], futuro: futuro.slice(1), selecao: null });
  },
  selecionarPavimento: (id) => set({ pavimentoId: id, selecao: null }),
  selecionar: (selecao) => set({ selecao }),
}));

function existe(obra: Obra, pavimentoId: string | null, s: Selecao) {
  if (!s) return true;
  const pav = obra.pavimentos.find((p) => p.id === pavimentoId);
  if (!pav) return false;
  const lista = s.tipo === "laje" ? pav.lajes : s.tipo === "viga" ? pav.vigas : pav.pilares;
  return lista.some((e) => e.id === s.id);
}

/** O pavimento ativo da obra aberta. */
export const usePavimentoAtivo = () =>
  useObra((e) => e.obra?.pavimentos.find((p) => p.id === e.pavimentoId) ?? null);
