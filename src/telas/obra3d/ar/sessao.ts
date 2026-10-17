// Sessão WebXR "immersive-ar" da camada: anel sobre a mesa ou o chão (hit-test), toque
// para pôr o prédio, giro com dois dedos e escala de maquete.
//
// O que vai para a AR é a própria cena da vista (ctx.cena), sem cópia de geometria: ela
// entra como filha de um grupo (a maquete) numa cena AR só com o anel e as luzes. Foco,
// filtros, cores, explodido e objetos de outras camadas aparecem como na vista. Durante
// a sessão:
// - o laço do núcleo continua no requestAnimationFrame da janela, mas `renderer.render`
//   fica trocado por uma função que só desenha a cena AR. O render com XR ligado
//   sobrescreve a câmera que recebe (xr.updateCamera); assim a câmera da vista fica intacta.
//   Os planos de corte que o núcleo passa ao renderer são guardados e levados à maquete;
// - as luzes da vista ficam apagadas (a direção delas giraria e escalaria com a maquete) e
//   a cena AR acende as mesmas LUZES fixas no mundo;
// - a órbita fica travada.
// `restaurar` desfaz tudo; roda no fim da sessão, num erro e ao desligar a camada.
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  type Light,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  type Plane,
  RingGeometry,
  Scene,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from "three";
import { type ContextoVista, LUZES } from "../api";
import { lerEstadoAr, mudarEstadoAr, type FaseAr } from "./estado";
import {
  anguloDosToques,
  caixaDasVisiveis,
  diferencaAngular,
  type EscalaAr,
  ehHorizontal,
  fatorDaEscala,
  matrizDaMaquete,
  rotacaoDeFrente,
} from "./maquete";
import { SEM_SELECT, Sobreposicao } from "./Sobreposicao";

/** Depois de um gesto de dois dedos, o "select" dos dedos que saem não posiciona. */
const PAUSA_DEPOIS_DO_GESTO_MS = 500;

let atual: SessaoAr | null = null;

/** Abre a sessão AR. Chame direto no clique: o navegador exige o gesto do usuário. */
export function abrirAr(ctx: ContextoVista) {
  if (atual || !navigator.xr) return;
  atual = new SessaoAr(ctx);
  void atual.iniciar(navigator.xr);
}

/** Sai da AR pelo caminho normal (o navegador encerra a sessão e avisa). */
export function sairDaAr() {
  atual?.sair();
}

/** Desfaz tudo agora (camada desligada ou vista fechada). */
export function encerrarAr() {
  atual?.restaurar();
}

/** Troca a escala (Painel ou sobreposição); com o prédio posto, ele muda na hora. */
export function escolherEscala(escala: EscalaAr) {
  mudarEstadoAr({ escala });
  atual?.reposicionar();
}

