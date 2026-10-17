// Núcleo three.js da vista 3D: monta a cena a partir do modelo (modelo.ts), com a
// geometria mesclada por nível e tipo (uma malha sólida, uma transparente e as arestas
// por grupo: poucas chamadas de desenho mesmo em 20 pavimentos × 50 pilares), cor por
// vértice, foco (todo, nível, elemento com vizinhos, eixo), explodido, seleção, câmera
// com vistas prontas e o contexto das camadas (camadas.ts). Desenha só quando algo muda.
import {
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  MeshStandardMaterial,
  Raycaster,
  Scene,
  Sphere,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Obra } from "../../dominio/obra";
import type { Calculo } from "../calculo";
import type { ContextoVista, EventoVista, FabricaMateriais, PapelMaterial } from "./camadas";
import { COR_DEFEITO, COR_ESTADO, corNaRampa, NEUTRO, SEM_VALOR } from "./cores";
import { type DadosElemento, faixaDaGrandeza, GRANDEZAS, type GrandezaMapa } from "./dados";
import { type Malha, malhaVazia, paraCena, triangular } from "./geometria";
import type { Elemento3D, Modelo3D, TipoElemento } from "./modelo";
import { elementosNoEixo, type Foco, MEIA_FAIXA_EIXO, vizinhos } from "./partes";

export type Vista = "perspectiva" | "frente" | "lado" | "topo";
export type ModoCor = "estado" | GrandezaMapa;
export const TIPOS: readonly TipoElemento[] = ["laje", "viga", "pilar", "escada", "fundacao"];

/** Distância da câmera ao nível acima da qual as arestas somem (LOD), m. */
const LIMIAR_ARESTAS = 60;
const COR_SELECAO = "#38bdf8";

type Exibicao = "solido" | "fantasma" | "oculto";

interface GrupoTipo {
  solido: Mesh;
  fantasma: Mesh;
  arestas: LineSegments;
  /** Chaves das peças na malha sólida e o primeiro triângulo de cada (+ o total). */
  chaves: string[];
  inicios: number[];
}

interface GrupoNivel {
  grupo: Group;
  tipos: Map<TipoElemento, GrupoTipo>;
  marcas: Group;
  rotulo: Sprite | undefined;
}

export interface EstadoVisual {
  foco: Foco;
  /** No foco de nível, os níveis vizinhos aparecem transparentes (senão, ocultos). */
  vizinhosTransparentes: boolean;
  tiposOcultos: ReadonlySet<TipoElemento>;
  niveisOcultos: ReadonlySet<number>;
  explodido: boolean;
  modoCor: ModoCor;
  /** Mostrar as marcas dos defeitos do original. */
  marcas: boolean;
}

export const ESTADO_INICIAL: EstadoVisual = {
  foco: { tipo: "todo" },
  vizinhosTransparentes: true,
  tiposOcultos: new Set(),
  niveisOcultos: new Set(),
  explodido: false,
  modoCor: "estado",
  marcas: true,
};

const materiaisPadrao: FabricaMateriais = (papel: PapelMaterial): Material => {
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
        opacity: 0.45,
        depthTest: false,
      });
  }
};

const movimentoReduzido = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Placa com texto para rótulos e marcas (tamanho constante na tela). */
/** Placa com texto de `alturaPx` px de altura na tela (ajustarPlacas refaz a escala). */
function placa(texto: string, fundo: string, cor: string, alturaPx = 22): Sprite {
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  const px = 48;
  if (g) g.font = `600 ${px}px system-ui, sans-serif`;
  const largura = Math.ceil((g?.measureText(texto).width ?? px) + px * 0.8);
  c.width = largura;
  c.height = px * 1.5;
  if (g) {
    g.fillStyle = fundo;
    g.beginPath();
    g.roundRect(0, 0, c.width, c.height, px * 0.3);
    g.fill();
    g.font = `600 ${px}px system-ui, sans-serif`;
    g.fillStyle = cor;
    g.textBaseline = "middle";
    g.fillText(texto, px * 0.4, c.height / 2 + 2);
  }
  const tex = new CanvasTexture(c);
  const s = new Sprite(new SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false }));
  s.userData = { alturaPx, aspecto: c.width / c.height };
  s.renderOrder = 10;
  return s;
}

export interface OpcoesCena {
  obra: Obra;
  calculo: Calculo;
  modelo: Modelo3D;
  dados: ReadonlyMap<string, DadosElemento>;
  fundoEscuro: boolean;
}

