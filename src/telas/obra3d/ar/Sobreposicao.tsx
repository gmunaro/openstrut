// Controles por cima da câmera durante a sessão AR (dom-overlay): o que fazer agora, a
// escala e "Sair". O resto da tela fica livre para o toque que põe o prédio e para o
// giro com dois dedos (tratados em sessao.ts, na raiz da sobreposição).
import { Button } from "@/components/ui/button";
import { useEstadoAr } from "./estado";
import { ESCALAS, type EscalaAr } from "./maquete";

/** Atributo dos controles: o toque neles não posiciona o prédio (beforexrselect). */
export const SEM_SELECT = "data-ar-sem-select";

const INSTRUCAO = {
  fora: "",
  abrindo: "Abrindo a câmera…",
  procurando: "Aponte para a mesa ou o chão e mova o celular devagar até aparecer o anel.",
  mirando: "Toque na tela para pôr o prédio no anel.",
  posicionado: "Toque em outro ponto para mudar o prédio de lugar. Gire com dois dedos.",
} as const;

export function Sobreposicao({
  aoSair,
  aoEscala,
}: {
  aoSair: () => void;
  aoEscala: (e: EscalaAr) => void;
}) {
  const { fase, escala } = useEstadoAr();
  return (
    <div className="pointer-events-none fixed inset-0 flex flex-col justify-between gap-2 p-3 text-sm text-white">
      <p role="status" aria-live="polite" className="rounded-md bg-black/65 px-3 py-2">
        {INSTRUCAO[fase]}
      </p>
      <div
        {...{ [SEM_SELECT]: "" }}
        className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-md bg-black/65 p-2"
      >
        <span>Escala</span>
        <div role="group" aria-label="Escala" className="flex gap-1">
          {ESCALAS.map((e) => (
            // botão nativo: as cores fixas (branco sobre a câmera) não passam pelo tema
            <button
              key={e.id}
              type="button"
              aria-pressed={e.id === escala}
              className={`h-10 rounded-md px-2 font-medium outline-none focus-visible:ring-2 focus-visible:ring-white ${
                e.id === escala ? "bg-white text-black" : "text-white"
              }`}
              onClick={() => aoEscala(e.id)}
            >
              {e.id}
            </button>
          ))}
        </div>
        <Button size="sm" variant="destructive" className="ml-auto h-10" onClick={aoSair}>
          Sair
        </Button>
      </div>
    </div>
  );
}
