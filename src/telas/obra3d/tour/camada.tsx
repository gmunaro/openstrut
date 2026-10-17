// Camada "Tour". Guiado: para no prédio inteiro, em cada nível de baixo para cima, nas
// peças com falha e nas afetadas por defeito do original (paradas.ts), 2,5 s em cada, com
// Anterior, Próxima e Pausar. Outra ação que leva a câmera (botão de vista, outra camada)
// pausa o tour. Livre: anda pela estrutura em primeira pessoa (caminhada.ts), pelo teclado
// ou pelo joystick na tela, com a órbita travada. Com prefers-reduced-motion, a câmera
// salta sem animar e o tour só avança pelos botões.
import { useSyncExternalStore } from "react";
import { Box3, Sphere, Vector3 } from "three";
import { Button } from "@/components/ui/button";
import type { Camada, ContextoVista } from "../api";
import { ALTURA_OLHOS, type Caminhante, type Comando, frenteDe, passo, pisos } from "./caminhada";
import { descreverParada, montarParadas, type Parada } from "./paradas";
import { criarJoystick, criarLegenda } from "./sobreposicao";

/** Tempo em cada parada depois que a câmera chega, ms. */
export const DURACAO_PARADA = 2500;

const movimentoReduzido = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const toque = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
const ortografica = (ctx: ContextoVista) => "isOrthographicCamera" in ctx.camera;

/** O que o Painel mostra; fica no módulo. */
let estado = {
  modo: "guiado" as "guiado" | "livre",
  indice: 0,
  total: 0,
  tocando: false,
  titulo: "",
  linhas: [] as readonly string[],
  aviso: "",
  piso: "",
  ortografica: false,
};
const ouvintes = new Set<() => void>();
function mudar(p: Partial<typeof estado>) {
  estado = { ...estado, ...p };
  ouvintes.forEach((f) => f());
}
const assinar = (f: () => void) => {
  ouvintes.add(f);
  return () => void ouvintes.delete(f);
};

interface Livre {
  c: Caminhante;
  piso: number;
  teclas: Set<string>;
  joy: { x: number; y: number };
  pararQuadro: (() => void) | null;
  limpar: () => void;
}

interface Sessao {
  ctx: ContextoVista;
  paradas: Parada[];
  /** Cresce a cada ida a uma parada: a resposta de uma ida antiga é ignorada. */
  ida: number;
  /** A câmera está indo para uma parada (os eventos "camera" são do tour). */
  movendo: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  legenda: ReturnType<typeof criarLegenda>;
  livre: Livre | null;
}
let sessao: Sessao | null = null;

function mostrarParada(s: Sessao) {
  const p = s.paradas[estado.indice];
  const { titulo, linhas } = p
    ? descreverParada(p, s.ctx.modelo, s.ctx.dados)
    : { titulo: "Sem paradas", linhas: [] };
  s.legenda.mostrar(`Parada ${estado.indice + 1} de ${s.paradas.length}: ${titulo}`, linhas);
  mudar({ titulo, linhas, total: s.paradas.length });
}

/** Raio mínimo do enquadramento de uma peça, m: mostra a peça com os vizinhos em volta (de
 *  perto demais, a câmera fica dentro das lajes). */
const RAIO_PECA = 4;

function alvoDa(ctx: ContextoVista, p: Parada) {
  if (p.tipo === "todo") return ctx.esferaVisivel();
  if (p.tipo === "nivel") return ctx.caixaDoNivel(p.nivel);
  if (p.tipo === "grupo") {
    // as peças do grupo juntas
    const caixa = new Box3();
    for (const k of p.chaves) {
      const c = ctx.caixaDe(k);
      if (c) caixa.union(c);
    }
    return caixa.isEmpty() ? ctx.caixaDoNivel(p.nivel) : caixa;
  }
  const esfera = ctx.caixaDe(p.chave)?.getBoundingSphere(new Sphere());
  if (esfera) esfera.radius = Math.max(esfera.radius * 2, RAIO_PECA);
  return esfera;
}

function limparTimer(s: Sessao) {
  if (s.timer !== null) clearTimeout(s.timer);
  s.timer = null;
}