export class Cena3D implements ContextoVista {
  readonly renderer: WebGLRenderer;
  readonly cena = new Scene();
  readonly controles: OrbitControls;
  private perspectiva = new PerspectiveCamera(45, 1, 0.1, 5000);
  private orto = new OrthographicCamera(-10, 10, 10, -10, -5000, 5000);
  camera: PerspectiveCamera | OrthographicCamera = this.perspectiva;
  private raiz = new Group();
  private niveis: GrupoNivel[] = [];
  private malhas = new Map<string, Malha>();
  private materiais: Record<PapelMaterial, Material>;
  private fabrica: FabricaMateriais = materiaisPadrao;
  private destaque = new Group();
  private planos = new Map<string, Plane[]>();
  private filtros = new Map<string, (e: Elemento3D) => boolean>();
  private ouvintes = new Map<EventoVista, Set<() => void>>();
  private quadros = new Set<(dt: number) => void>();
  private sujo = true;
  private animacao: number | null = null;
  private ultimo = performance.now();
  private observador: ResizeObserver;
  private porChave = new Map<string, Elemento3D>();
  private deslocamentos: number[] = [];
  private deslocamentosAlvo: number[] = [];
  private _selecao: string | null = null;
  private apontado: { x: number; y: number } | null = null;
  estado: EstadoVisual = ESTADO_INICIAL;
  obra: Obra;
  calculo: Calculo;
  modelo: Modelo3D;
  dados: ReadonlyMap<string, DadosElemento>;
  /** A vista atual (para os botões). */
  vista: Vista = "perspectiva";

  constructor(
    private conteiner: HTMLElement,
    opcoes: OpcoesCena,
  ) {
    this.obra = opcoes.obra;
    this.calculo = opcoes.calculo;
    this.modelo = opcoes.modelo;
    this.dados = opcoes.dados;
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.localClippingEnabled = false;
    const canvas = this.renderer.domElement;
    canvas.style.touchAction = "none";
    canvas.style.display = "block";
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "img");
    conteiner.appendChild(canvas);
    this.materiais = this.criarMateriais(materiaisPadrao);
    this.cena.background = new Color(opcoes.fundoEscuro ? "#111827" : "#f1f5f9");
    this.cena.add(new HemisphereLight(0xffffff, 0x64748b, 1.6));
    this.cena.add(new AmbientLight(0xffffff, 0.35));
    const sol = new DirectionalLight(0xffffff, 1.4);
    sol.position.set(0.6, 1, 0.4);
    this.cena.add(sol);
    this.cena.add(this.raiz);
    this.cena.add(this.destaque);

    this.controles = new OrbitControls(this.camera, canvas);
    this.controles.enableDamping = !movimentoReduzido();
    this.controles.screenSpacePanning = true;
    this.controles.listenToKeyEvents(canvas);
    this.controles.addEventListener("change", () => {
      this.sujo = true;
      this.emitir("camera");
    });
    canvas.addEventListener("pointerdown", this.aoApertar);
    canvas.addEventListener("pointerup", this.aoSoltar);

