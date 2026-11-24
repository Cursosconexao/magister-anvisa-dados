
(function(){
"use strict";
var CFG = Object.assign({
  acesso: "ACESSO",
  modo: "calculo",
  dados: "https://cursosconexao.github.io/magister-anvisa-dados/amb/",
  planos: "LINK_ASSINATURA"
}, window.MAGISTER_AMB_CONFIG || {});
var T = ["AMB90","AMB92","AMB96","AMB99","CIEFAS"];
var NOME = {AMB90:"AMB 90",AMB92:"AMB 92",AMB96:"AMB 96",AMB99:"AMB 99",CIEFAS:"CIEFAS 2000"};
var CHAVE = "mgamb_negociacao_v2", CHAVE_LISTA = "mgamb_negociacoes_v2";
var root = document.getElementById("mgamb");
if (!root) return;

/* ---------- utilitários ---------- */
function r2(v){ return Math.round((v + (v>=0?1:-1)*1e-9) * 100) / 100; }
function brl(v){ return (v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
function nf(v,max){ return (v||0).toLocaleString("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:max==null?4:max}); }
function pc(v){ return (v>0?"+":"") + (v*100).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}) + "%"; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
function norm(s){ return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase(); }
function fcod(c){ return c.slice(0,2)+"."+c.slice(2,4)+"."+c.slice(4,7)+"-"+c.slice(7); }
function limpaCod(s){ var d=String(s||"").replace(/\D/g,""); if(!d||d.length>8) return null; while(d.length<8) d="0"+d; return d; }
function num(v){ if(typeof v==="number") return v; var s=String(v||"").trim(); if(!s) return 0; if(s.indexOf(",")>=0) s=s.replace(/\./g,"").replace(",","."); var n=parseFloat(s); return isNaN(n)?0:n; }
function $(sel,el){ return (el||root).querySelector(sel); }
function $$(sel,el){ return Array.prototype.slice.call((el||root).querySelectorAll(sel)); }
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function soma(a){ return a.reduce(function(x,y){return x+y;},0); }
function copiar(txt,bt){
  function ok(){ if(bt){ var o=bt.textContent; bt.textContent="Copiado"; setTimeout(function(){bt.textContent=o;},1500);} }
  function fb(){ var t=document.createElement("textarea"); t.value=txt; document.body.appendChild(t); t.select(); try{document.execCommand("copy");ok();}catch(e){} document.body.removeChild(t); }
  try{ navigator.clipboard.writeText(txt).then(ok,fb); }catch(e){ fb(); }
}
function baixarCSV(nome, linhas){
  var csv = "﻿" + linhas.map(function(l){ return l.map(function(c){ c=String(c==null?"":c); return /[;"\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c; }).join(";"); }).join("\n");
  var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); a.download=nome; document.body.appendChild(a); a.click(); setTimeout(function(){URL.revokeObjectURL(a.href); a.remove();},500);
}
function cn(v){ return (Math.round((v||0)*100)/100).toFixed(2).replace(".",","); }
function kpi(r,v,d){ return '<div class="kpi"><div class="r">'+r+'</div><div class="v">'+v+'</div>'+(d?'<div class="d">'+d+'</div>':'')+'</div>'; }
/* tabela responsiva: cols [{t, n, opc, prim}] ; linhas [{cls, c:[html|null]}]. Colunas "opc" somem quando todas as células são vazias (null). */
function tabela(cols, linhas){
  var vis = cols.map(function(c,i){ return !c.opc || linhas.some(function(l){ return l.c[i]!=null && l.c[i]!==""; }); });
  var h = '<div class="tab-wrap resp"><table class="resp"><thead><tr>'+cols.map(function(c,i){ return vis[i]?'<th'+(c.n?' class="n"':'')+'>'+c.t+'</th>':''; }).join("")+'</tr></thead><tbody>';
  h += linhas.map(function(l){ return '<tr'+(l.cls?' class="'+l.cls+'"':'')+'>'+cols.map(function(c,i){ if(!vis[i]) return ""; var v=l.c[i]; var cl=[c.n?"n":"",c.prim?"prim":""].join(" ").trim(); return '<td data-l="'+esc(c.t)+'"'+(cl?' class="'+cl+'"':'')+'>'+(v==null?'<span class="mut">–</span>':v)+'</td>'; }).join("")+'</tr>'; }).join("");
  return h+'</tbody></table></div>';
}

/* ---------- acesso ---------- */
if (["sim","yes","true","assinante","administrador","admin"].indexOf(String(CFG.acesso).normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase()) < 0) {
  var link = /^https?:\/\//.test(CFG.planos) ? '<p style="margin-top:14px"><a class="bt" href="'+esc(CFG.planos)+'" target="_top" style="text-decoration:none">Conheça os planos</a></p>' : "";
  root.innerHTML = '<div class="card trava"><div class="ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--pri)"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div><h3>'+(CFG.modo==="depara"?"DE-PARA TUSS × AMB":"Cálculo AMB")+' é exclusivo para assinantes</h3><p class="mut">Calcule e correlacione procedimentos das tabelas AMB 90, 92, 96, 99 e CIEFAS 2000 com a TUSS.</p>'+link+'</div>';
  return;
}

/* ---------- dados ---------- */
var DB = {tab:{}, codigos:{}, lista:[], tuss:{}, tussLista:[], ambTuss:{}, depara:null};
function montar(meta, itens, depara){
  DB.meta = meta;
  meta.tabelas.forEach(function(m){ DB.tab[m.id] = {moeda:m.moeda, portes:m.portes, map:{}, n:0}; });
  T.forEach(function(t){
    var tb = DB.tab[t]; if(!tb) return;
    (itens[t]||[]).forEach(function(a){
      var r = {c:a[0], d:a[1], hm:a[2]||0, co:a[3]||0, pa:a[4]||0, aux:a[5]||0, fm:a[6]||0, t:t};
      (tb.map[r.c] = tb.map[r.c] || []).push(r); tb.n++;
      var k = DB.codigos[r.c];
      if(!k){ k = DB.codigos[r.c] = {tipo:"AMB", c:r.c, d:r.d, tabs:[], txt:""}; DB.lista.push(k); }
      if(k.tabs.indexOf(t)<0) k.tabs.push(t);
      if(t==="AMB92" || !k.d) k.d = r.d;
      k.txt += " " + norm(r.d);
    });
  });
  DB.lista.sort(function(a,b){ return a.c<b.c?-1:1; });
  if (depara && depara.pares) {
    DB.depara = depara;
    depara.pares.forEach(function(p){
      var a=p[0], t=p[1], d=p[2]||"";
      var k = DB.tuss[t]; if(!k){ k = DB.tuss[t] = {tipo:"TUSS", c:t, d:d, amb:[], txt:""}; DB.tussLista.push(k); }
      if (d && !k.d) k.d = d;
      if (k.amb.indexOf(a)<0) k.amb.push(a);
      (DB.ambTuss[a] = DB.ambTuss[a] || []); if (DB.ambTuss[a].indexOf(t)<0) DB.ambTuss[a].push(t);
    });
    DB.tussLista.forEach(function(k){ k.txt = norm(k.d) + " " + k.amb.map(function(a){ return DB.codigos[a]?DB.codigos[a].txt:""; }).join(" "); if(!k.d && k.amb[0] && DB.codigos[k.amb[0]]) k.dAmb = DB.codigos[k.amb[0]].d; });
    DB.tussLista.sort(function(a,b){ return a.c<b.c?-1:1; });
  }
}
function carregar(){
  if (window.MGAMB_DADOS) { var x=window.MGAMB_DADOS; montar(x.meta, x.itens, x.depara); return Promise.resolve(); }
  function get(n){ return fetch(CFG.dados + n, {cache:"default"}).then(function(r){ if(!r.ok) throw new Error(n+" "+r.status); return r.json(); }); }
  return Promise.all([get("meta.json")].concat(T.map(function(t){ return get(t+".json"); }))).then(function(res){
    var itens = {}; T.forEach(function(t,i){ itens[t] = res[i+1]; });
    var dp = res[0].depara ? get("depara.json").catch(function(){ return null; }) : Promise.resolve(null);
    return dp.then(function(d){ montar(res[0], itens, d); });
  });
}
function tussDe(amb){ return DB.ambTuss[amb] || []; }
function descTuss(t){ var k=DB.tuss[t]; return k ? (k.d || k.dAmb || "") : ""; }

/* ---------- negociação ---------- */
var PADRAO = { nome:"", base:"AMB92", subseq:true, ciefas:false, ch:0.41, filme:21.70, pctR:0, exc:[], reajPct:8, reajCasas:2 };
function normaliza(o){
  var s = Object.assign(clone(PADRAO), o||{});
  if (o && o.planos && o.ch==null) { var p=o.planos[o.plano]||o.planos.basico; if(p) s.ch=p.hm; }
  delete s.planos; delete s.plano;
  s.exc = (s.exc||[]).map(function(e){ return {nome:e.nome||"", de:e.de||"", ate:e.ate||"", ch:num(e.ch!=null?e.ch:e.hm)}; });
  return s;
}
var S = normaliza(null), NEG = {lista:[], atual:null, bubble:false};
try { S = normaliza(JSON.parse(localStorage.getItem(CHAVE)||"null")); NEG.atual = S._id||null; } catch(e){}
function salvar(){ try{ localStorage.setItem(CHAVE, JSON.stringify(S)); }catch(e){} }
function temBubble(n){ return typeof window["bubble_fn_"+n] === "function"; }
function negListaLocal(){ try{ return JSON.parse(localStorage.getItem(CHAVE_LISTA)||"[]"); }catch(e){ return []; } }
function negGravaLocal(l){ try{ localStorage.setItem(CHAVE_LISTA, JSON.stringify(l)); }catch(e){} }
function paraSalvar(){ var o = clone(S); delete o._id; return o; }
function negSalvar(nome, substituir){
  var dados = paraSalvar(); dados.nome = nome; dados.salvo_em = new Date().toISOString();
  var antigo = substituir ? NEG.atual : null;
  if (temBubble("ambnegsalvar")) {
    NEG.pendenteNome = nome; S.nome = nome; salvar();
    window.bubble_fn_ambnegsalvar(JSON.stringify(dados));
    if (antigo && temBubble("ambnegexcluir")) setTimeout(function(){ window.bubble_fn_ambnegexcluir(antigo); }, 600);
    negRecarregar(1500);
  } else {
    var l = negListaLocal().filter(function(x){ return x.id!==antigo; });
    var id = "l"+Date.now(); l.push({id:id, d:dados}); negGravaLocal(l);
    NEG.lista = l; NEG.atual = id; S.nome = nome; S._id = id; salvar(); desenhaNeg();
  }
}
function negRecarregar(ms){ if (temBubble("ambneglistar")) setTimeout(function(){ window.bubble_fn_ambneglistar(String(Date.now())); }, ms||0); }
function negExcluir(id){
  if (temBubble("ambnegexcluir")) { window.bubble_fn_ambnegexcluir(id); NEG.lista = NEG.lista.filter(function(x){ return x.id!==id; }); negRecarregar(1200); }
  else { var l = negListaLocal().filter(function(x){ return x.id!==id; }); negGravaLocal(l); NEG.lista=l; }
  if (NEG.atual===id){ NEG.atual=null; S.nome=""; delete S._id; salvar(); }
  desenhaNeg();
}
function negAplicar(id){
  var n = NEG.lista.filter(function(x){return x.id===id;})[0]; if(!n) return;
  S = normaliza(n.d); S._id = id; NEG.atual = id; salvar(); IMP.A = null; atualizaTudo(); desenhaNeg();
}
window.MagisterAMB = window.MagisterAMB || {};
window.MagisterAMB.negociacoes = function(lista){
  NEG.bubble = true;
  NEG.lista = (lista||[]).filter(function(x){ return x && x.id; }).map(function(x){ var d=x.d; if(typeof d==="string"){ try{ d=JSON.parse(d); }catch(e){ d={}; } } return {id:x.id, d:d||{}}; });
  NEG.lista.sort(function(a,b){ return String(a.d.nome||"").localeCompare(String(b.d.nome||""),"pt-BR"); });
  if (NEG.pendenteNome) { var novo = NEG.lista.filter(function(x){ return x.d.nome===NEG.pendenteNome; }).sort(function(a,b){ return String(b.d.salvo_em||"").localeCompare(String(a.d.salvo_em||"")); })[0]; if(novo){ NEG.atual=novo.id; S._id=novo.id; S.nome=novo.d.nome; salvar(); NEG.pendenteNome=null; } }
  if (NEG.atual && !NEG.lista.some(function(x){return x.id===NEG.atual;}) && !NEG.pendenteNome) { NEG.atual=null; delete S._id; }
  if ($("#mg-neg")) desenhaNeg();
};

function cadeia(cfg){
  var c = [cfg.base];
  if (cfg.subseq && cfg.base!=="CIEFAS") { var i=T.indexOf(cfg.base); for(var j=i+1;j<4;j++) c.push(T[j]); if(cfg.ciefas) c.push("CIEFAS"); }
  return c;
}
function excecao(cfg, c){
  for (var i=0;i<(cfg.exc||[]).length;i++){
    var e = cfg.exc[i], de = String(e.de||"").replace(/\D/g,""), ate = String(e.ate||e.de||"").replace(/\D/g,"");
    if(!de) continue;
    if (c.slice(0,de.length)>=de && c.slice(0,ate.length)<=ate) return e;
  }
  return null;
}
function fatores(t, c, cfg){
  cfg = cfg||S;
  if (DB.tab[t].moeda === "R$") { var f = 1 + (cfg.pctR||0)/100; return {tipo:"R$", hm:f, co:f, an:f, origem: cfg.pctR ? "valor em R$ da tabela "+pc(cfg.pctR/100) : "valor em R$ da tabela"}; }
  var e = excecao(cfg, c);
  if (e) return {tipo:"CH", hm:num(e.ch), co:num(e.ch), an:num(e.ch), origem:"CH da exceção "+(e.nome||e.de)};
  return {tipo:"CH", hm:cfg.ch, co:cfg.ch, an:cfg.ch, origem:"CH da negociação"};
}
function achar(c, cfg, forcada){
  var ch = forcada ? [forcada] : cadeia(cfg||S);
  for (var i=0;i<ch.length;i++){ var tb=DB.tab[ch[i]]; if(tb && tb.map[c]) return {rows:tb.map[c], t:ch[i], subseq:i>0}; }
  return null;
}
function valores(r, cfg){
  cfg = cfg||S;
  var f = fatores(r.t, r.c, cfg), portes = DB.tab[r.t].portes;
  var v = {f:f, hm:r2(r.hm*f.hm), co:r2(r.co*f.co), fil:r2(r.fm*cfg.filme), porteQ:portes[r.pa]||0};
  v.an = r2(v.porteQ*f.an);
  v.aux = []; for (var i=0;i<(r.aux||0);i++) v.aux.push(r2(v.hm*(i===0?0.3:0.2)));
  v.auxT = soma(v.aux);
  v.total = r2(v.hm+v.co+v.fil); v.geral = r2(v.total+v.auxT+v.an);
  return v;
}
function capIII(c){ var e = +c.slice(0,2); return e>=15 && e<=38 && c.slice(0,4)!=="2302"; }
function tipoExame(r){ var d = norm(r.d); if(/TOMOGRAFIA/.test(d)) return "tc"; if(/RESSONANCIA/.test(d)) return "rm"; return "nenhum"; }
function qtdTxt(v,t){ return DB.tab[t].moeda==="CH" ? nf(v)+" CH" : brl(v); }

/* ---------- estrutura ---------- */
var ABA = CFG.modo==="depara" ? "depara" : "calc";
function telaBase(){
  var info = T.map(function(t){ return '<span class="pilula">'+NOME[t]+' · '+(DB.tab[t]?DB.tab[t].n.toLocaleString("pt-BR"):0)+'</span>'; }).join("");
  if (DB.depara) info += '<span class="pilula tuss">De-para TUSS · '+DB.depara.pares.length.toLocaleString("pt-BR")+' pares</span>';
  var dep = CFG.modo==="depara";
  root.innerHTML =
  '<div class="topo"><div><h2>'+(dep?"DE-PARA TUSS × AMB":"Cálculo AMB")+'</h2><p class="mut" style="margin:4px 0 0">'+(dep?"Correlação entre os códigos TUSS (Tabela 22) e as tabelas AMB 90, 92, 96, 99 e CIEFAS 2000.":"Valoração de procedimentos nas tabelas AMB 90, 92, 96, 99 e CIEFAS 2000, com pesquisa por AMB ou TUSS.")+'</p></div><div class="chips">'+info+'</div></div>'+
  (dep ? '' : '<div class="card" id="mg-neg"></div>'+
  '<div class="abas" role="tablist">'+
    '<button class="aba" data-aba="calc">Calcular procedimento</button>'+
    '<button class="aba" data-aba="conta">Conta com vários procedimentos</button>'+
    '<button class="aba" data-aba="imp">Impacto na carteira</button>'+
    '<button class="aba" data-aba="depara">De-para TUSS × AMB</button>'+
    '<button class="aba" data-aba="como">Como calcula</button>'+
  '</div>')+'<div id="mg-corpo"></div>';
  $$(".aba").forEach(function(b){ b.addEventListener("click", function(){ ABA=b.getAttribute("data-aba"); trocaAba(); }); });
  if (!dep) telaNeg();
  trocaAba();
  if (!dep) {
    if (temBubble("ambneglistar")) negRecarregar(0);
    else if (window.MGAMB_NEG) window.MagisterAMB.negociacoes(window.MGAMB_NEG);
    else { NEG.lista = negListaLocal(); desenhaNeg(); }
  }
}
function trocaAba(){
  $$(".aba").forEach(function(b){ b.classList.toggle("on", b.getAttribute("data-aba")===ABA); });
  ({calc:telaCalc, conta:telaConta, imp:telaImp, depara:telaDepara, como:telaComo})[ABA]();
}
function atualizaTudo(){
  salvar(); resumoNeg();
  if (ABA==="calc" && $("#mg-cres")) resCalc();
  else if (ABA==="conta" && $("#mg-kitens")) desenhaConta();
  else if (ABA==="imp") telaImp();
  else if (ABA==="como") telaComo();
}

/* ---------- painel da negociação ---------- */
var negAberta = false;
function telaNeg(){
  $("#mg-neg").innerHTML = '<div class="linha-bt entre" style="align-items:flex-start"><div style="min-width:0;flex:1 1 260px"><h3 style="margin:0">Parâmetros da negociação</h3><div class="linha-bt mut peq" id="mg-negres" style="margin-top:6px;gap:6px"></div></div><div class="linha-bt"><select id="mg-negsel" style="width:auto;max-width:240px"></select><button class="bt cont" id="mg-negbt"></button></div></div><div id="mg-negcorpo" style="display:none;margin-top:16px"></div>';
  $("#mg-negbt").addEventListener("click", function(){ negAberta=!negAberta; desenhaNeg(); });
  $("#mg-negsel").addEventListener("change", function(){ if(this.value) negAplicar(this.value); else { NEG.atual=null; S.nome=""; delete S._id; salvar(); desenhaNeg(); } });
  desenhaNeg();
}
function resumoNeg(){
  var ch = cadeia(S).map(function(t){return NOME[t];}).join(" › ");
  var h = (S.nome?'<span class="pilula ok">'+esc(S.nome)+'</span>':'')+'<span class="pilula pri">Tabela: '+esc(ch)+'</span><span class="pilula">CH '+nf(S.ch)+'</span><span class="pilula">Filme '+brl(S.filme)+'/m²</span>';
  if (S.pctR) h += '<span class="pilula">Tabelas em R$ '+pc(S.pctR/100)+'</span>';
  if (S.exc.length) h += '<span class="pilula al">'+S.exc.length+' CH diferenciado(s)</span>';
  if ($("#mg-negres")) $("#mg-negres").innerHTML = h;
}
function desenhaNeg(){
  if (!$("#mg-negbt")) return;
  var sel = $("#mg-negsel");
  sel.innerHTML = '<option value="">'+(NEG.lista.length?"Negociações salvas ("+NEG.lista.length+")":"Nenhuma negociação salva")+'</option>'+NEG.lista.map(function(n){ return '<option value="'+esc(n.id)+'"'+(n.id===NEG.atual?" selected":"")+'>'+esc(n.d.nome||"Sem nome")+'</option>'; }).join("");
  $("#mg-negbt").textContent = negAberta ? "Fechar" : "Editar parâmetros";
  var c = $("#mg-negcorpo"); c.style.display = negAberta ? "block" : "none";
  resumoNeg();
  if (!negAberta) return;
  var opsT = T.map(function(t){ return '<option value="'+t+'"'+(S.base===t?" selected":"")+'>'+NOME[t]+'</option>'; }).join("");
  var linhasE = S.exc.map(function(e,i){
    return {c:['<input type="text" data-ex="'+i+'" data-cp="nome" value="'+esc(e.nome||"")+'" placeholder="Ex.: Hemoterapia">','<input type="text" data-ex="'+i+'" data-cp="de" value="'+esc(e.de||"")+'" placeholder="27">','<input type="text" data-ex="'+i+'" data-cp="ate" value="'+esc(e.ate||"")+'" placeholder="27">','<input type="text" inputmode="decimal" data-ex="'+i+'" data-cp="ch" value="'+nf(num(e.ch))+'">','<button class="bt leve min" data-exdel="'+i+'">Remover</button>']}; });
  c.innerHTML =
  '<div class="grade2">'+
   '<div><h4>Tabela de referência</h4><div class="grade" style="grid-template-columns:1fr">'+
     '<label class="cp">Tabela base do contrato<select id="mg-base">'+opsT+'</select></label>'+
     '<label class="chk"><input type="checkbox" id="mg-subseq"'+(S.subseq?" checked":"")+'> Usar tabelas subsequentes quando o código não existir na base</label>'+
     '<label class="chk"><input type="checkbox" id="mg-ciefas"'+(S.ciefas?" checked":"")+'> Incluir CIEFAS 2000 no fim da subsequência</label>'+
     '<p class="mut peq" style="margin:0">AMB 90 e 92 em quantidade de CH; AMB 96, 99 e CIEFAS já em reais. Se a negociação cair na CBHPM, use a aba Simulação CBHPM.</p></div></div>'+
   '<div><h4>Valores negociados</h4><div class="grade">'+
     '<label class="cp">Moeda de conversão (CH)<input type="text" inputmode="decimal" id="mg-ch" value="'+nf(S.ch)+'"></label>'+
     '<label class="cp">Valor do m² de filme (R$)<input type="text" inputmode="decimal" id="mg-filme" value="'+nf(S.filme,2)+'"></label>'+
     '<label class="cp">Acréscimo sobre tabelas em R$ (%)<input type="text" inputmode="decimal" id="mg-pctr" value="'+nf(S.pctR,2)+'"></label></div>'+
   '<div class="card" style="background:var(--fundo);margin:12px 0 0;padding:14px"><h4>Reajuste do CH</h4><div class="grade"><label class="cp">Reajuste (%)<input type="text" inputmode="decimal" id="mg-rpct" value="'+nf(S.reajPct,2)+'"></label><label class="cp">Casas decimais do CH<select id="mg-rcasas"><option value="2"'+(S.reajCasas==2?" selected":"")+'>2 (arredonda)</option><option value="4"'+(S.reajCasas==4?" selected":"")+'>4</option></select></label></div><div id="mg-rres" class="peq" style="margin-top:8px"></div><div class="linha-bt" style="margin-top:8px"><button class="bt cont min" id="mg-raplica">Aplicar reajuste ao CH</button></div></div></div>'+
  '</div>'+
  '<div class="sep"></div><h4>CH diferenciado por especialidade, grupo ou faixa de código</h4><p class="mut peq">Pelo começo do código (2 dígitos = especialidade, 4 = grupo). Ex.: Hemoterapia de 27 até 27 com CH 0,76. Para CH diferente por plano, salve uma negociação para cada plano.</p>'+
  (S.exc.length ? tabela([{t:"Nome",prim:true},{t:"De"},{t:"Até"},{t:"CH"},{t:""}], linhasE) : '')+
  '<div class="linha-bt" style="margin-top:10px"><button class="bt leve min" id="mg-exadd">Adicionar CH diferenciado</button></div>'+
  '<div class="sep"></div><h4>Cadastrar negociação</h4><p class="mut peq">'+(NEG.bubble||temBubble("ambnegsalvar")?"Fica salva na sua conta e aparece no seletor acima em qualquer computador.":"Fica salva neste navegador.")+'</p>'+
  '<div class="linha-bt"><input type="text" id="mg-negnome" placeholder="Nome (ex.: Hospital X · AMB 92 · CH 0,44)" value="'+esc(S.nome||"")+'" style="flex:1 1 260px;width:auto">'+
  '<button class="bt" id="mg-negnovo">Salvar como nova</button>'+(NEG.atual?'<button class="bt cont" id="mg-negatu">Atualizar "'+esc(S.nome)+'"</button><button class="bt perigo" id="mg-negdel">Excluir</button>':'')+
  '<button class="bt leve" id="mg-padrao">Limpar parâmetros</button></div>';

  function upd(){ atualizaTudo(); }
  $("#mg-base").addEventListener("change", function(){ S.base=this.value; upd(); });
  $("#mg-subseq").addEventListener("change", function(){ S.subseq=this.checked; upd(); });
  $("#mg-ciefas").addEventListener("change", function(){ S.ciefas=this.checked; upd(); });
  $("#mg-ch").addEventListener("change", function(){ S.ch=num(this.value); upd(); reaj(); });
  $("#mg-filme").addEventListener("change", function(){ S.filme=num(this.value); upd(); });
  $("#mg-pctr").addEventListener("change", function(){ S.pctR=num(this.value); upd(); });
  $$("input[data-ex]",c).forEach(function(i){ i.addEventListener("change", function(){ var e=S.exc[+this.getAttribute("data-ex")], cp=this.getAttribute("data-cp"); e[cp] = cp==="ch" ? num(this.value) : this.value.trim(); upd(); }); });
  $$("[data-exdel]",c).forEach(function(b){ b.addEventListener("click", function(){ S.exc.splice(+this.getAttribute("data-exdel"),1); upd(); desenhaNeg(); }); });
  $("#mg-exadd").addEventListener("click", function(){ S.exc.push({nome:"",de:"",ate:"",ch:S.ch}); salvar(); desenhaNeg(); });
  $("#mg-padrao").addEventListener("click", function(){ S=normaliza(null); NEG.atual=null; upd(); desenhaNeg(); });
  $("#mg-negnovo").addEventListener("click", function(){ var n=$("#mg-negnome").value.trim(); if(!n){ $("#mg-negnome").focus(); $("#mg-negnome").placeholder="Informe um nome para salvar"; return; } negSalvar(n,false); });
  if ($("#mg-negatu")) $("#mg-negatu").addEventListener("click", function(){ var n=$("#mg-negnome").value.trim()||S.nome; negSalvar(n,true); });
  if ($("#mg-negdel")) $("#mg-negdel").addEventListener("click", function(){ if(this.getAttribute("data-ok")){ negExcluir(NEG.atual); } else { this.setAttribute("data-ok","1"); this.textContent="Confirmar exclusão"; } });
  function reaj(){
    var pct=num($("#mg-rpct").value), casas=+$("#mg-rcasas").value, m=Math.pow(10,casas);
    S.reajPct=pct; S.reajCasas=casas; salvar();
    var a = Math.round(S.ch*(1+pct/100)*m)/m;
    $("#mg-rres").innerHTML = 'CH '+nf(S.ch)+' → <b>'+nf(a)+'</b> ('+pc(S.ch?a/S.ch-1:0)+' efetivo)'+(casas===2?'<div class="mut" style="margin-top:4px">Com 2 casas o reajuste efetivo pode ficar diferente do percentual negociado.</div>':'');
  }
  $("#mg-rpct").addEventListener("input", reaj); $("#mg-rcasas").addEventListener("change", reaj);
  $("#mg-raplica").addEventListener("click", function(){
    var pct=num($("#mg-rpct").value), m=Math.pow(10,+$("#mg-rcasas").value);
    S.ch=Math.round(S.ch*(1+pct/100)*m)/m;
    S.exc.forEach(function(e){ e.ch=Math.round(num(e.ch)*(1+pct/100)*m)/m; });
    upd(); desenhaNeg();
  });
  reaj();
}

/* ---------- busca (AMB e TUSS) ---------- */
function buscar(q, lim, tipo){
  q = String(q||"").trim(); if(!q) return [];
  var dig = q.replace(/[\s.\-]/g,""), out = [];
  var fontes = tipo==="AMB" ? [DB.lista] : tipo==="TUSS" ? [DB.tussLista] : [DB.lista, DB.tussLista];
  if (/^\d{2,}$/.test(dig)) {
    var alt = dig.replace(/^0+/,""), exato = limpaCod(dig);
    fontes.forEach(function(L){ var n=0; for(var i=0;i<L.length && n<lim;i++){ var k=L[i]; if(k.c.indexOf(dig)===0 || k.c.replace(/^0+/,"").indexOf(alt)===0){ out.push(k); n++; } } });
    out.sort(function(a,b){ return (b.c===exato)-(a.c===exato); });
    return out;
  }
  var pal = norm(q).split(/\s+/).filter(Boolean);
  fontes.forEach(function(L){ var n=0; for (var i=0;i<L.length && n<lim;i++){ var k=L[i], ok=true; for(var j=0;j<pal.length;j++){ if(k.txt.indexOf(pal[j])<0){ok=false;break;} } if(ok){ out.push(k); n++; } } });
  return out;
}
var FILTRO_BUSCA = "tudo";
function widgetBusca(box, aoEscolher, ph){
  var temTuss = !!DB.depara;
  box.innerHTML = '<div class="busca">'+(temTuss?'<div class="filtros"><button type="button" class="chip" data-f="tudo">AMB e TUSS</button><button type="button" class="chip" data-f="AMB">Só AMB</button><button type="button" class="chip" data-f="TUSS">Só TUSS</button></div>':'')+'<input type="text" placeholder="'+esc(ph||(temTuss?"Código AMB, código TUSS ou descrição":"Código ou descrição do procedimento"))+'" autocomplete="off"><div class="lista"></div></div>';
  var inp = $("input",box), lst = $(".lista",box), res = [], sel = 0, tm;
  function tipo(){ return !temTuss ? "AMB" : FILTRO_BUSCA==="tudo" ? null : FILTRO_BUSCA; }
  function marca(){ $$(".chip[data-f]",box).forEach(function(b){ b.classList.toggle("on", b.getAttribute("data-f")===FILTRO_BUSCA); }); }
  $$(".chip[data-f]",box).forEach(function(b){ b.addEventListener("click", function(){ FILTRO_BUSCA=b.getAttribute("data-f"); marca(); if(inp.value.trim()){ res=buscar(inp.value,30,tipo()); sel=0; pinta(); } inp.focus(); }); });
  marca();
  function pinta(){
    if(!res.length){ lst.innerHTML = inp.value.trim() ? '<div class="op mut">Nenhum procedimento encontrado.</div>' : ""; lst.classList.toggle("on", !!inp.value.trim()); return; }
    lst.innerHTML = res.map(function(k,i){
      var tu = k.tipo==="AMB" ? tussDe(k.c) : null;
      var info = k.tipo==="AMB" ? k.tabs.map(function(t){return NOME[t];}).join(" · ") + (tu.length?" · TUSS "+tu.slice(0,3).join(", ")+(tu.length>3?"…":""):"") : (k.amb.length===1?"1 código AMB: "+fcod(k.amb[0]) : k.amb.length+" códigos AMB correspondentes");
      return '<button type="button" class="op'+(i===sel?" sel":"")+'" data-i="'+i+'"><span class="tag '+(k.tipo==="AMB"?"a":"t")+'">'+k.tipo+'</span><b>'+(k.tipo==="AMB"?fcod(k.c):k.c)+'</b>'+esc(k.d||k.dAmb||"")+'<small>'+info+'</small></button>'; }).join("");
    lst.classList.add("on");
    $$(".op[data-i]",lst).forEach(function(b){ b.addEventListener("mousedown", function(ev){ ev.preventDefault(); escolhe(+b.getAttribute("data-i")); }); });
  }
  function escolhe(i){ var k=res[i]; if(!k) return; lst.classList.remove("on"); inp.value=""; res=[]; aoEscolher(k.tipo, k.c); }
  inp.addEventListener("input", function(){ clearTimeout(tm); tm=setTimeout(function(){ res=buscar(inp.value,30,tipo()); sel=0; pinta(); },120); });
  inp.addEventListener("keydown", function(ev){
    if(ev.key==="ArrowDown"){ sel=Math.min(sel+1,res.length-1); pinta(); ev.preventDefault(); }
    else if(ev.key==="ArrowUp"){ sel=Math.max(sel-1,0); pinta(); ev.preventDefault(); }
    else if(ev.key==="Enter"){ ev.preventDefault(); res=buscar(inp.value,30,tipo()); if(res.length) escolhe(Math.min(sel,res.length-1)); else pinta(); }
    else if(ev.key==="Escape"){ lst.classList.remove("on"); }
  });
  inp.addEventListener("blur", function(){ setTimeout(function(){ lst.classList.remove("on"); },150); });
  inp.addEventListener("focus", function(){ if(res.length) lst.classList.add("on"); });
  return inp;
}
/* cards de opções AMB para um código TUSS (1×n) */
function cardsTuss(tuss, ativo){
  var k = DB.tuss[tuss]; if(!k) return "";
  return '<div class="opcoes">'+k.amb.map(function(a){
    var ach = achar(a, S), ka = DB.codigos[a];
    if (!ka) return '<div class="opcao" style="cursor:default"><div class="cod">AMB '+fcod(a)+'</div><div class="mut peq">Código do de-para não encontrado nas tabelas AMB carregadas.</div></div>';
    if (!ach) return '<button type="button" class="opcao'+(a===ativo?" on":"")+'" data-amb="'+a+'"><div class="cod">AMB '+fcod(a)+'</div><div>'+esc(ka.d)+'</div><div class="pilula al">Fora da tabela da negociação · existe na '+ka.tabs.map(function(t){return NOME[t];}).join(", ")+'</div></button>';
    var r = ach.rows[0], v = valores(r), dl = [];
    dl.push(["Tabela", NOME[r.t]+(ach.subseq?" (subsequência)":"")]);
    dl.push(["Honorário", qtdTxt(r.hm,r.t)]);
    if (r.co) dl.push(["Custo operacional", qtdTxt(r.co,r.t)]);
    if (r.fm) dl.push(["Filme", nf(r.fm)+" m²"]);
    if (r.aux) dl.push(["Auxiliares", r.aux]);
    if (r.pa) dl.push(["Porte anestésico", r.pa]);
    return '<button type="button" class="opcao'+(a===ativo?" on":"")+'" data-amb="'+a+'"><div class="cod">AMB '+fcod(a)+'</div><div>'+esc(r.d)+'</div><dl>'+dl.map(function(x){ return '<dt>'+x[0]+'</dt><dd>'+x[1]+'</dd>'; }).join("")+'</dl><div class="vt">'+brl(v.geral)+'</div><div class="peq mut">total com a negociação atual</div></button>';
  }).join("")+'</div>';
}

/* ---------- aba 1: calcular procedimento ---------- */
var CALC = {c:null, t:null, v:0, tuss:null};
function telaCalc(){
  $("#mg-corpo").innerHTML = '<div class="card"><h3>Calcular procedimento</h3><div id="mg-cbusca"></div><div id="mg-cres"></div></div>';
  widgetBusca($("#mg-cbusca"), function(tipo, c){
    if (tipo==="TUSS"){ var k=DB.tuss[c]; CALC.tuss=c; CALC.c = k.amb.length===1 ? k.amb[0] : null; }
    else { CALC.c=c; CALC.tuss=null; }
    CALC.t=null; CALC.v=0; resCalc();
  });
  resCalc();
}
function memoria(r, v){
  var u = DB.tab[r.t].moeda==="CH", L = [];
  L.push(NOME[r.t]+" · "+fcod(r.c)+" "+r.d);
  var tu = tussDe(r.c); if (tu.length) L.push("TUSS relacionado: "+tu.join(", "));
  L.push("Conversão: "+v.f.origem);
  L.push("Honorário: "+(u ? nf(r.hm)+" CH × "+nf(v.f.hm)+" = " : brl(r.hm)+(v.f.hm!==1?" × "+nf(v.f.hm):"")+" = ")+brl(v.hm));
  if (r.co) L.push("Custo operacional: "+(u ? nf(r.co)+" CH × "+nf(v.f.co)+" = " : brl(r.co)+(v.f.co!==1?" × "+nf(v.f.co):"")+" = ")+brl(v.co));
  if (r.fm) L.push("Filme: "+nf(r.fm)+" m² × "+brl(S.filme)+" = "+brl(v.fil));
  v.aux.forEach(function(a,i){ L.push((i+1)+"º auxiliar: "+(i===0?"30%":"20%")+" × "+brl(v.hm)+" = "+brl(a)); });
  if (r.pa) L.push("Anestesista: porte "+r.pa+" = "+(u ? nf(v.porteQ)+" CH × "+nf(v.f.an) : brl(v.porteQ)+(v.f.an!==1?" × "+nf(v.f.an):""))+" = "+brl(v.an));
  if ((r.co || r.fm) && (r.aux || r.pa)) L.push("Total do procedimento: "+brl(v.total));
  L.push("Total geral: "+brl(v.geral));
  return L.join("\n");
}
function resCalc(){
  var el = $("#mg-cres");
  if (!CALC.c && !CALC.tuss){ el.innerHTML = '<div class="vazio">Digite o código AMB'+(DB.depara?" ou TUSS":"")+' (com ou sem pontos) ou parte da descrição.<br><span class="peq">Ex.: 43030025, 31.01.001-6, apendicectomia, tomografia abdomen</span></div>'; return; }
  var h = "";
  if (CALC.tuss) {
    var kt = DB.tuss[CALC.tuss];
    h += '<div class="sep"></div><div class="linha-bt"><span class="tag t">TUSS</span><b>'+kt.c+'</b> <span>'+esc(kt.d||kt.dAmb||"")+'</span></div>';
    if (kt.amb.length>1) h += '<p class="mut peq" style="margin-top:6px">Este TUSS corresponde a '+kt.amb.length+' códigos AMB. Escolha o que foi realizado:</p>';
    h += cardsTuss(CALC.tuss, CALC.c);
    if (!CALC.c){ el.innerHTML = h; ligaCards(); return; }
  }
  var k = DB.codigos[CALC.c], ach = achar(CALC.c, S, CALC.t);
  var chips = T.map(function(t){ var tem = !!(DB.tab[t] && DB.tab[t].map[CALC.c]); return '<button class="chip'+(ach&&ach.t===t?" on":"")+'" data-t="'+t+'"'+(tem?"":" disabled")+'>'+NOME[t]+'</button>'; }).join("");
  var tu = tussDe(CALC.c);
  h += '<div class="sep"></div><div class="linha-bt entre" style="align-items:flex-start"><div style="min-width:0"><div class="peq mut"><span class="tag a">AMB</span>'+fcod(CALC.c)+'</div><div style="font-weight:600;font-size:16px">'+esc(k.d)+'</div>'+
    (DB.depara ? '<div class="linha-bt" style="margin-top:6px;gap:6px">'+(tu.length ? tu.map(function(t){ return '<button class="pilula tuss" data-tuss="'+t+'" style="cursor:pointer" title="'+esc(descTuss(t))+'">TUSS '+t+(DB.tuss[t].amb.length>1?' · 1×'+DB.tuss[t].amb.length:'')+'</button>'; }).join("") : '<span class="pilula al">Sem TUSS no de-para</span>')+'</div>' : '')+
    '</div><div class="chips">'+chips+'</div></div>';
  if (!ach){
    h += '<div class="aviso al">Este código não está na '+esc(cadeia(S).map(function(t){return NOME[t];}).join(", "))+'. Ele existe em: '+k.tabs.map(function(t){return NOME[t];}).join(", ")+'. Escolha uma tabela acima ou ajuste a subsequência nos parâmetros.</div>';
    el.innerHTML = h; ligaChips(); ligaCards(); return;
  }
  var rows = ach.rows, idx = Math.min(CALC.v, rows.length-1), r = rows[idx], v = valores(r);
  if (ach.subseq && !CALC.t) h += '<div class="aviso inf">Não existe na '+NOME[S.base]+'. Calculado pela '+NOME[ach.t]+' (subsequência da negociação).</div>';
  if (CALC.t && cadeia(S).indexOf(CALC.t)<0) h += '<div class="aviso al">A '+NOME[CALC.t]+' não faz parte da tabela de referência da negociação; o cálculo é só para comparação.</div>';
  if (rows.length>1) h += '<div class="aviso al">Este código aparece '+rows.length+' vezes na '+NOME[ach.t]+'. <label class="cp" style="margin-top:6px;max-width:520px">Linha da tabela<select id="mg-var">'+rows.map(function(x,i){ return '<option value="'+i+'"'+(i===idx?" selected":"")+'>'+(i+1)+' · '+esc(x.d)+' · '+qtdTxt(x.hm+x.co,x.t)+'</option>'; }).join("")+'</select></label></div>';
  var u = DB.tab[r.t].moeda==="CH", ks = [], ext = r.aux||r.pa;
  ks.push(kpi("Honorário", brl(v.hm), u ? nf(r.hm)+" CH × "+nf(v.f.hm) : "tabela "+brl(r.hm)));
  if (r.co) ks.push(kpi("Custo operacional", brl(v.co), u ? nf(r.co)+" CH × "+nf(v.f.co) : "tabela "+brl(r.co)));
  if (r.fm) ks.push(kpi("Filme radiológico", brl(v.fil), nf(r.fm)+" m² × "+brl(S.filme)));
  v.aux.forEach(function(a,i){ ks.push(kpi((i+1)+"º auxiliar", brl(a), (i===0?"30%":"20%")+" do honorário")); });
  if (r.pa) ks.push(kpi("Anestesista", brl(v.an), "porte "+r.pa+" = "+qtdTxt(v.porteQ,r.t)));
  if ((r.co||r.fm) && ext) ks.push(kpi("Total do procedimento", brl(v.total), "honorário + custo op. + filme"));
  ks.push('<div class="kpi dest"><div class="r">'+(ext?"Total geral":"Total")+'</div><div class="v">'+brl(v.geral)+'</div>'+(ext?'<div class="d">com auxiliares e anestesista</div>':'')+'</div>');
  h += '<div class="kpis">'+ks.join("")+'</div>';
  h += '<div class="linha-bt"><button class="bt" id="mg-addconta">Adicionar à conta</button><button class="bt cont" id="mg-copmem">Copiar memória de cálculo</button><button class="bt cont" id="mg-ccsv">Baixar CSV</button></div>';
  h += '<details><summary>Memória de cálculo</summary><div class="memo">'+esc(memoria(r,v))+'</div></details>';
  var base = v.geral, comp = [];
  var lin = T.map(function(t){
    var rr = DB.tab[t] && DB.tab[t].map[CALC.c];
    if (!rr) return {cls:"", c:['<b>'+NOME[t]+'</b>','<span class="mut">não existe nesta tabela</span>',null,null,null,null,null,null,null]};
    var x = rr[0], vv = valores(x); comp.push({t:t,x:x,v:vv});
    return {cls: t===r.t?"usada":"", c:['<b>'+NOME[t]+'</b>'+(rr.length>1?' <span class="pilula al">'+rr.length+' linhas</span>':''), esc(x.d), qtdTxt(x.hm,t), x.co?qtdTxt(x.co,t):null, x.fm?nf(x.fm):null, x.aux||null, x.pa||null, '<b>'+brl(vv.geral)+'</b>', t===r.t?"base":'<span class="'+(vv.geral>base?"pos":vv.geral<base?"neg":"")+'">'+(base?pc(vv.geral/base-1):"–")+'</span>']};
  });
  h += '<div class="sep"></div><h4>Parâmetros em todas as versões</h4><p class="mut peq">Com a negociação atual (CH para AMB 90 e 92; acréscimo informado para as tabelas em R$). A variação compara com a tabela destacada.</p>'+
    tabela([{t:"Tabela",prim:true},{t:"Descrição"},{t:"Honorário",n:true},{t:"Custo op.",n:true,opc:true},{t:"Filme m²",n:true,opc:true},{t:"Aux.",n:true,opc:true},{t:"Porte anest.",n:true,opc:true},{t:"Total",n:true},{t:"Variação",n:true}], lin);
  el.innerHTML = h;
  ligaChips(); ligaCards();
  var vs = $("#mg-var"); if (vs) vs.addEventListener("change", function(){ CALC.v=+this.value; resCalc(); });
  $("#mg-copmem").addEventListener("click", function(){ copiar(memoria(r,v), this); });
  $("#mg-addconta").addEventListener("click", function(){ addConta(r, CALC.tuss || (tu.length===1?tu[0]:null)); ABA="conta"; trocaAba(); });
  $("#mg-ccsv").addEventListener("click", function(){
    var L=[["TUSS","Código AMB","Tabela","Descrição","Honorário (qtd)","Custo op. (qtd)","Filme m²","Porte anestésico","Honorário R$","Custo op. R$","Filme R$","1º auxiliar R$","2º auxiliar R$","3º auxiliar R$","4º auxiliar R$","Anestesista R$","Total R$"]];
    comp.forEach(function(o){ L.push([CALC.tuss||tussDe(CALC.c).join(" | "),fcod(o.x.c),NOME[o.t],o.x.d,cn(o.x.hm),cn(o.x.co),cn(o.x.fm),o.x.pa||"",cn(o.v.hm),cn(o.v.co),cn(o.v.fil),cn(o.v.aux[0]),cn(o.v.aux[1]),cn(o.v.aux[2]),cn(o.v.aux[3]),cn(o.v.an),cn(o.v.geral)]); });
    baixarCSV("calculo_amb_"+CALC.c+".csv", L);
  });
  function ligaChips(){ $$(".chip[data-t]", el).forEach(function(b){ b.addEventListener("click", function(){ var t=b.getAttribute("data-t"); CALC.t = (ach && ach.t===t && !CALC.t) ? null : t; CALC.v=0; resCalc(); }); }); }
}
function ligaCards(){
  $$("#mg-cres .opcao[data-amb]").forEach(function(b){ b.addEventListener("click", function(){ CALC.c=b.getAttribute("data-amb"); CALC.t=null; CALC.v=0; resCalc(); }); });
  $$("#mg-cres [data-tuss]").forEach(function(b){ b.addEventListener("click", function(){ CALC.tuss=b.getAttribute("data-tuss"); resCalc(); }); });
}

/* ---------- aba 2: conta ---------- */
var CONTA = {itens:[], apto:false, intern:true, urg:false, aux16b:true, instr:0, instrP2:true, seq:0, escolhaTuss:null};
var VIA = {principal:["Principal",1], mesma:["Mesma via do principal",0.5], diferente:["Via diferente",0.7], equipe:["Equipe distinta",1], na:["Não se aplica",1]};
var ESC = {nenhum:["Sem escalonamento",[1]], tc:["Tomografia 100/70/50",[1,0.7,0.5]], rm:["Ressonância 100/80",[1,0.8]]};
var ANE = {tab:"Conforme tabela", sem:"Chamado sem previsão", nao:"Não participou"};
function porteSemPrev(t){ return t==="AMB90" ? 1 : 3; }
function addConta(r, tuss){
  var temPrinc = CONTA.itens.some(function(i){ return i.via==="principal"; });
  var exame = capIII(r.c) || r.co>0 || r.fm>0;
  if (!tuss){ var tu=tussDe(r.c); if(tu.length===1) tuss=tu[0]; }
  CONTA.itens.push({id:++CONTA.seq, c:r.c, t:r.t, tuss:tuss||null, rowi:Math.max(0,(DB.tab[r.t].map[r.c]||[]).indexOf(r)), qtd:1,
    via: exame ? "na" : (temPrinc ? "mesma" : "principal"), esc: tipoExame(r), ane:"tab", acr: !capIII(r.c)});
}
function addContaCod(c, tuss){ var a = achar(c, S); if(!a){ var k=DB.codigos[c]; if(!k) return; a={rows:DB.tab[k.tabs[0]].map[c]}; } addConta(a.rows[0], tuss); }
function rowDe(it){ var a = DB.tab[it.t].map[it.c]; return a[Math.min(it.rowi,a.length-1)]; }
function calcConta(){
  var acrF = (CONTA.apto && CONTA.intern ? 2 : 1) * (CONTA.urg ? 1.3 : 1);
  var maxAux = 0; CONTA.itens.forEach(function(it){ if(it.via!=="na") maxAux = Math.max(maxAux, rowDe(it).aux||0); });
  var cont = {}, res = [];
  CONTA.itens.forEach(function(it){
    var r = rowDe(it), v = valores(r), q = Math.max(0, num(it.qtd)), u = DB.tab[r.t].moeda==="CH";
    var g = ESC[it.esc] ? it.esc : "nenhum", k = cont[g] = (cont[g]||0)+1, tab = ESC[g][1], escP = g==="nenhum" ? 1 : tab[Math.min(k-1, tab.length-1)];
    var viaP = VIA[it.via][1], acr = it.acr ? acrF : 1;
    var cir = r2(v.hm*viaP*escP*acr*q), co = r2(v.co*escP*q), fil = r2(v.fil*q);
    var nAux = (CONTA.aux16b && it.via!=="na" && CONTA.itens.length>1) ? maxAux : (r.aux||0);
    var aux = []; for (var i=0;i<nAux;i++) aux.push(r2(cir*(i===0?0.3:0.2)));
    var porte = it.ane==="nao" ? 0 : (r.pa || (it.ane==="sem" ? porteSemPrev(r.t) : 0));
    var pq = DB.tab[r.t].portes[porte]||0, an = r2(pq*v.f.an*viaP*acr*q);
    var ins = (CONTA.instr>0 && (!CONTA.instrP2 || porte>=2)) ? r2(cir*CONTA.instr/100) : 0;
    var auxT = soma(aux), tot = r2(cir+co+fil+auxT+an+ins);
    var txtAcr = (CONTA.apto&&CONTA.intern?" × 2 (apartamento +100%)":"") + (CONTA.urg?" × 1,3 (urgência +30%)":"");
    var L = [];
    L.push(NOME[r.t]+" · "+fcod(r.c)+" "+r.d+(it.tuss?" · TUSS "+it.tuss:"")+(q!==1?" · quantidade "+nf(q):""));
    L.push("Honorário base: "+(u? nf(r.hm)+" CH × "+nf(v.f.hm) : brl(r.hm)+(v.f.hm!==1?" × "+nf(v.f.hm):""))+" = "+brl(v.hm));
    var passos = brl(v.hm);
    if (viaP!==1) passos += " × "+nf(viaP*100,0)+"% ("+VIA[it.via][0].toLowerCase()+")";
    if (escP!==1) passos += " × "+nf(escP*100,0)+"% ("+k+"º exame de "+ESC[g][0].split(" ")[0].toLowerCase()+")";
    if (acr!==1) passos += txtAcr;
    if (q!==1) passos += " × "+nf(q);
    if (passos!==brl(v.hm)) L.push("Honorário final: "+passos+" = "+brl(cir));
    if (r.co) L.push("Custo operacional: "+brl(v.co)+(escP!==1?" × "+nf(escP*100,0)+"%":"")+(q!==1?" × "+nf(q):"")+" = "+brl(co)+" (sem acréscimo de acomodação e horário)");
    if (r.fm) L.push("Filme: "+nf(r.fm)+" m² × "+brl(S.filme)+(q!==1?" × "+nf(q):"")+" = "+brl(fil)+" (sem escalonamento e sem acréscimo)");
    aux.forEach(function(a,i){ L.push((i+1)+"º auxiliar: "+(i===0?"30%":"20%")+" × "+brl(cir)+" = "+brl(a)); });
    if (nAux>(r.aux||0)) L.push("Auxiliares pelo maior número previsto no ato ("+nAux+"), conforme a regra de múltiplos procedimentos.");
    if (porte) L.push("Anestesista: porte "+porte+(r.pa?"":" (sem previsão na tabela)")+" = "+(u? nf(pq)+" CH × "+nf(v.f.an) : brl(pq))+(viaP!==1?" × "+nf(viaP*100,0)+"%":"")+(acr!==1?txtAcr:"")+(q!==1?" × "+nf(q):"")+" = "+brl(an));
    if (ins) L.push("Instrumentador: "+nf(CONTA.instr,2)+"% × "+brl(cir)+" = "+brl(ins));
    L.push("Total do item: "+brl(tot));
    res.push({it:it, r:r, cir:cir, co:co, fil:fil, aux:aux, auxT:auxT, an:an, ins:ins, tot:tot, memo:L.join("\n"), nAux:nAux, porte:porte});
  });
  return res;
}
function urgCriterio(t, dt){
  var d = dt.getDay(), h = dt.getHours()+dt.getMinutes()/60;
  if (t==="AMB90") return d===0 || (d===6 && h>=12) || (d>=1&&d<=5 && (h>=19||h<7)) ? "dentro" : "fora";
  if (t==="AMB92") return d===0 || h>=22 || h<6 ? "dentro" : "fora";
  return null;
}
function telaConta(){
  $("#mg-corpo").innerHTML =
  '<div class="card"><h3>Conta com vários procedimentos</h3><p class="mut">Monte o ato com um ou mais procedimentos (por AMB ou TUSS). A página aplica via de acesso, escalonamento de exames, acréscimos de acomodação e horário, auxiliares, anestesista e instrumentador.</p>'+
  '<div class="grade" style="margin:12px 0">'+
    '<label class="cp">Acomodação<select id="mg-apto"><option value="0"'+(!CONTA.apto?" selected":"")+'>Enfermaria</option><option value="1"'+(CONTA.apto?" selected":"")+'>Apartamento</option></select></label>'+
    '<label class="cp">Regime<select id="mg-intern"><option value="1"'+(CONTA.intern?" selected":"")+'>Internação</option><option value="0"'+(!CONTA.intern?" selected":"")+'>Ambulatorial</option></select></label>'+
    '<label class="cp">Auxiliares com vários procedimentos<select id="mg-a16"><option value="1"'+(CONTA.aux16b?" selected":"")+'>Maior número previsto no ato</option><option value="0"'+(!CONTA.aux16b?" selected":"")+'>O previsto em cada procedimento</option></select></label>'+
    '<label class="cp">Instrumentador (% do cirurgião)<input type="text" inputmode="decimal" id="mg-instr" value="'+nf(CONTA.instr,2)+'"></label>'+
  '</div>'+
  '<div class="linha-bt" style="gap:10px 18px;margin-bottom:12px"><label class="chk"><input type="checkbox" id="mg-urg"'+(CONTA.urg?" checked":"")+'> Horário de urgência (+30% no honorário)</label><label class="chk"><input type="checkbox" id="mg-ip2"'+(CONTA.instrP2?" checked":"")+'> Instrumentador só a partir do porte anestésico 2</label></div>'+
  '<details><summary>Verificar se o horário é de urgência</summary><div class="grade" style="margin-top:10px"><label class="cp">Data do atendimento<input type="date" id="mg-udt"></label><label class="cp">Hora de início<input type="time" id="mg-uhr"></label><label class="chk" style="align-self:end"><input type="checkbox" id="mg-ufer"> Feriado</label></div><div id="mg-ures" class="peq" style="margin-top:8px"></div></details>'+
  '<div class="sep"></div><div id="mg-kbusca"></div><div id="mg-ktuss"></div><div id="mg-kitens" style="margin-top:12px"></div></div>'+
  '<div id="mg-kres"></div>';
  $("#mg-apto").addEventListener("change", function(){ CONTA.apto=this.value==="1"; desenhaConta(); });
  $("#mg-intern").addEventListener("change", function(){ CONTA.intern=this.value==="1"; desenhaConta(); });
  $("#mg-a16").addEventListener("change", function(){ CONTA.aux16b=this.value==="1"; desenhaConta(); });
  $("#mg-instr").addEventListener("change", function(){ CONTA.instr=num(this.value); desenhaConta(); });
  $("#mg-urg").addEventListener("change", function(){ CONTA.urg=this.checked; desenhaConta(); });
  $("#mg-ip2").addEventListener("change", function(){ CONTA.instrP2=this.checked; desenhaConta(); });
  function verUrg(){
    var d=$("#mg-udt").value, h=$("#mg-uhr").value, out=$("#mg-ures"); if(!d||!h){ out.innerHTML=""; return; }
    var dt = new Date(d+"T"+h+":00"), fer=$("#mg-ufer").checked;
    out.innerHTML = ["AMB90","AMB92"].map(function(t){ var c = fer ? "dentro" : urgCriterio(t,dt); return '<span class="pilula '+(c==="dentro"?"ok":"")+'">'+NOME[t]+': '+(c==="dentro"?"horário de urgência":"horário normal")+'</span>'; }).join(" ") +
      '<div class="mut" style="margin-top:6px">AMB 90: segunda a sexta das 19h às 7h, sábado a partir das 12h, domingos e feriados. AMB 92: das 22h às 6h, domingos e feriados. Para AMB 96, 99 e CIEFAS confira as instruções gerais da tabela. Atendimento eletivo agendado nesses horários não gera acréscimo.</div>';
  }
  ["#mg-udt","#mg-uhr","#mg-ufer"].forEach(function(s){ $(s).addEventListener("change", verUrg); });
  widgetBusca($("#mg-kbusca"), function(tipo, c){
    if (tipo==="TUSS"){ var k=DB.tuss[c]; if(k.amb.length===1){ addContaCod(k.amb[0], c); CONTA.escolhaTuss=null; } else CONTA.escolhaTuss=c; }
    else { addContaCod(c); CONTA.escolhaTuss=null; }
    desenhaConta();
  }, DB.depara ? "Adicionar procedimento: código AMB, TUSS ou descrição" : "Adicionar procedimento: código ou descrição");
  desenhaConta();
}
function desenhaConta(){
  var box = $("#mg-kitens"), out = $("#mg-kres"), et = $("#mg-ktuss");
  if (et) {
    if (CONTA.escolhaTuss) {
      var kt = DB.tuss[CONTA.escolhaTuss];
      et.innerHTML = '<div class="aviso inf" style="margin-top:12px"><b>TUSS '+kt.c+'</b> corresponde a '+kt.amb.length+' códigos AMB. Escolha o realizado para incluir na conta. <button class="bt leve min" id="mg-ktfecha" style="margin-left:6px">Cancelar</button></div>'+cardsTuss(kt.c);
      $$(".opcao[data-amb]",et).forEach(function(b){ b.addEventListener("click", function(){ addContaCod(b.getAttribute("data-amb"), CONTA.escolhaTuss); CONTA.escolhaTuss=null; desenhaConta(); }); });
      $("#mg-ktfecha").addEventListener("click", function(){ CONTA.escolhaTuss=null; desenhaConta(); });
    } else et.innerHTML = "";
  }
  if (!CONTA.itens.length){ box.innerHTML = '<div class="vazio">Nenhum procedimento na conta. Busque acima ou use "Adicionar à conta" na aba Calcular procedimento.<br><button class="bt leve min" id="mg-exemplo" style="margin-top:10px">Carregar exemplo do curso</button></div>'; out.innerHTML="";
    $("#mg-exemplo").addEventListener("click", function(){ [["43050190","principal"],["43030025","mesma"]].forEach(function(x){ addContaCod(x[0]); CONTA.itens[CONTA.itens.length-1].via=x[1]; }); desenhaConta(); });
    return; }
  var ops = function(obj, val, lab){ return Object.keys(obj).map(function(k){ return '<option value="'+k+'"'+(k===val?" selected":"")+'>'+esc(lab? lab(k) : obj[k])+'</option>'; }).join(""); };
  var linhas = CONTA.itens.map(function(it,i){ var r=rowDe(it), tabs=DB.codigos[it.c].tabs, tu=tussDe(it.c);
    var det = [qtdTxt(r.hm,r.t)]; if(r.co) det.push("c.op. "+qtdTxt(r.co,r.t)); if(r.aux) det.push(r.aux+" aux."); if(r.pa) det.push("porte "+r.pa);
    return {cls:"", c:[
      '<b>'+fcod(r.c)+'</b>'+(it.tuss?' <span class="pilula tuss">TUSS '+it.tuss+'</span>':(tu.length>1?' <span class="pilula tuss">TUSS '+tu.join(", ")+'</span>':''))+'<div class="peq">'+esc(r.d)+'</div><div class="peq mut">'+det.join(" · ")+'</div>',
      '<select data-id="'+it.id+'" data-k="t">'+tabs.map(function(t){return '<option value="'+t+'"'+(t===it.t?" selected":"")+'>'+NOME[t]+'</option>';}).join("")+'</select>',
      '<input type="text" inputmode="decimal" data-id="'+it.id+'" data-k="qtd" value="'+nf(num(it.qtd))+'" style="width:64px">',
      '<select data-id="'+it.id+'" data-k="via">'+ops(VIA,it.via,function(k){return VIA[k][0]+(k!=="na"?" ("+VIA[k][1]*100+"%)":"");})+'</select>',
      '<select data-id="'+it.id+'" data-k="esc">'+ops(ESC,it.esc,function(k){return ESC[k][0];})+'</select>',
      '<select data-id="'+it.id+'" data-k="ane">'+ops(ANE,it.ane)+'</select>',
      '<label class="chk" title="Apartamento e urgência no honorário"><input type="checkbox" data-id="'+it.id+'" data-k="acr"'+(it.acr?" checked":"")+'> aplicar</label>',
      '<span style="white-space:nowrap"><button class="bt leve min" data-id="'+it.id+'" data-mv="-1"'+(i===0?" disabled":"")+'>↑</button> <button class="bt leve min" data-id="'+it.id+'" data-mv="1"'+(i===CONTA.itens.length-1?" disabled":"")+'>↓</button> <button class="bt leve min" data-id="'+it.id+'" data-del="1">Remover</button></span>'
    ]};
  });
  box.innerHTML = '<div class="linha-bt entre" style="margin-bottom:8px"><h4 style="margin:0">Procedimentos da conta</h4><div class="linha-bt"><button class="bt leve min" id="mg-princ">Definir principal pelo maior honorário</button><button class="bt leve min" id="mg-limpa">Limpar conta</button></div></div>'+
    '<div class="item-conta">'+tabela([{t:"Procedimento",prim:true},{t:"Tabela"},{t:"Qtd."},{t:"Via de acesso"},{t:"Escalonamento de exame"},{t:"Anestesista"},{t:"Acréscimos"},{t:""}], linhas)+'</div>';
  function itemDe(el){ var id=+el.getAttribute("data-id"); return CONTA.itens.filter(function(x){return x.id===id;})[0]; }
  $$("[data-k]",box).forEach(function(inp){ inp.addEventListener("change", function(){ var it=itemDe(inp), k=inp.getAttribute("data-k"); it[k] = inp.type==="checkbox" ? inp.checked : (k==="qtd" ? num(inp.value) : inp.value); if(k==="t") it.rowi=0; desenhaConta(); }); });
  $$("[data-del]",box).forEach(function(b){ b.addEventListener("click", function(){ CONTA.itens.splice(CONTA.itens.indexOf(itemDe(b)),1); desenhaConta(); }); });
  $$("[data-mv]",box).forEach(function(b){ b.addEventListener("click", function(){ var it=itemDe(b), i=CONTA.itens.indexOf(it), j=i+(+b.getAttribute("data-mv")); if(j<0||j>=CONTA.itens.length) return; CONTA.itens.splice(i,1); CONTA.itens.splice(j,0,it); desenhaConta(); }); });
  $("#mg-limpa").addEventListener("click", function(){ CONTA.itens=[]; desenhaConta(); });
  $("#mg-princ").addEventListener("click", function(){
    var cand = CONTA.itens.filter(function(x){ return x.via!=="na" && x.via!=="equipe"; }); if(!cand.length) return;
    var m = cand.reduce(function(a,b){ return valores(rowDe(b)).hm > valores(rowDe(a)).hm ? b : a; });
    cand.forEach(function(x){ if(x===m) x.via="principal"; else if(x.via==="principal") x.via="mesma"; });
    desenhaConta();
  });
  var res = calcConta(), avisos = [];
  var np = CONTA.itens.filter(function(x){return x.via==="principal";}).length, nc = CONTA.itens.filter(function(x){return x.via!=="na"&&x.via!=="equipe";}).length;
  if (nc && np===0) avisos.push('<div class="aviso al">Nenhum procedimento marcado como principal. O principal é o de maior honorário e é a referência da via de acesso.</div>');
  if (np>1) avisos.push('<div class="aviso al">Há '+np+' procedimentos marcados como principal. Só um é o principal do ato; os demais são da mesma via (50%), de via diferente (70%) ou de equipe distinta (100%).</div>');
  var fora = CONTA.itens.filter(function(x){ return cadeia(S).indexOf(x.t)<0; });
  if (fora.length) avisos.push('<div class="aviso al">'+fora.length+' item(ns) calculado(s) por tabela fora da referência da negociação ('+cadeia(S).map(function(t){return NOME[t];}).join(" › ")+').</div>');
  if (CONTA.apto && !CONTA.intern) avisos.push('<div class="aviso inf">Apartamento em regime ambulatorial: sem acréscimo de 100%.</div>');
  var maxN = 0, tot = {cir:0,co:0,fil:0,an:0,ins:0,tot:0,aux:[0,0,0,0]};
  res.forEach(function(x){ tot.cir+=x.cir; tot.co+=x.co; tot.fil+=x.fil; tot.an+=x.an; tot.ins+=x.ins; tot.tot+=x.tot; x.aux.forEach(function(a,i){ tot.aux[i]+=a; }); maxN=Math.max(maxN,x.aux.length); });
  var ks = [kpi("Cirurgião",brl(tot.cir),"honorário após regras")];
  for (var i=0;i<maxN;i++) ks.push(kpi((i+1)+"º auxiliar",brl(tot.aux[i]),(i===0?"30%":"20%")+" do cirurgião"));
  if (tot.an) ks.push(kpi("Anestesista",brl(tot.an),"porte × CH, com via e acréscimos"));
  if (tot.co) ks.push(kpi("Custo operacional",brl(tot.co),"sem acréscimos"));
  if (tot.fil) ks.push(kpi("Filme",brl(tot.fil),"sem escalonamento"));
  if (tot.ins) ks.push(kpi("Instrumentador",brl(tot.ins),nf(CONTA.instr,2)+"% do cirurgião"));
  ks.push('<div class="kpi dest"><div class="r">Total da conta</div><div class="v">'+brl(tot.tot)+'</div><div class="d">'+res.length+' procedimento(s)</div></div>');
  var cols = [{t:"Procedimento",prim:true},{t:"Regras",opc:true},{t:"Cirurgião",n:true}];
  for (i=0;i<4;i++) cols.push({t:(i+1)+"º aux.",n:true,opc:true});
  cols = cols.concat([{t:"Anestesista",n:true,opc:true},{t:"Custo op.",n:true,opc:true},{t:"Filme",n:true,opc:true},{t:"Instrum.",n:true,opc:true},{t:"Total",n:true}]);
  function z(v){ return v ? brl(v) : null; }
  var lin = res.map(function(x){ var it=x.it, tags=[];
    if (it.via!=="na") tags.push(VIA[it.via][0]+" "+VIA[it.via][1]*100+"%");
    if (it.esc!=="nenhum") tags.push(ESC[it.esc][0].split(" ")[0]);
    if (it.acr && CONTA.apto && CONTA.intern) tags.push("apartamento +100%");
    if (it.acr && CONTA.urg) tags.push("urgência +30%");
    if (x.porte) tags.push("porte "+x.porte);
    return {c:['<b>'+fcod(x.r.c)+'</b> <span class="peq mut">'+NOME[x.r.t]+'</span>'+(it.tuss?' <span class="pilula tuss">TUSS '+it.tuss+'</span>':'')+'<div class="peq">'+esc(x.r.d)+'</div>', tags.length?tags.map(function(t){return '<span class="pilula" style="margin:0 4px 4px 0">'+esc(t)+'</span>';}).join(""):null, brl(x.cir), z(x.aux[0]), z(x.aux[1]), z(x.aux[2]), z(x.aux[3]), z(x.an), z(x.co), z(x.fil), z(x.ins), '<b>'+brl(x.tot)+'</b>']};
  });
  lin.push({cls:"tot", c:["Total",null,brl(tot.cir),z(tot.aux[0]),z(tot.aux[1]),z(tot.aux[2]),z(tot.aux[3]),z(tot.an),z(tot.co),z(tot.fil),z(tot.ins),brl(tot.tot)]});
  out.innerHTML = '<div class="card"><div class="linha-bt entre"><h3 style="margin:0">Resultado da conta</h3><div class="linha-bt"><button class="bt cont min" id="mg-kcop">Copiar memória</button><button class="bt cont min" id="mg-kcsv">Baixar CSV</button></div></div>'+avisos.join("")+
    '<div class="kpis">'+ks.join("")+'</div>'+tabela(cols, lin)+
    '<details><summary>Memória de cálculo por procedimento</summary>'+res.map(function(x){ return '<div class="memo">'+esc(x.memo)+'</div>'; }).join("")+'</details></div>';
  var memoTxt = res.map(function(x){return x.memo;}).join("\n\n")+"\n\nTotal da conta: "+brl(tot.tot);
  $("#mg-kcop").addEventListener("click", function(){ copiar(memoTxt, this); });
  $("#mg-kcsv").addEventListener("click", function(){
    var L=[["TUSS","Código AMB","Descrição","Tabela","Quantidade","Via de acesso","Escalonamento","Cirurgião","1º auxiliar","2º auxiliar","3º auxiliar","4º auxiliar","Anestesista","Custo operacional","Filme","Instrumentador","Total"]];
    res.forEach(function(x){ L.push([x.it.tuss||tussDe(x.r.c).join(" | "),fcod(x.r.c),x.r.d,NOME[x.r.t],nf(num(x.it.qtd)),VIA[x.it.via][0],ESC[x.it.esc][0],cn(x.cir),cn(x.aux[0]),cn(x.aux[1]),cn(x.aux[2]),cn(x.aux[3]),cn(x.an),cn(x.co),cn(x.fil),cn(x.ins),cn(x.tot)]); });
    L.push(["Total","","","","","","",cn(tot.cir),cn(tot.aux[0]),cn(tot.aux[1]),cn(tot.aux[2]),cn(tot.aux[3]),cn(tot.an),cn(tot.co),cn(tot.fil),cn(tot.ins),cn(tot.tot)]);
    baixarCSV("conta_amb.csv", L);
  });
}

/* ---------- aba 3: impacto na carteira ---------- */
var IMP = {txt:"", A:null, B:null, completo:false, filtro:"", res:null, entrada:"auto", regra1n:"maior"};
function cenarioDe(cfg){ return {base:cfg.base, subseq:cfg.subseq, ciefas:cfg.ciefas, ch:cfg.ch, filme:cfg.filme, pctR:cfg.pctR}; }
function cfgDe(c){ return {base:c.base, subseq:c.subseq, ciefas:c.ciefas, ch:c.ch, filme:c.filme, pctR:c.pctR, exc:S.exc}; }
function telaImp(){
  if (!IMP.A){ IMP.A = cenarioDe(S); var m=Math.pow(10,S.reajCasas||2); IMP.B = clone(IMP.A); IMP.B.ch=Math.round(IMP.A.ch*(1+S.reajPct/100)*m)/m; IMP.B.pctR = Math.round(((1+IMP.A.pctR/100)*(1+S.reajPct/100)-1)*10000)/100; }
  function cen(id, c){
    var opsT = T.map(function(t){ return '<option value="'+t+'"'+(c.base===t?" selected":"")+'>'+NOME[t]+'</option>'; }).join("");
    return '<div class="card" style="margin:0;background:var(--fundo)"><h4>Cenário '+id+'</h4><div class="grade">'+
    '<label class="cp">Tabela base<select data-c="'+id+'" data-k="base">'+opsT+'</select></label>'+
    '<label class="cp">CH<input type="text" inputmode="decimal" data-c="'+id+'" data-k="ch" value="'+nf(c.ch)+'"></label>'+
    '<label class="cp">Filme R$/m²<input type="text" inputmode="decimal" data-c="'+id+'" data-k="filme" value="'+nf(c.filme,2)+'"></label>'+
    '<label class="cp">Acréscimo tabelas em R$ (%)<input type="text" inputmode="decimal" data-c="'+id+'" data-k="pctR" value="'+nf(c.pctR,2)+'"></label>'+
    '</div><label class="chk" style="margin-top:10px"><input type="checkbox" data-c="'+id+'" data-k="subseq"'+(c.subseq?" checked":"")+'> Usar subsequência</label></div>';
  }
  var dp = !!DB.depara;
  $("#mg-corpo").innerHTML = '<div class="card"><h3>Impacto na carteira</h3><p class="mut">Cole a produção (código e quantidade) e compare dois cenários: reajuste do CH, troca de tabela base (ex.: AMB 92 para AMB 96) ou novo valor de filme. Cada linha usa o valor unitário do procedimento, sem regras de conta.</p>'+
  '<div class="grade2"><div><label class="cp">Código e quantidade por linha (separados por ; ou tabulação)<textarea id="mg-itxt" placeholder="43030025;120&#10;34010017;350">'+esc(IMP.txt)+'</textarea></label>'+
  '<div class="linha-bt" style="margin-top:8px"><label class="bt leve min" style="display:inline-block">Abrir arquivo CSV ou TXT<input type="file" id="mg-iarq" accept=".csv,.txt,text/csv,text/plain" style="display:none"></label><span class="peq mut">Do Excel: copie as duas colunas e cole aqui.</span></div>'+
  (dp?'<div class="grade" style="margin-top:12px"><label class="cp">Os códigos colados são<select id="mg-ient"><option value="auto"'+(IMP.entrada==="auto"?" selected":"")+'>Identificar sozinho (TUSS primeiro)</option><option value="TUSS"'+(IMP.entrada==="TUSS"?" selected":"")+'>TUSS</option><option value="AMB"'+(IMP.entrada==="AMB"?" selected":"")+'>AMB</option></select></label>'+
  '<label class="cp">TUSS com mais de um AMB (1×n)<select id="mg-i1n"><option value="maior"'+(IMP.regra1n==="maior"?" selected":"")+'>Usar o AMB de maior valor</option><option value="menor"'+(IMP.regra1n==="menor"?" selected":"")+'>Usar o AMB de menor valor</option><option value="primeiro"'+(IMP.regra1n==="primeiro"?" selected":"")+'>Usar o primeiro do de-para</option></select></label></div>':'')+
  '</div><div class="grade" style="grid-template-columns:1fr">'+cen("A",IMP.A)+cen("B",IMP.B)+'</div></div>'+
  '<div class="linha-bt" style="margin-top:12px"><label class="chk"><input type="checkbox" id="mg-icomp"'+(IMP.completo?" checked":"")+'> Incluir auxiliares e anestesista previstos na tabela</label><button class="bt" id="mg-icalc">Calcular impacto</button></div></div><div id="mg-ires"></div>';
  $$("[data-c]").forEach(function(i){ i.addEventListener("change", function(){ var c=IMP[i.getAttribute("data-c")], k=i.getAttribute("data-k"); c[k] = i.type==="checkbox" ? i.checked : (k==="base" ? i.value : num(i.value)); }); });
  $("#mg-itxt").addEventListener("input", function(){ IMP.txt=this.value; });
  $("#mg-icomp").addEventListener("change", function(){ IMP.completo=this.checked; });
  if ($("#mg-ient")) { $("#mg-ient").addEventListener("change", function(){ IMP.entrada=this.value; }); $("#mg-i1n").addEventListener("change", function(){ IMP.regra1n=this.value; }); }
  $("#mg-iarq").addEventListener("change", function(){ var f=this.files[0]; if(!f) return; var rd=new FileReader(); rd.onload=function(){ IMP.txt=String(rd.result); $("#mg-itxt").value=IMP.txt; calcImp(); }; rd.readAsText(f,"utf-8"); });
  $("#mg-icalc").addEventListener("click", calcImp);
  if (IMP.res) desenhaImp();
}
function calcImp(){
  var agg = {}, ign = 0, ordem = [];
  IMP.txt.split(/\r?\n/).forEach(function(l){
    l = l.trim(); if(!l) return;
    var p = l.split(/[;\t]/); if (p.length<2) p = l.split(/[\s,]+/);
    p = p.map(function(x){return x.trim();}).filter(function(x){return x!=="";});
    var c = limpaCod(p[0]); if(!c){ ign++; return; }
    if (!(c in agg)) ordem.push(c);
    agg[c] = (agg[c]||0) + (p.length>1 ? num(p[1]) : 1);
  });
  var cA = cfgDe(IMP.A), cB = cfgDe(IMP.B), lin = [], semCorr = [], tA=0, tB=0, qT=0, esp={}, n1n=0;
  function comp(r, cfg){ var v = valores(r, cfg); return {v:v, u: IMP.completo ? v.geral : v.total}; }
  ordem.forEach(function(c){
    var q = agg[c], tuss = null, cands;
    var ehTuss = !!DB.depara && (IMP.entrada==="TUSS" || (IMP.entrada==="auto" && !!DB.tuss[c]));
    if (ehTuss) { tuss = c; cands = DB.tuss[c] ? DB.tuss[c].amb : []; }
    else cands = [c];
    var opA = [], opB = [];
    cands.forEach(function(a){ var x=achar(a,cA), y=achar(a,cB); if(x) opA.push({a:a,r:x.rows[0],t:x.t,k:comp(x.rows[0],cA)}); if(y) opB.push({a:a,r:y.rows[0],t:y.t,k:comp(y.rows[0],cB)}); });
    if (!opA.length && !opB.length){ semCorr.push([c,q,ehTuss]); return; }
    function pega(op){ if(!op.length) return null; if(IMP.regra1n==="primeiro"||op.length===1) return op[0]; return op.reduce(function(a,b){ return (IMP.regra1n==="maior" ? b.k.u>a.k.u : b.k.u<a.k.u) ? b : a; }); }
    var a = pega(opA), b = pega(opB);
    if (cands.length>1) n1n++;
    var amb = (a||b).a, va = a?r2(a.k.u*q):0, vb = b?r2(b.k.u*q):0;
    if (!tuss) { var tu = tussDe(amb); tuss = tu.length ? tu.join(" | ") : ""; }
    tA+=va; tB+=vb; qT+=q;
    var e = amb.slice(0,2);
    (esp[e] = esp[e] || {e:e, a:0, b:0, q:0}); esp[e].a+=va; esp[e].b+=vb; esp[e].q+=q;
    lin.push({tuss:tuss, n:cands.length, c:amb, d:(DB.codigos[amb]||{}).d||"", q:q, A:a, B:b, va:va, vb:vb});
  });
  lin.sort(function(x,y){ return Math.abs(y.vb-y.va)-Math.abs(x.vb-x.va); });
  IMP.res = {lin:lin, nf:semCorr, ign:ign, tA:r2(tA), tB:r2(tB), qT:qT, n1n:n1n, esp:Object.keys(esp).map(function(k){return esp[k];}).sort(function(x,y){return y.a-x.a;})};
  desenhaImp();
}
function desenhaImp(){
  var R = IMP.res, el = $("#mg-ires"); if(!el) return;
  if (!R.lin.length && !R.nf.length){ el.innerHTML = '<div class="card"><div class="vazio">Informe ao menos uma linha com código e quantidade.</div></div>'; return; }
  var dif = R.tB-R.tA, dp = R.tA ? dif/R.tA : 0;
  var h = '<div class="card"><div class="linha-bt entre"><h3 style="margin:0">Resultado</h3><button class="bt cont min" id="mg-icsv">Baixar CSV</button></div>'+
  '<div class="kpis">'+kpi("Cenário A",brl(R.tA),NOME[IMP.A.base]+(IMP.A.subseq?" com subsequência":""))+kpi("Cenário B",brl(R.tB),NOME[IMP.B.base]+(IMP.B.subseq?" com subsequência":""))+
  '<div class="kpi dest"><div class="r">Diferença B − A</div><div class="v">'+brl(dif)+'</div><div class="d">'+pc(dp)+'</div></div>'+
  kpi("Códigos calculados",R.lin.length.toLocaleString("pt-BR"),nf(R.qT,2)+" na quantidade total")+'</div>';
  if (R.n1n) h += '<div class="aviso inf">'+R.n1n+' código(s) TUSS com mais de um AMB no de-para: usado o '+({maior:"de maior valor",menor:"de menor valor",primeiro:"primeiro do de-para"})[IMP.regra1n]+'. Na conta, escolha o AMB realizado.</div>';
  if (R.nf.length) h += '<div class="aviso al">'+R.nf.length+' código(s) sem correspondência nas tabelas dos dois cenários'+(DB.depara?" ou no de-para":"")+': '+R.nf.slice(0,15).map(function(x){return x[0];}).join(", ")+(R.nf.length>15?"…":"")+'</div>';
  if (R.ign) h += '<div class="aviso inf">'+R.ign+' linha(s) ignorada(s) por não começarem com um código válido (cabeçalho, por exemplo).</div>';
  var semA = R.lin.filter(function(x){return !x.A;}).length, semB = R.lin.filter(function(x){return !x.B;}).length;
  if (semA||semB) h += '<div class="aviso al">'+(semA? semA+' código(s) só existem no cenário B. ':'')+(semB? semB+' código(s) só existem no cenário A. ':'')+'Esses itens entram com zero no cenário em que não existem.</div>';
  h += '<h4 style="margin-top:12px">Por especialidade (2 primeiros dígitos do código AMB)</h4>'+tabela([{t:"Especialidade",prim:true},{t:"Quantidade",n:true},{t:"Cenário A",n:true},{t:"Cenário B",n:true},{t:"Diferença",n:true},{t:"%",n:true}],
    R.esp.map(function(e){ var d=e.b-e.a; return {c:[e.e, nf(e.q,2), brl(e.a), brl(e.b), '<span class="'+(d>0?"pos":d<0?"neg":"")+'">'+brl(d)+'</span>', e.a?pc(d/e.a):null]}; }));
  h += '<div class="linha-bt entre" style="margin-top:16px"><h4 style="margin:0">Procedimentos (maiores diferenças primeiro)</h4><input type="text" id="mg-ifil" placeholder="Filtrar por código ou descrição" style="max-width:320px" value="'+esc(IMP.filtro)+'"></div><div id="mg-ilist" style="margin-top:8px"></div></div>';
  el.innerHTML = h;
  function lista(){
    var f = norm(IMP.filtro), dig = IMP.filtro.replace(/\D/g,"");
    var L = R.lin.filter(function(x){ return !f || norm(x.d).indexOf(f)>=0 || (dig && (x.c.indexOf(dig)>=0 || String(x.tuss).indexOf(dig)>=0)); });
    $("#mg-ilist").innerHTML = tabela([{t:"TUSS",opc:true},{t:"AMB",prim:true},{t:"Descrição"},{t:"Qtd.",n:true},{t:"Tabela A › B"},{t:"Unitário A",n:true},{t:"Unitário B",n:true},{t:"Total A",n:true},{t:"Total B",n:true},{t:"Diferença",n:true}],
      L.slice(0,300).map(function(x){ var d=x.vb-x.va; return {c:[x.tuss?esc(x.tuss)+(x.n>1?' <span class="pilula al">1×'+x.n+'</span>':''):null, '<b>'+fcod(x.c)+'</b>', esc(x.d), nf(x.q,2), (x.A?NOME[x.A.t]:"–")+' › '+(x.B?NOME[x.B.t]:"–"), x.A?brl(x.A.k.u):null, x.B?brl(x.B.k.u):null, brl(x.va), brl(x.vb), '<span class="'+(d>0?"pos":d<0?"neg":"")+'">'+brl(d)+'</span>']}; }))+
      (L.length>300?'<p class="mut peq" style="margin-top:6px">Mostrando 300 de '+L.length.toLocaleString("pt-BR")+'. O CSV traz todos.</p>':"");
  }
  $("#mg-ifil").addEventListener("input", function(){ IMP.filtro=this.value; lista(); });
  $("#mg-icsv").addEventListener("click", function(){
    var cab=["TUSS","Código AMB","Descrição","Quantidade"];
    ["A","B"].forEach(function(s){ cab=cab.concat(["Tabela "+s,"Honorário "+s,"Custo op. "+s,"Filme "+s,"1º auxiliar "+s,"2º auxiliar "+s,"3º auxiliar "+s,"4º auxiliar "+s,"Anestesista "+s,"Unitário "+s,"Total "+s]); });
    cab.push("Diferença");
    var L=[cab];
    R.lin.forEach(function(x){ var l=[x.tuss,fcod(x.c),x.d,cn(x.q)];
      [["A",x.A,x.va],["B",x.B,x.vb]].forEach(function(o){ var op=o[1]; if(!op){ l=l.concat(["","","","","","","","","","",""]); return; } var v=op.k.v, inc=IMP.completo; l=l.concat([NOME[op.t],cn(v.hm),cn(v.co),cn(v.fil),inc?cn(v.aux[0]):"",inc?cn(v.aux[1]):"",inc?cn(v.aux[2]):"",inc?cn(v.aux[3]):"",inc?cn(v.an):"",cn(op.k.u),cn(o[2])]); });
      l.push(cn(x.vb-x.va)); L.push(l); });
    R.nf.forEach(function(x){ L.push([x[2]?x[0]:"",x[2]?"":x[0],"sem correspondência",cn(x[1])]); });
    baixarCSV("impacto_amb.csv", L);
  });
  lista();
}

/* ---------- aba 4: de-para TUSS × AMB ---------- */
var DP = {q:""};
function telaDepara(){
  var c = $("#mg-corpo");
  if (!DB.depara){ c.innerHTML = '<div class="card"><h3>De-para TUSS × AMB</h3><div class="aviso al">O de-para ainda não foi carregado na base. Assim que for publicado, a pesquisa por TUSS fica disponível aqui e nas outras abas.</div></div>'; return; }
  var n1n = DB.tussLista.filter(function(k){return k.amb.length>1;}).length, namb = Object.keys(DB.ambTuss).length;
  c.innerHTML = '<div class="card"><h3>De-para TUSS × AMB</h3><p class="mut">Pesquise pelo código TUSS ou AMB, ou por parte da descrição. Base: '+DB.depara.pares.length.toLocaleString("pt-BR")+' pares, '+DB.tussLista.length.toLocaleString("pt-BR")+' códigos TUSS ('+n1n.toLocaleString("pt-BR")+' com mais de um AMB) e '+namb.toLocaleString("pt-BR")+' códigos AMB.</p>'+
    '<div class="linha-bt"><input type="text" id="mg-dq" placeholder="Código TUSS, código AMB ou descrição" value="'+esc(DP.q)+'" style="flex:1 1 280px;width:auto"><button class="bt cont" id="mg-dcsv">Baixar de-para completo (CSV)</button></div><div id="mg-dres" style="margin-top:12px"></div></div>';
  var tm;
  $("#mg-dq").addEventListener("input", function(){ DP.q=this.value; clearTimeout(tm); tm=setTimeout(resDepara,150); });
  $("#mg-dcsv").addEventListener("click", function(){
    var L=[["TUSS","Descrição TUSS","Código AMB","Descrição AMB","Tabelas AMB","Relação"]];
    DB.depara.pares.forEach(function(p){ var k=DB.codigos[p[0]], kt=DB.tuss[p[1]]; L.push([p[1],p[2]||"",fcod(p[0]),k?k.d:"não encontrado nas tabelas",k?k.tabs.map(function(t){return NOME[t];}).join(", "):"",(kt.amb.length>1?"1×"+kt.amb.length:"1×1")+(tussDe(p[0]).length>1?" (AMB com "+tussDe(p[0]).length+" TUSS)":"")]); });
    baixarCSV("depara_tuss_amb.csv", L);
  });
  resDepara();
}
function resDepara(){
  var el = $("#mg-dres"), q = DP.q.trim();
  if (!q){ el.innerHTML = '<div class="vazio">Digite um código ou descrição para ver a correlação.</div>'; return; }
  var achados = buscar(q, 40, null), pares = [], visto = {};
  achados.forEach(function(k){
    var lista = k.tipo==="TUSS" ? k.amb.map(function(a){ return [a,k.c]; }) : tussDe(k.c).map(function(t){ return [k.c,t]; });
    if (k.tipo==="AMB" && !lista.length) lista = [[k.c,null]];
    lista.forEach(function(p){ var key=p[0]+"|"+p[1]; if(!visto[key]){ visto[key]=1; pares.push(p); } });
  });
  if (!pares.length){ el.innerHTML = '<div class="vazio">Nenhuma correlação encontrada.</div>'; return; }
  el.innerHTML = tabela([{t:"TUSS",prim:true},{t:"Descrição TUSS",opc:true},{t:"AMB"},{t:"Descrição AMB"},{t:"Tabelas"},{t:"Relação",opc:true},{t:"",opc:true}],
    pares.slice(0,200).map(function(p){ var k=DB.codigos[p[0]], kt=p[1]?DB.tuss[p[1]]:null;
      return {c:[p[1]?'<b>'+p[1]+'</b>':'<span class="pilula al">sem TUSS</span>', kt&&kt.d?esc(kt.d):null, '<b>'+fcod(p[0])+'</b>', k?esc(k.d):'<span class="mut">não está nas tabelas AMB</span>', k?k.tabs.map(function(t){return NOME[t];}).join(", "):null, kt?(kt.amb.length>1?'<span class="pilula al">1×'+kt.amb.length+'</span>':'1×1'):null, (k && CFG.modo!=="depara")?'<button class="bt leve min" data-calc="'+p[0]+'" data-t="'+(p[1]||"")+'">Calcular</button>':null]}; }))+
    (pares.length>200?'<p class="mut peq">Mostrando 200 de '+pares.length+'. Refine a pesquisa.</p>':'');
  $$("[data-calc]",el).forEach(function(b){ b.addEventListener("click", function(){ CALC={c:b.getAttribute("data-calc"), t:null, v:0, tuss:b.getAttribute("data-t")||null}; ABA="calc"; trocaAba(); }); });
}

/* ---------- aba 5: como calcula ---------- */
function telaComo(){
  var g = DB.meta && DB.meta.gerado_em ? DB.meta.gerado_em.split("-").reverse().join("/") : "";
  $("#mg-corpo").innerHTML = '<div class="card"><h3>Como a página calcula</h3><div class="grade2"><div class="regras">'+
  '<h4>Valor de um procedimento</h4><ul>'+
  '<li><b>Honorário</b>: AMB 90 e 92 em quantidade de CH × moeda de conversão (CH) da negociação. AMB 96, 99 e CIEFAS já em reais, com acréscimo opcional.</li>'+
  '<li><b>Custo operacional</b>: quantidade de CH × CH da negociação.</li>'+
  '<li><b>Filme radiológico</b>: m² da tabela × valor do m² negociado.</li>'+
  '<li><b>Auxiliares</b>: 1º auxiliar 30% e os demais 20% do valor final do cirurgião, sem descontar do cirurgião.</li>'+
  '<li><b>Anestesista</b>: porte anestésico convertido pela tabela de portes (AMB 90/92 em CH; 96, 99 e CIEFAS em R$).</li>'+
  '<li><b>Subsequência</b>: o código é procurado na tabela base e, se não existir, nas seguintes (90 › 92 › 96 › 99).</li>'+
  '<li><b>TUSS</b>: a transmissão é em TUSS; o de-para liga cada TUSS aos códigos AMB. Quando há mais de um AMB (1×n), a página mostra as opções com os parâmetros para escolher.</li></ul></div>'+
  '<div class="regras"><h4>Regras da conta (instruções gerais)</h4><ul>'+
  '<li><b>Principal</b>: o procedimento de maior honorário vale 100%.</li>'+
  '<li><b>Via de acesso</b>: mesma via do principal 50%; via diferente 70%; equipes distintas 100%. Vale também para o anestesista.</li>'+
  '<li><b>Apartamento</b>: +100% no honorário com plano apartamento e paciente internado. Não vale em regime ambulatorial nem para procedimentos diagnósticos e terapêuticos (especialidades 15 a 38), exceto endoscopia intervencionista (23.02).</li>'+
  '<li><b>Urgência</b>: +30% no honorário. Os acréscimos se acumulam (× 2 × 1,3). Filme e custo operacional não têm acréscimo.</li>'+
  '<li><b>Exames de imagem</b>: tomografia 100%, 70% e 50% a partir do 3º; ressonância 100% e 80% nos demais, no honorário + custo operacional; o filme entra 100%.</li>'+
  '<li><b>Anestesista sem previsão</b>: porte 1 pela AMB 90 e porte 3 pela AMB 92.</li>'+
  '<li><b>Instrumentador</b>: não previsto na tabela; percentual do contrato.</li></ul></div></div>'+
  '<div class="aviso al">As regras seguem as instruções gerais da AMB 92 apresentadas no curso. Cada tabela tem instruções e observações próprias que prevalecem sobre a regra geral. Confira sempre a tabela base do contrato.</div>'+
  '<p class="mut peq">Base: '+T.map(function(t){return NOME[t]+" ("+(DB.tab[t]?DB.tab[t].n.toLocaleString("pt-BR"):0)+")";}).join(", ")+(g?" · atualizada em "+g:"")+(DB.depara?" · de-para: "+DB.depara.pares.length.toLocaleString("pt-BR")+" pares":"")+'.</p></div>';
}

/* ---------- início ---------- */
carregar().then(telaBase).catch(function(e){
  root.innerHTML = '<div class="card"><div class="aviso er">Não foi possível carregar as tabelas AMB ('+esc(e.message)+'). Atualize a página; se continuar, avise o suporte Magister.</div></div>';
});
})();