/** Vai à parada `i`: seleciona a peça (ou tira a seleção), enquadra e, tocando, agenda a
 *  próxima. "cancelada" vinda de outra ação pausa o tour; a de uma ida nossa mais nova,
 *  não. */
async function irPara(s: Sessao, i: number) {
  limparTimer(s);
  const p = s.paradas[i];
  if (!p) return;
  const ida = ++s.ida;
  mudar({ indice: i });
  mostrarParada(s);
  const { ctx } = s;
  ctx.selecionar(p.tipo === "peca" && ctx.elemento(p.chave) ? p.chave : null);
  const alvo = alvoDa(ctx, p);
  let fim: "concluida" | "cancelada" = "concluida";
  if (alvo) {
    s.movendo = true;
    fim = await ctx.enquadrarEm(alvo, !movimentoReduzido());
    if (s.ida !== ida || sessao !== s) return;
    s.movendo = false;
  }
  if (fim === "cancelada") return pausar(s, "Tour pausado: outra ação levou a câmera.");
  if (estado.tocando) s.timer = setTimeout(() => avancar(s, 1), DURACAO_PARADA);
}

function avancar(s: Sessao, passo: number) {
  const i = estado.indice + passo;
  if (i >= s.paradas.length) return pausar(s, "Fim do tour.");
  void irPara(s, Math.max(0, i));
}

function tocar(s: Sessao) {
  if (s.livre) sairLivre(s);
  s.ctx.travarControles(true);
  const recomeca = estado.indice >= s.paradas.length - 1;
  mudar({ tocando: true, aviso: "" });
  void irPara(s, recomeca ? 0 : estado.indice);
}

function pausar(s: Sessao, aviso = "") {
  limparTimer(s);
  s.ida++;
  s.movendo = false;
  if (!s.livre) s.ctx.travarControles(false);
  mudar({ tocando: false, aviso });
}

// ---- tour livre ------------------------------------------------------------------------

const TECLAS: Record<string, Partial<Comando>> = {
  KeyW: { frente: 1 },
  ArrowUp: { frente: 1 },
  KeyS: { frente: -1 },
  ArrowDown: { frente: -1 },
  KeyA: { lado: -1 },
  KeyD: { lado: 1 },
  ArrowLeft: { giro: 1 },
  ArrowRight: { giro: -1 },
};

function comandoDe(l: Livre): Comando {
  const c = { frente: l.joy.y, lado: 0, giro: -l.joy.x };
  for (const t of l.teclas) {
    const k = TECLAS[t];
    c.frente += k?.frente ?? 0;
    c.lado += k?.lado ?? 0;
    c.giro += k?.giro ?? 0;
  }
  return c;
}

function aplicarCamera(ctx: ContextoVista, c: Caminhante) {
  const f = frenteDe(c.rumo);
  ctx.camera.position.set(c.x, c.y, c.z);
  // o alvo da órbita 1 m à frente: a vista olha para ele a cada quadro
  ctx.controles.target.set(c.x + f.x, c.y, c.z + f.z);
  ctx.controles.update();
  ctx.pedirRender();
}

function alturaDoPiso(ctx: ContextoVista, i: number) {
  const p = pisos(ctx.modelo.niveis)[i];
  return p ? ctx.alturaNaCena(p.nivel, p.cota) + ALTURA_OLHOS : ALTURA_OLHOS;
}

function mudarPiso(s: Sessao, delta: number) {
  const l = s.livre;
  if (!l) return;
  const lista = pisos(s.ctx.modelo.niveis);
  l.piso = Math.max(0, Math.min(lista.length - 1, l.piso + delta));
  l.c = { ...l.c, y: alturaDoPiso(s.ctx, l.piso) };
  aplicarCamera(s.ctx, l.c);
  mostrarPiso(s);
}

function mostrarPiso(s: Sessao) {
  const l = s.livre;
  const p = l ? pisos(s.ctx.modelo.niveis)[l.piso] : undefined;
  const piso = p
    ? `${p.nome} (+${p.cota.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} m)`
    : "";
  s.legenda.mostrar(`Caminhando: ${piso}`, [
    toque()
      ? "Arraste o controle redondo para andar e girar"
      : "W/S ou ↑/↓ andam, A/D de lado, ←/→ giram, Q/E descem e sobem, Esc sai",
  ]);
  mudar({ piso });
}