class SessaoAr {
  private readonly sobreposicao = document.createElement("div");
  private raizReact: Root | null = null;
  private sessao: XRSession | null = null;
  private fonteHit: XRHitTestSource | null = null;
  private readonly cenaAr = new Scene();
  private readonly maquete = new Group();
  private readonly anel = new Mesh(
    new RingGeometry(0.06, 0.08, 40).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: 0xffffff }),
  );
  private readonly cameraXr = new PerspectiveCamera(50, 1, 0.01, 500);
  private readonly renderer: WebGLRenderer;
  private readonly razaoPixel: number;
  private readonly tamanho = new Vector2();
  private readonly controlesLigados: boolean;
  private luzesDaVista: { luz: Light; visivel: boolean }[] = [];
  private planosAr: Plane[] = [];
  private caixa = new Box3();
  /** Onde está o prédio (mundo AR); null antes do primeiro toque. */
  private ponto: Vector3 | null = null;
  private rotacao = 0;
  /** Ponto do anel no quadro atual; null sem superfície. */
  private mira: Vector3 | null = null;
  private readonly olho = new Vector3();
  private readonly toques = new Map<number, { x: number; y: number }>();
  private anguloAnterior: number | null = null;
  private gestoAte = 0;
  private montada = false;
  private restaurada = false;

  constructor(private readonly ctx: ContextoVista) {
    this.renderer = ctx.renderer;
    this.razaoPixel = ctx.renderer.getPixelRatio();
    ctx.renderer.getSize(this.tamanho);
    this.controlesLigados = ctx.controles.enabled;
  }

  async iniciar(xr: XRSystem) {
    mudarEstadoAr({ fase: "abrindo", erro: null });
    this.montarSobreposicao();
    let sessao: XRSession;
    try {
      // sem await antes desta chamada: o pedido precisa do gesto do usuário
      sessao = await xr.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay"],
        domOverlay: { root: this.sobreposicao },
      });
    } catch (e) {
      return this.falhar(e);
    }
    if (this.restaurada) return void sessao.end().catch(() => {});
    this.sessao = sessao;
    sessao.addEventListener("end", this.aoTerminarSessao);
    try {
      const { ctx, renderer: r } = this;
      r.xr.addEventListener("sessionend", this.aoTerminarXr);
      this.desviarRender();
      ctx.travarControles(true);
      r.xr.enabled = true;
      r.xr.setReferenceSpaceType("local");
      // o laço vai direto ao WebXRManager: renderer.setAnimationLoop ligaria também um
      // laço na janela
      r.xr.setAnimationLoop(this.quadro);
      await r.xr.setSession(sessao);
      const viewer = await sessao.requestReferenceSpace("viewer");
      const fonte = await sessao.requestHitTestSource?.({ space: viewer });
      if (!fonte) throw new Error("o navegador não oferece hit-test");
      if (this.restaurada) {
        // cancelada enquanto abria
        fonte.cancel();
        return void sessao.end().catch(() => {});
      }
      this.fonteHit = fonte;
      sessao.addEventListener("select", this.aoTocar);
      this.montarCena();
      this.sobreposicao.hidden = false;
      this.mudarFase("procurando");
    } catch (e) {
      this.falhar(e);
    }
  }

  /** Botão "Sair": o fim da sessão chega por "end" e restaura. */
  sair() {
    if (this.sessao && this.renderer.xr.isPresenting)
      void this.sessao.end().catch(() => this.restaurar());
    else this.restaurar();
  }

  reposicionar() {
    if (!this.ponto) return;
    this.aplicarMatriz();
  }

  // ---- montagem ------------------------------------------------------------------------

  private montarSobreposicao() {
    const s = this.sobreposicao;
    s.hidden = true; // aparece quando a sessão abre (o dom-overlay a põe em tela cheia)
    s.dataset.arSobreposicao = "";
    s.className = "fixed inset-0 z-50";
    s.style.touchAction = "none";
    s.addEventListener("beforexrselect", this.antesDoSelect);
    s.addEventListener("pointerdown", this.aoApertar);
    s.addEventListener("pointermove", this.aoMover);
    s.addEventListener("pointerup", this.aoSoltar);
    s.addEventListener("pointercancel", this.aoSoltar);
    document.body.appendChild(s);
    this.raizReact = createRoot(s);
    this.raizReact.render(
      createElement(Sobreposicao, { aoSair: () => this.sair(), aoEscala: escolherEscala }),
    );
  }

  private montarCena() {
    const { ctx } = this;
    this.caixa = this.caixaVisivel();
    const { ceu, ambiente, sol } = LUZES;
    const luzSol = new DirectionalLight(sol.cor, sol.intensidade);
    luzSol.position.set(...sol.direcao);
    this.cenaAr.add(
      new HemisphereLight(ceu.cor, ceu.chao, ceu.intensidade),
      new AmbientLight(ambiente.cor, ambiente.intensidade),
      luzSol,
    );
    this.anel.matrixAutoUpdate = false;
    this.anel.visible = false;
    this.maquete.matrixAutoUpdate = false;
    this.maquete.visible = false;
    this.cenaAr.add(this.anel, this.maquete);
    for (const luz of ctx.luzes) {
      this.luzesDaVista.push({ luz, visivel: luz.visible });
      luz.visible = false;
    }
    this.maquete.add(ctx.cena);
    this.montada = true;
  }

  /** Daqui até `restaurar`, o núcleo não desenha (com o XR ligado, o render dele tomaria a
   *  câmera da vista); a sessão desenha a cena AR no laço do XR. */
  private desviarRender() {
    this.ctx.assumirDesenho(() => {});
  }

  /** Caixa do que aparece na vista agora; o modelo inteiro se nada aparece. */
  private caixaVisivel() {
    const { ctx } = this;
    const c = caixaDasVisiveis(
      ctx.modelo.elementos.map((e) => e.chave),
      (k) => ctx.estaVisivel(k),
      (k) => ctx.caixaDe(k),
    );
    return c.isEmpty() ? ctx.caixaNaCena() : c;
  }

  private aplicarMatriz() {
    if (!this.ponto) return;
    const fator = fatorDaEscala(lerEstadoAr().escala);
    this.maquete.matrix.copy(matrizDaMaquete(this.caixa, this.ponto, fator, this.rotacao));
    this.maquete.matrixWorldNeedsUpdate = true;
  }

  // ---- quadro --------------------------------------------------------------------------

  private quadro = (_tempo: number, frame?: XRFrame) => {
    const ref = this.renderer.xr.getReferenceSpace();
    if (!frame || !ref || !this.montada) return;
    const pose = frame.getViewerPose(ref);
    if (pose) {
      const p = pose.transform.position;
      this.olho.set(p.x, p.y, p.z);
    }
    const acerto = this.fonteHit ? frame.getHitTestResults(this.fonteHit)[0] : undefined;
    const m = acerto?.getPose(ref)?.transform.matrix;
    if (m && ehHorizontal(m)) {
      this.anel.matrix.fromArray(m);
      this.anel.visible = true;
      this.mira = (this.mira ?? new Vector3()).setFromMatrixPosition(this.anel.matrix);
    } else {
      this.anel.visible = false;
      this.mira = null;
    }
    if (!this.ponto) this.mudarFase(this.mira ? "mirando" : "procurando");
    // os planos de corte da vista (pórtico, camada de corte) levados à maquete
    this.planosAr = this.ctx.planosCorte().map((p) => p.clone().applyMatrix4(this.maquete.matrix));
    this.renderer.clippingPlanes = this.planosAr;
    this.renderer.render(this.cenaAr, this.cameraXr);
  };

  private mudarFase(fase: FaseAr) {
    if (lerEstadoAr().fase !== fase) mudarEstadoAr({ fase });
  }

  // ---- toque ---------------------------------------------------------------------------

  /** "select" da sessão (toque na tela fora dos controles): põe o prédio no anel. */
  private aoTocar = () => {
    if (this.toques.size > 1 || performance.now() < this.gestoAte || !this.mira) return;
    const primeiro = this.ponto === null;
    this.ponto = this.mira.clone();
    // a frente da vista para quem segura o celular; depois, o giro do usuário fica
    if (primeiro) this.rotacao = rotacaoDeFrente(this.ponto, this.olho);
    this.caixa = this.caixaVisivel();
    this.aplicarMatriz();
    this.maquete.visible = true;
    this.mudarFase("posicionado");
  };

  private antesDoSelect = (e: Event) => {
    if (e.target instanceof Element && e.target.closest(`[${SEM_SELECT}]`)) e.preventDefault();
  };

  private aoApertar = (e: PointerEvent) => {
    if (e.target instanceof Element && e.target.closest(`[${SEM_SELECT}]`)) return;
    this.toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.toques.size < 2) return;
    this.gestoAte = Number.POSITIVE_INFINITY;
    // o giro conta a partir da posição dos dois dedos agora
    const [a, b] = [...this.toques.values()];
    this.anguloAnterior = this.toques.size === 2 ? anguloDosToques(a!, b!) : null;
  };

  /** Dois dedos giram o prédio em torno da vertical do ponto onde ele está. */
  private aoMover = (e: PointerEvent) => {
    if (!this.toques.has(e.pointerId)) return;
    this.toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.toques.size !== 2) return;
    const [a, b] = [...this.toques.values()];
    const angulo = anguloDosToques(a!, b!);
    if (this.anguloAnterior !== null && this.ponto) {
      // horário na tela = horário visto de cima = rotação negativa em Y
      this.rotacao -= diferencaAngular(angulo, this.anguloAnterior);
      this.aplicarMatriz();
    }
    this.anguloAnterior = angulo;
  };

  private aoSoltar = (e: PointerEvent) => {
    if (!this.toques.delete(e.pointerId)) return;
    if (this.toques.size < 2) this.anguloAnterior = null;
    if (this.gestoAte === Number.POSITIVE_INFINITY && this.toques.size === 0)
      this.gestoAte = performance.now() + PAUSA_DEPOIS_DO_GESTO_MS;
  };

  // ---- fim -----------------------------------------------------------------------------

  private aoTerminarSessao = () => this.restaurar();

  /** Depois do fim da sessão o WebGLRenderer religa o laço dele na janela
   *  (onXRSessionEnd → animation.start()), que rodaria todo quadro sem fazer nada. Este
   *  aviso vem depois do dele: desliga o laço. */
  private aoTerminarXr = () => {
    this.renderer.xr.removeEventListener("sessionend", this.aoTerminarXr);
    this.renderer.setAnimationLoop(null);
    this.restaurar();
    this.devolverTamanho();
    this.ctx.pedirRender();
  };

  /** O WebXRManager devolve a razão de pixel e o tamanho no fim da sessão, mas com uma
   *  sessão que falhou no meio ele pode devolver valores que não guardou: volta aos de
   *  antes da sessão. */
  private devolverTamanho() {
    const r = this.renderer;
    if (r.xr.isPresenting) return;
    const agora = r.getSize(new Vector2());
    if (r.getPixelRatio() === this.razaoPixel && agora.equals(this.tamanho)) return;
    r.setPixelRatio(this.razaoPixel);
    r.setSize(this.tamanho.x, this.tamanho.y, false);
  }

  private falhar(e: unknown) {
    const texto = e instanceof Error ? e.message || e.name : String(e);
    const sessao = this.sessao;
    this.restaurar();
    if (sessao) void sessao.end().catch(() => {});
    mudarEstadoAr({ erro: `Não foi possível abrir a realidade aumentada (${texto}).` });
  }

  /** Desfaz tudo o que a sessão mudou; pode ser chamada mais de uma vez. */
  restaurar() {
    if (this.restaurada) return;
    this.restaurada = true;
    if (atual === this) atual = null;
    const { ctx, renderer: r } = this;
    r.xr.setAnimationLoop(null);
    if (!r.xr.isPresenting) r.setAnimationLoop(null);
    try {
      this.fonteHit?.cancel();
    } catch {
      // a fonte já acabou com a sessão
    }
    this.fonteHit = null;
    this.sessao?.removeEventListener("select", this.aoTocar);
    this.sessao?.removeEventListener("end", this.aoTerminarSessao);
    if (this.montada) {
      this.maquete.remove(ctx.cena);
      ctx.cena.updateMatrixWorld(true);
      for (const { luz, visivel } of this.luzesDaVista) luz.visible = visivel;
      this.luzesDaVista = [];
      this.montada = false;
    }
    ctx.assumirDesenho(null);
    r.xr.enabled = false;
    this.devolverTamanho();
    ctx.travarControles(!this.controlesLigados);
    this.anel.geometry.dispose();
    this.anel.material.dispose();
    this.cenaAr.clear();
    const s = this.sobreposicao;
    s.removeEventListener("beforexrselect", this.antesDoSelect);
    s.removeEventListener("pointerdown", this.aoApertar);
    s.removeEventListener("pointermove", this.aoMover);
    s.removeEventListener("pointerup", this.aoSoltar);
    s.removeEventListener("pointercancel", this.aoSoltar);
    this.raizReact?.unmount();
    this.raizReact = null;
    s.remove();
    if (r.xr.isPresenting) void this.sessao?.end().catch(() => {});
    mudarEstadoAr({ fase: "fora" });
    ctx.pedirRender();
  }
}
