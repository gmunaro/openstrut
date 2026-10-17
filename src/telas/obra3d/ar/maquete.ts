// Contas puras da realidade aumentada: a escala da maquete e a matriz que leva a cena da
// vista (m, Y para cima) ao ponto da mesa ou do chão achado pelo hit-test, com a base no
// chão, centrada no ponto e girada em torno da vertical. Sem DOM e sem WebXR: testadas em
// maquete.test.ts com conta à mão.
import { Box3, Matrix4, Vector3 } from "three";

/** Escalas oferecidas: maquete de mesa (1:50, 1:100, 1:200) e tamanho real (1:1). */
export const ESCALAS = [
  { id: "1:50", fator: 1 / 50 },
  { id: "1:100", fator: 1 / 100 },
  { id: "1:200", fator: 1 / 200 },
  { id: "1:1", fator: 1 },
] as const;

export type EscalaAr = (typeof ESCALAS)[number]["id"];

export const ESCALA_PADRAO: EscalaAr = "1:100";

/** Fator da escala (1:100 → 0,01). */
export function fatorDaEscala(escala: EscalaAr): number {
  return ESCALAS.find((e) => e.id === escala)!.fator;
}

/** Matriz cena → mundo AR: o centro da base da `caixa` (centro em X e Z, Y mínimo) vai
 *  para `ponto`, a caixa encolhe pelo `fator` e gira `rotacao` rad em torno da vertical
 *  (anti-horário visto de cima, como `Matrix4.makeRotationY`). A base fica no plano do
 *  ponto: M = T(ponto) · Ry(rotacao) · S(fator) · T(−centroDaBase). */
export function matrizDaMaquete(
  caixa: Box3,
  ponto: Vector3,
  fator: number,
  rotacao: number,
): Matrix4 {
  const base = new Vector3(
    (caixa.min.x + caixa.max.x) / 2,
    caixa.min.y,
    (caixa.min.z + caixa.max.z) / 2,
  );
  return new Matrix4()
    .makeTranslation(ponto.x, ponto.y, ponto.z)
    .multiply(new Matrix4().makeRotationY(rotacao))
    .multiply(new Matrix4().makeScale(fator, fator, fator))
    .multiply(new Matrix4().makeTranslation(-base.x, -base.y, -base.z));
}

/** Giro inicial em torno da vertical para a frente da vista (+Z da cena, a direção de onde
 *  a vista "Frente" olha) ficar voltada para quem segura o celular em `olho`. */
export function rotacaoDeFrente(ponto: Vector3, olho: Vector3): number {
  const dx = olho.x - ponto.x;
  const dz = olho.z - ponto.z;
  if (dx * dx + dz * dz < 1e-12) return 0;
  // Ry(θ) leva +Z a (sen θ, 0, cos θ)
  return Math.atan2(dx, dz);
}

/** A pose do hit-test é de superfície horizontal virada para cima (mesa, chão), não de
 *  parede nem de teto: o eixo Y da pose (a normal da superfície) fica a menos de ~25° da
 *  vertical. `m` é a matriz 4 × 4 da pose em colunas (XRRigidTransform.matrix). */
export function ehHorizontal(m: ArrayLike<number>): boolean {
  return (m[5] ?? 0) > 0.9;
}

/** Ângulo, rad, do segmento entre dois toques na tela (px, y para baixo). Girar dois
 *  dedos no sentido horário na tela aumenta o ângulo. */
export function anguloDosToques(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Diferença entre dois ângulos, rad, levada a (−π, π]: o giro entre dois quadros do
 *  gesto não salta ao passar de π para −π. */
export function diferencaAngular(depois: number, antes: number): number {
  let d = depois - antes;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Caixa das peças que aparecem na vista (foco, filtros, cortes), com o explodido; vazia se
 *  nenhuma aparece. É a caixa que vai para a mesa. */
export function caixaDasVisiveis(
  chaves: Iterable<string>,
  visivel: (chave: string) => boolean,
  caixaDe: (chave: string) => Box3 | undefined,
): Box3 {
  const caixa = new Box3();
  for (const k of chaves) {
    if (!visivel(k)) continue;
    const c = caixaDe(k);
    if (c && !c.isEmpty()) caixa.union(c);
  }
  return caixa;
}
