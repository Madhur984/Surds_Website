/* ===== SENSOR CONE SYSTEM ===== */
var SENSOR_DEFS=[
  {sec:1,gx:4,gy:0,gz:3,sR:120,dir:90,spread:85,color:'#f97316',label:'T-01'},
  {sec:1,gx:6.5,gy:0,gz:3,sR:110,dir:90,spread:80,color:'#f97316',label:'H-01'},
  {sec:1,gx:0,gy:2,gz:3,sR:95,dir:90,spread:70,color:'#fb923c',label:'T-02'},
  {sec:2,gx:4.5,gy:2,gz:3,sR:100,dir:90,spread:75,color:'#3b82f6',label:'C-01'},
  {sec:2,gx:6.5,gy:2,gz:3,sR:95,dir:90,spread:70,color:'#3b82f6',label:'C-02'},
  {sec:2,gx:3.2,gy:2,gz:3,sR:85,dir:90,spread:60,color:'#60a5fa',label:'C-03'},
  {sec:3,gx:0,gy:1,gz:3,sR:90,dir:90,spread:90,color:'#a855f7',label:'V-01'},
  {sec:3,gx:0,gy:3.5,gz:3,sR:85,dir:90,spread:85,color:'#a855f7',label:'V-02'},
  {sec:3,gx:0,gy:5,gz:3,sR:80,dir:90,spread:75,color:'#c084fc',label:'V-03'},
  {sec:4,gx:5.5,gy:4.2,gz:3,sR:140,dir:90,spread:120,color:'#ef4444',label:'AQ-01'},
  {sec:4,gx:2,gy:7,gz:3,sR:100,dir:90,spread:90,color:'#ef4444',label:'TH-01'},
  {sec:4,gx:5,gy:5.5,gz:3,sR:85,dir:90,spread:80,color:'#f87171',label:'TH-02'},
  {sec:5,gx:5.5,gy:4.5,gz:3,sR:300,dir:0,spread:360,color:'#22c55e',label:'ESG',isGlow:true}
];
var sensorStates=SENSOR_DEFS.map(function(){return{opacity:0,radius:0,tOp:0,tR:0}});

function coneScreen(cx,cy,screenR,dirDeg,spreadDeg,rScale){
  var r=Math.max(.1,screenR*rScale),pts=[[cx,cy]],steps=30;
  var sa=(dirDeg-spreadDeg/2)*Math.PI/180,ea=(dirDeg+spreadDeg/2)*Math.PI/180;
  for(var i=0;i<=steps;i++){var a=sa+(ea-sa)*(i/steps);pts.push([cx+r*Math.cos(a),cy+r*Math.sin(a)])}
  return pts
}
function gradientDefs(){
  var s='';for(var i=0;i<SENSOR_DEFS.length;i++){var sen=SENSOR_DEFS[i],cx=isoX(sen.gx,sen.gy),cy=isoY(sen.gx,sen.gy,sen.gz||0),r=sen.sR*1.15;
  if(sen.isGlow)s+='<radialGradient id="cg'+i+'" cx="'+cx+'" cy="'+cy+'" r="'+r+'" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="'+sen.color+'" stop-opacity="0.22"/><stop offset="50%" stop-color="'+sen.color+'" stop-opacity="0.08"/><stop offset="100%" stop-color="'+sen.color+'" stop-opacity="0"/></radialGradient>';
  else s+='<radialGradient id="cg'+i+'" cx="'+cx+'" cy="'+cy+'" r="'+r+'" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="'+sen.color+'" stop-opacity="0.55"/><stop offset="50%" stop-color="'+sen.color+'" stop-opacity="0.15"/><stop offset="100%" stop-color="'+sen.color+'" stop-opacity="0"/></radialGradient>'}
  return s
}
function sensorsSVG(){
  var s='';for(var i=0;i<SENSOR_DEFS.length;i++){var sen=SENSOR_DEFS[i],st=sensorStates[i];if(st.opacity<.008)continue;
  var cx=isoX(sen.gx,sen.gy),cy=isoY(sen.gx,sen.gy,sen.gz||0);
  s+='<g opacity="'+st.opacity.toFixed(3)+'">';
  if(sen.isGlow){s+=poly(coneScreen(cx,cy,sen.sR,0,360,st.radius),'url(#cg'+i+')')}
  else{var pts=coneScreen(cx,cy,sen.sR,sen.dir,sen.spread,st.radius);s+=poly(pts,'url(#cg'+i+')');
  s+=ln(pts[0],[pts[1][0],pts[1][1]],sen.color,1.5,'opacity="0.45" stroke-dasharray="4 3"');
  s+=ln(pts[0],[pts[pts.length-1][0],pts[pts.length-1][1]],sen.color,1.5,'opacity="0.45" stroke-dasharray="4 3"');
  var arc='';for(var j=1;j<pts.length;j++){if(j>1)arc+=' ';arc+=pts[j][0].toFixed(1)+','+pts[j][1].toFixed(1)}
  s+='<polyline points="'+arc+'" fill="none" stroke="'+sen.color+'" stroke-width=".8" opacity="0.25" stroke-dasharray="2 5"/>';
  var sa2=(sen.dir-sen.spread/2)*Math.PI/180,endX=cx+sen.sR*st.radius*Math.cos(sa2),endY=cy+sen.sR*st.radius*Math.sin(sa2);
  s+='<line x1="'+cx+'" y1="'+cy+'" x2="'+endX.toFixed(1)+'" y2="'+endY.toFixed(1)+'" stroke="'+sen.color+'" stroke-width="1.8" opacity="0.5" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="'+(sen.dir-sen.spread/2).toFixed(1)+' '+cx+' '+cy+'" to="'+(sen.dir+sen.spread/2).toFixed(1)+' '+cx+' '+cy+'" dur="3s" repeatCount="indefinite"/></line>'}
  /* ceiling mount indicator: bracket on ceiling + drop line to sensor */
  var ceilY=cy-8;
  s+='<line x1="'+(cx-6).toFixed(1)+'" y1="'+ceilY.toFixed(1)+'" x2="'+(cx+6).toFixed(1)+'" y2="'+ceilY.toFixed(1)+'" stroke="'+sen.color+'" stroke-width="2" opacity="0.6" stroke-linecap="round"/>';
  s+='<line x1="'+cx.toFixed(1)+'" y1="'+ceilY.toFixed(1)+'" x2="'+cx.toFixed(1)+'" y2="'+cy.toFixed(1)+'" stroke="'+sen.color+'" stroke-width="1" opacity="0.35" stroke-dasharray="2 2"/>';
  /* sensor dot + pulse rings */
  s+='<circle cx="'+cx+'" cy="'+cy+'" r="4.5" fill="'+sen.color+'"/>';
  s+='<circle cx="'+cx+'" cy="'+cy+'" r="4.5" fill="none" stroke="'+sen.color+'" stroke-width="1.5"><animate attributeName="r" from="4.5" to="18" dur="2.2s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.65" to="0" dur="2.2s" repeatCount="indefinite"/></circle>';
  s+='<circle cx="'+cx+'" cy="'+cy+'" r="4.5" fill="none" stroke="'+sen.color+'" stroke-width="1"><animate attributeName="r" from="4.5" to="13" dur="2.2s" begin="1.1s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.4" to="0" dur="2.2s" begin="1.1s" repeatCount="indefinite"/></circle>';
  s+='<text x="'+cx+'" y="'+(ceilY-6)+'" text-anchor="middle" font-family=Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" font-size="7.5" font-weight="bold" fill="'+sen.color+'" opacity="0.9">'+sen.label+'</text>';
  s+='</g>'}return s
}

