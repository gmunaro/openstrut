ON ERROR GOTO trata
OPEN "C:\OUT17.TXT" FOR OUTPUT AS #1
um# = 1: zero# = 0: m8# = -8: m2# = -2: terco# = 1 / 3: meio# = .5: g# = 1D+10: h# = 1D+20: t# = 1D+300
e = 0: x# = 12345: x! = 12345: x# = um# / zero#: PRINT #1, "1/0"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = -um# / zero#: PRINT #1, "-1/0"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = zero# / zero#: PRINT #1, "0/0"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: a! = 1: b! = 0: x! = a! / b!: PRINT #1, "1!/0!"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: a% = 5: b% = 0: x# = a% \ b%: PRINT #1, "5%\0%"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: a% = 5: b% = 0: x# = a% MOD b%: PRINT #1, "5 MOD 0"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: i% = CINT(g#): x# = i%: PRINT #1, "CINT(1E10)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: l& = CLNG(h#): x# = l&: PRINT #1, "CLNG(1E20)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: i% = g#: x# = i%: PRINT #1, "i%=1E10"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x! = CSNG(t#): x# = x!: PRINT #1, "CSNG(1E300)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x! = t#: x# = x!: PRINT #1, "x!=1E300"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = m8# ^ terco#: PRINT #1, "(-8)^(1/3)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = m2# ^ meio#: PRINT #1, "(-2)^.5"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: x# = zero# ^ (-um#): PRINT #1, "0^-1"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1000: x# = EXP(q#): PRINT #1, "EXP(1000)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 400: x# = 10# ^ q#: PRINT #1, "10^400"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: i% = CINT(SQR(-um#)): x# = i%: PRINT #1, "CINT(SQR(-1))"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: i% = CINT(um# / zero#): x# = i%: PRINT #1, "CINT(1/0)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+5: x# = TAN(q#): PRINT #1, "TAN(1D+5)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+5: x# = SIN(q#): PRINT #1, "SIN(1D+5)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+5: x# = COS(q#): PRINT #1, "COS(1D+5)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+6: x# = TAN(q#): PRINT #1, "TAN(1D+6)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+6: x# = SIN(q#): PRINT #1, "SIN(1D+6)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+6: x# = COS(q#): PRINT #1, "COS(1D+6)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+7: x# = TAN(q#): PRINT #1, "TAN(1D+7)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+7: x# = SIN(q#): PRINT #1, "SIN(1D+7)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+7: x# = COS(q#): PRINT #1, "COS(1D+7)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+8: x# = TAN(q#): PRINT #1, "TAN(1D+8)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+8: x# = SIN(q#): PRINT #1, "SIN(1D+8)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+8: x# = COS(q#): PRINT #1, "COS(1D+8)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+9: x# = TAN(q#): PRINT #1, "TAN(1D+9)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+9: x# = SIN(q#): PRINT #1, "SIN(1D+9)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+9: x# = COS(q#): PRINT #1, "COS(1D+9)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+15: x# = TAN(q#): PRINT #1, "TAN(1D+15)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+15: x# = SIN(q#): PRINT #1, "SIN(1D+15)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+15: x# = COS(q#): PRINT #1, "COS(1D+15)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+18: x# = TAN(q#): PRINT #1, "TAN(1D+18)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+18: x# = SIN(q#): PRINT #1, "SIN(1D+18)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+18: x# = COS(q#): PRINT #1, "COS(1D+18)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 9D+18: x# = TAN(q#): PRINT #1, "TAN(9D+18)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 9D+18: x# = SIN(q#): PRINT #1, "SIN(9D+18)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 9D+18: x# = COS(q#): PRINT #1, "COS(9D+18)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+19: x# = TAN(q#): PRINT #1, "TAN(1D+19)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+19: x# = SIN(q#): PRINT #1, "SIN(1D+19)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: q# = 1D+19: x# = COS(q#): PRINT #1, "COS(1D+19)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: a! = 1E+10: x! = SIN(a!): PRINT #1, "SIN!(1E10)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
e = 0: x# = 12345: x! = 12345: a! = 1E+10: x! = TAN(a!): PRINT #1, "TAN!(1E10)"; " e="; e; " x#="; x#; " x!="; x!
CLOSE #1: OPEN "C:\OUT17.TXT" FOR APPEND AS #1
CLOSE
END
trata:
IF e = 0 THEN e = ERR
RESUME NEXT
