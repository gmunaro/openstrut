// Materiais PBR da camada "Render realista": os papéis do núcleo (camadas.ts) refeitos a
// partir de `materiaisPadrao`, com a mesma cor por vértice, a mesma opacidade do fantasma e
// a mesma cor de destaque, para o render não destoar da vista e das fotos.
import {
  type LineBasicMaterial,
  type Material,
  type MeshBasicMaterial,
  MeshStandardMaterial,
} from "three";
import { materiaisPadrao, type PapelMaterial } from "../api";

/** Opacidade das arestas no render: discretas, a luz já marca os cantos. */
export const OPACIDADE_ARESTAS = 0.18;

/** Material do papel no render. "solido" e "fantasma" viram MeshStandardMaterial com as
 *  propriedades de transparência, lados e polygonOffset do padrão; "arestas" e "destaque"
 *  são os do padrão, sem tone mapping (a cor da seleção fica exata). */
export function materialPBR(papel: PapelMaterial, rugosidade: number): Material {
  const base = materiaisPadrao(papel);
  if (papel === "arestas") {
    const m = base as LineBasicMaterial;
    m.opacity = OPACIDADE_ARESTAS;
    m.toneMapped = false;
    return m;
  }
  if (papel === "destaque") {
    (base as MeshBasicMaterial).toneMapped = false;
    return base;
  }
  const m = new MeshStandardMaterial({
    vertexColors: true,
    side: base.side,
    transparent: base.transparent,
    opacity: base.opacity,
    depthWrite: base.depthWrite,
    polygonOffset: base.polygonOffset,
    polygonOffsetFactor: base.polygonOffsetFactor,
    polygonOffsetUnits: base.polygonOffsetUnits,
    roughness: rugosidade,
    metalness: 0,
  });
  base.dispose();
  return m;
}