/* ===== CHEMICAL PROCESS-DURATION BADGES ===== */
var PROCESS_BADGES=[
  {gx:1,gy:0,h:3.5,label:'Reactor · Cook',duration:'42 min',color:'#3b82f6'},
  {gx:6,gy:2,h:2.2,label:'Vat Mixer · Blend',duration:'65 min',color:'#ef4444',bottleneck:true},
  {gx:10,gy:0,h:4.2,label:'Cool Tower · Cooldown',duration:'28 min',color:'#22c55e'}
];
function processBadgesSVG(){
  if(currentTheme!=='chemical')return'';
  var s='';
  for(var i=0;i<PROCESS_BADGES.length;i++){
    var b=PROCESS_BADGES[i];
    var topX=isoX(b.gx+.5,b.gy+.5),topY=isoY(b.gx+.5,b.gy+.5,b.h);
    var cx=topX,cy=topY-34,w=b.bottleneck?128:106;
    s+='<g>';
    s+='<line x1="'+topX.toFixed(1)+'" y1="'+topY.toFixed(1)+'" x2="'+cx.toFixed(1)+'" y2="'+(cy+15).toFixed(1)+'" stroke="'+b.color+'" stroke-width="1" opacity="0.4" stroke-dasharray="2 2"/>';
    if(b.bottleneck){
      s+='<circle cx="'+cx.toFixed(1)+'" cy="'+cy.toFixed(1)+'" r="14" fill="none" stroke="'+b.color+'" stroke-width="1.5" opacity="0.4"><animate attributeName="r" from="14" to="26" dur="2.2s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.45" to="0" dur="2.2s" repeatCount="indefinite"/></circle>';
    }
    s+='<rect x="'+(cx-w/2).toFixed(1)+'" y="'+(cy-15).toFixed(1)+'" width="'+w+'" height="30" rx="7" fill="#0a1a2a" opacity="0.92" stroke="'+b.color+'" stroke-width="1.2"/>';
    s+='<text x="'+cx.toFixed(1)+'" y="'+(cy-3).toFixed(1)+'" text-anchor="middle" font-family=Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" font-size="7.5" font-weight="600" fill="#cbd5e1">'+b.label+'</text>';
    s+='<text x="'+cx.toFixed(1)+'" y="'+(cy+9).toFixed(1)+'" text-anchor="middle" font-family=Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" font-size="11" font-weight="bold" fill="'+b.color+'">'+b.duration+(b.bottleneck?' ⚠':'')+'</text>';
    s+='</g>'
  }
  return s
}