    this.observador = new ResizeObserver(() => this.redimensionar());
    this.observador.observe(conteiner);
    this.redimensionar();
    this.reconstruir();
    this.definirVista("perspectiva", false);
    this.laco();
  }

  // ---- ciclo de vida e desenho ----------------------------------------------------

  private laco = () => {
    this.animacao = requestAnimationFrame(this.laco);
    const agora = performance.now();
    const dt = (agora - this.ultimo) / 1000;
    this.ultimo = agora;
    for (const f of this.quadros) f(dt);
    this.animarExplodido(dt);
    const mexeu = this.controles.update(dt);
    if (this.sujo || mexeu || this.quadros.size > 0) this.desenhar();
  };

  /** Desenha já (a exportação PNG lê o canvas logo depois). */
  desenhar() {
    this.sujo = false;
    this.lodArestas();
    this.ajustarPlacas();
    this.renderer.clippingPlanes = [...this.planos.values()].flat();
    this.renderer.render(this.cena, this.camera);
  }

  pedirRender = () => {
    this.sujo = true;
  };

  private redimensionar() {
    const w = Math.max(1, this.conteiner.clientWidth);
    const h = Math.max(1, this.conteiner.clientHeight);
    this.renderer.setSize(w, h);
    this.perspectiva.aspect = w / h;
    this.perspectiva.updateProjectionMatrix();
    this.ajustarOrto();
    this.sujo = true;
  }

  private ajustarOrto(meiaAltura = (this.orto.top - this.orto.bottom) / 2) {
    const aspecto = this.perspectiva.aspect;
    this.orto.top = meiaAltura;
    this.orto.bottom = -meiaAltura;
    this.orto.left = -meiaAltura * aspecto;
    this.orto.right = meiaAltura * aspecto;
    this.orto.updateProjectionMatrix();
  }

  destruir() {
    if (this.animacao !== null) cancelAnimationFrame(this.animacao);
    this.observador.disconnect();
    this.controles.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.aoApertar);
    canvas.removeEventListener("pointerup", this.aoSoltar);
    this.limparGrupos();
    this.limparDestaque();
    for (const m of Object.values(this.materiais)) m.dispose();
    this.renderer.dispose();
    canvas.remove();
  }

  // ---- eventos ------------------------------------------------------------------------

  aoMudar(evento: EventoVista, f: () => void) {
    let s = this.ouvintes.get(evento);
    if (!s) this.ouvintes.set(evento, (s = new Set()));
    s.add(f);
    return () => void s.delete(f);
  }

  private emitir(evento: EventoVista) {
    for (const f of this.ouvintes.get(evento) ?? []) f();
  }

  // ---- materiais ------------------------------------------------------------------------

  private criarMateriais(f: FabricaMateriais) {
    return {
      solido: f("solido"),
      fantasma: f("fantasma"),
      arestas: f("arestas"),
      destaque: f("destaque"),
    } satisfies Record<PapelMaterial, Material>;
  }

  definirMateriais(f: FabricaMateriais | null) {
    for (const m of Object.values(this.materiais)) m.dispose();
    this.fabrica = f ?? materiaisPadrao;
    this.materiais = this.criarMateriais(this.fabrica);
    this.reconstruir();
  }

  // ---- geometria ---------------------------------------------------------------------------

  /** Malha de um elemento (cacheada; o modelo novo zera o cache). */
  malhaDe(chave: string): Malha {
    let m = this.malhas.get(chave);
    if (!m) {
      const el = this.porChave.get(chave);
      m = malhaVazia();
      for (const s of el?.solidos ?? []) triangular(m, s);
      this.malhas.set(chave, m);
    }
    return m;
  }

  /** Troca obra, cálculo, modelo e dados (a obra mudou) e refaz a cena. */
  atualizar(opcoes: Omit<OpcoesCena, "fundoEscuro">) {
    const modeloNovo = opcoes.modelo !== this.modelo;
    Object.assign(this, opcoes);
    if (modeloNovo) this.malhas.clear();
    if (this._selecao && !this.modelo.elementos.some((e) => e.chave === this._selecao))
      this.selecionar(null);
    this.reconstruir();
  }

  definirEstado(parcial: Partial<EstadoVisual>) {
    this.estado = { ...this.estado, ...parcial };
    // o explodido só move os grupos dos níveis: não refaz a geometria
    if (Object.keys(parcial).every((k) => k === "explodido")) {
      this.definirDeslocamentos();
      if (movimentoReduzido()) this.aplicarDeslocamentos();
      this.sujo = true;
      this.emitir("cena");
      return;
    }
    this.reconstruir();
  }

  /** Deslocamento vertical de cada nível no explodido (alvo da animação). */
  private definirDeslocamentos() {
    const n = this.modelo.niveis.length;
    const gap = this.estado.explodido ? this.vaoExplodido() : 0;
    this.deslocamentosAlvo = Array.from({ length: n }, (_, i) => i * gap);
    if (this.deslocamentos.length !== n || movimentoReduzido())
      this.deslocamentos = [...this.deslocamentosAlvo];
  }

  private aplicarDeslocamentos() {
    this.niveis.forEach((n, i) => (n.grupo.position.y = this.deslocamentos[i] ?? 0));
    this.atualizarPosicaoDestaque();
  }

  /** Como cada elemento aparece no foco e nos filtros atuais. */
  private exibicoes(): Map<string, Exibicao> {
    const { foco, tiposOcultos, niveisOcultos, vizinhosTransparentes } = this.estado;
    const mapa = new Map<string, Exibicao>();
    let solidos: Set<string> | null = null;
    let resto: Exibicao = "solido";
    let lajesFantasma = false;
    if (foco.tipo === "elemento") {
      solidos = vizinhos(this.modelo, foco.chave);
      resto = "fantasma";
      // as lajes vizinhas de uma viga ou de um pilar ficam transparentes: não escondem
      // os pilares e vigas de baixo
      lajesFantasma = this.porChave.get(foco.chave)?.tipo !== "laje";
    } else if (foco.tipo === "eixo") {
      const eixo = this.modelo.eixos.find((e) => e.chave === foco.chave);
      solidos = eixo ? elementosNoEixo(this.modelo, eixo) : new Set();
      resto = "oculto";
    }
    for (const e of this.modelo.elementos) {
      let x: Exibicao = solidos ? (solidos.has(e.chave) ? "solido" : resto) : "solido";
      if (lajesFantasma && e.tipo === "laje" && x === "solido") x = "fantasma";
      if (foco.tipo === "nivel") {
        const d = Math.abs(e.nivel - foco.nivel);
        x = d === 0 ? "solido" : d === 1 && vizinhosTransparentes ? "fantasma" : "oculto";
        if ((e.tipo === "fundacao" || e.tipo === "escada") && d !== 0) x = "oculto";
      }
      // no mapa de uma grandeza, os outros tipos ficam transparentes (contexto)
      const modo = this.estado.modoCor;
      if (x === "solido" && modo !== "estado" && GRANDEZAS[modo].tipo !== e.tipo) x = "fantasma";
      const filtrado = [...this.filtros.values()].some((f) => !f(e));
      if (tiposOcultos.has(e.tipo) || niveisOcultos.has(e.nivel) || filtrado) x = "oculto";
      mapa.set(e.chave, x);
    }
    return mapa;
  }

  private corDe(e: Elemento3D): string {
    const d = this.dados.get(e.chave);
    const modo = this.estado.modoCor;
    if (modo === "estado") {
      if (!d || d.estado === "sem") return NEUTRO[e.tipo];
      return COR_ESTADO[d.estado];
    }
    if (GRANDEZAS[modo].tipo !== e.tipo) return NEUTRO[e.tipo];
    const faixa = this.faixa;
    if (d?.grandeza === undefined || !faixa) return SEM_VALOR;
    const t = faixa.max > faixa.min ? (d.grandeza - faixa.min) / (faixa.max - faixa.min) : 1;
    return corNaRampa(t);
  }

  /** Faixa da grandeza do mapa de cor (para a legenda). */
  get faixa() {
    const modo = this.estado.modoCor;
    return modo === "estado" ? undefined : faixaDaGrandeza(this.modelo, this.dados, modo);
  }

  private limparGrupos() {
    for (const n of this.niveis) {
      n.grupo.traverse((o) => {
        if (o instanceof Mesh || o instanceof LineSegments) o.geometry.dispose();
        if (o instanceof Sprite) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
      this.raiz.remove(n.grupo);
    }
    this.niveis = [];
  }

  /** Refaz a geometria mesclada de todos os grupos (foco, cores, filtros, modelo). */
  reconstruir() {
    this.porChave = new Map(this.modelo.elementos.map((e) => [e.chave, e]));
    this.limparGrupos();
    const exib = this.exibicoes();
    const n = this.modelo.niveis.length;
    this.definirDeslocamentos();
    const cor = new Color();
    const original = this.obra.modoCalculo === "original";
    const foco = this.estado.foco;
    const mostraRotulos = foco.tipo !== "elemento";
    const eixo =
      foco.tipo === "eixo" ? this.modelo.eixos.find((x) => x.chave === foco.chave) : undefined;

    for (let i = 0; i < n; i++) {
      const grupo = new Group();
      grupo.name = this.modelo.niveis[i]!.nome;
      grupo.position.y = this.deslocamentos[i] ?? 0;
      const tipos = new Map<TipoElemento, GrupoTipo>();
      const marcas = new Group();
      for (const tipo of TIPOS) {
        const doGrupo = this.modelo.elementos.filter((e) => e.nivel === i && e.tipo === tipo);
        const sol = { p: [] as number[], n: [] as number[], c: [] as number[], a: [] as number[] };
        const fan = { p: [] as number[], n: [] as number[], c: [] as number[] };
        const chaves: string[] = [];
        const inicios: number[] = [];
        for (const e of doGrupo) {
          const x = exib.get(e.chave);
          if (x === "oculto") continue;
          const m = this.malhaDe(e.chave);
          cor.set(this.corDe(e));
          const alvo = x === "solido" ? sol : fan;
          if (x === "solido") {
            chaves.push(e.chave);
            inicios.push(sol.p.length / 9);
            for (let k = 0; k < m.arestas.length; k++) sol.a.push(m.arestas[k]!);
          }
          if (e.rotulo) marcas.add(this.rotuloDe(e, e.rotulo));
          // a marca do defeito aparece também na peça transparente (mapa de grandeza)
          const d = this.dados.get(e.chave);
          if (original && this.estado.marcas && d && d.defeitos.length > 0)
            marcas.add(this.marcaDefeito(e));
          for (let k = 0; k < m.posicoes.length; k++) {
            alvo.p.push(m.posicoes[k]!);
            alvo.n.push(m.normais[k]!);
          }
          for (let k = 0; k < m.posicoes.length / 3; k++) alvo.c.push(cor.r, cor.g, cor.b);
        }
        inicios.push(sol.p.length / 9);
        const solido = new Mesh(geometria(sol.p, sol.n, sol.c), this.materiais.solido);
        const fantasma = new Mesh(geometria(fan.p, fan.n, fan.c), this.materiais.fantasma);
        const ar = new BufferGeometry();
        ar.setAttribute("position", new Float32BufferAttribute(sol.a, 3));
        const arestas = new LineSegments(ar, this.materiais.arestas);
        solido.name = `${grupo.name} ${tipo}`;
        solido.userData = { tipo };
        fantasma.renderOrder = 1;
        solido.visible = sol.p.length > 0;
        fantasma.visible = fan.p.length > 0;
        grupo.add(solido, fantasma, arestas);
        tipos.set(tipo, { solido, fantasma, arestas, chaves, inicios });
      }
      grupo.add(marcas);
      let rotulo: Sprite | undefined;
      const nv = this.modelo.niveis[i]!;
      const visivel = [...exib].some(
        ([k, x]) => x !== "oculto" && this.porChave.get(k)?.nivel === i,
      );
      if (mostraRotulos && visivel) {
        rotulo = placa(
          `${nv.nome}  +${nv.cota.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          "rgba(15,23,42,0.75)",
          "#f8fafc",
          20,
        );
        const c = this.modelo.caixa;
        // no pórtico, o rótulo fica dentro da faixa do corte (senão o corte o apaga)
        const rx = eixo?.direcao === "x" ? eixo.c : c.min.x - 0.6;
        const ry = eixo?.direcao === "y" ? eixo.c : c.min.y - 0.6;
        rotulo.position.set(...paraCena(rx, ry, nv.cota));
        rotulo.center.set(1, 0.5);
        grupo.add(rotulo);
      }
      this.raiz.add(grupo);
      this.niveis.push({ grupo, tipos, marcas, rotulo });
    }
    const planosEixo = this.planosDoEixo();
    if (planosEixo.length > 0) this.planos.set("eixo", planosEixo);
    else this.planos.delete("eixo");
    // a seleção que saiu do foco (oculta) deixa de valer
    if (this._selecao && exib.get(this._selecao) === "oculto") this.selecionar(null);
    this.atualizarDestaque();
    this.sujo = true;
    this.emitir("cena");
  }

  private vaoExplodido() {
    const pds = this.modelo.niveis.map((n) => n.cota - n.cotaPiso);
    const medio = pds.reduce((t, x) => t + x, 0) / Math.max(1, pds.length);
    return Math.max(1.5, 0.8 * medio);
  }

  private animarExplodido(dt: number) {
    let mexeu = false;
    this.deslocamentos = this.deslocamentos.map((y, i) => {
      const alvo = this.deslocamentosAlvo[i] ?? 0;
      if (Math.abs(alvo - y) < 1e-3) return alvo;
      mexeu = true;
      return y + (alvo - y) * Math.min(1, dt * 8);
    });
    if (!mexeu) return;
    this.aplicarDeslocamentos();
    this.sujo = true;
    this.emitir("cena");
  }

  alturaNaCena = (indiceNivel: number, cota: number) =>
    cota + (this.deslocamentosAlvo[indiceNivel] ?? 0);

  /** Rótulo de uma peça (escada), em cima dela. */
  private rotuloDe(e: Elemento3D, texto: string) {
    const m = this.malhaDe(e.chave);
    const s = placa(texto, "rgba(68,64,60,0.85)", "#fafaf9", 18);
    const [x, , z] = centroDe(m.posicoes);
    let topo = -Infinity;
    for (let k = 1; k < m.posicoes.length; k += 3) topo = Math.max(topo, m.posicoes[k]!);
    s.position.set(x, topo + 0.2, z);
    s.center.set(0.5, 0);
    return s;
  }

  /** Marca de defeito do original: placa "!" em cima do elemento (não só a cor). */
  private marcaDefeito(e: Elemento3D) {
    const m = this.malhaDe(e.chave);
    const s = placa("!", COR_DEFEITO, "#ffffff", 26);
    const [x, , z] = centroDe(m.posicoes);
    let topo = -Infinity;
    for (let k = 1; k < m.posicoes.length; k += 3) topo = Math.max(topo, m.posicoes[k]!);
    s.position.set(x, topo + 0.3, z);
    s.center.set(0.5, 0);
    s.userData = { ...s.userData, chave: e.chave, marca: true };
    return s;
  }

  /** Escala das placas (sizeAttenuation false) para a altura em px pedida: na perspectiva
   *  1 unidade = H / (2·tan(fov/2)) px; na ortográfica, H·zoom / (top − bottom) px. */
  private ajustarPlacas() {
    const h = Math.max(1, this.renderer.domElement.clientHeight);
    // tela estreita (celular): placas menores, para os rótulos caberem ao lado do prédio
    const fator = this.renderer.domElement.clientWidth < 520 ? 0.7 : 1;
    const porPx =
      this.camera instanceof PerspectiveCamera
        ? (2 * Math.tan((this.camera.fov * Math.PI) / 360)) / h
        : (this.orto.top - this.orto.bottom) / this.orto.zoom / h;
    for (const n of this.niveis)
      n.grupo.traverse((o) => {
        if (!(o instanceof Sprite)) return;
        const { alturaPx, aspecto } = o.userData as { alturaPx: number; aspecto: number };
        const k = alturaPx * fator * porPx;
        o.scale.set(k * aspecto, k, 1);
      });
  }

  /** Esconde as arestas dos níveis longe da câmera (LOD simples). */
  private lodArestas() {
    const cam = this.camera.position;
    const orto = this.camera instanceof OrthographicCamera;
    const meia = (this.orto.top - this.orto.bottom) / 2 / this.orto.zoom;
    for (const n of this.niveis) {
      let perto: boolean;
      if (orto) perto = meia < LIMIAR_ARESTAS / 2;
      else {
        const nv = this.modelo.niveis[this.niveis.indexOf(n)];
        const c = this.modelo.caixa;
        const centro = new Vector3(
          (c.min.x + c.max.x) / 2,
          (nv?.cota ?? 0) + n.grupo.position.y,
          -(c.min.y + c.max.y) / 2,
        );
        perto = centro.distanceTo(cam) < LIMIAR_ARESTAS;
      }
      for (const t of n.tipos.values()) t.arestas.visible = perto && t.solido.visible;
    }
  }

  // ---- seleção ------------------------------------------------------------------------------

  get selecao() {
    return this._selecao;
  }

  selecionar(chave: string | null) {
    if (chave === this._selecao) return;
    this._selecao = chave;
    this.atualizarDestaque();
    this.sujo = true;
    this.emitir("selecao");
  }

  private limparDestaque() {
    for (const o of this.destaque.children.slice()) {
      if (o instanceof Mesh || o instanceof LineSegments) o.geometry.dispose();
      this.destaque.remove(o);
    }
  }

  private atualizarDestaque() {
    this.limparDestaque();
    const el = this._selecao ? this.porChave.get(this._selecao) : undefined;
    if (!el) return;
    const m = this.malhaDe(el.chave);
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(m.posicoes, 3));
    g.setAttribute("normal", new Float32BufferAttribute(m.normais, 3));
    const preenchimento = new Mesh(g, this.materiais.destaque);
    preenchimento.renderOrder = 5;
    const ga = new BufferGeometry();
    ga.setAttribute("position", new Float32BufferAttribute(m.arestas, 3));
    const contorno = new LineSegments(
      ga,
      new LineBasicMaterial({ color: COR_SELECAO, depthTest: false }),
    );
    contorno.renderOrder = 6;
    this.destaque.add(preenchimento, contorno);
    this.atualizarPosicaoDestaque();
  }

  private atualizarPosicaoDestaque() {
    const el = this._selecao ? this.porChave.get(this._selecao) : undefined;
    this.destaque.position.y = el ? (this.niveis[el.nivel]?.grupo.position.y ?? 0) : 0;
  }

  // ---- toque e clique ----------------------------------------------------------------------

  private aoApertar = (ev: PointerEvent) => {
    this.apontado = ev.isPrimary ? { x: ev.clientX, y: ev.clientY } : null;
  };

  private aoSoltar = (ev: PointerEvent) => {
    const a = this.apontado;
    this.apontado = null;
    // arrastar (órbita) não seleciona
    if (!a || Math.hypot(ev.clientX - a.x, ev.clientY - a.y) > 6) return;
    this.selecionar(this.elementoEm(ev.clientX, ev.clientY));
  };

  /** Chave do elemento sólido sob o ponto da tela (respeita os planos de corte). */
  elementoEm(clientX: number, clientY: number): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1,
    );
    const ray = new Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const alvos: Object3D[] = [];
    for (const n of this.niveis) {
      if (!n.grupo.visible) continue;
      for (const t of n.tipos.values()) if (t.solido.visible) alvos.push(t.solido);
      alvos.push(...n.marcas.children);
    }
    const planos = [...this.planos.values()].flat();
    for (const hit of ray.intersectObjects(alvos, false)) {
      if (planos.some((p) => p.distanceToPoint(hit.point) < 0)) continue;
      const marca = hit.object.userData as { chave?: string; marca?: boolean };
      if (marca.marca && marca.chave) return marca.chave;
      const t = this.niveis
        .flatMap((n) => [...n.tipos.values()])
        .find((x) => x.solido === hit.object);
      if (!t || hit.faceIndex === undefined || hit.faceIndex === null) continue;
      const i = ultimoMenorOuIgual(t.inicios, hit.faceIndex);
      const chave = t.chaves[i];
      if (chave) return chave;
    }
    return null;
  }

  /** Posição na tela (px do canvas) do centro do elemento, para o e2e e a acessibilidade. */
  pontoNaTela(chave: string): { x: number; y: number } | undefined {
    const el = this.porChave.get(chave);
    if (!el) return undefined;
    const [x, y, z] = centroDe(this.malhaDe(chave).posicoes);
    const v = new Vector3(x, y + (this.niveis[el.nivel]?.grupo.position.y ?? 0), z).project(
      this.camera,
    );
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
  }

  // ---- câmera -------------------------------------------------------------------------------

  /** Esfera que envolve o que está visível (sólidos), na cena. */
  private esferaVisivel(): Sphere {
    const exib = this.exibicoes();
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    const p = new Vector3();
    for (const e of this.modelo.elementos) {
      if (exib.get(e.chave) !== "solido") continue;
      const dy = this.deslocamentosAlvo[e.nivel] ?? 0;
      const pos = this.malhaDe(e.chave).posicoes;
      for (let k = 0; k < pos.length; k += 3) {
        p.set(pos[k]!, pos[k + 1]! + dy, pos[k + 2]!);
        min.min(p);
        max.max(p);
      }
    }
    if (min.x === Infinity) return new Sphere(new Vector3(), 10);
    const centro = min.clone().add(max).multiplyScalar(0.5);
    return new Sphere(centro, Math.max(1, min.distanceTo(max) / 2));
  }

  /** Direção da câmera (da cena para a câmera) de cada vista. */
  private direcao(v: Vista): Vector3 {
    const foco = this.estado.foco;
    const eixo =
      foco.tipo === "eixo" ? this.modelo.eixos.find((e) => e.chave === foco.chave) : undefined;
    if (v === "frente") return new Vector3(0, 0, 1);
    if (v === "lado") return new Vector3(1, 0, 0);
    if (v === "topo") return new Vector3(0, 1, 0.0001).normalize();
    if (eixo)
      return eixo.direcao === "y"
        ? new Vector3(0.25, 0.15, 1).normalize()
        : new Vector3(1, 0.15, 0.25).normalize();
    return new Vector3(1, 0.75, 1.25).normalize();
  }

  /** Vista pronta (perspectiva ou ortográfica de frente, lado ou topo), enquadrada. */
  definirVista(v: Vista, animar = true) {
    this.vista = v;
    const cam = v === "perspectiva" ? this.perspectiva : this.orto;
    if (cam !== this.camera) {
      cam.position.copy(this.camera.position);
      cam.quaternion.copy(this.camera.quaternion);
      this.camera = cam;
      this.controles.object = cam;
    }
    void this.enquadrar(animar, this.direcao(v));
    this.emitir("camera");
  }

  /** Enquadra o que está visível; sem `dir`, mantém a direção atual da câmera. */
  enquadrar(animar = true, dir?: Vector3) {
    const esfera = this.esferaVisivel();
    const atual = this.camera.position.clone().sub(this.controles.target);
    const d = (dir ?? (atual.lengthSq() > 1e-9 ? atual : this.direcao(this.vista)))
      .clone()
      .normalize();
    if (this.camera instanceof OrthographicCamera) {
      this.ajustarOrto(esfera.radius * 1.1);
      this.orto.zoom = 1;
      this.orto.updateProjectionMatrix();
      const pos = esfera.center.clone().add(d.multiplyScalar(esfera.radius * 4));
      return this.moverCamera(pos, esfera.center, animar);
    }
    const fov = (this.perspectiva.fov * Math.PI) / 180;
    const fovH = 2 * Math.atan(Math.tan(fov / 2) * this.perspectiva.aspect);
    // tela estreita (celular em pé): mais folga para os rótulos dos níveis
    const folga = this.perspectiva.aspect < 1 ? 1.45 : 1.08;
    const dist = (esfera.radius * folga) / Math.sin(Math.min(fov, fovH) / 2);
    const pos = esfera.center.clone().add(d.multiplyScalar(dist));
    this.perspectiva.near = Math.max(0.05, dist / 500);
    this.perspectiva.far = dist * 20;
    this.perspectiva.updateProjectionMatrix();
    return this.moverCamera(pos, esfera.center, animar);
  }

  moverCamera(posicao: Vector3, alvo: Vector3, animar = true): Promise<void> {
    const de = this.camera.position.clone();
    const alvoDe = this.controles.target.clone();
    if (!animar || movimentoReduzido() || de.lengthSq() === 0) {
      this.camera.position.copy(posicao);
      this.controles.target.copy(alvo);
      this.controles.update();
      this.sujo = true;
      return Promise.resolve();
    }
    return new Promise((fim) => {
      let t = 0;
      const passo = (dt: number) => {
        t = Math.min(1, t + dt / 0.45);
        const s = t * t * (3 - 2 * t);
        this.camera.position.lerpVectors(de, posicao, s);
        this.controles.target.lerpVectors(alvoDe, alvo, s);
        this.controles.update();
        if (t >= 1) {
          this.quadros.delete(passo);
          fim();
        }
      };
      this.quadros.add(passo);
    });
  }

  // ---- exportação --------------------------------------------------------------------------

  /** PNG do que está na tela. */
  png(): Promise<Blob | null> {
    this.desenhar();
    return new Promise((ok) => this.renderer.domElement.toBlob(ok, "image/png"));
  }

  /** glTF binário (.glb) das malhas sólidas visíveis, com a cor por vértice. */
  async glb(): Promise<ArrayBuffer> {
    const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
    const saida = new Group();
    saida.name = this.obra.nome || "obra";
    const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    for (const n of this.niveis) {
      const g = new Group();
      g.name = n.grupo.name;
      g.position.copy(n.grupo.position);
      for (const t of n.tipos.values())
        if (t.solido.visible) {
          const m = new Mesh(t.solido.geometry, material);
          m.name = t.solido.name;
          g.add(m);
        }
      saida.add(g);
    }
    const r = await new GLTFExporter().parseAsync(saida, { binary: true });
    material.dispose();
    return r as ArrayBuffer;
  }

  // ---- contexto das camadas ---------------------------------------------------------------

  definirPlanosCorte(id: string, planos: Plane[]) {
    if (planos.length === 0) this.planos.delete(id);
    else this.planos.set(id, planos);
    this.sujo = true;
  }

  definirFiltro(id: string, f: ((e: Elemento3D) => boolean) | null) {
    if (f) this.filtros.set(id, f);
    else this.filtros.delete(id);
    this.reconstruir();
  }

  elemento(chave: string) {
    return this.porChave.get(chave);
  }

  grupoDoNivel(indice: number) {
    return this.niveis[indice]?.grupo;
  }

  aoQuadro(f: (dt: number) => void) {
    this.quadros.add(f);
    return () => void this.quadros.delete(f);
  }

  travarControles(travar: boolean) {
    this.controles.enabled = !travar;
  }

  /** Planos do corte vertical do eixo em foco (a faixa de ± MEIA_FAIXA_EIXO). */
  private planosDoEixo(): Plane[] {
    const foco = this.estado.foco;
    const eixo =
      foco.tipo === "eixo" ? this.modelo.eixos.find((e) => e.chave === foco.chave) : undefined;
    if (!eixo) return [];
    // x da planta = X da cena; y da planta = −Z da cena
    if (eixo.direcao === "x")
      return [
        new Plane(new Vector3(1, 0, 0), -(eixo.c - MEIA_FAIXA_EIXO)),
        new Plane(new Vector3(-1, 0, 0), eixo.c + MEIA_FAIXA_EIXO),
      ];
    return [
      new Plane(new Vector3(0, 0, -1), -(eixo.c - MEIA_FAIXA_EIXO)),
      new Plane(new Vector3(0, 0, 1), eixo.c + MEIA_FAIXA_EIXO),
    ];
  }
}

function geometria(p: number[], n: number[], c: number[]) {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(p, 3));
  g.setAttribute("normal", new Float32BufferAttribute(n, 3));
  g.setAttribute("color", new Float32BufferAttribute(c, 3));
  g.computeBoundingSphere();
  return g;
}

function centroDe(pos: readonly number[]): [number, number, number] {
  const s = [0, 0, 0];
  const n = pos.length / 3 || 1;
  for (let k = 0; k < pos.length; k += 3) {
    s[0]! += pos[k]!;
    s[1]! += pos[k + 1]!;
    s[2]! += pos[k + 2]!;
  }
  return [s[0]! / n, s[1]! / n, s[2]! / n];
}

/** Índice do último início ≤ x (busca binária; `inicios` crescente). */
export function ultimoMenorOuIgual(inicios: readonly number[], x: number): number {
  let lo = 0;
  let hi = inicios.length - 1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (inicios[m]! <= x) lo = m;
    else hi = m - 1;
  }
  return lo;
}
