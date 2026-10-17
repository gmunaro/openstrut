// Materiais, luzes e fundo padrão da vista 3D. As camadas que trocam materiais
// (definirMateriais) ou acrescentam luz partem destes valores para não destoar da vista.
import {
  DoubleSide,
  LineBasicMaterial,
  type Material,
  MeshBasicMaterial,
  MeshLambertMaterial,
} from "three";
import type { FabricaMateriais, PapelMaterial } from "./camadas";

/** Cor da seleção: o preenchimento "destaque" e o contorno da peça selecionada. */
export const COR_SELECAO = "#38bdf8";

/** Os materiais da vista. A vista chama a fábrica uma vez por papel e usa a mesma
 *  instância em todas as malhas daquele papel. "solido" e "fantasma" pegam a cor de
 *  cada peça do atributo `color` dos vértices (`vertexColors: true`). */
export const materiaisPadrao: FabricaMateriais = (papel: PapelMaterial): Material => {
  switch (papel) {
    case "solido":
      return new MeshLambertMaterial({
        vertexColors: true,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
    case "fantasma":
      return new MeshLambertMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      });
    case "arestas":
      return new LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.4 });
    case "destaque":
      return new MeshBasicMaterial({
        color: COR_SELECAO,
        transparent: true,
        // leve: a cor da peça (falha, aviso) continua visível sob a seleção, que se marca
        // mais pelo contorno ciano
        opacity: 0.2,
        depthTest: false,
      });
  }
};

/** Luzes da vista: céu (HemisphereLight), ambiente (AmbientLight) e sol
 *  (DirectionalLight, direção na cena, Y para cima). */
export const LUZES = {
  ceu: { cor: 0xffffff, chao: 0x64748b, intensidade: 1.6 },
  ambiente: { cor: 0xffffff, intensidade: 0.35 },
  sol: { cor: 0xffffff, intensidade: 1.4, direcao: [0.6, 1, 0.4] as [number, number, number] },
};

/** Cor de fundo da cena no tema escuro e no claro. */
export const FUNDO = { escuro: "#111827", claro: "#f1f5f9" };