/** Enquanto houver tecla ou joystick, anda a cada quadro; parado, a vista volta a só
 *  desenhar quando algo muda. */
function garantirLaco(s: Sessao, l: Livre) {
  if (l.pararQuadro) return;
  l.pararQuadro = s.ctx.aoQuadro((dt) => {
    const cmd = comandoDe(l);
    if (cmd.frente === 0 && cmd.lado === 0 && cmd.giro === 0) {
      l.pararQuadro?.();
      l.pararQuadro = null;
      return;
    }
    l.c = passo(l.c, cmd, Math.min(dt, 0.1));
    aplicarCamera(s.ctx, l.c);
  });
}

function entrarLivre(s: Sessao) {
  const { ctx } = s;
  if (s.livre || ortografica(ctx)) return;
  pausar(s);
  ctx.selecionar(null);
  ctx.travarControles(true);
  // começa no chão, 4 m à frente da fachada de y mínimo (z máximo na cena), olhando o prédio
  const caixa = ctx.caixaNaCena();
  const centro = caixa.getCenter(new Vector3());
  const l: Livre = {
    c: { x: centro.x, y: alturaDoPiso(ctx, 0), z: caixa.max.z + 4, rumo: 0 },
    piso: 0,
    teclas: new Set(),
    joy: { x: 0, y: 0 },
    pararQuadro: null,
    limpar: () => {},
  };
  const conteiner = ctx.renderer.domElement.parentElement;
  const joystick = conteiner
    ? criarJoystick(conteiner, (x, y) => {
        l.joy = { x, y };
        garantirLaco(s, l);
      })
    : null;
  const digitando = (t: EventTarget | null) =>
    t instanceof HTMLElement &&
    (t.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName));
  const baixar = (e: KeyboardEvent) => {
    if (digitando(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "Escape") return sairLivre(s);
    if (e.code === "KeyQ" || e.code === "PageDown") mudarPiso(s, -1);
    else if (e.code === "KeyE" || e.code === "PageUp") mudarPiso(s, 1);
    else if (TECLAS[e.code]) {
      l.teclas.add(e.code);
      garantirLaco(s, l);
    } else return;
    e.preventDefault();
  };
  const soltar = (e: KeyboardEvent) => void l.teclas.delete(e.code);
  // trocar de janela com a tecla apertada não deixa o caminhante andando sozinho
  const perderFoco = () => l.teclas.clear();
  window.addEventListener("keydown", baixar);
  window.addEventListener("keyup", soltar);
  window.addEventListener("blur", perderFoco);
  l.limpar = () => {
    l.pararQuadro?.();
    window.removeEventListener("keydown", baixar);
    window.removeEventListener("keyup", soltar);
    window.removeEventListener("blur", perderFoco);
    joystick?.remover();
  };
  s.livre = l;
  mudar({ modo: "livre", aviso: "" });
  void ctx.moverCamera(
    new Vector3(l.c.x, l.c.y, l.c.z),
    new Vector3(l.c.x, l.c.y, l.c.z - 1),
    false,
  );
  mostrarPiso(s);
}

/** Sai da caminhada, destrava a órbita e, com `enquadrar`, volta ao prédio inteiro. */
function sairLivre(s: Sessao, enquadrar = true) {
  const l = s.livre;
  if (!l) return;
  l.limpar();
  s.livre = null;
  s.ctx.travarControles(false);
  mudar({ modo: "guiado", piso: "" });
  mostrarParada(s);
  if (enquadrar) void s.ctx.enquadrarEm(s.ctx.esferaVisivel(), !movimentoReduzido());
}

// ---- Painel e ciclo de vida -------------------------------------------------------------

