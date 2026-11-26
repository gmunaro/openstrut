// Animações dos atos do tour guiado (paradas.ts, historia.ts): a obra subindo pelas etapas
// da sequência 4D, a carga descendo pela coluna mais carregada, as barras do lance de
// baixo crescendo dentro do concreto e o Nk dos pilares no explodido. Cada ato começa na
// parada e é desfeito ao sair dela (`parar`); sem animação (movimento reduzido), mostra o
// estado final de uma vez. Usa só o contrato das camadas (filtros, cores, transparência,
// objetos na cena), com a fonte ID.
import {
  Box3,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Sphere,
  Vector3,
} from "three";
import type { ContextoVista } from "../api";
import {
  agruparPorMaterial,
  COR_TIPO,
  type PosicaoDesenhada,
  type TipoBarra,
} from "../armadura/logica";
// a rampa "calor" do Nk, a mesma do link rampa=calor da vista
import { corNaRampa, RAMPAS } from "../cores";
import { faixaDaGrandeza } from "../dados";
import { gerarEtapas } from "../sequencia/etapas";
import { type CaminhoCargas, fracaoNk, textoNk } from "./historia";
import type { Parada } from "./paradas";

const ID = "tour";

/** Duração das animações, ms: a obra inteira subindo, cada lance no caminho das cargas e
 *  as barras crescendo. */
export const DURACAO_OBRA = 6000;
export const DURACAO_LANCE = 800;
export const DURACAO_BARRAS = 2500;

/** Cor das lajes e vigas que entregam a carga ao pilar e das setas que descem. */
const COR_CARGA = "#fbbf24";
const COR_SETA = "#f97316";

export interface Ato {
  /** Resolve quando a animação termina (já resolvida sem animação). */
  pronto: Promise<void>;
  /** O enquadramento vem depois da animação (o explodido muda a altura do prédio). */
  enquadrarDepois: boolean;
  /** Para onde a câmera olha, antes de o ato esconder ou mudar peças. */
  alvo: Box3 | Sphere | undefined;
  /** Desfaz o ato (filtros, cores, objetos, explodido). */
  parar(): void;
}

/** Roda `passo(t)` com t de 0 a 1 ao longo de `ms`; resolve no fim ou ao parar. */
function animar(ctx: ContextoVista, ms: number, passo: (t: number) => void) {
  let parar = () => {};
  const pronto = new Promise<void>((ok) => {
    let decorrido = 0;
    const fim = () => {
      cancelar();
      ok();
    };
    const cancelar = ctx.aoQuadro((dt) => {
      decorrido += dt * 1000;
      const t = Math.min(1, decorrido / ms);
      passo(t);
      if (t >= 1) fim();
    });
    parar = fim;
  });
  return { pronto, parar: () => parar() };
}

/** Legenda da vista no lugar da de concreto: a rampa do Nk dos pilares, do menor ao maior
 *  (os textos do cálculo), e os itens `antes`. */
function legendaNk(ctx: ContextoVista, antes: { cor: string; rotulo: string }[] = []) {
  const pilares = ctx.modelo.elementos.filter(
    (e) => e.tipo === "pilar" && ctx.dados.get(e.chave)?.grandeza !== undefined,
  );
  const nk = (k: string) => ctx.dados.get(k)?.grandeza ?? 0;
  const ordem = pilares.map((e) => e.chave).sort((a, b) => nk(a) - nk(b));
  const ponta = (k: string | undefined) => (k && textoNk(ctx.dados.get(k))) ?? "";
  ctx.definirLegenda(ID, {
    titulo: "Nk nos pilares",
    itens: [
      ...antes,
      { cor: corNaRampa(0, RAMPAS.calor), rotulo: `Menor: ${ponta(ordem[0])}` },
      { cor: corNaRampa(1, RAMPAS.calor), rotulo: `Maior: ${ponta(ordem.at(-1))}` },
    ],
    substitui: true,
  });
}

/** Cone de ponta para baixo, centrado na origem (feito à mão: o ConeGeometry do three
 *  iria para o pedaço comum que toda a vista 3D baixa). */
