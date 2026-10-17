// Verificação de equilíbrio do pavimento: as somas de carga das lajes, das
// vigas e dos pilares e se elas fecham (montagem.verificarEquilibrio).
import type { Equilibrio as ResultadoEquilibrio } from "../../calculo/montagem";
import { formatarGrandeza, unidade } from "../formato";
import { useUnidades } from "../sessao";
import { LinhaElemento } from "./memoria";
import { Cabecalho, Corpo, Linha, Tabela, Td, Th, TituloBloco } from "./tabela";

export function TabelaEquilibrio({
  equilibrio: e,
  comMemoria,
}: {
  equilibrio: ResultadoEquilibrio;
  comMemoria: boolean;
}) {
  const s = useUnidades();
  const u = unidade("forca", s);
  return (
    <>
      <TituloBloco copiar="Equilíbrio">Equilíbrio</TituloBloco>
      <Tabela className="w-auto">
        <Cabecalho>
          <Linha>
            <Th>Verificação</Th>
            <Th num unidade={u}>
              Carga das lajes
            </Th>
            <Th num unidade={u}>
              Reações das lajes
            </Th>
            <Th num unidade={u}>
              Lajes → vigas
            </Th>
            <Th num unidade={u}>
              Carga das vigas
            </Th>
            <Th num unidade={u}>
              Carga nos pilares
            </Th>
            <Th>Situação</Th>
          </Linha>
        </Cabecalho>
        <Corpo>
          <LinhaElemento
            nome="Σ"
            avisos={e.avisos}
            memoria={[{ titulo: "Equilíbrio", etapas: e.memoria }]}
            colunas={7}
            comMemoria={comMemoria}
          >
            <Td num>{formatarGrandeza(e.cargaLajes, "forca", s)}</Td>
            <Td num>{formatarGrandeza(e.reacoesLajes, "forca", s)}</Td>
            <Td num>{formatarGrandeza(e.lajesNasVigas, "forca", s)}</Td>
            <Td num>{formatarGrandeza(e.cargaVigas, "forca", s)}</Td>
            <Td num>{formatarGrandeza(e.cargaPilares, "forca", s)}</Td>
            <Td className={e.ok ? "text-ok font-semibold" : "text-destructive font-semibold"}>
              {e.ok ? "ok" : "não fecha"}
            </Td>
          </LinhaElemento>
        </Corpo>
      </Tabela>
    </>
  );
}
