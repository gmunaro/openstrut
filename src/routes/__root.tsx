import { createRootRoute, Outlet } from "@tanstack/react-router";
import { BotaoRelatar } from "../components/relato/BotaoRelatar";
import { instalarColetorErros } from "../components/relato/coletorErros";
// de marca.ts, não de telas/calculo.ts: este arquivo está no carregamento inicial e o
// outro traz o motor de cálculo junto
import { AVISO_CONFERENCIA } from "../telas/marca";

// os erros da página vão para o diagnóstico do relato de problema; liga antes de montar
instalarColetorErros();

export const Route = createRootRoute({ component: Raiz });

/** Moldura do app (conteúdo da rota e o rodapé com o aviso de conferência) e, fora dela,
 *  o botão de relatar problema, por cima de todas as telas. O botão fica fora da moldura
 *  para não mexer nos seletores `#root > div:first-child` e `> footer` do index.css. */
function Raiz() {
  return (
    <>
      <div className="flex h-screen flex-col print:block print:h-auto">
        <div className="flex min-h-0 flex-1 flex-col overflow-auto print:overflow-visible">
          <Outlet />
        </div>
        <footer className="text-aviso border-t px-4 py-1 text-center text-xs print:hidden">
          {AVISO_CONFERENCIA}
        </footer>
      </div>
      <BotaoRelatar />
    </>
  );
}
