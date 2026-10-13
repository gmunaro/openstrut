// Vizinhança e vinculação das lajes de um pavimento, como na V1
// (LAJEGEOT.BM, LgDetectaContinuidade; LAJCALC.BM, LcSobrepoe%).
// Independe da norma.
import { BORDOS, type Bordo, type Laje, type Vinculo } from "../../dominio/obra";

/** Tolerância geométrica da V1, m (LG_TOL e LcSobrepoe%). */
export const TOL = 0.001;

export const BORDO_OPOSTO: Record<Bordo, Bordo> = {
  esquerdo: "direito",
  direito: "esquerdo",
  inferior: "superior",
  superior: "inferior",
};

export type GeometriaLaje = Pick<Laje, "id" | "x" | "y" | "lx" | "ly">;

/** Linha do bordo: coordenada da linha (x se vertical, y se horizontal) e
 *  extensão ao longo dela, m (V1 LgGeom / LcBordoGeom). */
export function linhaDoBordo(l: GeometriaLaje, b: Bordo) {
  switch (b) {
    case "esquerdo":
      return { eixo: l.x, inicio: l.y, fim: l.y + l.ly };
    case "inferior":
      return { eixo: l.y, inicio: l.x, fim: l.x + l.lx };
    case "direito":
      return { eixo: l.x + l.lx, inicio: l.y, fim: l.y + l.ly };
    case "superior":
      return { eixo: l.y + l.ly, inicio: l.x, fim: l.x + l.lx };
  }
}

/** Bordo de uma laje encostado no bordo oposto de outra, na mesma linha. */
export interface Contato {
  laje: string;
  bordo: Bordo;
  vizinha: string;
  bordoVizinha: Bordo;
  /** Comprimento comum aos dois bordos, m. */
  sobreposicao: number;
  /** O menor dos dois bordos, m. */
  menorLado: number;
}

/**
 * Todos os contatos entre bordos opostos (esquerdo × direito, inferior ×
 * superior) de lajes diferentes que estão na mesma linha (±1 mm) e têm algum
 * trecho comum. Cada par aparece nos dois sentidos, na ordem laje, bordo
 * (esquerdo, inferior, direito, superior), vizinha, que é a ordem dos laços da V1.
 */
export function contatos(lajes: readonly GeometriaLaje[]): Contato[] {
  const lista: Contato[] = [];
  for (const a of lajes) {
    for (const bordo of BORDOS) {
      const la = linhaDoBordo(a, bordo);
      const bordoVizinha = BORDO_OPOSTO[bordo];
      for (const b of lajes) {
        if (b === a) continue;
        const lb = linhaDoBordo(b, bordoVizinha);
        if (Math.abs(la.eixo - lb.eixo) > TOL) continue;
        const sobreposicao = Math.min(la.fim, lb.fim) - Math.max(la.inicio, lb.inicio);
        if (sobreposicao <= 0) continue;
        const menorLado = Math.min(la.fim - la.inicio, lb.fim - lb.inicio);
        lista.push({ laje: a.id, bordo, vizinha: b.id, bordoVizinha, sobreposicao, menorLado });
      }
    }
  }
  return lista;
}

/** Continuidade para a vinculação: sobreposição maior que 50% do menor dos dois
 *  bordos (V1 LgContinuo%; a regra dos 50% é suposição da reconstrução). */
export const ehContinuo = (c: Contato) => c.menorLado > TOL && c.sobreposicao > 0.5 * c.menorLado;

/**
 * Vínculo de cada bordo das lajes de um pavimento, por id da laje. Um bordo é
 * engastado quando há laje do outro lado em continuidade (`ehContinuo`) e
 * apoiado caso contrário (V1 LgDetectaContinuidade). Bordo livre não entra em
 * continuidade, nem de um lado nem do outro. O vínculo forçado em
 * `laje.vinculos` vale só para o próprio bordo: forçar "apoiado" num lado não
 * muda o vizinho, como a troca de bordo da V1 (LAJECALC BordoTroca).
 */
export function vinculacao(lajes: readonly Laje[]): Record<string, Record<Bordo, Vinculo>> {
  const porId = new Map(lajes.map((l) => [l.id, l]));
  const livre = (id: string, b: Bordo) => porId.get(id)?.vinculos[b] === "livre";
  const engastados = new Set(
    contatos(lajes)
      .filter((c) => ehContinuo(c) && !livre(c.laje, c.bordo) && !livre(c.vizinha, c.bordoVizinha))
      .map((c) => `${c.laje}|${c.bordo}`),
  );
  const resultado: Record<string, Record<Bordo, Vinculo>> = {};
  for (const l of lajes) {
    const detectado = (b: Bordo): Vinculo =>
      engastados.has(`${l.id}|${b}`) ? "engastado" : "apoiado";
    resultado[l.id] = {
      esquerdo: l.vinculos.esquerdo ?? detectado("esquerdo"),
      inferior: l.vinculos.inferior ?? detectado("inferior"),
      direito: l.vinculos.direito ?? detectado("direito"),
      superior: l.vinculos.superior ?? detectado("superior"),
    };
  }
  return resultado;
}
