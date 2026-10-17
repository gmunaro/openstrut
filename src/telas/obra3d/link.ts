// Entrada "ver em 3D": abre a aba 3D da tela da obra já focada num elemento. Dois
// caminhos, os dois leves (não carregam three.js):
// - dentro do app (planta, resultados): `pedirVer3d({ pavimentoId, tipo, id })`;
// - por URL: `/obra?ver3d=<tipo>~<pavimentoId>~<id>` (`valorVer3d`), lido ao abrir a tela.
import { create } from "zustand";

export interface Ver3d {
  pavimentoId: string;
  tipo: "laje" | "viga" | "pilar";
  id: string;
}

export const PARAM_VER3D = "ver3d";

/** Valor do parâmetro de URL `ver3d`. */
export const valorVer3d = (v: Ver3d) =>
  [v.tipo, v.pavimentoId, v.id].map(encodeURIComponent).join("~");

/** Lê o valor de `ver3d` (aceita o valor entre aspas, como o router serializa strings). */
export function lerVer3d(valor: string | null | undefined): Ver3d | null {
  if (!valor) return null;
  const partes = valor.replace(/^"|"$/g, "").split("~").map(decodeURIComponent);
  const [tipo, pavimentoId, id] = partes;
  if (partes.length !== 3 || !pavimentoId || !id) return null;
  if (tipo !== "laje" && tipo !== "viga" && tipo !== "pilar") return null;
  return { tipo, pavimentoId, id };
}

/** Pedido de abrir a 3D num elemento; a tela da obra consome e zera. */
export const useVer3d = create<{ pedido: Ver3d | null; limpar: () => void }>()((set) => ({
  pedido: null,
  limpar: () => set({ pedido: null }),
}));

/** Abre a aba 3D focada no elemento (botão "ver em 3D" da planta ou dos resultados). */
export const pedirVer3d = (v: Ver3d) => useVer3d.setState({ pedido: v });
