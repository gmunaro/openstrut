// Confirmação em diálogo (Radix Dialog) no lugar de window.confirm: tem título, foco
// e Escape como os outros diálogos da tela. `confirmar` devolve uma promessa que
// resolve com a escolha do usuário; ao fechar, o foco volta ao elemento de origem.
import { type RefObject, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** `destrutiva`: a ação apaga ou substitui algo (botão em vermelho). */
type Pergunta = { titulo: string; descricao: string; acao: string; destrutiva?: boolean };

/**
 * Devolve `confirmar(pergunta)`, que abre o diálogo e resolve `true` só se o usuário
 * escolher a ação, e o `dialogo` a renderizar no JSX. Cancelar, Escape e clicar fora
 * resolvem `false`. Chamar de novo antes de responder resolve a anterior com `false`.
 * Ao fechar, o foco volta a `botaoOrigem` ou, sem ele, ao elemento que tinha o foco
 * quando a pergunta abriu (o botão clicado), se ele ainda estiver na página.
 */
export function useConfirmacao(botaoOrigem?: RefObject<HTMLElement | null>) {
  // A pergunta fica guardada depois de fechar, para o texto não sumir na animação.
  const [pergunta, setPergunta] = useState<Pergunta>({ titulo: "", descricao: "", acao: "" });
  const [aberta, setAberta] = useState(false);
  const resposta = useRef<((ok: boolean) => void) | null>(null);
  const origem = useRef<HTMLElement | null>(null);

  const decidir = (ok: boolean) => {
    resposta.current?.(ok);
    resposta.current = null;
    setAberta(false);
  };

  const confirmar = (nova: Pergunta) =>
    new Promise<boolean>((resolver) => {
      resposta.current?.(false);
      resposta.current = resolver;
      const ativo = document.activeElement;
      origem.current = botaoOrigem?.current ?? (ativo instanceof HTMLElement ? ativo : null);
      setPergunta(nova);
      setAberta(true);
    });

  const dialogo = (
    <Dialog open={aberta} onOpenChange={(aberto) => !aberto && decidir(false)}>
      <DialogContent
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (origem.current?.isConnected) origem.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{pergunta.titulo}</DialogTitle>
          <DialogDescription>{pergunta.descricao}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => decidir(false)}>
            Cancelar
          </Button>
          <Button
            variant={pergunta.destrutiva ? "destructive" : "default"}
            onClick={() => decidir(true)}
          >
            {pergunta.acao}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirmar, dialogo };
}
