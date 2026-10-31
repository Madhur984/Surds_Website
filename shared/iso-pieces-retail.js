/* ===== RETAIL PIECES =====
   Detailed, "cartoonish-but-real" storefront fixtures with genuinely stocked product.
   Every piece key, name, height, rotation count and the loadDefault() layout below are
   UNCHANGED, so the movement-intelligence dwell tracker and the highest-visited /
   suggested-move flags keep pointing at exactly the same fixtures. Motion is
   Date.now()-driven (recomputed each gen call) because render() rebuilds the whole scene
   SVG every tick — SMIL would just reset. */

/* --- small product props, drawn standing on a fixture face at screen point (x,y) --- */
function fxItem(x,y,kind,c){
  x=+(+x).toFixed(1);y=+(+y).toFixed(1);
  if(kind===0){ /* bottle */
    return '<rect x="'+(x-1)+'" y="'+(y-13)+'" width="2" height="4" rx="1" fill="#cfe0e6"/>'+
      '<rect x="'+(x-2.6)+'" y="'+(y-10)+'" width="5.2" height="10.5" rx="2.2" fill="'+c+'"/>'+
      '<rect x="'+(x-1.8)+'" y="'+(y-8.6)+'" width="1.3" height="7" fill="#ffffff" opacity="0.32"/>'+
      '<rect x="'+(x-2.6)+'" y="'+(y-3)+'" width="5.2" height="2.6" fill="#ffffff" opacity="0.85"/>';
  }
  if(kind===1){ /* can */
    return '<rect x="'+(x-2.8)+'" y="'+(y-10)+'" width="5.6" height="10.5" rx="1.4" fill="'+c+'"/>'+
      '<rect x="'+(x-2.8)+'" y="'+(y-10)+'" width="5.6" height="2.4" rx="1.3" fill="#ffffff" opacity="0.3"/>'+
      '<rect x="'+(x-2.1)+'" y="'+(y-8)+'" width="1.2" height="8" fill="#ffffff" opacity="0.24"/>';
  }
  /* box */
  return '<rect x="'+(x-3.2)+'" y="'+(y-11)+'" width="6.4" height="11" rx="0.8" fill="'+c+'"/>'+
    '<rect x="'+(x-3.2)+'" y="'+(y-6.4)+'" width="6.4" height="2" fill="#ffffff" opacity="0.82"/>'+
    '<rect x="'+(x-3.2)+'" y="'+(y-11)+'" width="6.4" height="2.4" fill="#ffffff" opacity="0.16"/>';
}
/* a row of stocked product across a face `fc`, sitting on deck-height `u` */
function fxRow(fc,u,n,seed){
  var pal=['#e0473a','#f0a83a','#3f7fd0','#3fae5a','#e0b430','#c94f8a','#4ab0b0','#7a58c8'],o='';
  o+=poly([bil(fc,.06,u),bil(fc,.94,u),bil(fc,.94,u+.02),bil(fc,.06,u+.02)],'#d8c8a4','opacity="0.9"'); /* shelf deck */
  for(var i=0;i<n;i++){var p=bil(fc,.13+i*(.74/(n-1)),u+.02);o+=fxItem(p[0],p[1],(i+seed)%3,pal[(i*2+seed)%pal.length]);}
  return o;
}

