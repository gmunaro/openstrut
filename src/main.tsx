import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { routeTree } from "./routeTree.gen";
import { ouvirInstalacao } from "./telas/instalar";
import { manterCampoVisivel } from "./telas/tela";
import { iniciarTema } from "./telas/tema";

// tema escolhido (escuro por padrão; index.css); a impressão volta para papel branco
iniciarTema();

// o pedido de instalação (Chrome, Edge) pode chegar antes da tela inicial montar
ouvirInstalacao();

// teclado virtual do celular: o campo em foco não fica embaixo dele
manterCampoVisivel();

// BASE_URL é o `base` do Vite: "/" no instalador desktop, "/openstrut/" no GitHub Pages
const router = createRouter({ routeTree, basepath: import.meta.env.BASE_URL });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("elemento #root ausente");
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
