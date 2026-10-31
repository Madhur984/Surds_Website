/* ===== CHEMICAL PLANT PIECES ===== */
var PIECES_CHEM={
pipe_x:{name:'Pipe H',h:0.8,gen:function(a,b){
  var ph=0.7,t=(Date.now()/600)%1,do2=9*(1-t);
  var p1=[isoX(a,b+0.5),isoY(a,b+0.5,ph)],p2=[isoX(a+1,b+0.5),isoY(a+1,b+0.5,ph)];
  var s=ln(p1,p2,'#2a2a2a',7)+ln(p1,p2,'#4a4a4a',5);
  s+='<line x1="'+p1[0].toFixed(1)+'" y1="'+p1[1].toFixed(1)+'" x2="'+p2[0].toFixed(1)+'" y2="'+p2[1].toFixed(1)+'" stroke="#3b82f6" stroke-width="3" stroke-dasharray="6 3" stroke-linecap="round" stroke-dashoffset="'+do2.toFixed(1)+'"/>';
  var f1=[isoX(a,b+0.5),isoY(a,b+0.5,0)],f2=[isoX(a+1,b+0.5),isoY(a+1,b+0.5,0)];
  s+=ln(f1,p1,'#666',1.2)+ln(f2,p2,'#666',1.2);
  return s}},
pipe_y:{name:'Pipe V',h:0.8,gen:function(a,b){
  var ph=0.7,t=(Date.now()/600)%1,do2=9*(1-t);
  var p1=[isoX(a+0.5,b),isoY(a+0.5,b,ph)],p2=[isoX(a+0.5,b+1),isoY(a+0.5,b+1,ph)];
  var s=ln(p1,p2,'#2a2a2a',7)+ln(p1,p2,'#4a4a4a',5);
  s+='<line x1="'+p1[0].toFixed(1)+'" y1="'+p1[1].toFixed(1)+'" x2="'+p2[0].toFixed(1)+'" y2="'+p2[1].toFixed(1)+'" stroke="#3b82f6" stroke-width="3" stroke-dasharray="6 3" stroke-linecap="round" stroke-dashoffset="'+do2.toFixed(1)+'"/>';
  var f1=[isoX(a+0.5,b),isoY(a+0.5,b,0)],f2=[isoX(a+0.5,b+1),isoY(a+0.5,b+1,0)];
  s+=ln(f1,p1,'#666',1.2)+ln(f2,p2,'#666',1.2);
  return s}},
pipe_cr:{name:'Corner R',h:0.8,gen:function(a,b){
  var ph=0.7,t=(Date.now()/600)%1,do2=9*(1-t);
  var p1=[isoX(a,b+0.5),isoY(a,b+0.5,ph)],pc=[isoX(a+0.5,b+0.5),isoY(a+0.5,b+0.5,ph)],p2=[isoX(a+0.5,b+1),isoY(a+0.5,b+1,ph)];
  var s=ln(p1,pc,'#2a2a2a',7)+ln(pc,p2,'#2a2a2a',7)+ln(p1,pc,'#4a4a4a',5)+ln(pc,p2,'#4a4a4a',5);
  s+='<line x1="'+p1[0].toFixed(1)+'" y1="'+p1[1].toFixed(1)+'" x2="'+pc[0].toFixed(1)+'" y2="'+pc[1].toFixed(1)+'" stroke="#3b82f6" stroke-width="3" stroke-dasharray="6 3" stroke-linecap="round" stroke-dashoffset="'+do2.toFixed(1)+'"/>';
  s+='<line x1="'+pc[0].toFixed(1)+'" y1="'+pc[1].toFixed(1)+'" x2="'+p2[0].toFixed(1)+'" y2="'+p2[1].toFixed(1)+'" stroke="#3b82f6" stroke-width="3" stroke-dasharray="6 3" stroke-linecap="round" stroke-dashoffset="'+do2.toFixed(1)+'"/>';
  var fpc=[isoX(a+0.5,b+0.5),isoY(a+0.5,b+0.5,0)];
  s+=ln(fpc,pc,'#666',1.2);
  return s}},
pipe_cl:{name:'Corner L',h:0.8,gen:function(a,b){
  var ph=0.7,t=(Date.now()/600)%1,do2=9*(1-t);
  var p1=[isoX(a+0.5,b),isoY(a+0.5,b,ph)],pc=[isoX(a+0.5,b+0.5),isoY(a+0.5,b+0.5,ph)],p2=[isoX(a+1,b+0.5),isoY(a+1,b+0.5,ph)];
  var s=ln(p1,pc,'#2a2a2a',7)+ln(pc,p2,'#2a2a2a',7)+ln(p1,pc,'#4a4a4a',5)+ln(pc,p2,'#4a4a4a',5);
  s+='<line x1="'+p1[0].toFixed(1)+'" y1="'+p1[1].toFixed(1)+'" x2="'+pc[0].toFixed(1)+'" y2="'+pc[1].toFixed(1)+'" stroke="#3b82f6" stroke-width="3" stroke-dasharray="6 3" stroke-linecap="round" stroke-dashoffset="'+do2.toFixed(1)+'"/>';
  s+='<line x1="'+pc[0].toFixed(1)+'" y1="'+pc[1].toFixed(1)+'" x2="'+p2[0].toFixed(1)+'" y2="'+p2[1].toFixed(1)+'" stroke="#3b82f6" stroke-width="3" stroke-dasharray="6 3" stroke-linecap="round" stroke-dashoffset="'+do2.toFixed(1)+'"/>';
  var fpc=[isoX(a+0.5,b+0.5),isoY(a+0.5,b+0.5,0)];
  s+=ln(fpc,pc,'#666',1.2);
  return s}},
reactor:{name:'Reactor',h:3.5,gen:function(a,b){
  var f=boxFaces(a,b,3.5);
  var s=poly(f.left,'#2a4a6a','stroke="#1a3a5a" stroke-width="0.5"')+poly(f.right,'#3a5a7a','stroke="#2a4a6a" stroke-width="0.5"')+poly(f.top,'#4a6a8a','stroke="#3a5a7a" stroke-width="0.5"');
  var mc=bil(f.top,.5,.5);
  s+='<rect x="'+(mc[0]-4).toFixed(1)+'" y="'+(mc[1]-8).toFixed(1)+'" width="8" height="8" rx="2" fill="#555" stroke="#444" stroke-width=".8" opacity="0.8"/>';
  var gc=bil(f.left,.5,.35);
  s+='<circle cx="'+gc[0].toFixed(1)+'" cy="'+gc[1].toFixed(1)+'" r="3.5" fill="#0a1a2a" stroke="#3b82f6" stroke-width="1" opacity="0.8"/>';
  s+='<circle cx="'+gc[0].toFixed(1)+'" cy="'+gc[1].toFixed(1)+'" r="1.5" fill="#3b82f6" opacity="0.6"><animate attributeName="r" values="1.5;2.5;1.5" dur="2s" repeatCount="indefinite"/></circle>';
  var gc2=bil(f.left,.5,.65);
  s+='<circle cx="'+gc2[0].toFixed(1)+'" cy="'+gc2[1].toFixed(1)+'" r="2" fill="#ef4444" opacity="0.7"/>';
  s+='<circle cx="'+gc2[0].toFixed(1)+'" cy="'+gc2[1].toFixed(1)+'" r="2" fill="none" stroke="#ef4444" stroke-width=".5" opacity="0.4"><animate attributeName="r" from="2" to="5" dur="1.5s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.4" to="0" dur="1.5s" repeatCount="indefinite"/></circle>';
  return s}},
mixer:{name:'Mixer',h:2.2,gen:function(a,b){
  var f=boxFaces(a,b,2.2);
  var s=poly(f.left,'#1a4a3a','stroke="#0a3a2a" stroke-width="0.5"')+poly(f.right,'#2a5a4a','stroke="#1a4a3a" stroke-width="0.5"')+poly(f.top,'#3a6a5a','stroke="#2a5a4a" stroke-width="0.5"');
  var mc=bil(f.top,.5,.5);
  s+='<circle cx="'+mc[0].toFixed(1)+'" cy="'+mc[1].toFixed(1)+'" r="6" fill="none" stroke="#22c55e" stroke-width="1.5" opacity="0.6"><animateTransform attributeName="transform" type="rotate" from="0 '+mc[0]+' '+mc[1]+'" to="360 '+mc[0]+' '+mc[1]+'" dur="3s" repeatCount="indefinite"/></circle>';
  s+='<line x1="'+mc[0].toFixed(1)+'" y1="'+(mc[1]-6).toFixed(1)+'" x2="'+mc[0].toFixed(1)+'" y2="'+(mc[1]+6).toFixed(1)+'" stroke="#22c55e" stroke-width="1" opacity="0.4"/>';
  s+='<circle cx="'+(mc[0]-6).toFixed(1)+'" cy="'+(mc[1]+3).toFixed(1)+'" r="2" fill="#22c55e" opacity="0.9"/>';
  s+='<circle cx="'+(mc[0]+6).toFixed(1)+'" cy="'+(mc[1]+3).toFixed(1)+'" r="2" fill="#22c55e" opacity="0.9"/>';
  return s}},
vat_mixer:{name:'Vat Mixer',h:2.2,gen:function(a,b){
  var h=2.2,bg=5,f=boxFaces(a,b,h),s='';
  /* curved barrel body — bottom edge bows outward */
  var lB0=f.left[0],lB3=f.left[3],lT3=f.left[2],lT0=f.left[1];
  var lC=[(lB0[0]+lB3[0])/2-bg,(lB0[1]+lB3[1])/2+3];
  s+='<path d="M'+P(lB0[0],lB0[1])+' Q'+P(lC[0],lC[1])+' '+P(lB3[0],lB3[1])+' L'+P(lT3[0],lT3[1])+' L'+P(lT0[0],lT0[1])+' Z" fill="#1a4a3a" stroke="#0a3a2a" stroke-width="0.5"/>';
  var rB1=f.right[0],rB2=f.right[1],rT2=f.right[2],rT1=f.right[3];
  var rC=[(rB1[0]+rB2[0])/2+bg,(rB1[1]+rB2[1])/2+3];
  s+='<path d="M'+P(rB1[0],rB1[1])+' Q'+P(rC[0],rC[1])+' '+P(rB2[0],rB2[1])+' L'+P(rT2[0],rT2[1])+' L'+P(rT1[0],rT1[1])+' Z" fill="#2a5a4a" stroke="#1a4a3a" stroke-width="0.5"/>';
  /* top face — open vat rim */
  s+=poly(f.top,'#3a6a5a','stroke="#2a5a4a" stroke-width="0.5"');
  /* inner liquid visible from top */
  var inn=[bil(f.top,.12,.12),bil(f.top,.88,.12),bil(f.top,.88,.88),bil(f.top,.12,.88)];
  s+=poly(inn,'#0a2a4a','opacity="0.85"');
  s+=poly(inn,'#3b82f6','opacity="0.2"');
  /* liquid swirl */
  var mc=bil(f.top,.5,.5);
  s+='<circle cx="'+mc[0].toFixed(1)+'" cy="'+mc[1].toFixed(1)+'" r="5" fill="#3b82f6" opacity="0.15"><animate attributeName="r" values="3;8;3" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.15;0.3;0.15" dur="2s" repeatCount="indefinite"/></circle>';
  /* motor housing on top */
  s+='<rect x="'+(mc[0]-3.5).toFixed(1)+'" y="'+(mc[1]-7).toFixed(1)+'" width="7" height="7" rx="2" fill="#555" stroke="#444" stroke-width=".8" opacity="0.85"/>';
  s+='<circle cx="'+mc[0].toFixed(1)+'" cy="'+(mc[1]-3.5).toFixed(1)+'" r="1.5" fill="#22c55e" opacity="0.8"/>';
  /* shaft down into the vat */
  var sb=[isoX(a+.5,b+.5),isoY(a+.5,b+.5,.8)];
  s+=ln(mc,sb,'#999',1.5,'opacity="0.7"');
  /* rotating fin — two crossed blades with paddle tips */
  var fr=7;
  s+='<g>';
  s+='<line x1="'+(mc[0]-fr).toFixed(1)+'" y1="'+sb[1].toFixed(1)+'" x2="'+(mc[0]+fr).toFixed(1)+'" y2="'+sb[1].toFixed(1)+'" stroke="#ddd" stroke-width="2.5" stroke-linecap="round" opacity="0.85"><animateTransform attributeName="transform" type="rotate" from="0 '+mc[0]+' '+sb[1]+'" to="360 '+mc[0]+' '+sb[1]+'" dur="1.8s" repeatCount="indefinite"/></line>';
  s+='<line x1="'+mc[0].toFixed(1)+'" y1="'+(sb[1]-fr).toFixed(1)+'" x2="'+mc[0].toFixed(1)+'" y2="'+(sb[1]+fr).toFixed(1)+'" stroke="#ddd" stroke-width="2.5" stroke-linecap="round" opacity="0.85"><animateTransform attributeName="transform" type="rotate" from="0 '+mc[0]+' '+sb[1]+'" to="360 '+mc[0]+' '+sb[1]+'" dur="1.8s" repeatCount="indefinite"/></line>';
  s+='<rect x="'+(mc[0]-fr-2.5).toFixed(1)+'" y="'+(sb[1]-2).toFixed(1)+'" width="5" height="4" rx="1" fill="#bbb" opacity="0.7"><animateTransform attributeName="transform" type="rotate" from="0 '+mc[0]+' '+sb[1]+'" to="360 '+mc[0]+' '+sb[1]+'" dur="1.8s" repeatCount="indefinite"/></rect>';
  s+='<rect x="'+(mc[0]+fr-2.5).toFixed(1)+'" y="'+(sb[1]-2).toFixed(1)+'" width="5" height="4" rx="1" fill="#bbb" opacity="0.7"><animateTransform attributeName="transform" type="rotate" from="0 '+mc[0]+' '+sb[1]+'" to="360 '+mc[0]+' '+sb[1]+'" dur="1.8s" repeatCount="indefinite"/></rect>';
  s+='<rect x="'+(mc[0]-2).toFixed(1)+'" y="'+(sb[1]-fr-2.5).toFixed(1)+'" width="4" height="5" rx="1" fill="#bbb" opacity="0.7"><animateTransform attributeName="transform" type="rotate" from="0 '+mc[0]+' '+sb[1]+'" to="360 '+mc[0]+' '+sb[1]+'" dur="1.8s" repeatCount="indefinite"/></rect>';
  s+='<rect x="'+(mc[0]-2).toFixed(1)+'" y="'+(sb[1]+fr-2.5).toFixed(1)+'" width="4" height="5" rx="1" fill="#bbb" opacity="0.7"><animateTransform attributeName="transform" type="rotate" from="0 '+mc[0]+' '+sb[1]+'" to="360 '+mc[0]+' '+sb[1]+'" dur="1.8s" repeatCount="indefinite"/></rect>';
  s+='</g>';
  /* pipe connection stubs — 4 directions at pipe height */
  var ph=0.7,t=(Date.now()/600)%1,do2=9*(1-t);
  var stubs=[
    [[isoX(a,b+.5),isoY(a,b+.5,ph)],[isoX(a+.22,b+.5),isoY(a+.22,b+.5,ph)]],
    [[isoX(a+1,b+.5),isoY(a+1,b+.5,ph)],[isoX(a+.78,b+.5),isoY(a+.78,b+.5,ph)]],
    [[isoX(a+.5,b),isoY(a+.5,b,ph)],[isoX(a+.5,b+.22),isoY(a+.5,b+.22,ph)]],
    [[isoX(a+.5,b+1),isoY(a+.5,b+1,ph)],[isoX(a+.5,b+.78),isoY(a+.5,b+.78,ph)]]
  ];
  for(var si=0;si<stubs.length;si++){
    var p1=stubs[si][0],p2=stubs[si][1];
    s+=ln(p1,p2,'#2a2a2a',7)+ln(p1,p2,'#4a4a4a',5);
    s+='<line x1="'+p1[0].toFixed(1)+'" y1="'+p1[1].toFixed(1)+'" x2="'+p2[0].toFixed(1)+'" y2="'+p2[1].toFixed(1)+'" stroke="#3b82f6" stroke-width="3" stroke-dasharray="6 3" stroke-linecap="round" stroke-dashoffset="'+do2.toFixed(1)+'"/>';
  }
  /* support legs at corners */
  var lps=[[a+.12,b+.12],[a+.88,b+.12],[a+.12,b+.88],[a+.88,b+.88]];
  for(var li=0;li<4;li++){
    var lp=[isoX(lps[li][0],lps[li][1]),isoY(lps[li][0],lps[li][1],0)];
    s+='<rect x="'+(lp[0]-1.5).toFixed(1)+'" y="'+lp[1].toFixed(1)+'" width="3" height="5" rx=".5" fill="#3a3a3a" opacity="0.6"/>';
  }
  return s}},
ctower:{name:'Cool Tower',h:4.2,gen:function(a,b){
  var f=boxFaces(a,b,4.2);
  var s=poly(f.left,'#5a6a7a','stroke="#4a5a6a" stroke-width="0.5"')+poly(f.right,'#6a7a8a','stroke="#5a6a7a" stroke-width="0.5"')+poly(f.top,'#7a8a9a','stroke="#6a7a8a" stroke-width="0.5"');
  for(var bi=0;bi<3;bi++){var bp=bil(f.left,.05+bi*.32,.5);s+=ln([bp[0]-2,bp[1]],[bp[0]+2,bp[1]],'#4a5a6a',1.5,'opacity="0.5"');}
  var tc=bil(f.top,.5,.5);
  s+='<ellipse cx="'+tc[0].toFixed(1)+'" cy="'+(tc[1]-5).toFixed(1)+'" rx="9" ry="4" fill="#aaccee" opacity="0.06"><animate attributeName="ry" values="4;7;4" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.06;0.14;0.06" dur="3s" repeatCount="indefinite"/></ellipse>';
  s+='<ellipse cx="'+tc[0].toFixed(1)+'" cy="'+(tc[1]-10).toFixed(1)+'" rx="6" ry="3" fill="#aaccee" opacity="0.04"><animate attributeName="ry" values="3;5;3" dur="4s" begin="1s" repeatCount="indefinite"/></ellipse>';
  s+='<ellipse cx="'+(tc[0]+3).toFixed(1)+'" cy="'+(tc[1]-14).toFixed(1)+'" rx="4" ry="2" fill="#aaccee" opacity="0.03"><animate attributeName="ry" values="2;4;2" dur="5s" begin="2s" repeatCount="indefinite"/></ellipse>';
  return s}},
storage:{name:'Storage',h:2.8,gen:function(a,b){
  var f=boxFaces(a,b,2.8);
  var s=poly(f.left,'#2a5a2a','stroke="#1a4a1a" stroke-width="0.5"')+poly(f.right,'#3a6a3a','stroke="#2a5a2a" stroke-width="0.5"')+poly(f.top,'#4a7a4a','stroke="#3a6a3a" stroke-width="0.5"');
  var lc=bil(f.left,.5,.35);
  s+='<rect x="'+(lc[0]-2).toFixed(1)+'" y="'+(lc[1]-6).toFixed(1)+'" width="4" height="12" rx="1" fill="#1a3a1a" stroke="#22c55e" stroke-width=".5" opacity="0.8"/>';
  s+='<rect x="'+(lc[0]-1.5).toFixed(1)+'" y="'+(lc[1]-2).toFixed(1)+'" width="3" height="7" rx=".5" fill="#22c55e" opacity="0.5"><animate attributeName="y" values="'+(lc[1]-2).toFixed(1)+';'+(lc[1]-5).toFixed(1)+';'+(lc[1]-2).toFixed(1)+'" dur="6s" repeatCount="indefinite"/><animate attributeName="height" values="7;3;7" dur="6s" repeatCount="indefinite"/></rect>';
  return s}},
pump:{name:'Pump',h:0.9,gen:function(a,b){
  var f=boxFaces(a,b,0.9);
  var s=poly(f.left,'#5a5a5a','stroke="#4a4a4a" stroke-width="0.5"')+poly(f.right,'#6a6a6a','stroke="#5a5a5a" stroke-width="0.5"')+poly(f.top,'#7a7a7a','stroke="#6a6a6a" stroke-width="0.5"');
  var mc=bil(f.top,.5,.5);
  s+='<circle cx="'+mc[0].toFixed(1)+'" cy="'+(mc[1]-3).toFixed(1)+'" r="5" fill="#444" stroke="#333" stroke-width="1" opacity="0.8"/>';
  s+='<line x1="'+(mc[0]-3).toFixed(1)+'" y1="'+(mc[1]-3).toFixed(1)+'" x2="'+(mc[0]+3).toFixed(1)+'" y2="'+(mc[1]-3).toFixed(1)+'" stroke="#f97316" stroke-width="1.5" opacity="0.8"><animateTransform attributeName="transform" type="rotate" from="0 '+mc[0]+' '+(mc[1]-3).toFixed(1)+'" to="360 '+mc[0]+' '+(mc[1]-3).toFixed(1)+'" dur="0.5s" repeatCount="indefinite"/></line>';
  s+='<circle cx="'+(mc[0]+5).toFixed(1)+'" cy="'+(mc[1]-1).toFixed(1)+'" r="1.5" fill="#22c55e" opacity="0.8"/>';
  return s}},
drum:{name:'Drum',h:1.3,gen:function(a,b){
  var f=boxFaces(a,b,1.3);
  var cols=[['#2a6a9a','#3a7aaa','#4a8aba'],['#9a6a2a','#aa7a3a','#ba8a4a'],['#6a2a6a','#7a3a7a','#8a4a8a'],['#2a6a4a','#3a7a5a','#4a8a6a']];
  var c=cols[(a+b)%cols.length];
  var s=poly(f.left,c[0],'stroke="'+c[0]+'" stroke-width="0.5"')+poly(f.right,c[1],'stroke="'+c[1]+'" stroke-width="0.5"')+poly(f.top,c[2],'stroke="'+c[2]+'" stroke-width="0.5"');
  var sc=bil(f.left,.5,.5);
  s+=ln([sc[0],sc[1]-5],[sc[0],sc[1]+5],'#f0c020',2.5,'opacity="0.6"');
  s+=ln([sc[0],sc[1]-2],[sc[0],sc[1]+2],'#222',1.5,'opacity="0.3"');
  return s}},
worker:{name:'Worker',h:0,isWalker:true,gen:function(a,b,rot){
  var c=[isoX(a+.5,b+.5),isoY(a+.5,b+.5)];
  var wb=[['#e85a00','#c04800','#1a1a1a','#f0d0a0'],['#e85a00','#c04800','#1a1a1a','#f0d0a0'],['#e8c020','#b8a018','#1a1a1a','#f0d0a0'],['#d04020','#a83018','#1a1a1a','#f0d0a0']];
  var col=wb[(a*3+b+(rot||0))%wb.length],x=c[0],y=c[1]-2;
  return'<g><ellipse cx="'+x.toFixed(1)+'" cy="'+(y+15).toFixed(1)+'" rx="7.5" ry="2.8" fill="#000" opacity="0.16"/>'+'<ellipse cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" rx="5.5" ry="8.5" fill="'+col[0]+'"/>'+'<circle cx="'+x.toFixed(1)+'" cy="'+(y-12).toFixed(1)+'" r="4.5" fill="'+col[3]+'"/>'+'<ellipse cx="'+x.toFixed(1)+'" cy="'+(y-15).toFixed(1)+'" rx="5" ry="2.5" fill="'+col[1]+'"/>'+'<line x1="'+(x-5.5).toFixed(1)+'" y1="'+(y-2).toFixed(1)+'" x2="'+(x-9).toFixed(1)+'" y2="'+(y+3).toFixed(1)+'" stroke="'+col[2]+'" stroke-width="2.5"/>'+'<line x1="'+(x+5.5).toFixed(1)+'" y1="'+(y-2).toFixed(1)+'" x2="'+(x+9).toFixed(1)+'" y2="'+(y+3).toFixed(1)+'" stroke="'+col[2]+'" stroke-width="2.5"/>'+'<line x1="'+(x-2.5).toFixed(1)+'" y1="'+(y+7).toFixed(1)+'" x2="'+(x-3).toFixed(1)+'" y2="'+(y+15).toFixed(1)+'" stroke="'+col[2]+'" stroke-width="2.5"/>'+'<line x1="'+(x+2.5).toFixed(1)+'" y1="'+(y+7).toFixed(1)+'" x2="'+(x+3).toFixed(1)+'" y2="'+(y+15).toFixed(1)+'" stroke="'+col[2]+'" stroke-width="2.5"/></g>'}},
sign:{name:'Sign',h:0,gen:function(a,b,rot,text){
  var c=[isoX(a+.5,b+.5),isoY(a+.5,b+.5,2.6)],t=(text||'BAY').toUpperCase(),w=Math.max(46,t.length*7.4+18);
  return'<g transform="translate('+c[0].toFixed(1)+','+c[1].toFixed(1)+')"><line x1="0" y1="-2" x2="0" y2="10" stroke="#909090" stroke-width="1" opacity="0.5"/>'+'<rect x="'+(-w/2).toFixed(1)+'" y="-13" width="'+w.toFixed(1)+'" height="22" rx="4" fill="#0a2a3a" opacity="0.94"/>'+'<text x="0" y="2.5" text-anchor="middle" font-family=Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" font-size="10" font-weight="bold" fill="#22c55e" letter-spacing="0.5">'+t+'</text></g>'}}
};
var ORDER_CHEM=['pipe_x','pipe_y','pipe_cr','pipe_cl','reactor','mixer','vat_mixer','ctower','storage','pump','drum','worker','sign'];
var HOTKEY_CHEM={'1':'pipe_x','2':'pipe_y','3':'pipe_cr','4':'reactor','5':'mixer','6':'vat_mixer','7':'ctower','8':'storage','9':'pump'};

