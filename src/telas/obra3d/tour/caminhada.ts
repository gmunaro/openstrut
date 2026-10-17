// Tour livre em primeira pessoa (lógica pura, testada em caminhada.test.ts): o passo da
// caminhada a cada quadro e os pisos onde dá para ficar. Coordenadas da cena (Y para cima,
// m). Rumo 0 olha para −Z (a câmera padrão do three.js); rumo positivo gira para a
// esquerda, no sentido anti-horário visto de cima.
import type { Nivel } from "../api";

/** Altura dos olhos acima do piso, m. */
export const ALTURA_OLHOS = 1.6;
/** Velocidade de caminhada, m/s, e de giro, rad/s. */
export const VELOCIDADE = 3;
export const GIRO = Math.PI / 2;

export interface Caminhante {
  x: number;
  y: number;
  z: number;
  /** Rumo, rad. */
  rumo: number;
}

/** Comando do teclado ou do joystick, cada eixo de −1 a 1: `frente` anda para a frente,
 *  `lado` anda para a direita, `giro` gira para a esquerda. */
export interface Comando {
  frente: number;
  lado: number;
  giro: number;
}

const limitar = (v: number) => Math.max(-1, Math.min(1, v));

/** Direção para onde o caminhante olha, no plano horizontal. */
export function frenteDe(rumo: number) {
  return { x: -Math.sin(rumo), z: -Math.cos(rumo) };
}

/** O caminhante depois de `dt` segundos de `comando`. Andar na diagonal não é mais rápido
 *  que andar reto (o vetor de frente e lado é limitado a 1). A altura não muda. */
export function passo(c: Caminhante, comando: Comando, dt: number): Caminhante {
  const rumo = c.rumo + limitar(comando.giro) * GIRO * dt;
  let f = limitar(comando.frente);
  let l = limitar(comando.lado);
  const n = Math.hypot(f, l);
  if (n > 1) {
    f /= n;
    l /= n;
  }
  const d = frenteDe(rumo);
  // direita = frente girada 90° no sentido horário: (−dz, dx)
  const passoM = VELOCIDADE * dt;
  return {
    x: c.x + (d.x * f - d.z * l) * passoM,
    y: c.y,
    z: c.z + (d.z * f + d.x * l) * passoM,
    rumo,
  };
}

/** Os pisos da caminhada, de baixo para cima: o chão (a cota de piso do primeiro nível) e
 *  a face de cima da laje de cada nível. `nivel` e `cota` vão para `ctx.alturaNaCena`. */
export function pisos(niveis: readonly Pick<Nivel, "nome" | "indice" | "cota" | "cotaPiso">[]) {
  const primeiro = niveis[0];
  if (!primeiro) return [];
  return [
    { nome: "Chão", nivel: primeiro.indice, cota: primeiro.cotaPiso },
    ...niveis.map((n) => ({ nome: n.nome, nivel: n.indice, cota: n.cota })),
  ];
}
