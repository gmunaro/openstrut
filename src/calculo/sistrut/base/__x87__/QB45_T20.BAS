' Sonda T20 (v1-difs): ^ do BRUN45 (B$POW4/B$POW8) bit a bit; PRINT USING de -0 e de negativos
' que arredondam a zero (VIGA f*EJ); sinal do zero em produto de comparacoes (DESENHO 0x38ebb)
' e tipo da cadeia inteiro * inteiro * SINGLE. Saida em C:\OUT20.TXT (texto)
' Os valores vao crus para C:\OUT20.BIN (PUT de BINARY); o texto vai para C:\OUT20.TXT.
ON ERROR GOTO trata
OPEN "C:\OUT20.TXT" FOR OUTPUT AS #1
OPEN "C:\OUT20.BIN" FOR BINARY AS #2
z! = 0: m! = -z!: zd# = 0: md# = -zd#
PUT #2, , m!: PUT #2, , md#: PUT #2, , z!
PRINT #1, USING "U1 ##.## ##.## #####.## ##.## ##.##"; m!; md#; m!; z!; zd#
a! = -.001: b! = -.004: c! = -.0049: d! = -.005: e2! = -.0000001: f! = -1E-20
PRINT #1, USING "U2 ##.## ##.## ##.## ##.## ##.## ##.##"; a!; b!; c!; d!; e2!; f!
ad# = -.001#: ed# = -1D-20
PRINT #1, USING "U3 ##.## ##.## #.### ### #####.##"; ad#; ed#; a!; a!; e2!
g! = m! * 5.5: h! = m! * 5.5 * 3.25
PUT #2, , g!: PUT #2, , h!
PRINT #1, USING "U4 ######.## #####.##"; g!; h!
PRINT #1, "Z3 ["; STR$(m!); "] ["; STR$(md#); "]"; m!; md#
i% = 0: n! = 3: bb! = 20: j% = -1: k% = 300: q% = 32767
r! = (i% > 0) * (i% < n! + 1) * bb!: PUT #2, , r!
r! = (i% > 0) * (i% < 5) * bb!: PUT #2, , r!
r! = (i% > 0) * bb!: PUT #2, , r!
r! = i% * j% * bb!: PUT #2, , r!
r! = (i% > 0) * 2 * bb!: PUT #2, , r!
r! = (i% < n! + 1) * (i% > 0) * bb!: PUT #2, , r!
r! = bb! * (i% > 0) * (i% < n! + 1): PUT #2, , r!
e = 0: r! = k% * k% * bb!: PRINT #1, "R6 e="; e; r!
e = 0: r! = bb! * k% * k%: PRINT #1, "R7 e="; e; r!
e = 0: r! = k% * k% + bb!: PRINT #1, "R8 e="; e; r!
e = 0: r! = q% + k% + bb!: PRINT #1, "R9 e="; e; r!
e = 0: r! = q% * 2 + bb!: PRINT #1, "R10 e="; e; r!
e = 0: r! = k% * k% / bb!: PRINT #1, "R11 e="; e; r!
e = 0: r! = k% * (k% * bb!): PRINT #1, "R12 e="; e; r!
e = 0: r! = (k% * k%) * bb!: PRINT #1, "R13 e="; e; r!
e = 0: r! = -(i% > 0) * (i% < 5) * bb!: PUT #2, , r!
e = 0: r! = (i% > 0) * (j% < 5) * -bb!: PUT #2, , r!
FOR t = 1 TO 130
READ x!
h# = x! ^ 2: l# = x! ^ 2 - h#: s! = x! - SQR(x! ^ 2 - 0!)
h3# = x! ^ 3: l3# = x! ^ 3 - h3#: hm# = x! ^ 1.5: lm# = x! ^ 1.5 - hm#
hn# = x! ^ -2: ln# = x! ^ -2 - hn#: hd# = CDBL(x!) ^ .37#: ld# = CDBL(x!) ^ .37# - hd#
PUT #2, , x!: PUT #2, , h#: PUT #2, , l#: PUT #2, , s!: PUT #2, , h3#: PUT #2, , l3#: PUT #2, , hm#: PUT #2, , lm#: PUT #2, , hn#: PUT #2, , ln#: PUT #2, , hd#: PUT #2, , ld#
PRINT #1, "P"; t; e: e = 0
NEXT
CLOSE
END
trata:
e = ERR: RESUME NEXT
DATA 4.7137, 8.4548, 12.2233, 16.0192, 19.8425, 23.6932, 27.5713, 31.4768, 35.4097, 39.37
DATA 43.3577, 47.3728, 51.4153, 55.4852, 59.5825, 63.7072, 67.8593, 72.0388, 76.2457, 80.48
DATA 84.7417, 89.0308, 93.3473, 97.6912, 102.062, 106.461, 110.887, 115.341, 119.822, 124.33
DATA 128.866, 133.429, 138.019, 142.637, 147.282, 151.955, 156.655, 161.383, 166.138, 170.92
DATA 175.73, 180.567, 185.431, 190.323, 195.243, 200.189, 205.163, 210.165, 215.194, 220.25
DATA 225.334, 230.445, 235.583, 240.749, 245.942, 251.163, 256.411, 261.687, 266.99, 272.32
DATA 277.678, 283.063, 288.475, 293.915, 299.382, 304.877, 310.399, 315.949, 321.526, 327.13
DATA 332.762, 338.421, 344.107, 349.821, 355.562, 361.331, 367.127, 372.951, 378.802, 384.68
DATA 390.586, 396.519, 402.479, 408.467, 414.483, 420.525, 426.595, 432.693, 438.818, 444.97
DATA 451.15, 457.357, 463.591, 469.853, 476.142, 482.459, 488.803, 495.175, 501.574, 508
DATA 514.454, 520.935, 527.443, 533.979, 540.543, 547.133, 553.751, 560.397, 567.07, 573.77
DATA 580.498, 587.253, 594.035, 600.845, 607.683, 614.547, 621.439, 628.359, 635.306, 642.28
DATA 0.3, 0.7, 1.1, 2.5, 10, 100, 123.456, 0.001, 1E+10, 7.77E-05
