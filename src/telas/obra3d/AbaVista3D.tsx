// Aba 3D da tela da obra: confere o WebGL e só então carrega a vista (three.js num
// pedaço próprio do bundle, baixado na primeira vez que a aba abre).
import { Component, lazy, type ReactNode, Suspense, useMemo, useState } from "react";
import type { Calculo } from "../calculo";
import type { Obra } from "../../dominio/obra";
import type { Ver3d } from "./link";

/** O import da vista; outro import (tentar de novo) cria um lazy novo. */
const carregarVista = () => lazy(() => import("./Vista3D"));

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
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    // solta o contexto do teste na hora (o navegador limita os contextos abertos)
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/** Falha ao baixar o pedaço da vista (sem rede antes da primeira visita, ou depois de
 *  uma atualização do app): mensagem e "Tentar de novo", sem derrubar a tela da obra. */
class FalhaAoCarregar extends Component<
  { children: ReactNode; aoTentar: () => void },
  { erro: string | null }
> {
  override state = { erro: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
  override render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div role="alert" className="mx-auto grid max-w-xl gap-2 p-6 text-sm">
        <p className="font-semibold">A vista 3D não carregou.</p>
        <p className="text-muted-foreground">
          O código da vista 3D é baixado na primeira vez que a aba abre e precisa de conexão. A
          planta e os resultados continuam disponíveis. ({this.state.erro})
        </p>
        <button
          type="button"
          className="w-fit rounded-md border px-3 py-1.5"
          onClick={() => {
            this.setState({ erro: null });
            this.props.aoTentar();
          }}
        >
          Tentar de novo
        </button>
      </div>
    );
  }
}

export function AbaVista3D(props: PropsVista3D) {
  const webgl = useMemo(temWebGL, []);
  const [Vista3D, setVista3D] = useState(carregarVista);
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
    <FalhaAoCarregar aoTentar={() => setVista3D(carregarVista)}>
      <Suspense
        fallback={
          <p role="status" className="text-muted-foreground p-6 text-sm">
            Carregando a vista 3D…
          </p>
        }
      >
        <Vista3D {...props} />
      </Suspense>
    </FalhaAoCarregar>
  );
}