function cone(raio: number, altura: number, lados = 12) {
  const pos = [0, -altura / 2, 0, 0, altura / 2, 0];
  for (let i = 0; i < lados; i++) {
    const a = (i / lados) * Math.PI * 2;
    pos.push(raio * Math.cos(a), altura / 2, raio * Math.sin(a));
  }
  const indices: number[] = [];
  for (let i = 0; i < lados; i++) {
    const p = 2 + i;
    const q = 2 + ((i + 1) % lados);
    indices.push(0, q, p, 1, p, q);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setIndex(indices);
  return geo;
}

/** Caixa de várias peças juntas. */
function caixaDas(ctx: ContextoVista, chaves: Iterable<string>) {
  const caixa = new Box3();
  for (const k of chaves) {
    const c = ctx.caixaDe(k);
    if (c) caixa.union(c);
  }
  return caixa.isEmpty() ? undefined : caixa;
}

/** A obra sobe: as peças aparecem etapa por etapa (fundação, pilares, vigas, lajes, nível
 *  por nível), como na sequência construtiva 4D. */
function atoObra(ctx: ContextoVista, comAnimacao: boolean): Ato {
  const alvo = ctx.caixaVisivel();
  const etapas = gerarEtapas(ctx.modelo);
  const ordem = new Map<string, number>();
  etapas.forEach((e, i) => e.chaves.forEach((k) => ordem.set(k, i)));
  let feitas = -1;
  const mostrar = (n: number) => {
    if (n === feitas) return;
    feitas = n;
    ctx.definirFiltro(ID, (e) => (ordem.get(e.chave) ?? -1) < n);
  };
  const a = comAnimacao
    ? animar(ctx, DURACAO_OBRA, (t) =>
        mostrar(Math.min(etapas.length, Math.floor(t * etapas.length) + 1)),
      )
    : null;
  if (!a) mostrar(etapas.length);
  return {
    pronto: a?.pronto ?? Promise.resolve(),
    enquadrarDepois: false,
    alvo,
    parar: () => {
      a?.parar();
      ctx.definirFiltro(ID, null);
    },
  };
}

/** Lajes e vigas do nível do lance que encostam no pilar (a 30 cm na horizontal): as que
 *  entregam carga a ele no topo do lance. */
function quemCarrega(ctx: ContextoVista, chave: string, nivel: number) {
  const caixa = ctx
    .caixaDe(chave)
    ?.clone()
    .expandByVector(new Vector3(0.3, 0.05, 0.3));
  if (!caixa) return [];
  return ctx.modelo.elementos.flatMap((e) =>
    e.nivel === nivel &&
    (e.tipo === "laje" || e.tipo === "viga") &&
    ctx.caixaDe(e.chave)?.intersectsBox(caixa)
      ? [e.chave]
      : [],
  );
}

/** O caminho das cargas: de cima para baixo, as lajes e vigas que encostam na coluna
 *  acendem, o lance recebe a cor do Nk dele, e setas descem pela coluna até a fundação.
 *  O resto do prédio fica transparente. Um rótulo acompanha o lance com o Nk. */
function atoCargas(ctx: ContextoVista, caminho: CaminhoCargas, comAnimacao: boolean): Ato {
  const passos = caminho.lances.map((l) => ({ ...l, carga: quemCarrega(ctx, l.chave, l.nivel) }));
  const destaque = new Set([
    ...passos.flatMap((p) => [p.chave, ...p.carga]),
    ...(caminho.fundacao ? [caminho.fundacao] : []),
  ]);
  const alvo = caixaDas(ctx, destaque);
  const faixa = faixaDaGrandeza(ctx.modelo, ctx.dados, "nkPilares") ?? { min: 0, max: 1 };
  const corDoLance = new Map(
    passos.map((p) => [p.chave, corNaRampa(fracaoNk(p.nk, faixa), RAMPAS.calor)]),
  );
  const base = passos.at(-1);
  if (caminho.fundacao && base) corDoLance.set(caminho.fundacao, corDoLance.get(base.chave)!);
  ctx.definirTransparencia(ID, (e) => !destaque.has(e.chave));
  legendaNk(ctx, [{ cor: COR_CARGA, rotulo: "Lajes e vigas que apoiam no pilar" }]);

  // até o passo n (exclusive) a carga já desceu; o passo n acende agora
  let feitos = -1;
  const acesas = new Set<string>();
  const acender = (n: number) => {
    if (n === feitos) return;
    feitos = n;
    acesas.clear();
    passos.slice(0, n).forEach((p) => {
      acesas.add(p.chave);
      p.carga.forEach((k) => acesas.add(k));
    });
    if (n > passos.length && caminho.fundacao) acesas.add(caminho.fundacao);
    ctx.definirCores(ID, (e) =>
      !acesas.has(e.chave) ? null : (corDoLance.get(e.chave) ?? COR_CARGA),
    );
  };

  // setas: três cones que descem pela coluna, por cima do concreto
  const setas = new Group();
  setas.name = "tour setas";
  // do tamanho do prédio (1/30 da altura da coluna), para aparecer de longe e no celular
  const altura = alvo ? alvo.max.y - alvo.min.y : 10;
  const material = new MeshBasicMaterial({ color: COR_SETA, depthTest: false, transparent: true });
  const geometria = cone(altura / 80, altura / 30);
  for (let i = 0; i < 3; i++) {
    const m = new Mesh(geometria, material);
    m.renderOrder = 10;
    setas.add(m);
  }
  const centro = ctx.caixaDe(passos[0]?.chave ?? "")?.getCenter(new Vector3()) ?? new Vector3();
  /** Põe as setas entre o topo da coluna e o pé do lance `n`, na fase f (0 a 1) do ciclo;
   *  as alturas vêm da cena na hora (o explodido pode mudá-las). Diz se alguma mudou. */
  const porSetas = (f: number, n: number) => {
    const alto = ctx.caixaDe(passos[0]?.chave ?? "")?.max.y ?? 0;
    const p = passos[Math.min(n, passos.length) - 1];
    const fundo = (p && ctx.caixaDe(p.chave)?.min.y) ?? alto;
    let mudou = false;
    setas.children.forEach((m, i) => {
      const fase = (f + i / 3) % 1;
      const y = alto - fase * (alto - fundo);
      if (Math.abs(m.position.y - y) > 1e-6) mudou = true;
      m.position.set(centro.x, y, centro.z);
    });
    return mudou;
  };

  // rótulo do lance com o Nk (o texto da legenda, por extenso, fica no canto)
  const conteiner = ctx.renderer.domElement.parentElement;
  const rotulo = document.createElement("div");
  rotulo.setAttribute("aria-hidden", "true");
  rotulo.dataset.testid = "tour-nk";
  rotulo.className =
    "bg-background pointer-events-none absolute z-10 rounded-md border px-1.5 py-0.5 text-xs tabular-nums whitespace-nowrap shadow-sm";
  rotulo.hidden = true;
  conteiner?.appendChild(rotulo);
  const ponto = new Vector3();
  let largura = 0;
  const posicionar = (n: number) => {
    const p = passos[Math.min(n, passos.length) - 1];
    const c = p ? ctx.caixaDe(p.chave) : undefined;
    if (!p || !c || !conteiner) return;
    const nivel = ctx.modelo.niveis[p.nivel]?.nome ?? "";
    const texto = `${caminho.nome} · ${nivel}: ${textoNk(ctx.dados.get(p.chave)) ?? ""}`;
    rotulo.hidden = false;
    // a largura só muda com o texto: ler o layout uma vez por troca, não a cada quadro
    if (rotulo.textContent !== texto) {
      rotulo.textContent = texto;
      largura = rotulo.offsetWidth;
    }
    c.getCenter(ponto).project(ctx.camera);
    const w = ctx.renderer.domElement.clientWidth;
    const h = ctx.renderer.domElement.clientHeight;
    const x = ((ponto.x + 1) / 2) * w + 14;
    const y = ((1 - ponto.y) / 2) * h;
    rotulo.style.left = `${Math.max(4, Math.min(w - largura - 4, x))}px`;
    rotulo.style.top = `${Math.max(48, Math.min(h - 28, y - 10))}px`;
  };

  ctx.cena.add(setas);
  // um passo por lance, de cima para baixo, e o último, o da fundação (se houver)
  const total = passos.length + (caminho.fundacao ? 1 : 0);
  let frente = comAnimacao ? 1 : total;
  acender(frente);
  // o rótulo (e, sem animação, as setas paradas) segue a câmera e o explodido depois de
  // cada quadro desenhado; as setas só pedem outro quadro quando saem do lugar
  const pararRotulo = ctx.depoisDoQuadro(() => {
    posicionar(frente);
    if (!comAnimacao && porSetas(0, frente)) ctx.pedirRender();
  });
  // com animação, as setas descem em ciclo enquanto o ato estiver na tela; sem, ficam
  // paradas ao longo da coluna inteira
  let tempo = 0;
  const pararSetas = comAnimacao
    ? ctx.aoQuadro((dt) => {
        tempo += dt;
        porSetas(tempo / 1.2, frente);
      })
    : (porSetas(0, frente), () => {});
  const a = comAnimacao
    ? animar(ctx, DURACAO_LANCE * total, (t) => {
        frente = Math.min(total, Math.floor(t * total) + 1);
        acender(frente);
      })
    : null;
  ctx.pedirRender();
  return {
    pronto: a?.pronto ?? Promise.resolve(),
    enquadrarDepois: false,
    alvo,
    parar: () => {
      a?.parar();
      pararSetas();
      pararRotulo();
      ctx.cena.remove(setas);
      geometria.dispose();
      material.dispose();
      rotulo.remove();
      ctx.definirLegenda(ID, null);
      ctx.definirCores(ID, null);
      ctx.definirTransparencia(ID, null);
      ctx.pedirRender();
    },
  };
}

/** Raio-x: o prédio transparente e as barras do lance crescendo do pé ao topo dele. */
function atoArmadura(ctx: ContextoVista, chave: string, comAnimacao: boolean): Ato {
  const e = ctx.elemento(chave);
  const caixa = ctx.caixaDe(chave);
  const esfera = caixa?.getBoundingSphere(new Sphere());
  if (esfera) esfera.radius = Math.max(esfera.radius * 1.6, 3);
  ctx.definirTransparencia(ID, () => true);
  const raiz = new Group();
  raiz.name = "tour armadura";
  const materiais = new Map<TipoBarra, MeshLambertMaterial>();
  const barras = e ? ctx.barrasDe(chave) : undefined;
  if (e && caixa && barras) {
    const itens: PosicaoDesenhada[] = barras.map((posicao) => ({ chave, nivel: e.nivel, posicao }));
    // as barras crescem a partir do pé do lance: o grupo de fora fica no pé e escala em y
    raiz.position.y = caixa.min.y;
    const dentro = new Group();
    dentro.position.y = ctx.alturaNaCena(e.nivel, 0) - caixa.min.y;
    raiz.add(dentro);
    for (const g of agruparPorMaterial(itens, (n) => ctx.alturaNaCena(n, 0))) {
      let m = materiais.get(g.tipo);
      if (!m) {
        m = new MeshLambertMaterial({ color: COR_TIPO[g.tipo], side: DoubleSide });
        materiais.set(g.tipo, m);
      }
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute(g.malha.posicoes, 3));
      geo.setAttribute("normal", new Float32BufferAttribute(g.malha.normais, 3));
      geo.setIndex(g.malha.indices);
      dentro.add(new Mesh(geo, m));
    }
  }
  ctx.cena.add(raiz);
  raiz.scale.y = comAnimacao ? 0.001 : 1;
  ctx.pedirRender();
  const a = comAnimacao
    ? animar(ctx, DURACAO_BARRAS, (t) => {
        // começa depressa e assenta no fim
        raiz.scale.y = Math.max(0.001, 1 - (1 - t) ** 3);
      })
    : null;
  return {
    pronto: a?.pronto ?? Promise.resolve(),
    enquadrarDepois: false,
    alvo: esfera,
    parar: () => {
      a?.parar();
      raiz.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
      ctx.cena.remove(raiz);
      for (const m of materiais.values()) m.dispose();
      ctx.definirTransparencia(ID, null);
      ctx.pedirRender();
    },
  };
}

