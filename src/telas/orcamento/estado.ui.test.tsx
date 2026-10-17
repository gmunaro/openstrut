import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { lerConfig, lerTabelas } from "./armazenamento";
import { useDadosOrcamento } from "./estado";
import { ID_SINAPI } from "./sinapi";

describe("useDadosOrcamento", () => {
  it("mudanças seguidas (como as de antes e depois de um await) não se apagam", async () => {
    const { result } = renderHook(() => useDadosOrcamento());
    await waitFor(() => expect(result.current.carregado).toBe(true));
    // as duas chamadas usam as funções da mesma renderização, como o callback de uma
    // importação que termina depois de o usuário editar um preço
    const { mudarConfig, alterarTabela, salvarTabela } = result.current;
    act(() => {
      mudarConfig((g) => ({ ...g, bdi: 0.2 }));
      mudarConfig((g) => ({ ...g, usosForma: 6 }));
      alterarTabela(ID_SINAPI, (t) => ({
        ...t,
        itens: t.itens.map((i) => (i.codigo === "1527" ? { ...i, preco: 600 } : i)),
      }));
      salvarTabela({
        id: "nova",
        nome: "nova",
        fonte: "",
        referencia: "",
        uf: "",
        desonerado: null,
        itens: [],
      });
      alterarTabela(ID_SINAPI, (t) => ({
        ...t,
        itens: t.itens.map((i) => (i.codigo === "34" ? { ...i, preco: 7 } : i)),
      }));
    });
    expect(result.current.guardada).toMatchObject({ bdi: 0.2, usosForma: 6 });
    const ref = result.current.tabelas.find((t) => t.id === ID_SINAPI)!;
    expect(ref.itens.find((i) => i.codigo === "1527")?.preco).toBe(600);
    expect(ref.itens.find((i) => i.codigo === "34")?.preco).toBe(7);
    expect(result.current.tabelas.map((t) => t.id)).toEqual([ID_SINAPI, "nova"]);
    expect(result.current.editada).toBe(true);
    // e o navegador guardou o mesmo
    await waitFor(async () => expect(await lerConfig()).toMatchObject({ bdi: 0.2, usosForma: 6 }));
    const guardadas = await lerTabelas();
    expect(guardadas.map((t) => t.id).sort()).toEqual([ID_SINAPI, "nova"].sort());

    // desfazer as edições da referência volta aos preços da SINAPI
    act(() => result.current.apagarTabela(ID_SINAPI));
    const volta = result.current.tabelas.find((t) => t.id === ID_SINAPI)!;
    expect(volta.itens.find((i) => i.codigo === "1527")?.preco).toBe(537.44);
    expect(result.current.editada).toBe(false);
  });
});
