// Barra de pavimentos: escolhe o pavimento ativo e edita o ativo (nome,
// pé-direito, repetições, posição, duplicar, apagar, copiar a planta de outro).
// No celular os pavimentos rolam na horizontal numa linha só e os campos do ativo
// ficam recolhidos atrás do botão "Editar pavimento".
import { ArrowDown, ArrowUp, Copy, CopyPlus, Plus, Settings2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Obra } from "../../dominio/obra";
import { useObra } from "../../estado/obra";
import {
  adicionarPavimento,
  alterarPeDireito,
  alterarRepeticoes,
  apagarPavimento,
  copiarPlanta,
  duplicarPavimento,
  moverPavimento,
  problemaNomePavimento,
  problemaPeDireito,
  problemaRepeticoes,
  renomearPavimento,
} from "../pavimentos";
import { useCompacto } from "../tela";
import { useConfirmacao } from "../useConfirmacao";
import { CampoTexto } from "./campos";
import { CampoPavimentoNumero } from "./BarraPavimentosNumero";

export function BarraPavimentos({ obra, ativoId }: { obra: Obra; ativoId: string | null }) {
  const editar = useObra((e) => e.editar);
  const selecionarPavimento = useObra((e) => e.selecionarPavimento);
  const indice = obra.pavimentos.findIndex((p) => p.id === ativoId);
  const ativo = obra.pavimentos[indice];
  const { confirmar, dialogo } = useConfirmacao();
  const compacto = useCompacto();
  const [editando, setEditando] = useState(false);
  // no celular os botões de ícone crescem para o alvo de toque (44 px)
  const icone = compacto ? "size-11 [&_svg:not([class*='size-'])]:size-4" : undefined;

  const novo = () => {
    // a criação precisa do id do pavimento novo para selecioná-lo depois
    const r = adicionarPavimento(obra, Math.max(indice, 0));
    editar(() => r.obra);
    selecionarPavimento(r.pavimento.id);
  };

  /** Cópia do ativo logo acima dele, já selecionada. */
  const duplicar = () => {
    if (!ativo) return;
    const r = duplicarPavimento(obra, ativo.id);
    if (!r.pavimento) return;
    editar(() => r.obra);
    selecionarPavimento(r.pavimento.id);
  };

  const apagar = async () => {
    if (!ativo) return;
    const conteudo = ativo.lajes.length + ativo.vigas.length + ativo.pilares.length;
    const planta =
      conteudo > 0
        ? ` A planta dele vai junto (${ativo.lajes.length} lajes, ${ativo.vigas.length} vigas, ${ativo.pilares.length} pilares).`
        : "";
    const ok = await confirmar({
      titulo: `Apagar o pavimento "${ativo.nome}"?`,
      descricao: `${planta} Dá para desfazer (Ctrl+Z).`.trim(),
      acao: "Apagar pavimento",
      destrutiva: true,
    });
    if (ok) editar((o) => apagarPavimento(o, ativo.id));
  };

  const copiarDe = async (origemId: string) => {
    if (!ativo) return;
    const origem = obra.pavimentos.find((p) => p.id === origemId);
    if (!origem) return;
    const vazio = ativo.lajes.length + ativo.vigas.length + ativo.pilares.length === 0;
    const ok =
      vazio ||
      (await confirmar({
        titulo: `Substituir a planta de "${ativo.nome}"?`,
        descricao: `A planta atual será substituída pela de "${origem.nome}". Dá para desfazer (Ctrl+Z).`,
        acao: "Substituir planta",
        destrutiva: true,
      }));
    if (ok) editar((o) => copiarPlanta(o, origemId, ativo.id));
  };

  return (
    <div
      className={cn(
        "bg-card flex flex-wrap items-center border-b print:hidden",
        compacto ? "gap-x-1 gap-y-1 px-1 py-0.5" : "gap-x-4 gap-y-2 px-4 py-2",
      )}
    >
      <nav
        aria-label="Pavimentos"
        className={cn(
          "flex items-center gap-1",
          // celular: uma linha que rola de lado, sem barra de rolagem à vista
          compacto
            ? "min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none]"
            : "flex-wrap",
        )}
      >
        <span className={cn("text-muted-foreground mr-1 text-xs", compacto && "sr-only")}>
          Pavimentos (topo → base)
        </span>
        {obra.pavimentos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => selecionarPavimento(p.id)}
            aria-current={p.id === ativoId ? "true" : undefined}
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs",
              compacto && "h-11 shrink-0 px-3 text-sm whitespace-nowrap",
              p.id === ativoId
                ? "border-primary bg-primary/15 text-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {p.nome}
            {p.repeticoes > 1 && (
              <span className="ml-1 opacity-70" title={`Repete ${p.repeticoes} vezes`}>
                ×{p.repeticoes}
              </span>
            )}
          </button>
        ))}
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn(icone, "shrink-0")}
          title="Novo pavimento (acima do ativo)"
          aria-label="Novo pavimento"
          onClick={novo}
        >
          <Plus />
        </Button>
      </nav>
      {compacto && (
        <Button
          variant={editando ? "secondary" : "ghost"}
          size="icon"
          className="size-11"
          aria-label="Editar pavimento"
          aria-expanded={editando}
          onClick={() => setEditando((e) => !e)}
        >
          <Settings2 />
        </Button>
      )}

      {ativo && (!compacto || editando) && (
        // key: ao trocar de pavimento os campos recomeçam com os valores dele (sem levar
        // texto digitado e não confirmado de um pavimento para outro)
        <div
          key={ativo.id}
          className={cn(
            "flex flex-wrap items-center gap-2 text-xs",
            compacto && "basis-full gap-x-3 px-2 pb-1 text-sm",
          )}
        >
          <CampoTexto
            rotulo="Nome"
            className="w-36"
            valor={ativo.nome}
            confirmar={(nome) => {
              const problema = problemaNomePavimento(obra, ativo.id, nome);
              if (!problema) editar((o) => renomearPavimento(o, ativo.id, nome));
              return problema;
            }}
          />
          <CampoPavimentoNumero
            rotulo="Pé-direito"
            unidade="m"
            className="w-16"
            valor={ativo.peDireito}
            problema={problemaPeDireito}
            confirmar={(n) => editar((o) => alterarPeDireito(o, ativo.id, n))}
          />
          <CampoPavimentoNumero
            rotulo="Repetições"
            className="w-12"
            casas={0}
            valor={ativo.repeticoes}
            problema={problemaRepeticoes}
            confirmar={(n) => editar((o) => alterarRepeticoes(o, ativo.id, n))}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            className={icone}
            title="Subir (para o topo)"
            aria-label="Subir pavimento"
            disabled={indice <= 0}
            onClick={() => editar((o) => moverPavimento(o, ativo.id, -1))}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className={icone}
            title="Descer (para a base)"
            aria-label="Descer pavimento"
            disabled={indice >= obra.pavimentos.length - 1}
            onClick={() => editar((o) => moverPavimento(o, ativo.id, 1))}
          >
            <ArrowDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className={icone}
            title="Duplicar pavimento (a cópia entra acima, com a mesma planta)"
            aria-label="Duplicar pavimento"
            onClick={duplicar}
          >
            <CopyPlus />
          </Button>
          {obra.pavimentos.length > 1 && (
            <Select value="" onValueChange={(id) => void copiarDe(id)}>
              <SelectTrigger
                size="sm"
                className={cn("h-7 text-xs", compacto && "h-11")}
                aria-label="Copiar planta de outro pavimento"
              >
                <Copy className="size-3.5" />
                <SelectValue placeholder="Copiar planta de…" />
              </SelectTrigger>
              <SelectContent>
                {obra.pavimentos
                  .filter((p) => p.id !== ativo.id)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn("hover:text-destructive", icone)}
            title={
              obra.pavimentos.length <= 1
                ? "A obra precisa de pelo menos um pavimento"
                : "Apagar pavimento"
            }
            aria-label="Apagar pavimento"
            disabled={obra.pavimentos.length <= 1}
            onClick={() => void apagar()}
          >
            <Trash2 />
          </Button>
        </div>
      )}
      {dialogo}
    </div>
  );
}
