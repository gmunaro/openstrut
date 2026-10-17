// Path tracing progressivo do render (three-gpu-pathtracer). Este arquivo só é baixado
// quando o usuário liga a opção: é o import dinâmico de camada.tsx, num pedaço "3d-"
// próprio. A vista desenha o quadro normal (raster) e, logo depois, no `onAfterRender` da
// cena, o traçador soma uma amostra e cobre o canvas com a imagem acumulada. Com a câmera
// mexendo, ele recomeça e deixa o raster aparecer.
import {
  CubeCamera,
  HalfFloatType,
  type Scene,
  type Texture,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { WebGLPathTracer } from "three-gpu-pathtracer";
import type { ContextoVista } from "../api";

/** Para de somar amostras aqui (a imagem já não muda a olho nu e a bateria agradece). */
export const AMOSTRAS_MAX = 256;
/** Tempo sem evento "camera" para começar a traçar, ms. */
const PARADA_MS = 300;

export interface Tracador {
  /** Amostras acumuladas na imagem atual (0 com a câmera mexendo). */
  amostras(): number;
  /** A câmera mexeu: recomeça a soma. */
  cameraMexeu(): void;
  /** A geometria, a seleção ou o explodido mudaram: refaz a BVH antes da próxima amostra. */
  cenaMudou(): void;
  /** Rugosidade ou luz mudaram. */
  materiaisMudaram(): void;
  limpar(): void;
}

/** Liga o path tracing na vista. `aoAmostrar` recebe o número de amostras a cada quadro;
 *  `aoFalhar`, o erro de uma amostra (o traçador para de tentar e a camada o desliga). */
export function ligarTracado(
  ctx: ContextoVista,
  aoAmostrar: (n: number) => void,
  aoFalhar: (e: unknown) => void,
): Tracador {
  const { renderer, cena } = ctx;
  // a biblioteca avisa no console que o caminho WebGL dela está depreciado (o novo é
  // WebGPU) e usa APIs que o three 0.186 marca como antigas; a vista é WebGL, então fica
  // assim até a vista ter um renderer WebGPU
  const pt = new WebGLPathTracer(renderer);
  pt.renderToCanvas = true;
  pt.rasterizeScene = false;
  pt.dynamicLowRes = false;
  pt.renderDelay = 0;
  pt.minSamples = 1;
  pt.fadeDuration = 0;
  pt.bounces = 4;
  pt.filterGlossyFactor = 0.5;
  // em tela de alta densidade, traça na resolução CSS: 4× menos raios, quase igual a olho nu
  pt.renderScale = 1 / Math.max(1, renderer.getPixelRatio());

  // O traçador lê o ambiente como textura equiretangular ou cubo, não como PMREM: a mesma
  // sala de estúdio do raster, num cubo, só para ele.
  const cubo = new WebGLCubeRenderTarget(128, { type: HalfFloatType });
  const sala = new RoomEnvironment();
  new CubeCamera(0.1, 100, cubo).update(renderer, sala);
  sala.dispose();

  /** Chama `f` com o ambiente da cena trocado pelo cubo (o traçador guarda o que leu). */
  const comCubo = (f: () => void) => {
    const env = cena.environment;
    cena.environment = cubo.texture as Texture;
    try {
      f();
    } finally {
      cena.environment = env;
    }
  };

  let sujo = true;
  let ultimoMovimento = performance.now();
  let camera = ctx.camera;
  let pararQuadro: (() => void) | null = null;
  let falhou = false;

  const amostras = () => (pt.samples >= 1 ? Math.floor(pt.samples) : 0);
  // a vista só desenha quando algo muda; enquanto soma, pede um quadro por vez
  const garantirQuadro = () => {
    if (pararQuadro) return;
    pararQuadro = ctx.aoQuadro(() => {
      aoAmostrar(amostras());
      if (amostras() >= AMOSTRAS_MAX) {
        pararQuadro?.();
        pararQuadro = null;
      }
    });
  };

  const proprio = Object.hasOwn(cena, "onAfterRender");
  const anterior = cena.onAfterRender;
  cena.onAfterRender = function (this: Scene, r, s, c, ...resto) {
    anterior.call(this, r, s, c, ...resto);
    // só o quadro da vista (não um render de outra camada para outra câmera)
    if (falhou || c !== ctx.camera || performance.now() - ultimoMovimento < PARADA_MS) return;
    try {
      if (sujo || camera !== ctx.camera) {
        camera = ctx.camera;
        comCubo(() => pt.setScene(cena, camera));
        sujo = false;
      }
      pt.pausePathTracing = amostras() >= AMOSTRAS_MAX;
      pt.renderSample();
    } catch (e) {
      falhou = true;
      aoFalhar(e);
    }
  };

  garantirQuadro();
  return {
    amostras,
    cameraMexeu() {
      ultimoMovimento = performance.now();
      if (camera !== ctx.camera) sujo = true;
      else pt.updateCamera();
      aoAmostrar(0);
      garantirQuadro();
    },
    cenaMudou() {
      sujo = true;
      pt.reset();
      garantirQuadro();
    },
    materiaisMudaram() {
      if (!sujo)
        comCubo(() => {
          pt.updateMaterials();
          pt.updateLights();
          pt.updateEnvironment();
        });
      garantirQuadro();
    },
    limpar() {
      pararQuadro?.();
      if (proprio) cena.onAfterRender = anterior;
      else delete (cena as { onAfterRender?: unknown }).onAfterRender;
      pt.dispose();
      cubo.dispose();
      ctx.pedirRender();
    },
  };
}