var PIECES={

/* ---- FRIDGE: glass-door beverage cooler, lit interior stacked with bottles/cans ---- */
fridge:{name:'Fridge',h:3,rots:4,gen:function(a,b,rot,text,visited){
  var glow=0.5+0.5*Math.sin(Date.now()/700+a+b);
  var door=function(f){
    var g=[bil(f,.08,.06),bil(f,.92,.06),bil(f,.92,.96),bil(f,.08,.96)];
    var o=poly(g,'#0e2833');                                  /* cold dark interior */
    o+=fxRow(f,.26,5,a)+fxRow(f,.45,5,a+1)+fxRow(f,.64,5,a+2)+fxRow(f,.83,5,a+3); /* four stocked shelves */
    /* interior LED strip glowing along the top */
    o+=poly([bil(f,.1,.07),bil(f,.9,.07),bil(f,.9,.12),bil(f,.1,.12)],'#d6faff','opacity="'+(visited?0.9:0.6)+'"');
    /* dark kick plate at the base */
    o+=poly([bil(f,.08,.94),bil(f,.92,.94),bil(f,.92,.99),bil(f,.08,.99)],'#5a646e');
    /* glass overlay: sheen + centre mullion + travelling frost */
    o+=poly(g,'#cfeaf5','opacity="0.12" stroke="#93bccf" stroke-width="1"');
    o+=ln(bil(f,.5,.08),bil(f,.5,.94),'#9fc4d4',1.2,'opacity="0.5"');
    o+=ln(bil(f,.2,.08),bil(f,.44,.94),'#ffffff',2.6,'opacity="0.16"');
    o+=ln(bil(f,.36+0.2*glow,.1),bil(f,.36+0.2*glow,.9),'#e6f9ff',1.3,'opacity="'+(0.1+0.16*glow).toFixed(2)+'"');
    /* two door handles */
    o+=ln(bil(f,.44,.16),bil(f,.44,.84),'#00d4ff',2.2,'opacity="'+(visited?0.95:0.6)+'" stroke-linecap="round"');
    o+=ln(bil(f,.56,.16),bil(f,.56,.84),'#00d4ff',2.2,'opacity="'+(visited?0.95:0.6)+'" stroke-linecap="round"');
    return o;
  };
  var closed=function(f){return ln(bil(f,.5,.05),bil(f,.5,.95),'#8f9aa4',1,'opacity="0.5"')+ln(bil(f,.72,.18),bil(f,.72,.82),'#5f6a74',2.4,'opacity="0.85" stroke-linecap="round"');};
  var s=box4(a,b,3,{front:'#c4ccd4',side:'#aeb8c2',top:'#d2dae2',stroke:'#9aa4ae'},rot,door,closed);
  /* branded canopy strip + refrigeration vent on the top */
  var f=boxFaces(a,b,3),cn=['#e0473a','#3f7fd0','#3fae5a','#e0a83a'][(a+b)%4];
  var can=[bil(f.top,.05,.05),bil(f.top,.95,.05),bil(f.top,.95,.24),bil(f.top,.05,.24)];
  s+=poly(can,cn,'opacity="0.9"');
  var tv=[bil(f.top,.24,.34),bil(f.top,.76,.34),bil(f.top,.76,.56),bil(f.top,.24,.56)];
  s+=poly(tv,'#9aa4ae','stroke="#8a94a0" stroke-width="0.4"');
  for(var vi=0;vi<3;vi++){var y=.38+vi*.06;s+=ln(bil(f.top,.28,y),bil(f.top,.72,y),'#6f7a86',1,'opacity="0.55"');}
  if(visited){var tc=bil(f.top,.5,.7),t=Date.now()/1000,pulse=.6+.4*Math.sin(t*2.6);s+='<ellipse cx="'+tc[0].toFixed(1)+'" cy="'+tc[1].toFixed(1)+'" rx="19" ry="12" fill="#8fe8ff" opacity="'+(0.14+0.18*pulse).toFixed(2)+'"/>';}
  return s;
}},

/* ---- SHELF: gondola, header sign + 3 stocked shelves + price rail ---- */
shelf:{name:'Shelf',h:2.2,rots:4,gen:function(a,b,rot){
  var open=function(fc){
    var g=[bil(fc,.05,.03),bil(fc,.95,.03),bil(fc,.95,.99),bil(fc,.05,.99)];
    var o=poly(g,'#4a3624');                                  /* pegboard back */
    for(var pr=0;pr<6;pr++){o+=ln(bil(fc,.1+pr*.16,.2),bil(fc,.1+pr*.16,.86),'#3a2a1a',0.6,'opacity="0.4"');} /* peg columns */
    o+=fxRow(fc,.28,6,a+1)+fxRow(fc,.53,6,a+3)+fxRow(fc,.78,6,a+5); /* stocked shelves */
    /* header sign band */
    var hd=['#0e3a5e','#7a1f18','#155a35'][(a+b)%3];
    o+=poly([bil(fc,.05,.05),bil(fc,.95,.05),bil(fc,.95,.17),bil(fc,.05,.17)],hd,'opacity="0.95"');
    o+=ln(bil(fc,.12,.11),bil(fc,.5,.11),'#bfe4ff',2,'opacity="0.5"');
    /* red price rail */
    o+=poly([bil(fc,.05,.9),bil(fc,.95,.9),bil(fc,.95,.99),bil(fc,.05,.99)],'#d24b4b','opacity="0.92"');
    return o;
  };
  return box4(a,b,2.2,{front:'#c8944a',side:'#ac7634',top:'#d6a252',stroke:'#b4823a'},rot,open,null);
}},

/* ---- PRODUCE: green display table mounded with fruit + a price stake ---- */
produce:{name:'Produce',h:.55,gen:function(a,b){
  var f=boxFaces(a,b,.55);
  var s=poly(f.right,'#3f8a3a','stroke="#2f6a2a" stroke-width="0.5"')+poly(f.left,'#2f6a2a','stroke="#1f4a1a" stroke-width="0.5"')+poly(f.top,'#8a6a44','stroke="#6a4a24" stroke-width="0.5"');
  /* slatted wooden crate */
  for(var sl=0;sl<3;sl++){s+=ln(bil(f.top,.06,.16+sl*.28),bil(f.top,.94,.16+sl*.28),'#6a4a24',1,'opacity="0.5"');}
  s+=poly([bil(f.top,.05,.05),bil(f.top,.95,.05),bil(f.top,.95,.14),bil(f.top,.05,.14)],'#a07a4a','opacity="0.85"');
  /* mounded fruit with highlights + a couple of leaves */
  var bl=['#c82020','#e05010','#f0a018','#48c048','#7048c0','#e07890','#e8d020'];
  for(var i=0;i<8;i++){var p=bil(f.top,.18+(i%4)*.21,.3+Math.floor(i/4)*.28),r=3.6+((i*5)%3),col=bl[(i+a)%bl.length];
    s+='<circle cx="'+p[0].toFixed(1)+'" cy="'+(p[1]-2).toFixed(1)+'" r="'+r.toFixed(1)+'" fill="'+col+'" opacity="0.97"/>';
    s+='<circle cx="'+(p[0]-1.1).toFixed(1)+'" cy="'+(p[1]-3.2).toFixed(1)+'" r="1.1" fill="#ffffff" opacity="0.45"/>';
    if(i%4===0)s+='<path d="M'+p[0].toFixed(1)+' '+(p[1]-5).toFixed(1)+' q3 -2 1 -4" stroke="#3aa03a" stroke-width="1.4" fill="none" opacity="0.8"/>';}
  return s;
}},

/* ---- CHECKOUT: full lane — moving belt, groceries, terminal, lane light ---- */
counter:{name:'Checkout',h:1.15,gen:function(a,b,rot,text,visited){
  var f=boxFaces(a,b,1.15),T=Date.now();
  var s=poly(f.left,'#3a9990','stroke="#2a8980" stroke-width="0.5"')+poly(f.right,'#4aada3','stroke="#3a9d93" stroke-width="0.5"')+poly(f.top,'#5bbfb5','stroke="#4bafa5" stroke-width="0.5"');
  /* conveyor belt with slats scrolling toward the till */
  var belt=[bil(f.top,.12,.16),bil(f.top,.82,.16),bil(f.top,.82,.58),bil(f.top,.12,.58)];
  s+=poly(belt,'#243f3a','opacity="0.96"');
  var flow=(T/520)%1;
  for(var bi=0;bi<5;bi++){var t=((bi/5)+flow)%1;s+=ln(bil(belt,t,.06),bil(belt,t,.94),'#3f6b63',2,'opacity="0.65"');}
  /* a few groceries riding the belt */
  var gc=['#e0473a','#f0a83a','#3f7fd0'];
  for(var gi=0;gi<3;gi++){var gp=bil(belt,(0.2+gi*0.28+flow*0.5)%1,.5);s+=fxItem(gp[0],gp[1]-2,gi%3,gc[gi]);}
  /* divider bar at the belt entrance */
  var dv=bil(f.top,.8,.36);s+='<rect x="'+(dv[0]-1).toFixed(1)+'" y="'+(dv[1]-7).toFixed(1)+'" width="9" height="2.4" rx="1" fill="#111" opacity="0.7"/>';
  /* till terminal (screen lights green when this lane is the busy one) */
  var bs=bil(f.top,.14,.82);
  s+=poly([[bs[0]-1,bs[1]-3],[bs[0]+11,bs[1]+2.5],[bs[0]+11,bs[1]-11.5],[bs[0]-1,bs[1]-17]],'#1a2a3a');
  s+=poly([[bs[0]+.8,bs[1]-4.8],[bs[0]+9.4,bs[1]-.6],[bs[0]+9.4,bs[1]-10],[bs[0]+.8,bs[1]-14.2]],visited?'#7fe0b0':'#2f62c8');
  /* card reader */
  s+='<rect x="'+(bs[0]+12).toFixed(1)+'" y="'+(bs[1]-6).toFixed(1)+'" width="5" height="7" rx="1" fill="#0e1a26" stroke="#2f62c8" stroke-width=".5" opacity="0.9"/>';
  /* lane light pole (green open / amber attention) */
  var lp=bil(f.top,.9,.82);
  s+='<line x1="'+lp[0].toFixed(1)+'" y1="'+lp[1].toFixed(1)+'" x2="'+lp[0].toFixed(1)+'" y2="'+(lp[1]-22).toFixed(1)+'" stroke="#888" stroke-width="1.4" opacity="0.7"/>';
  s+='<circle cx="'+lp[0].toFixed(1)+'" cy="'+(lp[1]-24).toFixed(1)+'" r="3" fill="'+(visited?'#22c55e':'#f0a83a')+'" opacity="'+(0.6+0.4*Math.abs(Math.sin(T/500))).toFixed(2)+'"/>';
  if(visited){var pulse=.6+.4*Math.sin(T/1000*3);
    s+='<circle cx="'+(bs[0]+4.5).toFixed(1)+'" cy="'+(bs[1]-8).toFixed(1)+'" r="11" fill="#7cfc9a" opacity="'+(0.18+0.22*pulse).toFixed(2)+'"/>';
    /* terminal screen flashes bright — the register "computer" lighting up as they check out */
    s+=poly([[bs[0]+.8,bs[1]-4.8],[bs[0]+9.4,bs[1]-.6],[bs[0]+9.4,bs[1]-10],[bs[0]+.8,bs[1]-14.2]],'#c9ffe0','opacity="'+(0.55+0.35*pulse).toFixed(2)+'"');}
  return s;
}},

/* ---- DELI: refrigerated service case, tilted glass, trays of goods + scale ---- */
deli:{name:'Deli',h:1.4,rots:4,gen:function(a,b,rot){
  var gl=function(fc){
    var g=[bil(fc,.08,.24),bil(fc,.92,.24),bil(fc,.92,.9),bil(fc,.08,.9)];
    var o=poly(g,'#122735');                                  /* dark case interior */
    /* two rows of deli trays (rounded blobs of product) */
    var tc=['#e05a5a','#e8c14a','#d98f5a','#b6d06a','#c86a9a'];
    for(var r=0;r<2;r++)for(var i=0;i<4;i++){var p=bil(fc,.16+i*.22,.4+r*.28);o+='<ellipse cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" rx="6" ry="3" fill="#dfe6ea" opacity="0.8"/>';o+='<ellipse cx="'+p[0].toFixed(1)+'" cy="'+(p[1]-0.6).toFixed(1)+'" rx="4.4" ry="2" fill="'+tc[(i+r+a)%tc.length]+'"/>';}
    /* slanted glass sheen + frame */
    o+=poly(g,'#d6e8f0','opacity="0.34" stroke="#a9c6d4" stroke-width="0.8"');
    o+=ln(bil(fc,.12,.28),bil(fc,.42,.86),'#ffffff',2,'opacity="0.2"');
    /* price ticket rail */
    o+=poly([bil(fc,.08,.9),bil(fc,.92,.9),bil(fc,.92,.98),bil(fc,.08,.98)],'#ffffff','opacity="0.85"');
    return o;
  };
  var s=box4(a,b,1.4,{front:'#d08a3a',side:'#ac6a28',top:'#e0a24a',stroke:'#bc7d2e'},rot,gl,null);
  /* a small scale on the counter top */
  var f=boxFaces(a,b,1.4),sp=bil(f.top,.78,.3);
  s+='<rect x="'+(sp[0]-4).toFixed(1)+'" y="'+(sp[1]-5).toFixed(1)+'" width="8" height="4" rx="1" fill="#e8e8e8" stroke="#bbb" stroke-width=".5"/>';
  s+='<rect x="'+(sp[0]-2.5).toFixed(1)+'" y="'+(sp[1]-8).toFixed(1)+'" width="5" height="3" rx=".6" fill="#1a2a1a"/>';
  return s;
}},

/* ---- FREEZER: open chest freezer, frosted well + stacked frozen goods ---- */
bin:{name:'Freezer',h:.8,gen:function(a,b,rot,text,visited){
  var f=boxFaces(a,b,.8);
  var s=poly(f.right,'#b8ccdc','stroke="#a8bccc" stroke-width="0.5"')+poly(f.left,'#8aaec4','stroke="#7a9eb4" stroke-width="0.5"')+poly(f.top,'#c8dce8','stroke="#b8ccd8" stroke-width="0.5"');
  var inn=[bil(f.top,.1,.1),bil(f.top,.9,.1),bil(f.top,.9,.9),bil(f.top,.1,.9)];
  s+=poly(inn,'#dff0fb','opacity="'+(visited?0.95:0.72)+'"');
  /* stacked frozen packs (top face shows their lids) */
  var cs=['#e84040','#4080e0','#20a040','#e0a020','#c040a0','#40b0b0'];
  for(var i=0;i<6;i++){var p=bil(f.top,.24+(i%3)*.26,.34+Math.floor(i/3)*.32);
    s+='<rect x="'+(p[0]-6).toFixed(1)+'" y="'+(p[1]-4.5).toFixed(1)+'" width="12" height="9" rx="1.6" fill="'+cs[(i+a)%6]+'" opacity="0.92"/>';
    s+='<rect x="'+(p[0]-6).toFixed(1)+'" y="'+(p[1]-4.5).toFixed(1)+'" width="12" height="3" rx="1.6" fill="#ffffff" opacity="0.28"/>';
    s+='<rect x="'+(p[0]-4).toFixed(1)+'" y="'+(p[1]-1).toFixed(1)+'" width="8" height="1.4" fill="#ffffff" opacity="0.6"/>';}
  /* glass slider edge + rim frost crystals */
  s+=ln(bil(f.top,.1,.5),bil(f.top,.9,.5),'#eaf6ff',2,'opacity="0.5"');
  for(var fi=0;fi<4;fi++){var q=bil(f.top,.18+fi*.22,.08);s+='<circle cx="'+q[0].toFixed(1)+'" cy="'+q[1].toFixed(1)+'" r="1.4" fill="#ffffff" opacity="'+(0.26+0.3*(0.5+0.5*Math.sin(Date.now()/600+fi))).toFixed(2)+'"/>';}
  if(visited){var tc=bil(f.top,.5,.5),t=Date.now()/1000,pulse=.6+.4*Math.sin(t*2.6);s+='<rect x="'+(tc[0]-16).toFixed(1)+'" y="'+(tc[1]-10).toFixed(1)+'" width="32" height="20" rx="4" fill="#bfe8ff" opacity="'+(0.12+0.16*pulse).toFixed(2)+'"/>';}
  return s;
}},

/* ---- WALL ---- */
wall:{name:'Wall',h:3,gen:function(a,b,rot){var f=boxFaces(a,b,3),face=rot%2?f.right:f.left,other=rot%2?f.left:f.right;return poly(other,'#bab0a4','stroke="#aaa094" stroke-width="0.4"')+poly(face,'#c8beb2','stroke="#b8ae9e" stroke-width="0.4"')+poly(f.top,'#d8d0c0','stroke="#c8c0b0" stroke-width="0.4"')}},

/* ---- GLASS: mullioned storefront window ---- */
glass:{name:'Glass',h:2.6,rots:4,gen:function(a,b,rot,text,visited){
  var f=boxFaces(a,b,2.6),face={0:f.yp,1:f.xp,2:f.xm,3:f.ym}[((rot%4)+4)%4];
  var s=poly(face,'#c8eef8','opacity="0.5" stroke="#90c8dc" stroke-width="0.8"');
  s+=ln(face[0],face[3],'#6f9fb8',2,'opacity="0.85"')+ln(face[1],face[2],'#6f9fb8',2,'opacity="0.85"');
  s+=ln(face[0],face[1],'#6f9fb8',2,'opacity="0.8"')+ln(face[3],face[2],'#6f9fb8',2,'opacity="0.8"');
  s+=ln(bil(face,.5,.02),bil(face,.5,.98),'#7fa9c0',1.4,'opacity="0.7"');
  s+=ln(bil(face,.02,.5),bil(face,.98,.5),'#7fa9c0',1.4,'opacity="0.7"');
  s+=ln(bil(face,.14,.05),bil(face,.14,.95),'#ffffff',2,'opacity="0.22"');
  s+=ln(bil(face,.3,.05),bil(face,.3,.95),'#ffffff',1.4,'opacity="0.14"');
  if(visited){var c=bil(face,.5,.5),t=Date.now()/1000,pulse=.6+.4*Math.sin(t*2.8);s+='<ellipse cx="'+c[0].toFixed(1)+'" cy="'+c[1].toFixed(1)+'" rx="14" ry="16" fill="#ffffff" opacity="'+(0.15+0.2*pulse).toFixed(2)+'"/>';}
  return s;
}},

/* ---- SIGN ---- */
sign:{name:'Sign',h:0,gen:function(a,b,rot,text){var c=[isoX(a+.5,b+.5),isoY(a+.5,b+.5,2.6)],t=(text||'AISLE').toUpperCase(),w=Math.max(46,t.length*7.4+18);return'<g transform="translate('+c[0].toFixed(1)+','+c[1].toFixed(1)+')"><line x1="0" y1="-2" x2="0" y2="10" stroke="#909090" stroke-width="1" opacity="0.5"/><rect x="'+(-w/2).toFixed(1)+'" y="-13" width="'+w.toFixed(1)+'" height="22" rx="4" fill="#0e3a5e" opacity="0.94"/><text x="0" y="2.5" text-anchor="middle" font-family=Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" font-size="10" font-weight="bold" fill="#90e4ff" letter-spacing="0.5">'+t+'</text></g>'}},

/* ---- SHOPPER (editor palette only; live shoppers are drawn by walkerSVG) ---- */
shopper:{name:'Shopper',h:0,isWalker:true,gen:function(a,b,rot){var c=[isoX(a+.5,b+.5),isoY(a+.5,b+.5)],bodies=[['#3a5898','#2a4880','#401808','#f0c090'],['#983838','#782020','#602010','#e8b078'],['#2f7d4f','#1f5d37','#241008','#f0c090'],['#c99a2e','#9a7420','#3a2410','#e8b078']],col=bodies[(a*3+b+(rot||0))%bodies.length],x=c[0],y=c[1]-2;return'<g><ellipse cx="'+x.toFixed(1)+'" cy="'+(y+15).toFixed(1)+'" rx="7.5" ry="2.8" fill="#000" opacity="0.16"/><ellipse cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" rx="5.5" ry="8.5" fill="'+col[0]+'"/><circle cx="'+x.toFixed(1)+'" cy="'+(y-12).toFixed(1)+'" r="4.5" fill="'+col[3]+'"/><ellipse cx="'+x.toFixed(1)+'" cy="'+(y-15).toFixed(1)+'" rx="3.5" ry="2" fill="'+col[2]+'"/><line x1="'+(x-5.5).toFixed(1)+'" y1="'+(y-2).toFixed(1)+'" x2="'+(x-9).toFixed(1)+'" y2="'+(y+3).toFixed(1)+'" stroke="'+col[1]+'" stroke-width="2.5"/><line x1="'+(x+5.5).toFixed(1)+'" y1="'+(y-2).toFixed(1)+'" x2="'+(x+9).toFixed(1)+'" y2="'+(y+3).toFixed(1)+'" stroke="'+col[1]+'" stroke-width="2.5"/><line x1="'+(x-2.5).toFixed(1)+'" y1="'+(y+7).toFixed(1)+'" x2="'+(x-3).toFixed(1)+'" y2="'+(y+15).toFixed(1)+'" stroke="'+col[1]+'" stroke-width="2.5"/><line x1="'+(x+2.5).toFixed(1)+'" y1="'+(y+7).toFixed(1)+'" x2="'+(x+3).toFixed(1)+'" y2="'+(y+15).toFixed(1)+'" stroke="'+col[1]+'" stroke-width="2.5"/></g>'}}
};
var ORDER=['fridge','shelf','produce','counter','deli','bin','glass','wall','shopper','sign'];
function loadDefault(){
  var d=[{type:'sign',gx:5,gy:6,rot:0,text:'ZONE A'},{type:'fridge',gx:3,gy:0,rot:0},{type:'fridge',gx:4,gy:0,rot:0},{type:'fridge',gx:5,gy:0,rot:0},{type:'fridge',gx:6,gy:0,rot:0},{type:'fridge',gx:7,gy:0,rot:0},{type:'shelf',gx:0,gy:1,rot:1},{type:'shelf',gx:0,gy:2,rot:1},{type:'glass',gx:7,gy:8,rot:0},{type:'glass',gx:8,gy:8,rot:0},{type:'glass',gx:9,gy:8,rot:0},{type:'bin',gx:3,gy:5,rot:0},{type:'bin',gx:4,gy:5,rot:0},{type:'bin',gx:5,gy:5,rot:0},{type:'bin',gx:6,gy:5,rot:0},{type:'counter',gx:4,gy:2,rot:0},{type:'counter',gx:5,gy:2,rot:0},{type:'counter',gx:6,gy:2,rot:0},{type:'counter',gx:7,gy:2,rot:0},{type:'counter',gx:3,gy:2,rot:0},{type:'bin',gx:7,gy:5,rot:0},{type:'shelf',gx:0,gy:3,rot:1},{type:'shelf',gx:0,gy:4,rot:1},{type:'produce',gx:11,gy:0,rot:0},{type:'produce',gx:11,gy:2,rot:0},{type:'produce',gx:11,gy:4,rot:0},{type:'produce',gx:11,gy:6,rot:0},{type:'produce',gx:11,gy:8,rot:0},{type:'produce',gx:0,gy:8,rot:0},{type:'produce',gx:2,gy:8,rot:0},{type:'produce',gx:0,gy:6,rot:0}];
  pieces=d.map(function(p){return Object.assign({},p,{id:uid++})})
}
loadDefault();
