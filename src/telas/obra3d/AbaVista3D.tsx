// Aba 3D da tela da obra: confere o WebGL e só então carrega a vista (three.js num
// pedaço próprio do bundle, baixado na primeira vez que a aba abre).
import { lazy, Suspense, useMemo } from "react";
import type { Calculo } from "../calculo";
import type { Obra } from "../../dominio/obra";
import type { Ver3d } from "./link";

const Vista3D = lazy(() => import("./Vista3D"));

export interface PropsVista3D {
  obra: Obra;
  calculo: Calculo;
  /** Elemento em foco ao abrir (entrada "ver em 3D"). */
  foco?: Ver3d | null;
  aoVerNaPlanta: (v: Ver3d) => void;
  aoVerNosResultados: (v: Ver3d) => void;
}

function temWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function AbaVista3D(props: PropsVista3D) {
  const webgl = useMemo(temWebGL, []);
  if (!webgl)
    return (
      <div role="alert" className="mx-auto grid max-w-xl gap-2 p-6 text-sm">
        <p className="font-semibold">
          A vista 3D precisa de WebGL, que este navegador não oferece.
        </p>
        <p className="text-muted-foreground">
          Ative a aceleração gráfica do navegador ou use outro navegador. A geometria da obra está
          na aba Planta e os resultados de cada elemento, na aba Resultados.
        </p>
      </div>
    );
  return (
    <Suspense
      fallback={
        <p role="status" className="text-muted-foreground p-6 text-sm">
          Carregando a vista 3D…
        </p>
      }
    >
      <Vista3D {...props} />
    </Suspense>
  );
}
