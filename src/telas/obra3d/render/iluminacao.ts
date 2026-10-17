// Luz do render: ambiente de estúdio (RoomEnvironment por PMREM), um sol com sombra e
// tone mapping neutro. As luzes do núcleo (LUZES) ficam mais fracas enquanto o render está
// ligado e voltam ao valor de antes na limpeza.
import {
  DirectionalLight,
  Group,
  HemisphereLight,
  Light,
  Mesh,
  NeutralToneMapping,
  PCFShadowMap,
  PMREMGenerator,
  type Sphere,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { type ContextoVista, LUZES } from "../api";

/** Intensidade do ambiente (RoomEnvironment) com a luz no fator 1. */
export const AMBIENTE = 0.4;
/** Quanto do céu (HemisphereLight) do núcleo fica no render: o ambiente faz o resto. */
const CEU_NO_RENDER = 0.25;

/** Posição do sol e caixa da câmera de sombra para cobrir uma esfera da cena: o sol fica
 *  a 2 raios do centro na direção `direcao` (normalizada aqui), olhando o centro; a caixa
 *  ortográfica tem meia largura = raio e vai de 1 a 3 raios de profundidade (com folga). */
export function ajusteDoSol(
  centro: { x: number; y: number; z: number },
  raio: number,
  direcao: readonly [number, number, number],
) {
  const r = Math.max(raio, 1);
  const [dx, dy, dz] = direcao;
  const n = Math.hypot(dx, dy, dz) || 1;
  return {
    posicao: {
      x: centro.x + (dx / n) * 2 * r,
      y: centro.y + (dy / n) * 2 * r,
      z: centro.z + (dz / n) * 2 * r,
    },
    meia: r,
    perto: 0.5 * r,
    longe: 3.5 * r,
  };
}

export interface Iluminacao {
  sol: DirectionalLight;
  /** Fator da luz (Painel): sol, ambiente e o resto do céu do núcleo. */
  definirLuz(fator: number): void;
  definirSombras(sim: boolean): void;
  /** Refaz a caixa da sombra e marca as peças sólidas (depois de "cena", "explodido" e
   *  "visibilidade"). */
  atualizar(eSolido: (m: Mesh) => boolean): void;
  limpar(): void;
}

/** Liga a luz do render na cena da vista. Celular (ponteiro grosso): sombra de 1024 px. */
export function ligarIluminacao(ctx: ContextoVista, fator: number, sombras: boolean): Iluminacao {
  const { cena, renderer } = ctx;
  const antes = {
    environment: cena.environment,
    environmentIntensity: cena.environmentIntensity,
    toneMapping: renderer.toneMapping,
    exposicao: renderer.toneMappingExposure,
    sombra: renderer.shadowMap.enabled,
    tipoSombra: renderer.shadowMap.type,
    autoSombra: renderer.shadowMap.autoUpdate,
  };
  // as luzes do núcleo, para escurecer e devolver
  const doNucleo = cena.children.filter((o): o is Light => o instanceof Light);
  const intensidades = doNucleo.map((l) => l.intensity);

  const pmrem = new PMREMGenerator(renderer);
  const sala = new RoomEnvironment();
  const ambiente = pmrem.fromScene(sala, 0.04);
  sala.dispose();
  pmrem.dispose();

  const grupo = new Group();
  grupo.name = "render: luz";
  const sol = new DirectionalLight(LUZES.sol.cor, LUZES.sol.intensidade);
  const celular = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  sol.shadow.mapSize.set(celular ? 1024 : 2048, celular ? 1024 : 2048);
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.03;
  grupo.add(sol, sol.target);
  cena.add(grupo);

  cena.environment = ambiente.texture;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  // a sombra só muda com a cena (o sol não segue a câmera): não redesenha a cada quadro
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  let comSombra = sombras;
  const definirLuz = (f: number) => {
    sol.intensity = LUZES.sol.intensidade * f;
    cena.environmentIntensity = AMBIENTE * f;
    doNucleo.forEach((l, i) => {
      const original = intensidades[i]!;
      l.intensity = l instanceof HemisphereLight ? original * CEU_NO_RENDER * f : 0;
    });
  };
  definirLuz(fator);
  sol.castShadow = comSombra;

  let ultimoSolido: (m: Mesh) => boolean = () => false;
  const atualizar = (eSolido: (m: Mesh) => boolean) => {
    ultimoSolido = eSolido;
    const esfera: Sphere = ctx.esferaVisivel();
    const a = ajusteDoSol(esfera.center, esfera.radius, LUZES.sol.direcao);
    sol.position.set(a.posicao.x, a.posicao.y, a.posicao.z);
    sol.target.position.copy(esfera.center);
    sol.target.updateMatrixWorld();
    const cam = sol.shadow.camera;
    cam.left = -a.meia;
    cam.right = a.meia;
    cam.top = a.meia;
    cam.bottom = -a.meia;
    cam.near = a.perto;
    cam.far = a.longe;
    cam.updateProjectionMatrix();
    cena.traverse((o) => {
      if (o instanceof Mesh && eSolido(o)) o.castShadow = o.receiveShadow = comSombra;
    });
    renderer.shadowMap.needsUpdate = true;
    ctx.pedirRender();
  };

  return {
    sol,
    definirLuz,
    definirSombras(sim) {
      comSombra = sim;
      sol.castShadow = sim;
      atualizar(ultimoSolido);
    },
    atualizar,
    limpar() {
      cena.remove(grupo);
      sol.dispose();
      doNucleo.forEach((l, i) => (l.intensity = intensidades[i]!));
      cena.environment = antes.environment;
      cena.environmentIntensity = antes.environmentIntensity;
      ambiente.dispose();
      renderer.toneMapping = antes.toneMapping;
      renderer.toneMappingExposure = antes.exposicao;
      renderer.shadowMap.enabled = antes.sombra;
      renderer.shadowMap.type = antes.tipoSombra;
      renderer.shadowMap.autoUpdate = antes.autoSombra;
    },
  };
}
