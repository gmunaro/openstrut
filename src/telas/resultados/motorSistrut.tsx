// Marcas que o motor SISTRUT devolve e que as tabelas não mostram: otimização dos
// negativos parada, viga interrompida em "Continuo com o processamento", caso de pilar
// sem resultado e avisos da verificação de seção. Só a NB-1/78 tem `sistrut`.
import type { ResultadoObra } from "../../calculo/fluxo";
import type { Aviso } from "../calculo";
import { formatarNumero } from "../formato";
import { ListaAvisos } from "./avisos";

const TEXTO_ERRO: Record<string, string> = {
  "nao-converge":
    "a busca do equilíbrio não converge; o original fica em laço sem fim (defeito D-2). Sem resultado.",
  "nk-nulo": "Nk nulo; o original divide por zero (defeito D-3). Sem resultado.",
};

/** Texto de um `CasoPilar.erro` (o próprio código, se não for conhecido). */
export function textoErro(erro: string): string {
  return TEXTO_ERRO[erro] ?? erro;
}

/** Marcas do motor como avisos por elemento. Vazio se o resultado não tem nenhuma. */
export function coletarMarcasMotor(r: ResultadoObra): Aviso[] {
  const marcas: Aviso[] = [];
  for (const ps of r.sistrut?.pavimentos ?? []) {
    const parada = ps.otimizacaoParada;
    if (parada)
      marcas.push({
        local: ps.nome,
        elemento: parada.laje,
        texto:
          `a otimização dos negativos não converge: no lado ${parada.lado + 1} a relação Mneg/Mpos ` +
          `passa a ${formatarNumero(parada.relacaoNova, 2)}, mas o código do lado continua ${parada.codigo}, ` +
          "e o original repete este lado sem fim (defeito R3). Valem os esforços de antes da otimização.",
      });
    for (const v of ps.vigas) {
      if (!v.interrompida) continue;
      const impressa = v.interrompida.impressa ? "; tabela de apoios e tramos já impressa" : "";
      const opcao = r.avisosComOpcao?.find(
        (a) => a.id === "viga.continuar-acima-do-limite" && a.elemento.id === v.id,
      );
      marcas.push({
        local: ps.nome,
        elemento: v.nome,
        texto:
          'parou em "Continuo com o processamento desta Viga S/N" com o padrão N (motivo: ' +
          `${v.interrompida.motivos.join(" e ")}); sem detalhamento nem quadro${impressa}.`,
        ...(opcao ? { opcao } : {}),
      });
    }
  }
  for (const p of r.pilares)
    for (const v of p.verificacoes ?? []) {
      // Um caso com erro entra como linha própria só se nenhum aviso da mesma
      // verificação já cita o rótulo dele (o motor costuma repetir o caso no aviso).
      for (const caso of v.casos) {
        const rotulo = `caso ${caso.rotulo}`.toLowerCase();
        const jaCitado = v.avisos.some((t) => t.toLowerCase().includes(rotulo));
        if (caso.erro && !jaCitado)
          marcas.push({
            local: p.pavimento,
            elemento: p.pilar.nome,
            texto: `Caso ${caso.rotulo}: ${textoErro(caso.erro)}`,
          });
      }
      for (const texto of v.avisos)
        marcas.push({ local: p.pavimento, elemento: p.pilar.nome, texto });
    }
  return marcas;
}

/**
 * Tira dos avisos gerais as linhas de viga interrompida: o bloco de marcas já traz a
 * mesma situação (com o motivo). Compara por local e elemento; os avisos de detalhamento
 * (elemento "V3 (detalhamento)") são outra situação e ficam.
 */
export function semMarcasDuplicadas(avisos: readonly Aviso[], r: ResultadoObra): Aviso[] {
  const interrompidas = new Set<string>();
  for (const ps of r.sistrut?.pavimentos ?? [])
    for (const v of ps.vigas) if (v.interrompida) interrompidas.add(`${ps.nome}|${v.nome}`);
  return avisos.filter((a) => !interrompidas.has(`${a.local}|${a.elemento}`));
}

/** Texto da lista de avisos gerais vazia quando há marcas do motor (elas vêm logo abaixo). */
export const vazioComMarcas = (r: ResultadoObra) =>
  coletarMarcasMotor(r).length > 0
    ? "Nenhum aviso geral; as marcas do motor SISTRUT estão abaixo."
    : undefined;

/** Bloco com o modo do motor e as marcas dele, ou o estado vazio explícito. */
export function BlocoMotorSistrut({
  resultado,
  comOpcoes = false,
}: {
  resultado: ResultadoObra;
  comOpcoes?: boolean;
}) {
  if (!resultado.sistrut) return null;
  const modo = resultado.sistrut.modo === "original" ? "como o SISTRUT original" : "corrigido";
  const marcas = coletarMarcasMotor(resultado);
  return (
    <section className="mt-4 mb-3" aria-labelledby="marcas-motor">
      <h2 id="marcas-motor" className="mb-2 text-sm font-semibold">
        Marcas do motor SISTRUT{" "}
        <span className="text-muted-foreground font-normal">(modo {modo})</span>
      </h2>
      {marcas.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhuma marca do motor: nenhuma otimização parada, viga interrompida nem caso de pilar sem
          resultado.
        </p>
      ) : (
        <ListaAvisos avisos={marcas} comOpcoes={comOpcoes} />
      )}
    </section>
  );
}
