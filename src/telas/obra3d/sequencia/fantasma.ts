// Malha transparente do "futuro" da sequência construtiva: os sólidos das peças que
// ainda não começaram, triangulados direto de `Elemento3D.solidos`. A vista não tem
// transparência por peça para camadas, então a camada esconde essas peças com o filtro
// e desenha esta malha no lugar.
import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from "three";
import type { Elemento3D, Ponto, Ponto3 } from "../api";

type V = [number, number, number];

/** Planta (x, y, z para cima) → cena (X, Y para cima, Z = −y). */
const cena = (x: number, y: number, z: number): V => [x, z, -y];

/** Triângulos dos sólidos das peças, em coordenadas da cena sem o explodido (o grupo do
 *  nível na camada aplica o deslocamento). Faces sem sentido definido: use DoubleSide. */
export function geometriaFantasma(elementos: readonly Elemento3D[]): BufferGeometry {
  const p: number[] = [];
  const tri = (a: V, b: V, c: V) => p.push(...a, ...b, ...c);
  const quad = (a: V, b: V, c: V, d: V) => {
    tri(a, b, c);
    tri(a, c, d);
  };
  for (const e of elementos)
    for (const s of e.solidos) {
      if (s.tipo === "prisma") {
        const n = s.base.length;
        if (n < 3 || !(s.z1 > s.z0)) continue;
        const tris = ShapeUtils.triangulateShape(
          s.base.map((q) => new Vector2(q.x, q.y)),
          [],
        );
        for (const t of tris) {
          const [a, b, c] = t.map((i) => s.base[i]!) as [Ponto, Ponto, Ponto];
          tri(cena(a.x, a.y, s.z0), cena(b.x, b.y, s.z0), cena(c.x, c.y, s.z0));
          tri(cena(a.x, a.y, s.z1), cena(b.x, b.y, s.z1), cena(c.x, c.y, s.z1));
        }
        for (let i = 0; i < n; i++) {
          const a = s.base[i]!;
          const b = s.base[(i + 1) % n]!;
          quad(
            cena(a.x, a.y, s.z0),
            cena(b.x, b.y, s.z0),
            cena(b.x, b.y, s.z1),
            cena(a.x, a.y, s.z1),
          );
        }
      } else {
        // barra: eixo da face de cima de a a b; largura na horizontal, altura para baixo
        const dx = s.b.x - s.a.x;
        const dy = s.b.y - s.a.y;
        const l = Math.hypot(dx, dy);
        if (!(l > 0)) continue;
        const px = (-dy / l) * (s.largura / 2);
        const py = (dx / l) * (s.largura / 2);
        const canto = (q: Ponto3, lado: number, desce: number) =>
          cena(q.x + lado * px, q.y + lado * py, q.z - desce);
        const [a1, a2, b1, b2] = [
          canto(s.a, 1, 0),
          canto(s.a, -1, 0),
          canto(s.b, 1, 0),
          canto(s.b, -1, 0),
        ];
        const h = s.altura;
        const [c1, c2, d1, d2] = [
          canto(s.a, 1, h),
          canto(s.a, -1, h),
          canto(s.b, 1, h),
          canto(s.b, -1, h),
        ];
        quad(a1, b1, b2, a2); // topo
        quad(c1, d1, d2, c2); // fundo
        quad(a1, b1, d1, c1); // lado +
        quad(a2, b2, d2, c2); // lado −
        quad(a1, a2, c2, c1); // ponta a
        quad(b1, b2, d2, d1); // ponta b
      }
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}
