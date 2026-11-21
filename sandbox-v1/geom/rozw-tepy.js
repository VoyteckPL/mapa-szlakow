// Sandbox v1 – geometria: odnoga pod kątem > 90° do drogi na wprost (klin, zakręt). Wywoływane z styk.js.
(function () {
  var unit = G.u.unit, left = G.u.left, dirIn = G.u.dirIn, dirOut = G.u.dirOut, add = G.u.add, dot = G.u.dot;
  // Odnoga pod kątem > 90° do drogi na wprost (wzorzec 93°, Wojtek 17:32): wewnętrzna krawędź odnogi dochodzi do krawędzi
  // pasów na wprost (Xin), zewnętrzna krawędź odnogi i zewnętrzna krawędź pnia – ukos (Xout). Styk pas pnia | odnoga =
  // odcinek od narożnika pnia w węźle (K) do Xout; klin K–Xin–Xout należy do odnogi (jej zewnętrzna krawędź zaczyna się w K).
  // Kąt WYJŚCIA odnogi e (od drogi na wprost, wg kierunku środek pasów pnia → 1. węzeł odnogi θ): do 100° e = θ (klin jak
  // wzorzec 93°, tam θ = 96°), 100°–115° e wraca płynnie do 90°, dalej e = 90° (wzorzec 137,7°, 17:42): odnoga wychodzi prostopadle
  // (styk jak przy 90°), a gdy dalej wjechałaby na pień – zakręt na odległości ½ jej szerokości od zewn. krawędzi pnia.
  // k = kontekst węzła z endSection: tIn, tDir, nT, N, P, st, ord, T, dalej
  function rozw(k, o, B, lo, hi, c, uB) {
    var tIn = k.tIn, tDir = k.tDir, nT = k.nT, N = k.N, P = k.P, st = k.st, ord = k.ord, T = k.T, dalej = k.dalej;
    var sg = tIn ? 1 : -1, aS = tIn ? dirOut(st.B, P) : dirIn(st.B, P), aB = [sg * uB[0], sg * uB[1]], aT = [-sg * tDir[0], -sg * tDir[1]];
    aS = [sg * aS[0], sg * aS[1]]; if (dot(aB, aS) >= 0) return null;
    var inL = ord.indexOf(st) < ord.indexOf(o), dIn = inL ? hi : lo, dOut = inL ? lo : hi;
    var K = add(N, nT, dIn), Cb = add(N, nT, c), Pn = P[tIn ? B.pts[1] : B.pts[B.pts.length - 2]], aBe = unit(Cb, Pn);
    var deg = 180 / Math.PI, th = Math.acos(Math.max(-1, Math.min(1, dot(aBe, aS)))) * deg;
    if (th <= 90) return null;
    var e = th <= 100 ? th : th >= 115 ? 90 : 100 - 10 * (th - 100) / 15, zakret = th > 100;
    if (zakret) { var pp = left(aS); if (dot(pp, [Cb[0] - K[0], Cb[1] - K[1]]) < 0) pp = [-pp[0], -pp[1]]; var er = e / deg; // pp: na stronę pasów odnogi
      aBe = [aS[0] * Math.cos(er) + pp[0] * Math.sin(er), aS[1] * Math.cos(er) + pp[1] * Math.sin(er)]; }
    var lB = left([sg * aBe[0], sg * aBe[1]]), si = dot(lB, aS) < 0 ? -1 : 1, wh = B.lanes * B.w / 2;
    function x(p, u, q, v) { var D = u[0] * v[1] - u[1] * v[0]; if (Math.abs(D) < 1e-6) return null;
      var t = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / D; return add(p, u, t); }
    var Xin = x(add(Cb, lB, si * wh), aBe, K, aS), Xout = x(add(Cb, lB, -si * wh), aBe, add(N, nT, dOut), aT);
    if (!Xin || !Xout || dot([Xin[0] - K[0], Xin[1] - K[1]], aS) < -1e-6 || dot([Xout[0] - N[0], Xout[1] - N[1]], aT) < -1e-6) return null;
    var cBo = dot([Cb[0] - N[0], Cb[1] - N[1]], lB), lin = function (A0, A1, u) { return [A0[0] + (A1[0] - A0[0]) * u, A0[1] + (A1[1] - A0[1]) * u]; };
    // płynnie od 90° (Wojtek 17:39): kp 0 → 1 między e = 90° a 93°; przy 90° styk = ukos Xin–Xout (jak wzorzec 90°),
    // od 93° styk K–Xout. J = koniec wewn. krawędzi pasa pnia (Xin → K). Odcinek stały pnia: jak przy węźle, gdy jest zakręt.
    var kp = Math.max(0, Math.min(1, (e - 90) / 3)), hk = zakret ? 1 : kp, J = lin(Xin, K, kp);
    var nOut = [nT[0] * (dOut < dIn ? -1 : 1), nT[1] * (dOut < dIn ? -1 : 1)], E0 = add(N, nT, dOut);
    return { cB: cBo, K: kp > 1e-6 ? J : null, dK: cBo - si * wh,
      pien: function (d) { return lin(J, Xout, (d - dIn) / (dOut - dIn)); },
      hold: function (d) { return lin(lin(Xin, Xout, (d - dIn) / (dOut - dIn)), add(N, nT, d), hk); },
      odn: function (d) { return lin(Xout, Xin, (d - cBo + si * wh) / (2 * si * wh)); },
      // pień jako przeszkoda: oś odnogi za węzłem ≥ ½ szer. odnogi od zewn. krawędzi pnia
      pienOdsun: { ref: [E0].concat(dalej(T, !tIn).map(function (q) { return add(q, nT, dOut); })), D: wh, side: nOut, G: wh + T.lanes * T.w },
      zakret: zakret ? { e: aBe, C: E0, n: nOut, D: wh } : null };
  }
  G.u.rozw = rozw;
})();
