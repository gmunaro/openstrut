const B = "C:/wt/v2-par-t2/src/calculo/sistrut";
const { sng } = await import(`${B}/base/f32.ts`);
const { emSingle, PARAMETROS_LAJE } = await import(`${B}/base/parametros.ts`);
const { bateComImpresso } = await import(`${B}/__oraculo__/index.ts`);
const { armadurasLaje } = await import(`${B}/lajes/armaduras.ts`);
const { espessuraMinimaLaje } = await import(`${B}/lajes/espessura.ts`);
const { otimizaNegativos, NaoConvergeOtimizacao } = await import(`${B}/lajes/otimizacao.ts`);
const { lajeproc } = await import(`${B}/lajes/proc.ts`);
const { CASOS_T2, esforcos, momentosComH } = await import(`${B}/lajes/__casos_t2__/casos.ts`);
const P = emSingle(PARAMETROS_LAJE);
const M = { fck: sng(0.15), fyk: sng(5), classeAco: "B", gamaF: sng(1.4), gamaC: sng(1.4), gamaS: sng(1.15) };
let total = 0, ok = 0;
const conta = (o, id, v) => { const x = o.valores.find(y => y.id === id); if (!x) return; total++; if (bateComImpresso(x, v)) ok++; else console.log('DIFERE', o.caso, id, x.impresso, v); };
const linha = (o, id, v, n) => { const x = o.valores.find(y => y.id === id); console.log(`${o.caso.replace('v2par_','')} ${id} | ${x?.impresso} | ${typeof v === 'number' ? v.toFixed(n) : v}`); };
for (const [k, c] of Object.entries(CASOS_T2)) { if (k === 'r3') continue; const o = c.oraculo;
  const { esforcos: e, recalcula } = esforcos(c, "antes");
  for (const l of c.obra.lajes) { const r = espessuraMinimaLaje(momentosComH(c, l.nome), M, P, "original");
    conta(o, l.nome+'.Hmin', r.h); conta(o, l.nome+'.Hmin.x/d', r.xd); conta(o, l.nome+'.Hmin.As.phi', r.barra.bitola); conta(o, l.nome+'.Hmin.As.s', r.barra.espacamento);
    const a = armadurasLaje(e.momentos[l.nome], M, P, "original"); const s = o.valores.some(v=>v.id===l.nome+'.As+princ.antesOtim')?'.antesOtim':'';
    conta(o, l.nome+'.x/d', a.xd); for (const [id, v] of [['As+princ',a.asPositivaPrincipal],['As+sec',a.asPositivaSecundaria],['As-maior',a.asNegativaMaior],['As-menor',a.asNegativaMenor]]) conta(o, l.nome+'.'+id+s, v); }
  if (o.valores.some(v=>v.id==='L1.As+princ.antesOtim')) { const r = otimizaNegativos(e, recalcula, M, P, "original");
    for (const l of r.lajes) { l.codigos.forEach((cd,i)=>conta(o, `${l.nome}.lado${i+1}.codigo`, cd)); const a = armadurasLaje(r.momentos[l.nome], M, P, "original");
      for (const [id, v] of [['As+princ',a.asPositivaPrincipal],['As+sec',a.asPositivaSecundaria],['As-maior',a.asNegativaMaior],['As-menor',a.asNegativaMenor]]) conta(o, l.nome+'.'+id, v);
      if (k==='assim'||k==='otim'||k==='cargas') linha(o, l.nome+'.As-maior', a.asNegativaMaior, 2); } }
  const pr = lajeproc(esforcos(c, "depois").esforcos, M, P, "original");
  for (const n of pr.negativas) linha(o, `${n.continuidade.lajeA}-${n.continuidade.lajeB}.proc.neg`, `#${n.barra.bitola?.toFixed(1)}c/${n.barra.espacamento}`);
  if (k==='balanco') { const a = armadurasLaje(e.momentos.L1, M, P, "original"); linha(o,'L1.As+princ.antesOtim',a.asPositivaPrincipal,2); linha(o,'L1.As+sec.antesOtim',a.asPositivaSecundaria,2); }
}
console.log('comparados (sem LAJEPROC/r3):', ok, '/', total);
const c = CASOS_T2.r3; const { esforcos: e, recalcula } = esforcos(c, "antes");
try { otimizaNegativos(e, recalcula, M, { ...P, relacaoNegPosMin: sng(0.35) }, "original"); } catch (x) { const s = x.estado; linha(c.oraculo, 'L1.otim.alteradaPara', s.relacaoNova, 2); linha(c.oraculo, 'L1.otim.M', s.lados[0].mTcm/100, 2); linha(c.oraculo, 'L1.otim.As', s.lados[0].as, 2); linha(c.oraculo, 'L1.otim.MnegMpos', s.lados[0].relacao, 2); }