function loadChemical(){
  var d=[
    {type:'sign',gx:6,gy:8,rot:0,text:'PLANT C'},
    /* === TOP ROW: REACTORS (left) & COOLING TOWERS (right) === */
    {type:'reactor',gx:0,gy:0},{type:'reactor',gx:1,gy:0},{type:'reactor',gx:2,gy:0},
    {type:'ctower',gx:9,gy:0},{type:'ctower',gx:10,gy:0},{type:'ctower',gx:11,gy:0},
    /* === VERTICAL PIPES DOWN FROM TOP EQUIPMENT === */
    {type:'pipe_y',gx:0,gy:1},{type:'pipe_y',gx:1,gy:1},{type:'pipe_y',gx:2,gy:1},
    {type:'pipe_y',gx:9,gy:1},{type:'pipe_y',gx:10,gy:1},{type:'pipe_y',gx:11,gy:1},
    /* === FIRST HORIZONTAL PIPE RUN — vat_mixers at crossings (gx 3,6,9) === */
    {type:'pipe_x',gx:0,gy:2},{type:'pipe_x',gx:1,gy:2},{type:'pipe_x',gx:2,gy:2},
    {type:'vat_mixer',gx:3,gy:2},
    {type:'pipe_x',gx:4,gy:2},{type:'pipe_x',gx:5,gy:2},
    {type:'vat_mixer',gx:6,gy:2},
    {type:'pipe_x',gx:7,gy:2},{type:'pipe_x',gx:8,gy:2},
    {type:'vat_mixer',gx:9,gy:2},
    {type:'pipe_x',gx:10,gy:2},{type:'pipe_x',gx:11,gy:2},
    /* === VERTICAL PIPES BETWEEN ROWS === */
    {type:'pipe_y',gx:3,gy:3},{type:'pipe_y',gx:6,gy:3},{type:'pipe_y',gx:9,gy:3},
    /* === PUMPS ALONG THE MID-RIB === */
    {type:'pump',gx:4,gy:3},{type:'pump',gx:8,gy:3},
    /* === MORE VERTICAL PIPES === */
    {type:'pipe_y',gx:3,gy:4},{type:'pipe_y',gx:6,gy:4},{type:'pipe_y',gx:9,gy:4},
    /* === SECOND HORIZONTAL PIPE RUN — vat_mixers at crossings (gx 3,6,9) === */
    {type:'pipe_x',gx:0,gy:5},{type:'pipe_x',gx:1,gy:5},{type:'pipe_x',gx:2,gy:5},
    {type:'vat_mixer',gx:3,gy:5},
    {type:'pipe_x',gx:4,gy:5},{type:'pipe_x',gx:5,gy:5},
    {type:'vat_mixer',gx:6,gy:5},
    {type:'pipe_x',gx:7,gy:5},{type:'pipe_x',gx:8,gy:5},
    {type:'vat_mixer',gx:9,gy:5},
    {type:'pipe_x',gx:10,gy:5},{type:'pipe_x',gx:11,gy:5},
    /* === VERTICAL PIPES DOWN TO STORAGE === */
    {type:'pipe_y',gx:3,gy:6},{type:'pipe_y',gx:6,gy:6},{type:'pipe_y',gx:9,gy:6},
    /* === STORAGE TANKS === */
    {type:'storage',gx:1,gy:7},{type:'storage',gx:5,gy:7},{type:'storage',gx:10,gy:7},
    /* === DRUMS === */
    {type:'drum',gx:0,gy:8},{type:'drum',gx:3,gy:8},{type:'drum',gx:6,gy:8},{type:'drum',gx:9,gy:8},
    /* === WORKERS === */
    {type:'worker',gx:2,gy:3,rot:0},{type:'worker',gx:8,gy:7,rot:1}
  ];
  pieces=d.map(function(p){return Object.assign({},p,{id:uid++})});
}
