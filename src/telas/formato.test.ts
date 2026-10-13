// Formatação para a tela. Referências: 1 tf = 9,80665 kN (gravidade padrão) e
// 1 MPa = 10,197 kgf/cm² (1000 kN/m² ÷ 9,80665 ÷ 10 000 cm²/m² × 1000 kgf/tf).
import { describe, expect, it } from "vitest";
import {
  casasAdequadas,
  converter,
  converterEtapa,
  formatarBarraEspacada,
  formatarBarras,
  formatarGrandeza,
  formatarNumero,
  lerNumero,
  unidade,
} from "./formato";

describe("formatarNumero", () => {
  it("usa vírgula decimal, ponto de milhar e casas fixas", () => {
    expect(formatarNumero(1234.5)).toBe("1.234,50");
    expect(formatarNumero(0.125, 3)).toBe("0,125");
    expect(formatarNumero(2.5, 0)).toBe("3");
  });
  it("mostra travessão para ausente ou não finito e não mostra -0", () => {
    expect(formatarNumero(undefined)).toBe("—");
    expect(formatarNumero(null)).toBe("—");
    expect(formatarNumero(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatarNumero(Number.NaN)).toBe("—");
    expect(formatarNumero(-0.001)).toBe("0,00");
    expect(formatarNumero(-1.5)).toBe("-1,50");
  });
});

describe("unidades", () => {
  it("SI não converte", () => {
    expect(converter(12.3, "momento", "si")).toBe(12.3);
    expect(unidade("momentoLinear", "si")).toBe("kN·m/m");
  });
  it("tf: força, momento e cargas divididos por 9,80665", () => {
    expect(converter(9.80665, "forca", "tf")).toBeCloseTo(1, 12);
    expect(converter(19.6133, "momento", "tf")).toBeCloseTo(2, 12);
    expect(converter(4.903325, "cargaArea", "tf")).toBeCloseTo(0.5, 12);
    expect(unidade("cargaLinear", "tf")).toBe("tf/m");
  });
  it("tf: tensão em kgf/cm² (25 MPa ≈ 254,93 kgf/cm²)", () => {
    expect(converter(25, "tensao", "tf")).toBeCloseTo(254.929, 3);
    expect(unidade("tensao", "tf")).toBe("kgf/cm²");
  });
  it("formatarGrandeza converte e formata", () => {
    expect(formatarGrandeza(98.0665, "forca", "tf")).toBe("10,00");
    expect(formatarGrandeza(undefined, "forca", "tf")).toBe("—");
  });
});

describe("converterEtapa (memória de cálculo)", () => {
  it("converte as unidades SI conhecidas", () => {
    expect(converterEtapa(9.80665, "kN·m/m", "tf")).toEqual({ valor: 1, unidade: "tf·m/m" });
    expect(converterEtapa(9.80665, "kN/m²", "tf")).toEqual({ valor: 1, unidade: "tf/m²" });
  });
  it("deixa como está o que não muda de sistema", () => {
    expect(converterEtapa(3.2, "cm²", "tf")).toEqual({ valor: 3.2, unidade: "cm²" });
    expect(converterEtapa(0.4, undefined, "tf")).toEqual({ valor: 0.4, unidade: "" });
    expect(converterEtapa(9.80665, "kN", "si")).toEqual({ valor: 9.80665, unidade: "kN" });
  });
});

describe("casasAdequadas", () => {
  it("dá 4 algarismos significativos entre 0 e 4 casas", () => {
    expect(casasAdequadas(0.0123)).toBe(4);
    expect(casasAdequadas(1.234)).toBe(3);
    expect(casasAdequadas(12.34)).toBe(2);
    expect(casasAdequadas(210000)).toBe(0);
    expect(casasAdequadas(0)).toBe(2);
  });
});

describe("barras", () => {
  it("malha e estribo: bitola e espaçamento", () => {
    expect(formatarBarraEspacada({ phi: 8, espacamento: 15 })).toBe("φ8 c/15");
    expect(formatarBarraEspacada({ phi: 6.3, espacamento: 12.5 })).toBe("φ6,3 c/12,5");
    expect(formatarBarraEspacada(null)).toBe("—");
  });
  it("longitudinais: quantidade e bitola", () => {
    expect(formatarBarras({ n: 3, phi: 12.5 })).toBe("3 φ12,5");
    expect(formatarBarras(null)).toBe("—");
  });
});

describe("lerNumero", () => {
  it("aceita vírgula ou ponto e espaços", () => {
    expect(lerNumero("2,8")).toBe(2.8);
    expect(lerNumero(" 3.25 ")).toBe(3.25);
    expect(lerNumero("-1")).toBe(-1);
    expect(lerNumero("1e3")).toBe(1000);
  });
  it("recusa o que não é número", () => {
    expect(lerNumero("")).toBeNull();
    expect(lerNumero("abc")).toBeNull();
    expect(lerNumero("2,5,1")).toBeNull();
    expect(lerNumero("1.234,5")).toBeNull();
  });
});