function Painel() {
  const e = useSyncExternalStore(assinar, () => estado);
  const s = sessao;
  if (!s) return null;
  const livre = e.modo === "livre";
  return (
    <div className="grid gap-2 text-xs">
      <div className="grid gap-1" aria-live="polite">
        <p className="font-semibold">
          {livre ? `Caminhando: ${e.piso}` : `Parada ${e.indice + 1} de ${e.total}: ${e.titulo}`}
        </p>
        {!livre &&
          e.linhas.map((l) => (
            <p key={l} className="tabular-nums">
              {l}
            </p>
          ))}
        {e.aviso && <p className="text-muted-foreground">{e.aviso}</p>}
      </div>
      {!livre && (
        <div className="flex flex-wrap gap-1">
          <Button
            size="xs"
            variant="outline"
            className="compacto:h-9"
            disabled={e.indice === 0}
            onClick={() => avancar(s, -1)}
          >
            Anterior
          </Button>
          <Button
            size="xs"
            variant="outline"
            className="compacto:h-9"
            onClick={() => (e.tocando ? pausar(s) : tocar(s))}
          >
            {e.tocando ? "Pausar" : "Reproduzir"}
          </Button>
          <Button
            size="xs"
            variant="outline"
            className="compacto:h-9"
            disabled={e.indice >= e.total - 1}
            onClick={() => avancar(s, 1)}
          >
            Próxima
          </Button>
        </div>
      )}
      <div className="grid gap-1">
        <div className="flex flex-wrap gap-1">
          <Button
            size="xs"
            variant={livre ? "secondary" : "outline"}
            className="compacto:h-9"
            disabled={!livre && e.ortografica}
            onClick={() => (livre ? sairLivre(s) : entrarLivre(s))}
          >
            {livre ? "Sair da caminhada" : "Andar pela estrutura"}
          </Button>
          {livre && (
            <>
              <Button
                size="xs"
                variant="outline"
                className="compacto:h-9"
                onClick={() => mudarPiso(s, -1)}
              >
                Descer andar
              </Button>
              <Button
                size="xs"
                variant="outline"
                className="compacto:h-9"
                onClick={() => mudarPiso(s, 1)}
              >
                Subir andar
              </Button>
            </>
          )}
        </div>
        <p className="text-muted-foreground">
          {!livre && e.ortografica
            ? "A caminhada usa a vista em perspectiva: escolha Perspectiva na barra de vistas."
            : "Teclado: W/S ou ↑/↓ andam, A/D de lado, ←/→ giram, Q/E descem e sobem um andar, Esc sai. No toque, arraste o controle redondo no canto do desenho. A caminhada atravessa as peças."}
        </p>
      </div>
    </div>
  );
}

export const camada: Camada = {
  ativar(ctx) {
    const conteiner = ctx.renderer.domElement.parentElement ?? document.body;
    const s: Sessao = {
      ctx,
      paradas: montarParadas(ctx.modelo, ctx.dados),
      ida: 0,
      movendo: false,
      timer: null,
      legenda: criarLegenda(conteiner),
      livre: null,
    };
    sessao = s;
    estado = { ...estado, modo: "guiado", indice: 0, aviso: "", ortografica: ortografica(ctx) };
    const parar = [
      // obra editada: paradas novas; a parada atual fica no limite da lista
      ctx.aoMudar("cena", () => {
        s.paradas = montarParadas(ctx.modelo, ctx.dados);
        mudar({ indice: Math.min(estado.indice, Math.max(0, s.paradas.length - 1)) });
        if (s.livre) mostrarPiso(s);
        else mostrarParada(s);
      }),
      ctx.aoMudar("explodido", () => {
        const l = s.livre;
        if (!l) return;
        l.c = { ...l.c, y: alturaDoPiso(ctx, l.piso) };
        aplicarCamera(ctx, l.c);
      }),
      ctx.aoMudar("camera", () => {
        const orto = ortografica(ctx);
        if (orto !== estado.ortografica) mudar({ ortografica: orto });
        if (orto && s.livre) sairLivre(s, false);
        // tocando e parado numa parada: quem mexeu na câmera não foi o tour
        if (estado.tocando && !s.movendo && s.timer !== null)
          pausar(s, "Tour pausado: outra ação levou a câmera.");
      }),
    ];
    if (movimentoReduzido()) {
      mudar({ aviso: "Movimento reduzido: o tour não anima e avança pelos botões." });
      void irPara(s, 0);
    } else tocar(s);
    return () => {
      parar.forEach((f) => f());
      sairLivre(s, false);
      pausar(s);
      s.legenda.remover();
      ctx.travarControles(false);
      sessao = null;
    };
  },
  Painel,
};
