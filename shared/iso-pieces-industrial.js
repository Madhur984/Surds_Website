/* ===== INDUSTRIAL (STEEL FACTORY) PIECES =====
   Richer, "cartoonish but readable" mill equipment. Piece keys, names, heights, rotation
   counts and the loadIndustrial() layout are UNCHANGED, so the movement-intelligence dwell
   tracker and the highest-visited / suggested-move flags stay pointed at the same machines.
   Motion is Date.now()-driven (recomputed each gen call) because render() rebuilds the whole
   scene SVG every tick — SMIL would just reset. */
var PIECES_IND={

/* ---- SMELTER: crucible of molten steel — pulsing glow, bubbling, rising sparks ---- */
smelter:{name:'Smelter',h:1.6,gen:function(a,b){
  var f=boxFaces(a,b,1.6),T=Date.now();
  var s=poly(f.right,'#4a3a30','stroke="#3a2a20" stroke-width="0.5"')+poly(f.left,'#3a2a20','stroke="#2a1a10" stroke-width="0.5"')+poly(f.top,'#5a4a3a','stroke="#4a3a2a" stroke-width="0.5"');
  /* refractory brick courses on the visible sides */
  for(var bi=1;bi<3;bi++){var u=bi/3;s+=ln(bil(f.left,.04,u),bil(f.left,.96,u),'#2a1a10',1,'opacity="0.5"')+ln(bil(f.right,.04,u),bil(f.right,.96,u),'#3a2a1a',1,'opacity="0.5"');}
  /* molten bowl */
  var bowl=[bil(f.top,.1,.18),bil(f.top,.9,.18),bil(f.top,.86,.82),bil(f.top,.14,.82)];
  s+=poly(bowl,'#1a0800','opacity="0.95"');
  var mp=0.5+0.5*Math.sin(T/500);
  s+=poly(bowl,'#ff4400','opacity="'+(0.45+0.25*mp).toFixed(2)+'"');
  s+=poly(bowl,'#ff9a00','opacity="'+(0.15+0.2*mp).toFixed(2)+'"');
  var tc=bil(f.top,.5,.5);
  s+='<ellipse cx="'+tc[0].toFixed(1)+'" cy="'+(tc[1]-2).toFixed(1)+'" rx="9" ry="3.5" fill="#ffd060" opacity="'+(0.2+0.25*mp).toFixed(2)+'"/>';
  /* bubbling molten blobs */
  for(var mi=0;mi<3;mi++){var ph=T/700+mi*0.6,bp=bil(bowl,.32+0.18*mi+0.08*Math.sin(ph*1.3),.42+0.2*Math.sin(ph)),rr=1.6+1.2*(0.5+0.5*Math.sin(ph*2));s+='<circle cx="'+bp[0].toFixed(1)+'" cy="'+bp[1].toFixed(1)+'" r="'+rr.toFixed(1)+'" fill="#ffec8a" opacity="'+(0.4+0.4*Math.abs(Math.sin(ph*2))).toFixed(2)+'"/>';}
  /* rising sparks / heat */
  for(var si=0;si<4;si++){var sp=(T/500+si*0.9)%1,x=tc[0]+(si-1.5)*4,y=tc[1]-4-sp*16;s+='<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+(1.2*(1-sp)).toFixed(1)+'" fill="#ffcf5a" opacity="'+(0.7*(1-sp)).toFixed(2)+'"/>';}
  return s}},

/* ---- TROUGH: hot-metal runner with molten flowing along it ---- */
trough:{name:'Trough',h:.35,gen:function(a,b){
  var f=boxFaces(a,b,.35),T=Date.now();
  var s=poly(f.right,'#4a3a2a','stroke="#3a2a1a" stroke-width="0.5"')+poly(f.left,'#3a2a1a','stroke="#2a1a0a" stroke-width="0.5"')+poly(f.top,'#5a4a3a','stroke="#4a3a2a" stroke-width="0.5"');
  var inner=[bil(f.top,.06,.34),bil(f.top,.94,.34),bil(f.top,.94,.66),bil(f.top,.06,.66)];
  s+=poly(inner,'#ff4400','opacity="0.55"')+poly(inner,'#ff9a00','opacity="0.2"');
  var flow=(T/450)%1;
  for(var i=0;i<4;i++){var t=((i/4)+flow)%1,p=bil(inner,t,.5);s+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="2.6" fill="#ffe08a" opacity="0.75"/>';}
  return s}},

/* ---- ROLL FORMER: mill stand, spinning rolls squeezing a hot strip ---- */
roller:{name:'Roll Former',h:1.6,gen:function(a,b){
  var f=boxFaces(a,b,1.6),T=Date.now();
  var s=poly(f.left,'#454545','stroke="#333" stroke-width="0.5"')+poly(f.right,'#555','stroke="#3a3a3a" stroke-width="0.5"')+poly(f.top,'#606060','stroke="#505050" stroke-width="0.5"');
  var ss=bil(f.top,.03,.5),se=bil(f.top,.97,.5);
  s+=ln(ss,se,'#ff7a2a',3.5,'opacity="0.5"')+ln(ss,se,'#ffd070',1.6,'opacity="0.7"');   /* hot strip */
  for(var i=0;i<3;i++){var rc=bil(f.top,.18+i*.32,.5),rot=((T/300+i)%1)*360;
    s+='<ellipse cx="'+rc[0].toFixed(1)+'" cy="'+rc[1].toFixed(1)+'" rx="3.6" ry="7.6" fill="#9a9a9a" stroke="#777" stroke-width="1" opacity="0.9"/>';
    s+='<ellipse cx="'+rc[0].toFixed(1)+'" cy="'+(rc[1]-.8).toFixed(1)+'" rx="3" ry="6.5" fill="#bcbcbc" opacity="0.3"/>';
    s+='<line x1="'+rc[0].toFixed(1)+'" y1="'+(rc[1]-6).toFixed(1)+'" x2="'+rc[0].toFixed(1)+'" y2="'+(rc[1]+6).toFixed(1)+'" stroke="#555" stroke-width="1" opacity="0.6" transform="rotate('+rot.toFixed(0)+' '+rc[0].toFixed(1)+' '+rc[1].toFixed(1)+')"/>';}
  var ge=bil(f.top,.9,.16);s+='<rect x="'+(ge[0]-3).toFixed(1)+'" y="'+(ge[1]-3).toFixed(1)+'" width="6" height="6" rx="1.5" fill="#444" stroke="#333" stroke-width=".6" opacity="0.7"/>';
  return s}},

/* ---- REELER: coiler drum winding the finished strip, spinning ---- */
reeler:{name:'Reeler',h:1.8,gen:function(a,b){
  var f=boxFaces(a,b,1.8),T=Date.now();
  var s=poly(f.left,'#4a4a50','stroke="#333" stroke-width="0.5"')+poly(f.right,'#555560','stroke="#3a3a40" stroke-width="0.5"')+poly(f.top,'#606068','stroke="#505058" stroke-width="0.5"');
  var mc=bil(f.top,.4,.5),rot=((T/700)%1)*360;
  s+='<circle cx="'+mc[0].toFixed(1)+'" cy="'+mc[1].toFixed(1)+'" r="10" fill="#777" stroke="#555" stroke-width="1.5" opacity="0.9"/>';
  s+='<circle cx="'+mc[0].toFixed(1)+'" cy="'+mc[1].toFixed(1)+'" r="7" fill="#999" stroke="#888" stroke-width="1" opacity="0.5"/>';
  s+='<circle cx="'+mc[0].toFixed(1)+'" cy="'+mc[1].toFixed(1)+'" r="12" fill="none" stroke="#aaa" stroke-width="1.5" opacity="0.35" stroke-dasharray="3 2"/>';
  s+='<line x1="'+(mc[0]-10).toFixed(1)+'" y1="'+mc[1].toFixed(1)+'" x2="'+(mc[0]+10).toFixed(1)+'" y2="'+mc[1].toFixed(1)+'" stroke="#bbb" stroke-width="1.5" opacity="0.6" transform="rotate('+rot.toFixed(0)+' '+mc[0].toFixed(1)+' '+mc[1].toFixed(1)+')"/>';
  var si=bil(f.top,.05,.5);s+=ln(si,[mc[0]-12,mc[1]],'#cfa070',2,'opacity="0.5"');
  var ge=bil(f.top,.85,.5);s+='<rect x="'+(ge[0]-4).toFixed(1)+'" y="'+(ge[1]-4).toFixed(1)+'" width="8" height="8" rx="2" fill="#555" stroke="#444" stroke-width=".8" opacity="0.7"/>';
  return s}},

/* ---- STEEL COIL: finished wound coil with banding + eye ---- */
coil:{name:'Steel Coil',h:.8,gen:function(a,b){
  var f=boxFaces(a,b,.8);
  var s=poly(f.right,'#6a6a6a','stroke="#555" stroke-width="0.5"')+poly(f.left,'#505050','stroke="#444" stroke-width="0.5"')+poly(f.top,'#7a7a7a','stroke="#666" stroke-width="0.5"');
  var c=bil(f.top,.5,.5);
  s+='<circle cx="'+c[0].toFixed(1)+'" cy="'+c[1].toFixed(1)+'" r="9" fill="#8a8a8a" stroke="#666" stroke-width="1" opacity="0.9"/>';
  s+='<circle cx="'+c[0].toFixed(1)+'" cy="'+c[1].toFixed(1)+'" r="6.5" fill="none" stroke="#a4a4a4" stroke-width="0.8" opacity="0.7"/>';
  s+='<circle cx="'+c[0].toFixed(1)+'" cy="'+c[1].toFixed(1)+'" r="4" fill="#4a4a4a" stroke="#777" stroke-width=".6" opacity="0.9"/>';
  s+='<circle cx="'+(c[0]-2).toFixed(1)+'" cy="'+(c[1]-2).toFixed(1)+'" r="2" fill="#bcbcbc" opacity="0.4"/>';
  s+=ln([c[0]-9,c[1]],[c[0]+9,c[1]],'#3a3a3a',1.4,'opacity="0.6"');
  return s}},

/* ---- FURNACE: reheat furnace, flickering glow through the door + exhaust ---- */
furnace:{name:'Furnace',h:3.2,rots:4,gen:function(a,b,rot){
  var T=Date.now(),flick=0.5+0.5*Math.sin(T/180)*Math.sin(T/90);
  var door=function(f){var g=[bil(f,.12,.06),bil(f,.88,.06),bil(f,.88,.94),bil(f,.12,.94)];
    return poly(g,'#1a0a00')+
      poly(g,'#ff4400','opacity="'+(0.14+0.14*flick).toFixed(2)+'"')+
      ln(bil(f,.25,.15),bil(f,.25,.85),'#ff5a00',1.5,'opacity="'+(0.3+0.2*flick).toFixed(2)+'"')+
      ln(bil(f,.5,.1),bil(f,.5,.9),'#ff7a10',2,'opacity="'+(0.4+0.25*flick).toFixed(2)+'"')+
      ln(bil(f,.75,.15),bil(f,.75,.85),'#ff5a00',1.5,'opacity="'+(0.3+0.2*flick).toFixed(2)+'"')+
      ln(f[2],f[3],'#ff8a20',2.2,'opacity="0.55"')};
  var closed=function(f){return ln(bil(f,.5,.06),bil(f,.5,.94),'#666',1,'opacity="0.4"')+ln(bil(f,.3,.3),bil(f,.7,.3),'#777',2,'opacity="0.3"')+ln(bil(f,.3,.6),bil(f,.7,.6),'#777',2,'opacity="0.3"')};
  var s=box4(a,b,3.2,{front:'#505050',side:'#404040',top:'#606060',stroke:'#333'},rot,door,closed);
  var f=boxFaces(a,b,3.2),dp=bil(f.top,.72,.3);
  s+='<rect x="'+(dp[0]-3).toFixed(1)+'" y="'+(dp[1]-8).toFixed(1)+'" width="6" height="9" rx="1.5" fill="#3a3a3a" stroke="#2a2a2a" stroke-width=".5" opacity="0.85"/>';
  s+='<ellipse cx="'+dp[0].toFixed(1)+'" cy="'+(dp[1]-11).toFixed(1)+'" rx="'+(4+2*flick).toFixed(1)+'" ry="2.4" fill="#c8bcb0" opacity="'+(0.05+0.06*flick).toFixed(2)+'"/>';
  return s}},

/* ---- STEEL RACK: pallet rack of stacked bar bundles ---- */
rack:{name:'Steel Rack',h:2.5,rots:4,gen:function(a,b,rot){
  var open=function(fc){var g=[bil(fc,.05,.03),bil(fc,.95,.03),bil(fc,.95,.99),bil(fc,.05,.99)];
    var o=poly(g,'#2f281f');
    o+=stockFace(g,3,3,['#8a7a60','#7a6a50','#6a5a40','#9a8a6a'],.9);
    for(var r=1;r<3;r++){var u=.06+r*(.9/3);o+=ln(bil(g,.02,u),bil(g,.98,u),'#c8b088',2,'opacity="0.8"');}   /* beams */
    for(var i=0;i<3;i++){o+=ln(bil(fc,.12,.2+i*.28),bil(fc,.88,.2+i*.28),'#b4b4b4',1.4,'opacity="0.32"');}  /* bar ends */
    return o};
  return box4(a,b,2.5,{front:'#706860',side:'#605850',top:'#807870',stroke:'#4a4240'},rot,open,null)}},

/* ---- CTRL PANEL: console with a live readout, blinking LEDs + an alarm light ---- */
panel:{name:'Ctrl Panel',h:1.3,gen:function(a,b,rot,text,visited){
  var f=boxFaces(a,b,1.3),T=Date.now(),face=f.right;
  var s=poly(f.left,'#2a3a2a','stroke="#1a2a1a" stroke-width="0.5"')+poly(face,'#3a4a3a','stroke="#2a3a2a" stroke-width="0.5"')+poly(f.top,'#4a5a4a','stroke="#3a4a3a" stroke-width="0.5"');
  /* readout screen (upper half of the front face) with a scrolling waveform */
  var scr=[bil(face,.14,.44),bil(face,.86,.44),bil(face,.86,.84),bil(face,.14,.84)];
  s+=poly(scr,'#0b1a12','stroke="#0a3a2a" stroke-width="0.6"');
  var wf='';for(var wi=0;wi<=8;wi++){var lt=wi/8,ly=.5+0.32*Math.sin((T/300)+wi*0.8),p=bil(scr,lt,ly);wf+=(wi?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)+' ';}
  s+='<path d="'+wf+'" fill="none" stroke="#22c55e" stroke-width="1.2" opacity="0.85"/>';
  /* status LEDs on a lower strip + one alarm light (red until this panel is the attended one) */
  var lc=bil(face,.24,.24),step=bil(face,.44,.24),dx=(step[0]-lc[0])/2,dy=(step[1]-lc[1])/2;
  for(var li=0;li<3;li++){var on=(Math.floor(T/500)+li)%2;s+='<circle cx="'+(lc[0]+dx*li).toFixed(1)+'" cy="'+(lc[1]+dy*li).toFixed(1)+'" r="2.3" fill="#22c55e" opacity="'+(on?0.95:0.4)+'"/>';}
  var ap=bil(face,.78,.24);s+='<circle cx="'+ap[0].toFixed(1)+'" cy="'+ap[1].toFixed(1)+'" r="2.6" fill="'+(visited?'#22c55e':'#ef4444')+'" opacity="'+(visited?0.95:(0.5+0.5*Math.abs(Math.sin(T/350)))).toFixed(2)+'"/>';
  if(visited){var sc=bil(f.top,.5,.5),pulse=.6+.4*Math.sin(T/1000*3);s+='<rect x="'+(sc[0]-13).toFixed(1)+'" y="'+(sc[1]-6).toFixed(1)+'" width="26" height="12" rx="2" fill="#7cfc9a" opacity="'+(0.14+0.2*pulse).toFixed(2)+'"/>';}
  return s}},

/* ---- WELD BAY: welding cell, flickering arc flash + spark shower ---- */
weld:{name:'Weld Bay',h:1.5,rots:4,gen:function(a,b,rot){
  var T=Date.now(),arc=Math.pow(0.5+0.5*Math.sin(T/70),3);
  var gl=function(fc){var g=[bil(fc,.1,.2),bil(fc,.9,.2),bil(fc,.9,.85),bil(fc,.1,.85)],c=bil(g,.5,.55);
    var o=poly(g,'#0a1a3a','opacity="0.75"');
    o+='<circle cx="'+c[0].toFixed(1)+'" cy="'+c[1].toFixed(1)+'" r="5" fill="#bcd6ff" opacity="'+(0.3+0.6*arc).toFixed(2)+'"/>';
    o+='<circle cx="'+c[0].toFixed(1)+'" cy="'+c[1].toFixed(1)+'" r="11" fill="#4488ff" opacity="'+(0.08+0.2*arc).toFixed(2)+'"/>';
    o+='<circle cx="'+c[0].toFixed(1)+'" cy="'+c[1].toFixed(1)+'" r="20" fill="#4488ff" opacity="'+(0.03+0.08*arc).toFixed(2)+'"/>';
    for(var si=0;si<5;si++){var a2=(si/5)*6.28+T/200,d=6+8*((T/120+si)%1);o+='<circle cx="'+(c[0]+Math.cos(a2)*d).toFixed(1)+'" cy="'+(c[1]+Math.abs(Math.sin(a2))*d*0.6).toFixed(1)+'" r="'+(1.1*arc+0.3).toFixed(1)+'" fill="#ffd070" opacity="'+(0.8*arc).toFixed(2)+'"/>';}
    return o};
  return box4(a,b,1.5,{front:'#5a5050',side:'#4a4040',top:'#6a6060',stroke:'#333'},rot,gl,null)}},

/* ---- COOLANT TANK: tank with hatch + a wobbling sight-glass level gauge ---- */
tank:{name:'Coolant Tank',h:1.1,gen:function(a,b){
  var f=boxFaces(a,b,1.1),T=Date.now();
  var s=poly(f.right,'#506050','stroke="#405040" stroke-width="0.5"')+poly(f.left,'#405040','stroke="#304030" stroke-width="0.5"')+poly(f.top,'#607060','stroke="#506050" stroke-width="0.5"');
  s+=ln(bil(f.left,.04,.4),bil(f.left,.96,.4),'#304030',1,'opacity="0.6"')+ln(bil(f.right,.04,.4),bil(f.right,.96,.4),'#405040',1,'opacity="0.6"');
  var c=bil(f.top,.5,.5);
  s+='<circle cx="'+c[0].toFixed(1)+'" cy="'+c[1].toFixed(1)+'" r="5" fill="#2a4a2a" stroke="#1a3a1a" stroke-width="1" opacity="0.8"/>';
  s+='<circle cx="'+c[0].toFixed(1)+'" cy="'+c[1].toFixed(1)+'" r="2" fill="#4488ff" opacity="'+(0.5+0.4*Math.abs(Math.sin(T/700))).toFixed(2)+'"/>';
  var g=[bil(f.right,.34,.18),bil(f.right,.5,.18),bil(f.right,.5,.8),bil(f.right,.34,.8)];
  s+=poly(g,'#0a1a1a','stroke="#2f8fd0" stroke-width="0.5" opacity="0.85"');
  var lvl=.55+0.06*Math.sin(T/600);
  s+=poly([bil(g,0,0),bil(g,1,0),bil(g,1,lvl),bil(g,0,lvl)],'#2f8fd0','opacity="0.65"');
  s+=ln(bil(g,0,lvl),bil(g,1,lvl),'#9fdcff',1.2,'opacity="0.85"');
  return s}},

/* ---- CONCRETE WALL with precast seams ---- */
cwall:{name:'Concrete',h:3,gen:function(a,b,rot){
  var f=boxFaces(a,b,3),face=rot%2?f.right:f.left,other=rot%2?f.left:f.right;
  var s=poly(other,'#6a6a6a','stroke="#5a5a5a" stroke-width="0.4"')+poly(face,'#7a7a7a','stroke="#6a6a6a" stroke-width="0.4"')+poly(f.top,'#8a8a8a','stroke="#7a7a7a" stroke-width="0.4"');
  s+=ln(bil(face,.5,.02),bil(face,.5,.98),'#5f5f5f',1,'opacity="0.5"');
  s+=ln(bil(face,.02,.5),bil(face,.98,.5),'#5f5f5f',1,'opacity="0.4"');
  return s}},

/* ---- SAFETY FENCE: hazard-striped railing; the gate swings clear when attended ---- */
fence:{name:'Safety Fence',h:2.2,rots:4,gen:function(a,b,rot,text,visited){
  var f=boxFaces(a,b,2.2),face={0:f.yp,1:f.xp,2:f.xm,3:f.ym}[((rot%4)+4)%4];
  var s=poly(face,'#e8c020','opacity="'+(visited?0.16:0.34)+'" stroke="#c0a018" stroke-width="0.8"');
  /* hazard chevrons across the top rail */
  for(var ci=0;ci<5;ci++){var t0=ci*.2,t1=t0+.1;s+=poly([bil(face,t0,.18),bil(face,t1,.18),bil(face,t1,.34),bil(face,t0,.34)],ci%2?'#1a1a1a':'#e8c020','opacity="'+(visited?0.3:0.85)+'"');}
  /* posts — the middle two swing clear when the gate is open (visited) */
  var bars=visited?[0,3]:[0,1,2,3];
  for(var bi=0;bi<bars.length;bi++){var i=bars[bi],p1=bil(face,.15+i*.22,.05),p2=bil(face,.15+i*.22,.95);s+=ln(p1,p2,'#333',2,'opacity="0.7"');}
  s+=ln(face[0],face[3],'#333',2.5,'opacity="'+(visited?0.3:0.8)+'"');
  s+=ln(face[1],face[2],'#333',2.5,'opacity="'+(visited?0.3:0.8)+'"');
  if(visited){var c=bil(face,.5,.5),t=Date.now()/1000,pulse=.6+.4*Math.sin(t*2.5);s+='<ellipse cx="'+c[0].toFixed(1)+'" cy="'+c[1].toFixed(1)+'" rx="14" ry="16" fill="#7cfc9a" opacity="'+(0.1+0.14*pulse).toFixed(2)+'"/>';}
  return s}},

/* ---- WORKER (editor palette only; live workers are drawn by walkerSVG) ---- */
worker:{name:'Worker',h:0,isWalker:true,gen:function(a,b,rot){
  var c=[isoX(a+.5,b+.5),isoY(a+.5,b+.5)];
  var wb=[['#e85a00','#c04800','#1a1a1a','#f0d0a0'],['#e85a00','#c04800','#1a1a1a','#f0d0a0'],['#e8c020','#b8a018','#1a1a1a','#f0d0a0'],['#d04020','#a83018','#1a1a1a','#f0d0a0']];
  var col=wb[(a*3+b+(rot||0))%wb.length],x=c[0],y=c[1]-2;
  return'<g><ellipse cx="'+x.toFixed(1)+'" cy="'+(y+15).toFixed(1)+'" rx="7.5" ry="2.8" fill="#000" opacity="0.16"/>'+
    '<ellipse cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" rx="5.5" ry="8.5" fill="'+col[0]+'"/>'+
    '<circle cx="'+x.toFixed(1)+'" cy="'+(y-12).toFixed(1)+'" r="4.5" fill="'+col[3]+'"/>'+
    '<ellipse cx="'+x.toFixed(1)+'" cy="'+(y-15).toFixed(1)+'" rx="5" ry="2.5" fill="'+col[1]+'"/>'+
    '<line x1="'+(x-5.5).toFixed(1)+'" y1="'+(y-2).toFixed(1)+'" x2="'+(x-9).toFixed(1)+'" y2="'+(y+3).toFixed(1)+'" stroke="'+col[2]+'" stroke-width="2.5"/>'+
    '<line x1="'+(x+5.5).toFixed(1)+'" y1="'+(y-2).toFixed(1)+'" x2="'+(x+9).toFixed(1)+'" y2="'+(y+3).toFixed(1)+'" stroke="'+col[2]+'" stroke-width="2.5"/>'+
    '<line x1="'+(x-2.5).toFixed(1)+'" y1="'+(y+7).toFixed(1)+'" x2="'+(x-3).toFixed(1)+'" y2="'+(y+15).toFixed(1)+'" stroke="'+col[2]+'" stroke-width="2.5"/>'+
    '<line x1="'+(x+2.5).toFixed(1)+'" y1="'+(y+7).toFixed(1)+'" x2="'+(x+3).toFixed(1)+'" y2="'+(y+15).toFixed(1)+'" stroke="'+col[2]+'" stroke-width="2.5"/></g>'}},

/* ---- SIGN: hanging bay marker ---- */
sign:{name:'Sign',h:0,gen:function(a,b,rot,text){
  var c=[isoX(a+.5,b+.5),isoY(a+.5,b+.5,2.6)],t=(text||'BAY').toUpperCase(),w=Math.max(46,t.length*7.4+18);
  return'<g transform="translate('+c[0].toFixed(1)+','+c[1].toFixed(1)+')"><line x1="0" y1="-2" x2="0" y2="10" stroke="#909090" stroke-width="1" opacity="0.5"/>'+
    '<rect x="'+(-w/2).toFixed(1)+'" y="-13" width="'+w.toFixed(1)+'" height="22" rx="4" fill="#1a2a3a" opacity="0.94"/>'+
    '<text x="0" y="2.5" text-anchor="middle" font-family=Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" font-size="10" font-weight="bold" fill="#f0c020" letter-spacing="0.5">'+t+'</text></g>'}}
};
var ORDER_IND=['smelter','trough','roller','reeler','coil','furnace','rack','panel','weld','tank','fence','cwall','worker','sign'];
var HOTKEY_IND={'1':'smelter','2':'trough','3':'roller','4':'reeler','5':'coil','6':'furnace','7':'rack','8':'panel','9':'worker','0':'sign'};

function loadIndustrial(){
  var d=[
    {type:'sign',gx:5,gy:7,rot:0,text:'BAY A'},
    /* === SMELTING (back row) === */
    {type:'smelter',gx:1,gy:0,rot:0},{type:'smelter',gx:2,gy:0,rot:0},{type:'smelter',gx:3,gy:0,rot:0},
    /* === HOT METAL TROUGH === */
    {type:'trough',gx:2,gy:1,rot:0},{type:'trough',gx:3,gy:1,rot:0},{type:'trough',gx:4,gy:1,rot:0},
    /* === ROLL FORMING === */
    {type:'roller',gx:5,gy:2,rot:0},{type:'roller',gx:6,gy:2,rot:0},{type:'roller',gx:7,gy:2,rot:0},
    /* === REELER (sheet → coil) === */
    {type:'reeler',gx:8,gy:3,rot:0},
    /* === FINISHED COILS (output) === */
    {type:'coil',gx:10,gy:2,rot:0},{type:'coil',gx:11,gy:2,rot:0},
    {type:'coil',gx:10,gy:3,rot:0},{type:'coil',gx:11,gy:3,rot:0},
    {type:'coil',gx:10,gy:4,rot:0},{type:'coil',gx:11,gy:4,rot:0},
    /* === CONTROL PANELS === */
    {type:'panel',gx:0,gy:2,rot:0},{type:'panel',gx:0,gy:3,rot:0},
    /* === COOLANT TANKS === */
    {type:'tank',gx:5,gy:4,rot:0},{type:'tank',gx:6,gy:4,rot:0},
    /* === SAFETY FENCES (around hot zone) === */
    {type:'fence',gx:0,gy:1,rot:0},{type:'fence',gx:1,gy:1,rot:0},
    {type:'fence',gx:9,gy:2,rot:0},{type:'fence',gx:9,gy:3,rot:0},{type:'fence',gx:9,gy:4,rot:0},
    /* === CONCRETE WALLS === */
    {type:'cwall',gx:0,gy:0,rot:0},{type:'cwall',gx:0,gy:7,rot:0},
    /* === STORAGE RACKS === */
    {type:'rack',gx:11,gy:6,rot:0},{type:'rack',gx:11,gy:7,rot:0},
    /* === EXTRA COILS IN STORAGE === */
    {type:'coil',gx:11,gy:8,rot:0},{type:'coil',gx:5,gy:8,rot:0},{type:'coil',gx:6,gy:8,rot:0}
  ];
  pieces=d.map(function(p){return Object.assign({},p,{id:uid++})});
}
