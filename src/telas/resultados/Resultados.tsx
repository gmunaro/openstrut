// Aba Resultados: falhas dos pavimentos (em vermelho) e avisos da obra; por
// pavimento, as tabelas de lajes, vigas e equilíbrio; depois os pilares por
// nível. Cada elemento abre a memória.
import { CircleAlert, Info } from "lucide-react";
import { useContext, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import type { ResultadoObra } from "../../calculo/fluxo";
import { calcularQuantitativos } from "../../calculo/quantitativos";
import type { Obra } from "../../dominio/obra";
import { useObra } from "../../estado/obra";
import {
  coletarAvisos,
  coletarFalhas,
  mensagemSemNorma,
  SELO_MODO_ORIGINAL,
  type Calculo,
} from "../calculo";
import { DetalhamentoContexto } from "../detalhamento";
import { formatarNumero } from "../formato";
import { ListaAvisos, ListaFalhas } from "./avisos";
import { TabelaEquilibrio } from "./equilibrio";
import { TabelasLajes } from "./lajes";
import { BlocoMotorSistrut, coletarMarcasMotor, semMarcasDuplicadas } from "./motorSistrut";
import { TabelaPilares } from "./pilares";
import { ResumoQuantitativos } from "./quantitativos";
import { TabelaVigas } from "./vigas";

/** Mensagem quando não há resultado: norma sem implementação ou erro do motor. */
export function SemCalculo({ calculo }: { calculo: Exclude<Calculo, { tipo: "ok" }> }) {
  if (calculo.tipo === "semNorma")
    return (
      <div
        role="status"
        className="border-aviso/50 bg-aviso/10 text-aviso flex items-start gap-2 rounded-md border p-4 text-sm"
      >
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>{mensagemSemNorma(calculo.norma)}</p>
      </div>
    );
  return (
    <div
      role="alert"
      className="border-destructive/60 bg-destructive/10 flex items-start gap-2 rounded-md border p-4 text-sm"
    >
      <CircleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">O cálculo não pôde ser concluído.</p>
        <p className="text-muted-foreground mt-1 text-xs">{calculo.mensagem}</p>
      </div>
    </div>
  );
}

/** Tabelas de todos os pavimentos e dos pilares (também usadas no relatório). */
export function TabelasObra({
  resultado,
  comMemoria,
}: {
  resultado: ResultadoObra;
  comMemoria: boolean;
}) {
  const gamaF = Math.max(resultado.norma.gamaG, resultado.norma.gamaQ);
  return (
    <>
      {resultado.pavimentos.map((rp) => (
        <section key={rp.pavimento.id} className="mt-6 break-inside-auto">
          <h2 className="border-b pb-1 text-base font-semibold">
            {rp.pavimento.nome}
            <span className="text-muted-foreground ml-3 text-xs font-normal">
              pé-direito {formatarNumero(rp.pavimento.peDireito)} m
              {rp.pavimento.repeticoes > 1 ? ` · repete ${rp.pavimento.repeticoes}×` : ""}
            </span>
          </h2>
          <TabelasLajes lajes={rp.lajes} comMemoria={comMemoria} />
          <TabelaVigas
            vigas={rp.vigas}
            naoCalculadas={rp.montagem.naoCalculadas}
            gamaF={gamaF}
            comMemoria={comMemoria}
          />
          <TabelaEquilibrio equilibrio={rp.equilibrio} comMemoria={comMemoria} />
        </section>
      ))}
      <section className="mt-6">
        <h2 className="border-b pb-1 text-base font-semibold">Pilares</h2>
        <TabelaPilares resultado={resultado} comMemoria={comMemoria} />
      </section>
    </>
  );
}

export function Resultados({ calculo }: { calculo: Calculo }) {
  const obra = useObra((e) => e.obra);
  const detalhamento = useContext(DetalhamentoContexto);
  if (calculo.tipo !== "ok") return <SemCalculo calculo={calculo} />;
  const r = calculo.resultado;
  return (
    <div className="pb-8">
      <p className="text-muted-foreground mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span>
          Calculado pela {r.norma.nome}. Clique na seta ao lado do nome para ver a memória de
          cálculo.
        </span>
        {obra?.modoCalculo === "original" && (
          <Badge variant="outline" className="border-aviso/60 text-aviso">
            {SELO_MODO_ORIGINAL}
          </Badge>
        )}
      </p>
      <ListaFalhas falhas={coletarFalhas(r)} />
      <ListaAvisos
        avisos={semMarcasDuplicadas(coletarAvisos(r, detalhamento), r)}
        vazio={
          coletarMarcasMotor(r).length > 0
            ? "Nenhum aviso geral; as marcas do motor SISTRUT estão abaixo."
            : undefined
        }
      />
      <BlocoMotorSistrut resultado={r} />
      <TabelasObra resultado={r} comMemoria />
      {obra && <BlocoQuantitativos obra={obra} resultado={r} />}
    </div>
  );
}

/** Resumo de aço e concreto da obra aberta (a obra traz cobrimentos e geometria). */
function BlocoQuantitativos({ obra, resultado }: { obra: Obra; resultado: ResultadoObra }) {
  const quant = useMemo(() => calcularQuantitativos(obra, resultado), [obra, resultado]);
  return <ResumoQuantitativos quant={quant} />;
}
