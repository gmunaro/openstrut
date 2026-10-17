// Elementos da camada Tour por cima do desenho: a legenda da parada e o joystick do toque.
// Ficam no contêiner do canvas (não no Painel), para aparecer também com o painel lateral
// oculto e no celular, onde o painel fica abaixo do desenho. Só texto (textContent).

/** Legenda da parada, no alto do desenho, abaixo da barra de vistas. */
export function criarLegenda(conteiner: HTMLElement) {
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.dataset.testid = "legenda-tour";
  el.className =
    "bg-background/90 pointer-events-none absolute top-24 left-1/2 max-sm:top-32 z-10 grid max-w-[min(22rem,calc(100%-1rem))] -translate-x-1/2 gap-0.5 rounded-md border px-3 py-1.5 text-center text-xs shadow-sm";
  conteiner.appendChild(el);
  return {
    mostrar(titulo: string, linhas: readonly string[]) {
      const t = document.createElement("p");
      t.className = "font-semibold";
      t.textContent = titulo;
      const resto = linhas.map((l) => {
        const p = document.createElement("p");
        p.className = "tabular-nums";
        p.textContent = l;
        return p;
      });
      el.replaceChildren(t, ...resto);
    },
    remover: () => el.remove(),
  };
}

/** Joystick de toque (também funciona com o mouse): devolve x e y de −1 a 1, y para cima
 *  positivo, enquanto o dedo arrasta; zero ao soltar. */
export function criarJoystick(conteiner: HTMLElement, aoMover: (x: number, y: number) => void) {
  const base = document.createElement("div");
  base.dataset.testid = "joystick-tour";
  base.setAttribute("role", "group");
  base.setAttribute("aria-label", "Controle de caminhada: arraste para andar e girar");
  base.className =
    "bg-background/60 absolute right-3 bottom-16 z-10 size-28 touch-none rounded-full border-2 shadow-md select-none";
  const botao = document.createElement("div");
  botao.className =
    "bg-primary/80 pointer-events-none absolute top-1/2 left-1/2 size-11 -translate-x-1/2 -translate-y-1/2 rounded-full";
  base.appendChild(botao);
  conteiner.appendChild(base);

  let dedo: number | null = null;
  const mover = (e: PointerEvent) => {
    const r = base.getBoundingClientRect();
    const raio = r.width / 2;
    let x = (e.clientX - (r.left + raio)) / raio;
    let y = -(e.clientY - (r.top + raio)) / raio;
    const n = Math.hypot(x, y);
    if (n > 1) {
      x /= n;
      y /= n;
    }
    botao.style.transform = `translate(calc(-50% + ${x * raio * 0.6}px), calc(-50% + ${-y * raio * 0.6}px))`;
    aoMover(x, y);
  };
  const soltar = (e: PointerEvent) => {
    if (e.pointerId !== dedo) return;
    dedo = null;
    botao.style.transform = "";
    aoMover(0, 0);
  };
  base.addEventListener("pointerdown", (e) => {
    dedo = e.pointerId;
    base.setPointerCapture(e.pointerId);
    e.preventDefault();
    mover(e);
  });
  base.addEventListener("pointermove", (e) => {
    if (e.pointerId === dedo) mover(e);
  });
  base.addEventListener("pointerup", soltar);
  base.addEventListener("pointercancel", soltar);
  return { remover: () => base.remove() };
}
