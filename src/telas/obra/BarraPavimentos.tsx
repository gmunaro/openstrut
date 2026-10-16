// Barra de pavimentos: escolhe o pavimento ativo e edita o ativo (nome,
// pé-direito, repetições, posição, apagar, copiar a planta de outro).
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
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
  moverPavimento,
  problemaNomePavimento,
  problemaPeDireito,
  problemaRepeticoes,
  renomearPavimento,
} from "../pavimentos";
import { useConfirmacao } from "../useConfirmacao";
import { CampoTexto } from "./campos";
import { CampoPavimentoNumero } from "./BarraPavimentosNumero";

export function BarraPavimentos({ obra, ativoId }: { obra: Obra; ativoId: string | null }) {
  const editar = useObra((e) => e.editar);
  const selecionarPavimento = useObra((e) => e.selecionarPavimento);
  const indice = obra.pavimentos.findIndex((p) => p.id === ativoId);
  const ativo = obra.pavimentos[indice];
  const { confirmar, dialogo } = useConfirmacao();

  const novo = () => {
    // a criação precisa do id do pavimento novo para selecioná-lo depois
    const r = adicionarPavimento(obra, Math.max(indice, 0));
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
        descricao: `A planta atual dá lugar à de "${origem.nome}". Dá para desfazer (Ctrl+Z).`,
        acao: "Substituir planta",
        destrutiva: true,
      }));
    if (ok) editar((o) => copiarPlanta(o, origemId, ativo.id));
  };

  return (
    <div className="bg-card flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 print:hidden">
      <nav aria-label="Pavimentos" className="flex flex-wrap items-center gap-1">
        <span className="text-muted-foreground mr-1 text-xs">Pavimentos (topo → base)</span>
        {obra.pavimentos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => selecionarPavimento(p.id)}
            aria-current={p.id === ativoId ? "true" : undefined}
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs",
              p.id === ativoId
                ? "border-primary bg-primary/15 text-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {p.nome}
            {p.repeticoes > 1 && <span className="ml-1 opacity-70">×{p.repeticoes}</span>}
          </button>
        ))}
        <Button
          variant="ghost"
          size="icon-xs"
          title="Novo pavimento (acima do ativo)"
          aria-label="Novo pavimento"
          onClick={novo}
        >
          <Plus />
        </Button>
      </nav>

      {ativo && (
        // key: ao trocar de pavimento os campos recomeçam com os valores dele (sem levar
        // texto digitado e não confirmado de um pavimento para outro)
        <div key={ativo.id} className="flex flex-wrap items-center gap-2 text-xs">
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
            title="Descer (para a base)"
            aria-label="Descer pavimento"
            disabled={indice >= obra.pavimentos.length - 1}
            onClick={() => editar((o) => moverPavimento(o, ativo.id, 1))}
          >
            <ArrowDown />
          </Button>
          {obra.pavimentos.length > 1 && (
            <Select value="" onValueChange={(id) => void copiarDe(id)}>
              <SelectTrigger
                size="sm"
                className="h-7 text-xs"
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
            title="Apagar pavimento"
            aria-label="Apagar pavimento"
            disabled={obra.pavimentos.length <= 1}
            onClick={() => void apagar()}
            className="hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </div>
      )}
      {dialogo}
    </div>
  );
}