/** O prédio explode e os pilares tomam a cor do Nk deles (rampa calor). Ao sair, volta o
 *  explodido de antes. */
function atoNk(ctx: ContextoVista): Ato {
  const antes = ctx.explodido;
  const faixa = faixaDaGrandeza(ctx.modelo, ctx.dados, "nkPilares") ?? { min: 0, max: 1 };
  ctx.definirCores(ID, (e) => {
    const nk = e.tipo === "pilar" ? ctx.dados.get(e.chave)?.grandeza : undefined;
    return nk === undefined ? null : corNaRampa(fracaoNk(nk, faixa), RAMPAS.calor);
  });
  legendaNk(ctx);
  ctx.definirExplodido(true);
  // espera o explodido assentar (sem animação, ele já chegou)
  let parar = () => {};
  const pronto = new Promise<void>((ok) => {
    const fim = () => {
      cancelar();
      ok();
    };
    const cancelar = ctx.aoQuadro(() => {
      if (!ctx.explodidoEmAnimacao) fim();
    });
    parar = fim;
  });
  return {
    pronto,
    enquadrarDepois: true,
    alvo: undefined,
    parar: () => {
      parar();
      ctx.definirLegenda(ID, null);
      ctx.definirCores(ID, null);
      ctx.definirExplodido(antes);
    },
  };
}

/** O ato da parada, ou null nas paradas sem ato (prédio, nível, peça, grupo). */
export function iniciarAto(ctx: ContextoVista, p: Parada, comAnimacao: boolean): Ato | null {
  if (p.tipo === "obra") return atoObra(ctx, comAnimacao);
  if (p.tipo === "cargas") return atoCargas(ctx, p.caminho, comAnimacao);
  if (p.tipo === "armadura") return atoArmadura(ctx, p.chave, comAnimacao);
  if (p.tipo === "nk") return atoNk(ctx);
  return null;
}
