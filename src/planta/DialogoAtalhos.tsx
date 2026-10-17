// Lista de atalhos do editor de planta, aberta pela tecla "?" ou pelo botão "Atalhos".
// A lista é a fonte única do que o editor aceita pelo teclado e pelo mouse.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Grupos de atalhos: tecla (ou gesto) e o que faz. */
export const ATALHOS: { grupo: string; itens: [string[], string][] }[] = [
  {
    grupo: "Ferramentas",
    itens: [
      [["V"], "Selecionar"],
      [["L"], "Laje: arraste de um canto ao outro"],
      [["P"], "Pilar: clique sobre o eixo de uma viga"],
      [["M"], "Medir: clique em dois pontos"],
      [["A"], "Adicionar elemento digitando as coordenadas"],
      [["Esc"], "Cancela o desenho, limpa a medida ou volta para Selecionar"],
    ],
  },
  {
    grupo: "Edição",
    itens: [
      [["Delete"], "Apaga o elemento selecionado"],
      [["Ctrl", "Z"], "Desfaz"],
      [["Ctrl", "Y"], "Refaz (também Ctrl + Shift + Z)"],
      [["Shift", "←↑→↓"], "Move a laje ou o pilar selecionado um passo da grade"],
      [["←↑→↓"], "Percorre os elementos, com a planta em foco"],
    ],
  },
  {
    grupo: "Vista",
    itens: [
      [["Roda"], "Zoom no ponto do cursor"],
      [["Espaço", "arrastar"], "Move a vista (também o botão do meio)"],
      [["E"], "Enquadra o pavimento inteiro"],
      [["?"], "Mostra esta lista"],
    ],
  },
];

export function DialogoAtalhos({
  aberto,
  aoMudarAberto,
}: {
  aberto: boolean;
  aoMudarAberto: (a: boolean) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudarAberto}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Atalhos da planta</DialogTitle>
          <DialogDescription>
            Valem com o mouse sobre a planta ou com ela em foco, fora dos campos de texto.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {ATALHOS.map((g) => (
            <section key={g.grupo} aria-label={g.grupo}>
              <h3 className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
                {g.grupo}
              </h3>
              <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1 text-sm">
                {g.itens.map(([teclas, acao]) => (
                  <div key={acao} className="contents">
                    <dt className="flex flex-wrap items-center gap-1">
                      {teclas.map((t) => (
                        <kbd
                          key={t}
                          className="bg-muted rounded border px-1.5 py-0.5 font-mono text-xs"
                        >
                          {t}
                        </kbd>
                      ))}
                    </dt>
                    <dd>{acao}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
