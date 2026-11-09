/* =====================================================================
   SISTEMA VOID · sistema.js · v1 · 08/11/2026
   Sem dependência, sem rastreador e sem nenhuma chamada de rede.
   Guia de uso: paginas/COMPONENTES.md (interno, não publicado).

   VOID.fmt            formatação pt-BR: número, %, p.p., R$, datas, tempo
   VOID.formatar(v,f)  formata pelo nome do formato; vazio vira "sem dado"
   VOID.ler(caminho)   lê um caminho de window.VOID_DADOS ("placar.leads")
   VOID.preencher()    troca [data-dado] e [data-dado-sinal] pelos valores
   VOID.sinal(el,cor)  aplica o semáforo: verde, laranja, vermelho ou cinza
   VOID.grafico(el,o)  barras e linha mensal (SVG) e funil (HTML)
   VOID.iniciar()      página atual, menu, âncoras, tabelas, dados e gráficos (roda sozinho)
   ===================================================================== */
(function (w, d) {
  'use strict';

  var raiz = d.documentElement;
  if (!/(^|\s)js(\s|$)/.test(raiz.className)) raiz.className += ' js';

  var SEM_DADO = 'sem dado';
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  function cada(lista, fn) { Array.prototype.forEach.call(lista || [], fn); }
  function vazio(v) { return v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v)); }
  function num(v) { var n = typeof v === 'number' ? v : Number(v); return n === 0 ? 0 : n; }

  /* ---------- formatação pt-BR ---------- */
  var formatadores = {};
  function nf(min, max) {
    if (max == null) max = min;
    var chave = min + '|' + max;
    if (!formatadores[chave]) {
      formatadores[chave] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
    }
    return formatadores[chave];
  }
  function casas(c, padrao) { return c == null || isNaN(c) ? padrao : +c; }
  function partesMes(v) { return /^(\d{4})-(\d{2})/.exec(String(v)); }

  var fmt = {
    numero: function (v, c) { return nf(casas(c, 0)).format(num(v)); },
    pct: function (v, c) { return nf(casas(c, 1)).format(num(v) * 100) + '%'; },
    pct100: function (v, c) { return nf(casas(c, 1)).format(num(v)) + '%'; },
    pp: function (v, c) {
      var n = num(v) * 100;
      return (n > 0 ? '+' : '') + nf(casas(c, 1)).format(n) + ' p.p.';
    },
    brl: function (v, c) {
      var n = num(v);
      return (n < 0 ? '-' : '') + 'R$ ' + nf(casas(c, 0)).format(Math.abs(n));
    },
    brlCurto: function (v) {
      var n = num(v), a = Math.abs(n), s = n < 0 ? '-' : '';
      if (a >= 1e6) return s + 'R$ ' + nf(0, a >= 1e7 ? 1 : 2).format(a / 1e6) + ' mi';
      if (a >= 1e4) return s + 'R$ ' + nf(0).format(a / 1e3) + ' mil';
      return s + 'R$ ' + nf(0).format(a);
    },
    data: function (v) {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
      return m ? m[3] + '/' + m[2] + '/' + m[1] : String(v);
    },
    mes: function (v) { var m = partesMes(v); return m ? MESES[+m[2] - 1] + '/' + m[1] : String(v); },
    mesCurto: function (v) { var m = partesMes(v); return m ? MESES[+m[2] - 1] : String(v); },
    minutos: function (v, c) { return nf(casas(c, 1)).format(num(v)) + ' min'; },
    horas: function (v, c) { return nf(casas(c, 1)).format(num(v)) + ' h'; },
    dias: function (v, c) {
      var n = num(v);
      return nf(casas(c, 0)).format(n) + (n === 1 ? ' dia' : ' dias');
    }
  };

  var FORMATOS = {
    numero: fmt.numero, pct: fmt.pct, pct100: fmt.pct100, pp: fmt.pp,
    brl: fmt.brl, 'brl-curto': fmt.brlCurto, data: fmt.data, mes: fmt.mes,
    min: fmt.minutos, h: fmt.horas, dias: fmt.dias,
    texto: function (v) { return String(v); }
  };
  var TEXTUAIS = { texto: 1, data: 1, mes: 1 };

  function formatar(v, formato, c) {
    if (vazio(v)) return SEM_DADO;
    formato = formato || 'numero';
    if (!TEXTUAIS[formato] && isNaN(num(v))) return String(v);
    return (FORMATOS[formato] || fmt.numero)(v, c);
  }

  /* ---------- dados da página (window.VOID_DADOS) ---------- */
  function ler(caminho, dados) {
    var o = dados === undefined ? w.VOID_DADOS : dados;
    if (o == null || !caminho) return undefined;
    var partes = String(caminho).split('.');
    for (var i = 0; i < partes.length; i++) {
      if (o == null) return undefined;
      o = o[partes[i]];
    }
    return o;
  }

  var SINAL_TEXTO = { verde: 'No caminho', laranja: 'Atenção', vermelho: 'Gargalo', cinza: 'Sem dado' };

  function sinal(el, estado, texto) {
    if (!el) return;
    if (!SINAL_TEXTO[estado]) estado = 'cinza';
    el.classList.remove('sinal-verde', 'sinal-laranja', 'sinal-vermelho', 'sinal-cinza');
    el.classList.add('sinal', 'sinal-' + estado);
    if (texto != null) el.textContent = texto;
    else if (!el.textContent.trim() || el.hasAttribute('data-dado-sinal')) el.textContent = SINAL_TEXTO[estado];
    var cartao = el.closest('.numero');
    if (cartao) cartao.setAttribute('data-sinal', estado);
  }

  function preencher(onde, dados) {
    onde = onde || d;
    cada(onde.querySelectorAll('[data-dado]'), function (el) {
      var caminho = el.getAttribute('data-dado');
      var v = ler(caminho, dados);
      if (v === undefined) {
        if (w.console) w.console.warn('[VOID] dado ausente: ' + caminho);
        return; /* mantém o texto escrito no HTML */
      }
      el.textContent = formatar(v, el.getAttribute('data-formato'), el.getAttribute('data-casas'));
      el.classList.toggle('sem-dado', vazio(v));
      if (el.tagName === 'DATA' && !vazio(v)) el.setAttribute('value', String(v));
    });
    cada(onde.querySelectorAll('[data-dado-sinal]'), function (el) {
      var v = ler(el.getAttribute('data-dado-sinal'), dados);
      if (v !== undefined) sinal(el, vazio(v) ? 'cinza' : String(v));
    });
  }

  /* ---------- página atual na navegação ---------- */
  /* o HTML já deve trazer aria-current="page"; se faltar, <body data-pagina="..."> resolve */
  function marcarPaginaAtual() {
    var atual = d.body ? d.body.getAttribute('data-pagina') : null;
    if (!atual || d.querySelector('.nav-link[aria-current]')) return;
    var link = d.querySelector('.nav-link[data-pagina="' + atual + '"]');
    if (link) link.setAttribute('aria-current', 'page');
  }

  /* ---------- menu do celular ---------- */
  function iniciarMenu() {
    var botao = d.querySelector('.menu-botao');
    if (!botao) return;
    var nav = d.getElementById(botao.getAttribute('aria-controls'));
    if (!nav) return;
    var rotulo = botao.querySelector('.menu-rotulo');
    function aberto() { return botao.getAttribute('aria-expanded') === 'true'; }
    function definir(abrir, focarBotao) {
      botao.setAttribute('aria-expanded', abrir ? 'true' : 'false');
      nav.classList.toggle('aberto', abrir);
      if (rotulo) rotulo.textContent = abrir ? 'Fechar' : 'Menu';
      if (!abrir && focarBotao) botao.focus();
    }
    botao.addEventListener('click', function () { definir(!aberto()); });
    d.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && aberto()) definir(false, true);
    });
    d.addEventListener('click', function (e) {
      if (!aberto()) return;
      var dentro = nav.contains(e.target);
      if (dentro ? e.target.closest('a') : !botao.contains(e.target)) definir(false);
    });
    if (w.matchMedia) {
      var largo = w.matchMedia('(min-width: 960px)');
      var aoMudar = function () { if (largo.matches) definir(false); };
      if (largo.addEventListener) largo.addEventListener('change', aoMudar);
      else if (largo.addListener) largo.addListener(aoMudar);
    }
  }

  /* ---------- âncoras: o CSS compensa o cabeçalho; aqui o foco acompanha ---------- */
  function iniciarAncoras() {
    d.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      if (!id) return;
      var alvo = d.getElementById(decodeURIComponent(id));
      if (!alvo) return;
      if (!alvo.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(alvo.tagName)) {
        alvo.setAttribute('tabindex', '-1');
      }
      w.setTimeout(function () {
        try { alvo.focus({ preventScroll: true }); } catch (erro) { alvo.focus(); }
      }, 0);
    });
  }

  /* ---------- observar largura ---------- */
  function observar(el, fn) {
    if (w.ResizeObserver) { new w.ResizeObserver(function () { fn(); }).observe(el); return; }
    var espera;
    w.addEventListener('resize', function () { w.clearTimeout(espera); espera = w.setTimeout(fn, 150); });
  }

  /* ---------- tabelas: rótulo dos cartões, papéis e dica de rolagem ---------- */
  function prepararTabelas(onde) {
    cada((onde || d).querySelectorAll('.tabela'), function (caixa) {
      if (caixa._voidPronta) return;
      var tabela = caixa.querySelector('table');
      if (!tabela) return;
      caixa._voidPronta = true;
      var cabecalhos = [];
      cada(tabela.querySelectorAll('thead th'), function (th) { cabecalhos.push(th.textContent.replace(/\s+/g, ' ').trim()); });
      var cartoes = caixa.classList.contains('tabela-cartoes');
      cada(tabela.querySelectorAll('tbody tr'), function (tr) {
        if (cartoes) tr.setAttribute('role', 'row');
        cada(tr.children, function (celula, i) {
          if (cabecalhos[i] && !celula.hasAttribute('data-rotulo')) celula.setAttribute('data-rotulo', cabecalhos[i]);
          if (cartoes) celula.setAttribute('role', celula.tagName === 'TH' ? 'rowheader' : 'cell');
        });
      });
      if (cartoes) {
        /* display:block apaga a semântica de tabela em alguns leitores de tela: os papéis devolvem */
        tabela.setAttribute('role', 'table');
        cada(tabela.querySelectorAll('thead, tbody'), function (g) { g.setAttribute('role', 'rowgroup'); });
        cada(tabela.querySelectorAll('thead tr'), function (tr) { tr.setAttribute('role', 'row'); });
        cada(tabela.querySelectorAll('thead th'), function (th) { th.setAttribute('role', 'columnheader'); });
      }
      if (caixa.classList.contains('tabela-rolar')) {
        if (!caixa.hasAttribute('tabindex')) caixa.setAttribute('tabindex', '0');
        if (!caixa.hasAttribute('role')) caixa.setAttribute('role', 'region');
        if (!caixa.hasAttribute('aria-label') && !caixa.hasAttribute('aria-labelledby')) {
          var legenda = tabela.querySelector('caption');
          caixa.setAttribute('aria-label', legenda ? legenda.textContent.trim() : 'Tabela');
        }
        var dica = caixa.previousElementSibling;
        if (!dica || !dica.classList.contains('tabela-dica')) {
          dica = d.createElement('p');
          dica.className = 'tabela-dica';
          dica.textContent = 'Deslize a tabela para o lado';
          caixa.parentNode.insertBefore(dica, caixa);
        }
        var conferir = function () { dica.hidden = caixa.scrollWidth <= caixa.clientWidth + 1; };
        conferir();
        observar(caixa, conferir);
      }
    });
  }

  /* ---------- gráficos ---------- */
  var SVGNS = 'http://www.w3.org/2000/svg';
  var contador = 0;

  function no(tag, atributos, pai, texto) {
    var n = d.createElementNS(SVGNS, tag);
    for (var k in atributos) if (atributos[k] != null) n.setAttribute(k, atributos[k]);
    if (texto != null) n.textContent = texto;
    if (pai) pai.appendChild(n);
    return n;
  }
  function html(tag, classe, texto) {
    var n = d.createElement(tag);
    if (classe) n.className = classe;
    if (texto != null) n.textContent = texto;
    return n;
  }
  function teto(v) {
    if (!(v > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function ehMes(r) { return /^\d{4}-\d{2}$/.test(String(r)); }
  function rotuloCurto(r) { return ehMes(r) ? fmt.mesCurto(r) : String(r); }
  function rotuloLongo(r) { return ehMes(r) ? fmt.mes(r) : String(r); }
  function largura(texto, px) { return String(texto).length * px * 0.6; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function indiceParcial(o, n) { return o.parcial === true ? n - 1 : (typeof o.parcial === 'number' ? o.parcial : -1); }

  /* caixas já ocupadas por rótulos: evita texto encavalado */
  function Ocupacao() { this.caixas = []; }
  Ocupacao.prototype.livre = function (x, y, w, h) {
    return this.caixas.every(function (c) {
      return Math.abs(c.x - x) * 2 >= c.w + w + 4 || Math.abs(c.y - y) * 2 >= c.h + h;
    });
  };
  Ocupacao.prototype.marcar = function (x, y, w, h) { this.caixas.push({ x: x, y: y, w: w, h: h }); };

  /* eixo x: prioridade para o destaque, o último e o primeiro; depois um a cada "salto".
     Embaixo, o ano (primeiro mês e cada janeiro) e a palavra "parcial" quando couber. */
  function eixoX(svg, rotulos, xDe, passo, altura, temMes, parcial, destaque, W) {
    var n = rotulos.length;
    if (!n) return;
    var maior = 0;
    rotulos.forEach(function (r) { maior = Math.max(maior, largura(rotuloCurto(r), 12)); });
    var salto = Math.max(1, Math.ceil((maior + 6) / Math.max(passo, 1)));
    var candidatos = [destaque, n - 1, 0];
    for (var i = 0; i < n; i += salto) candidatos.push(i);
    var linha1 = new Ocupacao(), feitos = {};
    candidatos.forEach(function (i) {
      if (i < 0 || i >= n || feitos[i]) return;
      feitos[i] = true;
      var t = rotuloCurto(rotulos[i]), lw = largura(t, 12), x = Math.min(Math.max(xDe(i), lw / 2), W - lw / 2);
      if (!linha1.livre(x, 0, lw, 14)) return;
      linha1.marcar(x, 0, lw, 14);
      no('text', { x: r1(x), y: altura - 22, 'text-anchor': 'middle', 'class': 'g-texto' }, svg, t);
    });
    var linha2 = new Ocupacao(), embaixo = [];
    rotulos.forEach(function (r, j) {
      if (temMes && (j === 0 || String(r).slice(5, 7) === '01')) embaixo.push([j, String(r).slice(0, 4)]);
    });
    if (parcial >= 0) embaixo.push([parcial, 'parcial']);
    embaixo.forEach(function (par) {
      var x = xDe(par[0]), lw = largura(par[1], 12);
      var xa = Math.min(Math.max(x, lw / 2), W - lw / 2);
      if (!linha2.livre(xa, 0, lw, 14)) return;
      linha2.marcar(xa, 0, lw, 14);
      no('text', { x: r1(xa), y: altura - 4, 'text-anchor': 'middle', 'class': 'g-texto' }, svg, par[1]);
    });
  }

  function svgBase(largura_, altura, o, resumo) {
    var id = 'g' + (++contador);
    var svg = no('svg', { viewBox: '0 0 ' + largura_ + ' ' + altura, width: largura_, height: altura, role: 'img', 'aria-labelledby': id + 't ' + id + 'd', focusable: 'false' });
    no('title', { id: id + 't' }, svg, o._titulo || '');
    no('desc', { id: id + 'd' }, svg, resumo);
    return svg;
  }

  function desenharBarras(area, o, W) {
    var rot = o.rotulos || [], val = o.valores || [], n = val.length;
    var temMes = rot.length > 0 && ehMes(rot[0]);
    var H = o.altura || 220, topo = 24, base = temMes ? 40 : 28;
    var max = 0, iMax = -1;
    val.forEach(function (v, i) { if (!vazio(v) && num(v) > max) { max = num(v); iMax = i; } });
    var y1 = teto(Math.max(max, vazio(o.meta) ? 0 : num(o.meta)));
    var passo = W / Math.max(n, 1), bw = Math.min(passo * 0.62, 56);
    var plotH = H - topo - base;
    var y = function (v) { return topo + plotH - (v / y1) * plotH; };
    var xDe = function (i) { return passo * i + passo / 2; };
    var parcial = indiceParcial(o, n);
    var destaque = typeof o.destaque === 'number' ? o.destaque : -1;

    var resumo = 'Barras' + (rot.length ? ' de ' + rotuloLongo(rot[0]) + ' a ' + rotuloLongo(rot[n - 1]) : '') + '. ';
    if (iMax >= 0) resumo += 'Maior valor: ' + rotuloLongo(rot[iMax]) + ', ' + formatar(val[iMax], o.formato, o.casas) + '. ';
    if (destaque >= 0) resumo += 'Destaque: ' + rotuloLongo(rot[destaque]) + ', ' + formatar(val[destaque], o.formato, o.casas) + '. ';
    if (parcial >= 0) resumo += rotuloLongo(rot[parcial]) + ' é parcial. ';
    resumo += 'Todos os valores em Ver os números.';

    var svg = svgBase(W, H, o, resumo);
    if (destaque >= 0) svg.setAttribute('class', 'tem-destaque');
    no('line', { x1: 0, x2: W, y1: r1(y(0)), y2: r1(y(0)), 'class': 'g-base' }, svg);
    if (!vazio(o.meta)) {
      no('line', { x1: 0, x2: W, y1: r1(y(num(o.meta))), y2: r1(y(num(o.meta))), 'class': 'g-meta' }, svg);
      no('text', { x: W, y: r1(y(num(o.meta)) - 6), 'text-anchor': 'end', 'class': 'g-texto' }, svg, 'meta ' + formatar(o.meta, o.formato, o.casas));
    }
    var maiorRotulo = 0;
    val.forEach(function (v) { if (!vazio(v)) maiorRotulo = Math.max(maiorRotulo, largura(formatar(v, o.formato, o.casas), 13)); });
    var todos = maiorRotulo + 4 <= passo;
    var topos = [];
    val.forEach(function (v, i) {
      var cx = xDe(i);
      if (vazio(v)) {
        no('line', { x1: r1(cx - bw / 2), x2: r1(cx + bw / 2), y1: r1(y(0) - 2), y2: r1(y(0) - 2), 'class': 'g-sem-dado' }, svg);
        return;
      }
      var classe = 'g-barra' + (i === destaque ? ' destaque' : '') + (i === parcial ? ' parcial' : '');
      var h = Math.max(y(0) - y(num(v)), num(v) > 0 ? 1 : 0);
      topos[i] = y(0) - h;
      no('rect', { x: r1(cx - bw / 2), y: r1(y(0) - h), width: r1(bw), height: r1(h), 'class': classe }, svg);
    });
    /* rótulo de valor: todos quando cabem; senão destaque, último e maior */
    var ordem = todos ? val.map(function (v, i) { return i; }) : [destaque, n - 1, iMax];
    var ocupado = new Ocupacao(), feitos = {};
    ordem.forEach(function (i) {
      if (i < 0 || i >= n || feitos[i] || vazio(val[i])) return;
      feitos[i] = true;
      var t = formatar(val[i], o.formato, o.casas), lw = largura(t, 13);
      var tx = Math.min(Math.max(xDe(i), lw / 2), W - lw / 2), ty = topos[i] - 6;
      if (!ocupado.livre(tx, ty - 5, lw, 15)) return;
      ocupado.marcar(tx, ty - 5, lw, 15);
      no('text', { x: r1(tx), y: r1(ty), 'text-anchor': 'middle', 'class': 'g-valor' + (i === destaque ? ' destaque' : '') }, svg, t);
    });
    eixoX(svg, rot, xDe, passo, H, temMes, parcial, destaque, W);
    area.appendChild(svg);
  }

  function desenharLinha(area, o, W) {
    var rot = o.rotulos || [];
    var series = (o.series || [{ nome: o.nome || '', valores: o.valores || [] }]).slice(0, 3);
    var n = rot.length || (series[0].valores || []).length;
    var temMes = rot.length > 0 && ehMes(rot[0]);
    var H = o.altura || 220, topo = 30, base = temMes ? 40 : 28, esq = 8, dir = 8;
    var max = 0;
    series.forEach(function (s) { (s.valores || []).forEach(function (v) { if (!vazio(v) && num(v) > max) max = num(v); }); });
    var y1 = teto(Math.max(max, vazio(o.meta) ? 0 : num(o.meta)));
    var plotH = H - topo - base;
    var y = function (v) { return topo + plotH - (v / y1) * plotH; };
    var xDe = function (i) { return n > 1 ? esq + (W - esq - dir) * i / (n - 1) : W / 2; };
    var passo = n > 1 ? (W - esq - dir) / (n - 1) : W;
    var parcial = indiceParcial(o, n);
    var destaque = typeof o.destaque === 'number' ? o.destaque : -1;

    var resumo = 'Linha' + (rot.length ? ' de ' + rotuloLongo(rot[0]) + ' a ' + rotuloLongo(rot[n - 1]) : '') + '. ';
    series.forEach(function (s) {
      var vs = (s.valores || []).filter(function (v) { return !vazio(v); });
      if (vs.length) resumo += (s.nome ? s.nome + ': ' : '') + 'começa em ' + formatar(vs[0], o.formato, o.casas) + ' e termina em ' + formatar(vs[vs.length - 1], o.formato, o.casas) + '. ';
    });
    if (parcial >= 0) resumo += rotuloLongo(rot[parcial]) + ' é parcial. ';
    resumo += 'Todos os valores em Ver os números.';

    var svg = svgBase(W, H, o, resumo);
    no('line', { x1: 0, x2: W, y1: r1(y(0)), y2: r1(y(0)), 'class': 'g-base' }, svg);
    no('line', { x1: 0, x2: W, y1: r1(y(y1)), y2: r1(y(y1)), 'class': 'g-grade' }, svg);
    no('text', { x: 0, y: r1(y(y1) - 6), 'class': 'g-texto' }, svg, formatar(y1, o.formato, o.casasEixo == null ? 0 : o.casasEixo));
    if (!vazio(o.meta)) {
      no('line', { x1: 0, x2: W, y1: r1(y(num(o.meta))), y2: r1(y(num(o.meta))), 'class': 'g-meta' }, svg);
      no('text', { x: W, y: r1(y(num(o.meta)) - 6), 'text-anchor': 'end', 'class': 'g-texto' }, svg, 'meta ' + formatar(o.meta, o.formato, o.casas));
    }

    var finais = [];
    series.forEach(function (s, si) {
      var papel = s.papel || (si === 0 ? 'principal' : 'comparacao');
      var cls = papel === 'destaque' ? ' s-destaque' : papel === 'comparacao' ? ' s-comparacao' : '';
      var cheio = '', tracejado = '', ant = null, ultimo = -1;
      (s.valores || []).forEach(function (v, i) {
        if (vazio(v)) { ant = null; return; }
        var p = [r1(xDe(i)), r1(y(num(v)))];
        if (i === parcial && ant) tracejado += 'M' + ant[0] + ' ' + ant[1] + 'L' + p[0] + ' ' + p[1];
        else cheio += (ant ? 'L' : 'M') + p[0] + ' ' + p[1];
        ant = p;
        ultimo = i;
      });
      if (cheio) no('path', { d: cheio, 'class': 'g-linha' + cls }, svg);
      if (tracejado) no('path', { d: tracejado, 'class': 'g-linha parcial' + cls }, svg);
      (s.valores || []).forEach(function (v, i) {
        if (vazio(v)) return;
        var eDestaque = si === 0 && i === destaque;
        if (papel === 'comparacao' && !eDestaque) return;
        if (n <= 24 || eDestaque || i === ultimo) {
          no('circle', { cx: r1(xDe(i)), cy: r1(y(num(v))), r: eDestaque ? 5 : 3.5, 'class': 'g-ponto' + cls + (eDestaque ? ' destaque' : '') }, svg);
        }
      });
      if (ultimo >= 0 && si === 0) {
        finais.push({ x: xDe(ultimo), y: y(num(s.valores[ultimo])) - 10, texto: formatar(s.valores[ultimo], o.formato, o.casas), destaque: false });
      }
    });
    var rotulos = [];
    if (destaque >= 0 && series[0] && !vazio((series[0].valores || [])[destaque])) {
      var vd = series[0].valores[destaque];
      if (destaque === n - 1 && finais.length) finais[0].destaque = true;
      else rotulos.push({ x: xDe(destaque), y: y(num(vd)) - 12, texto: formatar(vd, o.formato, o.casas), destaque: true });
    }
    finais.sort(function (a, b) { return a.y - b.y; });
    rotulos = rotulos.concat(finais);
    var ocupado = new Ocupacao();
    rotulos.forEach(function (f) {
      var lw = largura(f.texto, 13);
      var x = Math.min(Math.max(f.x, lw / 2), W - lw / 2), yy = Math.max(f.y, 12), tentativas = 0;
      while (!ocupado.livre(x, yy - 5, lw, 15) && tentativas < 6) { yy = yy - 16 < 12 ? yy + 32 : yy - 16; tentativas++; }
      ocupado.marcar(x, yy - 5, lw, 15);
      no('text', { x: r1(x), y: r1(yy), 'text-anchor': 'middle', 'class': 'g-valor' + (f.destaque ? ' destaque' : '') }, svg, f.texto);
    });
    eixoX(svg, rot, xDe, passo, H, temMes, parcial, destaque, W);
    area.appendChild(svg);
    if (series.length > 1) {
      var legenda = html('ul', 'grafico-legenda');
      series.forEach(function (s, si) {
        var papel = s.papel || (si === 0 ? 'principal' : 'comparacao');
        legenda.appendChild(html('li', 's-' + papel, s.nome || ('Série ' + (si + 1))));
      });
      area.appendChild(legenda);
    }
  }

  /* funil em HTML: o mesmo componente .funil escrito à mão, com as taxas calculadas */
  function desenharFunil(area, o) {
    var etapas = o.etapas || [];
    var max = 0;
    etapas.forEach(function (e) { if (!vazio(e.valor) && num(e.valor) > max) max = num(e.valor); });
    var gargalo = typeof o.gargalo === 'number' ? o.gargalo : -1;
    var lista = html('ol', 'funil' + (gargalo >= 0 ? ' tem-gargalo' : ''));
    if (o._titulo) lista.setAttribute('aria-label', o._titulo);
    etapas.forEach(function (e, i) {
      var semDado = vazio(e.valor);
      var li = html('li', 'funil-etapa' + (i === gargalo ? ' gargalo' : '') + (semDado ? ' sem-dado' : ''));
      var cab = html('div', 'funil-cab');
      cab.appendChild(html('span', 'funil-nome', e.nome));
      cab.appendChild(html('span', 'funil-valor', formatar(e.valor, o.formato, o.casas)));
      li.appendChild(cab);
      var trilho = html('span', 'funil-trilho');
      trilho.setAttribute('aria-hidden', 'true');
      var barra = html('span', 'funil-barra');
      barra.style.setProperty('--p', (max > 0 && !semDado ? r1(num(e.valor) / max * 100) : 0) + '%');
      trilho.appendChild(barra);
      li.appendChild(trilho);
      var taxa = html('p', 'funil-taxa');
      var texto;
      if (i === 0) texto = 'ponto de partida';
      else {
        var antes = etapas[i - 1] ? etapas[i - 1].valor : null;
        texto = (!semDado && !vazio(antes) && num(antes) > 0)
          ? formatar(num(e.valor) / num(antes), 'pct', o.casasTaxa) + ' da etapa anterior'
          : 'taxa sem dado';
      }
      if (o.taxas !== false) taxa.appendChild(html('span', null, texto));
      if (e.nota) taxa.appendChild(html('span', null, e.nota));
      if (i === gargalo) taxa.appendChild(html('span', 'sinal sinal-vermelho', 'Gargalo'));
      if (taxa.childNodes.length) li.appendChild(taxa);
      lista.appendChild(li);
    });
    area.appendChild(lista);
  }

  /* tabela "Ver os números": a leitura acessível de todo gráfico */
  function tabelaDados(o, tipo) {
    var det = html('details', 'grafico-dados');
    det.appendChild(html('summary', null, 'Ver os números'));
    var caixa = html('div', 'tabela');
    var t = html('table');
    var thead = html('thead'), trh = html('tr'), tbody = html('tbody');
    function cab(texto, numerico) {
      var th = html('th', numerico ? 'num' : null, texto);
      th.setAttribute('scope', 'col');
      trh.appendChild(th);
    }
    function linha(celulas) {
      var tr = html('tr');
      celulas.forEach(function (c, i) {
        var cel = html(i === 0 ? 'th' : 'td', i === 0 ? null : 'num', c);
        if (i === 0) cel.setAttribute('scope', 'row');
        tr.appendChild(cel);
      });
      tbody.appendChild(tr);
    }
    var rot = o.rotulos || [];
    var parcial;
    if (tipo === 'funil') {
      cab(o.colunaRotulo || 'Etapa'); cab(o.unidade || 'Quantidade', true); cab('Da etapa anterior', true);
      (o.etapas || []).forEach(function (e, i) {
        var antes = i > 0 ? o.etapas[i - 1].valor : null;
        var taxa = i === 0 ? 'ponto de partida' : (!vazio(e.valor) && !vazio(antes) && num(antes) > 0 ? formatar(num(e.valor) / num(antes), 'pct', o.casasTaxa) : SEM_DADO);
        linha([e.nome, formatar(e.valor, o.formato, o.casas), taxa]);
      });
    } else if (tipo === 'linha') {
      var series = (o.series || [{ nome: o.nome || o.unidade || 'Valor', valores: o.valores || [] }]).slice(0, 3);
      parcial = indiceParcial(o, rot.length);
      cab(o.colunaRotulo || (rot.length && ehMes(rot[0]) ? 'Mês' : 'Item'));
      series.forEach(function (s) { cab(s.nome || o.unidade || 'Valor', true); });
      rot.forEach(function (r, i) {
        linha([rotuloLongo(r) + (i === parcial ? ' (parcial)' : '')].concat(series.map(function (s) { return formatar((s.valores || [])[i], o.formato, o.casas); })));
      });
    } else {
      parcial = indiceParcial(o, (o.valores || []).length);
      cab(o.colunaRotulo || (rot.length && ehMes(rot[0]) ? 'Mês' : 'Item'));
      cab(o.unidade || 'Valor', true);
      (o.valores || []).forEach(function (v, i) { linha([rotuloLongo(rot[i]) + (i === parcial ? ' (parcial)' : ''), formatar(v, o.formato, o.casas)]); });
      if (!vazio(o.meta)) linha(['Meta', formatar(o.meta, o.formato, o.casas)]);
    }
    thead.appendChild(trh);
    t.appendChild(thead); t.appendChild(tbody);
    caixa.appendChild(t); det.appendChild(caixa);
    return det;
  }

  function desenhar(area) {
    var o = area._voidOpcoes;
    var tipo = o.tipo || 'barras';
    var W = Math.max(260, Math.round(area.clientWidth || 0) || 320);
    area._voidLargura = W;
    while (area.firstChild) area.removeChild(area.firstChild);
    if (tipo === 'linha') desenharLinha(area, o, W);
    else if (tipo === 'funil') desenharFunil(area, o);
    else desenharBarras(area, o, W);
    var depois = area.nextElementSibling;
    if (o.tabela !== false && !(depois && depois.classList.contains('grafico-dados'))) {
      area.parentNode.insertBefore(tabelaDados(o, tipo), area.nextSibling);
    }
  }

  function grafico(area, opcoes) {
    if (typeof area === 'string') area = d.querySelector(area);
    if (!area) return null;
    var o = Object.assign({}, opcoes || {});
    if (o.de) {
      var vindo = ler(o.de);
      if (vindo && typeof vindo === 'object') o = Object.assign({}, vindo, o);
    }
    var figura = area.closest('figure');
    var titulo = figura ? figura.querySelector('.grafico-titulo') : null;
    var fonte = figura ? figura.querySelector('.fonte') : null;
    if (!titulo || !fonte) {
      /* toda prova tem crédito: sem título que afirma e sem fonte com período, não desenha */
      area.innerHTML = '';
      area.appendChild(html('p', 'grafico-aviso', 'Este gráfico precisa de um título que afirma e de uma nota de fonte com período antes de ir ao ar.'));
      if (w.console) w.console.warn('[VOID] gráfico sem .grafico-titulo ou .fonte', area);
      return null;
    }
    o._titulo = titulo.textContent.replace(/\s+/g, ' ').trim();
    area._voidOpcoes = o;
    var antiga = area.nextElementSibling;
    if (antiga && antiga.classList.contains('grafico-dados')) antiga.parentNode.removeChild(antiga);
    desenhar(area);
    if (o.tipo !== 'funil' && !area._voidObservado) {
      area._voidObservado = true;
      observar(area, function () {
        var atual = Math.round(area.clientWidth || 0);
        if (atual && Math.abs(atual - area._voidLargura) > 4) desenhar(area);
      });
    }
    return area;
  }

  /* ---------- início ---------- */
  var iniciado = false;
  function iniciar() {
    if (iniciado) return;
    iniciado = true;
    marcarPaginaAtual();
    iniciarMenu();
    iniciarAncoras();
    preencher(d);
    cada(d.querySelectorAll('[data-grafico]'), function (area) {
      var o;
      try { o = JSON.parse(area.getAttribute('data-grafico')); }
      catch (erro) {
        area.appendChild(html('p', 'grafico-aviso', 'Os dados deste gráfico estão com erro de escrita (JSON inválido).'));
        if (w.console) w.console.warn('[VOID] JSON inválido em data-grafico', area);
        return;
      }
      grafico(area, o);
    });
    prepararTabelas(d);
  }

  w.VOID = {
    versao: '1.0',
    fmt: fmt,
    formatar: formatar,
    ler: ler,
    preencher: preencher,
    sinal: sinal,
    grafico: grafico,
    prepararTabelas: prepararTabelas,
    iniciar: iniciar
  };

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window, document);

/* Abrir o detalhe de uma seção quando acessada pelo índice. */
(function(){function revelar(){if(!location.hash)return;var alvo=document.getElementById(decodeURIComponent(location.hash.slice(1)));if(!alvo)return;var d=alvo.closest('details');if(d)d.open=true;var interno=alvo.querySelector('details.secao-detalhes');if(interno)interno.open=true;}window.addEventListener('hashchange',revelar);document.addEventListener('click',function(e){var a=e.target.closest('a[href^="#"]');if(!a)return;var id=a.getAttribute('href').slice(1),alvo=document.getElementById(id);if(alvo){var d=alvo.querySelector('details.secao-detalhes');if(d)d.open=true;}});window.addEventListener('beforeprint',function(){document.querySelectorAll('details').forEach(function(d){d.open=true;});});revelar();})();
