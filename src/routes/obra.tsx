// Rota /obra. Antes de sair da tela com alterações que não foram salvas em arquivo,
// pede confirmação. O rascunho no navegador não conta como salvo. Ao fechar ou
// recarregar a aba, o navegador mostra o aviso padrão enquanto a obra estiver assim.
import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useObra } from "../estado/obra";
import { TelaObra } from "../telas/obra/TelaObra";
import { useSessao } from "../telas/sessao";

/** Há obra aberta com alterações que não foram para o arquivo. Lê o estado no momento da chamada. */
function temAlteracoesNaoSalvas(): boolean {
  const obra = useObra.getState().obra;
  return obra !== null && obra !== useSessao.getState().obraSalva;
}

export const Route = createFileRoute("/obra")({ component: ObraComGuarda });

/** Tela da obra com o aviso de saída: bloqueia a troca de tela enquanto houver alterações não salvas. */
function ObraComGuarda() {
  const bloqueio = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      current.pathname === "/obra" && next.pathname !== "/obra" && temAlteracoesNaoSalvas(),
    enableBeforeUnload: temAlteracoesNaoSalvas,
    withResolver: true,
  });

  return (
    <>
      <TelaObra />
      <Dialog open={bloqueio.status === "blocked"}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Sair com alterações não salvas?</DialogTitle>
            <DialogDescription>
              A obra tem alterações que não foram salvas em arquivo. O rascunho continua no
              navegador e pode ser reaberto pela lista de recentes na tela inicial. Para guardar no
              arquivo, cancele e salve antes de sair.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              autoFocus
              onClick={() => bloqueio.status === "blocked" && bloqueio.reset()}
            >
              Continuar editando
            </Button>
            <Button
              variant="destructive"
              onClick={() => bloqueio.status === "blocked" && bloqueio.proceed()}
            >
              Sair sem salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
