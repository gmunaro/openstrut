import { createRootRoute, Outlet } from "@tanstack/react-router";
import { BotaoRelatar } from "../components/relato/BotaoRelatar";
import { instalarColetorErros } from "../components/relato/coletorErros";
import { AVISO_CONFERENCIA } from "../telas/calculo";

// os erros da página vão para o diagnóstico do relato de problema; liga antes de montar
instalarColetorErros();

export const Route = createRootRoute({ component: Raiz });

/** Moldura do app: conteúdo da rota, o rodapé com o aviso de conferência e o botão de
 *  relatar problema, por cima de todas as telas. */
function Raiz() {
  return (
    <div className="flex h-screen flex-col print:block print:h-auto">
      <div className="flex min-h-0 flex-1 flex-col overflow-auto print:overflow-visible">
        <Outlet />
      </div>
      <footer className="text-aviso border-t px-4 py-1 text-center text-xs print:hidden">
        {AVISO_CONFERENCIA}
      </footer>
      <BotaoRelatar />
    </div>
  );
}
