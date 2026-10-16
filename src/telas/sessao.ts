// Estado da sessão de trabalho que não faz parte da obra: o id do rascunho
// automático, o arquivo em disco ligado à obra aberta, a última versão salva
// em arquivo e a preferência de unidades (esta guardada no localStorage).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Obra } from "../dominio/obra";
import type { SistemaUnidades } from "./formato";

interface Sessao {
  rascunhoId: string | null;
  /** Arquivo em disco da obra (File System Access API); null = ainda não salvo ou modo download. */
  arquivo: FileSystemFileHandle | null;
  nomeArquivo: string | null;
  /** A obra como estava no último salvamento em arquivo (para marcar "não salvo"). */
  obraSalva: Obra | null;
  /** Versão do formato do arquivo aberto, quando ele foi migrado para a atual ao abrir
   *  (a tela avisa até salvar); null = arquivo já na versão atual, ou nenhum. */
  versaoMigrada: number | null;
  unidades: SistemaUnidades;
  /** Começa a sessão de uma obra recém-aberta. `salva` = obra que veio do arquivo. */
  iniciar: (
    rascunhoId: string,
    arquivo?: {
      handle: FileSystemFileHandle | null;
      nome: string;
      salva: Obra;
      versaoMigrada?: number;
    },
  ) => void;
  marcarSalvo: (obra: Obra, nome: string, handle: FileSystemFileHandle | null) => void;
  /** Fecha o aviso de arquivo migrado. */
  dispensarMigracao: () => void;
  definirUnidades: (u: SistemaUnidades) => void;
}

export const useSessao = create<Sessao>()(
  persist(
    (set) => ({
      rascunhoId: null,
      arquivo: null,
      nomeArquivo: null,
      obraSalva: null,
      versaoMigrada: null,
      unidades: "si",
      iniciar: (rascunhoId, arquivo) =>
        set({
          rascunhoId,
          arquivo: arquivo?.handle ?? null,
          nomeArquivo: arquivo?.nome ?? null,
          obraSalva: arquivo?.salva ?? null,
          versaoMigrada: arquivo?.versaoMigrada ?? null,
        }),
      // salvo, o arquivo já está na versão atual: o aviso de migração sai
      marcarSalvo: (obra, nome, handle) =>
        set((s) => ({
          obraSalva: obra,
          nomeArquivo: nome,
          arquivo: handle ?? s.arquivo,
          versaoMigrada: null,
        })),
      dispensarMigracao: () => set({ versaoMigrada: null }),
      definirUnidades: (unidades) => set({ unidades }),
    }),
    { name: "sistrut-v2:preferencias", partialize: (s) => ({ unidades: s.unidades }) },
  ),
);

/** Sistema de unidades da exibição. */
export const useUnidades = () => useSessao((s) => s.unidades);
