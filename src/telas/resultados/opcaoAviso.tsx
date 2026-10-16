// Botão da opção de um aviso (ResultadoObra.avisosComOpcao): liga a opção no elemento
// numa entrada só do desfazer, e o cálculo refaz sozinho (a tela calcula a obra aberta).
import { Button } from "@/components/ui/button";
import { type AvisoComOpcao, type IdAviso, OPCOES_AVISO } from "../../calculo/avisos";
import type { Obra, Pavimento } from "../../dominio/obra";
import { useObra } from "../../estado/obra";

/** O que cada opção muda no elemento do aviso. */
const LIGAR: Record<IdAviso, (p: Pavimento, id: string) => Pavimento> = {
  "viga.continuar-acima-do-limite": (p, id) => ({
    ...p,
    vigas: p.vigas.map((v) => (v.id === id ? { ...v, continuaSeExcederLimite: true } : v)),
  }),
  "pilar.nasce-em-transicao": (p, id) => ({
    ...p,
    pilares: p.pilares.map((q) => (q.id === id ? { ...q, transicao: true } : q)),
  }),
};

/** A obra com a opção do aviso ligada no elemento dele. */
export function ligarOpcao(obra: Obra, a: AvisoComOpcao): Obra {
  return {
    ...obra,
    pavimentos: obra.pavimentos.map((p) =>
      p.id === a.pavimentoId ? LIGAR[a.id](p, a.elemento.id) : p,
    ),
  };
}

/** Botão com o rótulo da opção; o nome acessível diz o elemento. */
export function BotaoOpcao({ opcao, elemento }: { opcao: AvisoComOpcao; elemento: string }) {
  const editar = useObra((e) => e.editar);
  const rotulo = OPCOES_AVISO[opcao.id];
  return (
    <Button
      variant="outline"
      size="xs"
      className="ml-2 align-baseline print:hidden"
      aria-label={elemento ? `${rotulo} (${elemento})` : rotulo}
      onClick={() => editar((o) => ligarOpcao(o, opcao))}
    >
      {rotulo}
    </Button>
  );
}
