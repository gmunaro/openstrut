import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AVISO_CONFERENCIA } from "../telas/calculo";

export const Route = createRootRoute({ component: Raiz });

/** Moldura do app: conteúdo da rota e o rodapé com o aviso de conferência. Ocupa a altura
 *  visível (dvh: sem a barra do navegador do celular) e deixa livres as bordas do aparelho
 *  (safe-area: entalhe da câmera e barra de gestos, no app instalado). */
function Raiz() {
  return (
    <div className="flex h-dvh flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] print:block print:h-auto print:p-0">
      <div className="flex min-h-0 flex-1 flex-col overflow-auto print:overflow-visible">
        <Outlet />
      </div>
      <footer className="text-aviso compacto:py-0.5 compacto:text-[11px] compacto:leading-tight border-t px-4 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] text-center text-xs print:hidden">
        {AVISO_CONFERENCIA}
      </footer>
    </div>
  );
}
