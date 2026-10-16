// Marcas que o motor SISTRUT devolve e que as tabelas não mostram: otimização dos
// negativos parada, viga interrompida em "Continuo com o processamento", caso de pilar
// sem resultado e avisos da verificação de seção. Só a NB-1/78 tem `sistrut`.
import type { ResultadoObra } from "../../calculo/fluxo";
import type { Aviso } from "../calculo";
import { formatarNumero } from "../formato";
import { ListaAvisos } from "./avisos";

const TEXTO_ERRO: Record<string, string> = {
  "nao-converge": "não converge; o original trava em laço sem fim (defeito D-2). Sem resultado.",
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
          `otimização dos negativos parada no lado ${parada.lado + 1} (relação ` +
          `${formatarNumero(parada.relacaoNova, 2)}, código ${parada.codigo} repetido); os esforços ficam os de ` +
          "antes da otimização.",
      });
    for (const v of ps.vigas) {
      if (!v.interrompida) continue;
      const impressa = v.interrompida.impressa ? "; tabela de apoios e tramos já impressa" : "";
      marcas.push({
        local: ps.nome,
        elemento: v.nome,
        texto:
          'parou em "Continuo com o processamento desta Viga S/N" com o padrão N (motivo: ' +
          `${v.interrompida.motivos.join(" e ")}); sem detalhamento nem quadro${impressa}.`,
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
            texto: `caso ${caso.rotulo}: ${textoErro(caso.erro)}`,
          });
      }
      for (const texto of v.avisos)
        marcas.push({ local: p.pavimento, elemento: p.pilar.nome, texto });
    }
  return marcas;
}

/** Bloco com o modo do motor e as marcas dele, ou o estado vazio explícito. */
export function BlocoMotorSistrut({ resultado }: { resultado: ResultadoObra }) {
  if (!resultado.sistrut) return null;
  const modo = resultado.sistrut.modo === "original" ? "como o SISTRUT original" : "corrigido";
  const marcas = coletarMarcasMotor(resultado);
  return (
    <section className="mb-3" aria-labelledby="marcas-motor">
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
        <ListaAvisos avisos={marcas} />
      )}
    </section>
  );
}
