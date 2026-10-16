import { describe, expect, it } from "vitest";
import { num, numAte } from "./texto";

describe("números nos textos para o usuário", () => {
  it("vírgula decimal, casas fixas", () => {
    expect(num(17.5, 1)).toBe("17,5");
    expect(num(42.56, 1)).toBe("42,6");
    expect(num(3, 2)).toBe("3,00");
    // o que arredonda a zero sai sem sinal
    expect(num(-0.001, 2)).toBe("0,00");
    expect(num(-0.006, 2)).toBe("-0,01");
    expect(num(-12.5, 1)).toBe("-12,5");
  });
  it("até n casas, sem zeros à direita: o SINGLE 0,35 do original sai 0,35", () => {
    expect(numAte(0.3499999940395355, 2)).toBe("0,35");
    expect(numAte(4, 2)).toBe("4");
    expect(numAte(-0.0001, 2)).toBe("0");
    expect(numAte(1.25)).toBe("1,25");
  });
});
