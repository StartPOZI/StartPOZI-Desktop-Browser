(function(){
var _t=function(s){return window.i18n&&window.i18n.t?window.i18n.t(s):s};
var p=new URLSearchParams(location.search);
var code=(p.get('code')||'').toUpperCase();
var eurl=p.get('url')||'';
var desc=p.get('desc')||'';
var T={'ERR_INTERNET_DISCONNECTED':'No internet','ERR_NETWORK_CHANGED':'Network changed','ERR_CONNECTION_REFUSED':'Server refused','ERR_CONNECTION_TIMED_OUT':'Timed out','ERR_NAME_NOT_RESOLVED':'Could not find the server','ERR_CONNECTION_RESET':'Connection reset','ERR_SSL_PROTOCOL_ERROR':'Security error','NOTFOUND':'Page not found','CRASHED':'Page crashed','DNS_REBIND':'Blocked: DNS rebinding'};
var M={'ERR_INTERNET_DISCONNECTED':'Check your internet connection.','ERR_NETWORK_CHANGED':'Network connection changed.','ERR_CONNECTION_REFUSED':'Server refused the connection.','ERR_CONNECTION_TIMED_OUT':'Server is taking too long to respond.','ERR_NAME_NOT_RESOLVED':'Could not resolve the server address.','ERR_CONNECTION_RESET':'Connection to the server was reset.','ERR_SSL_PROTOCOL_ERROR':'Could not establish a secure connection.','NOTFOUND':'The requested page does not exist.','CRASHED':'The page process crashed twice and could not recover. Try reloading.','DNS_REBIND':'This site resolves to a local/private network address — a classic attack on your router and home devices. If you trust it, disable "DNS rebinding protection" in Settings → Security.'};
var k;for(k in T)if(code.indexOf(k)===0){code=k;break}
document.getElementById('et').textContent=T[code]||'Could not load the page';
document.getElementById('em').textContent=M[code]||desc||'An unknown error occurred.';
var _dec;try{_dec=decodeURIComponent(eurl)}catch(_){_dec=eurl}
document.getElementById('eu').textContent=_dec;
document.getElementById('rb').addEventListener('click',function(){if(window.electronAPI&&window.electronAPI._retryUrl)window.electronAPI._retryUrl(eurl);else if(eurl)location.href=eurl;else location.reload()});

// ===== BREAKOUT GAME (delta-time) =====
var c=document.getElementById('gc'),ctx=c.getContext('2d');
var W,H,dpr;
function resize(){
  var r=c.getBoundingClientRect();
  dpr=window.devicePixelRatio||1;
  c.width=r.width*dpr;c.height=r.height*dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  W=r.width;H=r.height;
}
resize();window.addEventListener('resize',resize);

var best=parseInt(localStorage.getItem('_err_brk')||'0',10);
document.getElementById('gs').textContent=_t('Best: ')+best;

var paddle,paddleW=80,ball,bricks,particles,running,dead,score,lives,level;
var BASE_SPEED=200;

var COLORS=['#2196f3','#42a5f5','#64b5f6','#90caf9','#4fc3f7','#29b6f6','#03a9f4','#039be5'];
var ROWS=5,COLS=9,BRICK_PAD=4,BRICK_H=16;

function init(){
  paddleW=80;
  paddle={x:W/2-paddleW/2,y:H-24,w:paddleW,h:10};
  var r=Math.min(W*0.022,8);
  ball={x:W/2,y:H-40,r:r,dx:0,dy:0,speed:BASE_SPEED};
  bricks=[];particles=[];
  var bw=(W-BRICK_PAD*(COLS+1))/COLS;
  var topY=30;
  for(var row=0;row<ROWS;row++){
    for(var col=0;col<COLS;col++){
      bricks.push({x:BRICK_PAD+col*(bw+BRICK_PAD),y:topY+row*(BRICK_H+BRICK_PAD),w:bw,h:BRICK_H,alive:true,color:COLORS[row%COLORS.length],hits:row<2?2:1});
    }
  }
  score=0;lives=3;running=false;dead=false;level=1;
}

function resetBall(){
  ball.x=W/2;ball.y=H-40;
  var angle=Math.PI*0.25+Math.random()*Math.PI*0.5;
  ball.dx=ball.speed*Math.cos(angle)*(Math.random()>.5?1:-1);
  ball.dy=-ball.speed*Math.abs(Math.sin(angle));
}

function spawnParticles(x,y,color,n){
  for(var i=0;i<n;i++){
    particles.push({x:x,y:y,vx:(Math.random()-.5)*200,vy:(Math.random()-.5)*200,life:0.5,maxLife:0.5,color:color});
  }
}

var mouseX=W/2;
c.addEventListener('mousemove',function(e){var r=c.getBoundingClientRect();mouseX=e.clientX-r.left});
c.addEventListener('touchmove',function(e){e.preventDefault();var r=c.getBoundingClientRect();mouseX=e.touches[0].clientX-r.left},{passive:false});
c.addEventListener('click',function(){if(!running&&!dead){running=true;resetBall()}if(dead){init()}});

function update(dt){
  if(!running)return;
  paddle.x=Math.max(0,Math.min(W-paddle.w,mouseX-paddle.w/2));

  ball.x+=ball.dx*dt;
  ball.y+=ball.dy*dt;

  if(ball.x-ball.r<0){ball.x=ball.r;ball.dx=Math.abs(ball.dx)}
  if(ball.x+ball.r>W){ball.x=W-ball.r;ball.dx=-Math.abs(ball.dx)}
  if(ball.y-ball.r<0){ball.y=ball.r;ball.dy=Math.abs(ball.dy)}

  if(ball.y+ball.r>H){
    lives--;
    if(lives<=0){running=false;dead=true;if(score>best){best=score;localStorage.setItem('_err_brk',''+best);document.getElementById('gs').textContent=_t('Best: ')+best}spawnParticles(ball.x,ball.y,'#ff6b6b',20);return}
    running=false;
    setTimeout(function(){running=true;resetBall()},400);
    return;
  }

  if(ball.dy>0&&ball.y+ball.r>=paddle.y&&ball.y+ball.r<=paddle.y+paddle.h+ball.dy*dt&&ball.x>=paddle.x-ball.r&&ball.x<=paddle.x+paddle.w+ball.r){
    var hit=(ball.x-(paddle.x+paddle.w/2))/(paddle.w/2);
    var angle=hit*Math.PI*0.35;
    var spd=Math.sqrt(ball.dx*ball.dx+ball.dy*ball.dy);
    ball.dx=spd*Math.sin(angle);
    ball.dy=-spd*Math.cos(angle);
    ball.y=paddle.y-ball.r;
    spawnParticles(ball.x,ball.y,'#42a5f5',4);
  }

  for(var i=0;i<bricks.length;i++){
    var b=bricks[i];
    if(!b.alive)continue;
    if(ball.x+ball.r>b.x&&ball.x-ball.r<b.x+b.w&&ball.y+ball.r>b.y&&ball.y-ball.r<b.y+b.h){
      b.hits--;
      if(b.hits<=0){b.alive=false;score+=10;spawnParticles(b.x+b.w/2,b.y+b.h/2,b.color,8)}
      else{b.color='#fff';score+=3;spawnParticles(b.x+b.w/2,b.y+b.h/2,b.color,3)}
      var ox=Math.min(Math.abs(ball.x+ball.r-b.x),Math.abs(ball.x-ball.r-b.x-b.w));
      var oy=Math.min(Math.abs(ball.y+ball.r-b.y),Math.abs(ball.y-ball.r-b.y-b.h));
      if(ox<oy)ball.dx=-ball.dx;else ball.dy=-ball.dy;
      break;
    }
  }

  if(bricks.every(function(b){return!b.alive})){
    level++;ROWS=Math.min(ROWS+1,8);ball.speed+=30;paddleW=Math.max(50,paddleW-5);paddle.w=paddleW;
    init();running=true;resetBall();
  }

  for(var i=particles.length-1;i>=0;i--){
    var pp=particles[i];
    pp.x+=pp.vx*dt;pp.y+=pp.vy*dt;pp.vy+=600*dt;pp.life-=dt;
    if(pp.life<=0)particles.splice(i,1);
  }
}

function draw(){
  ctx.clearRect(0,0,W,H);
  for(var i=0;i<bricks.length;i++){
    var b=bricks[i];if(!b.alive)continue;
    ctx.fillStyle=b.color;
    ctx.beginPath();ctx.roundRect(b.x,b.y,b.w,b.h,3);ctx.fill();
  }
  ctx.fillStyle='#2196f3';
  ctx.beginPath();ctx.roundRect(paddle.x,paddle.y,paddle.w,paddle.h,5);ctx.fill();
  ctx.fillStyle='rgba(33,150,243,0.3)';
  ctx.beginPath();ctx.roundRect(paddle.x+4,paddle.y+2,paddle.w-8,3,2);ctx.fill();
  ctx.fillStyle='#e0e0e0';
  ctx.beginPath();ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.3)';
  ctx.beginPath();ctx.arc(ball.x-ball.r*0.3,ball.y-ball.r*0.3,ball.r*0.35,0,Math.PI*2);ctx.fill();
  for(var i=0;i<particles.length;i++){
    var pp=particles[i];ctx.globalAlpha=Math.max(0,pp.life/pp.maxLife);ctx.fillStyle=pp.color;
    ctx.fillRect(pp.x-2,pp.y-2,4,4);
  }
  ctx.globalAlpha=1;
  ctx.fillStyle='#42a5f5';ctx.font='bold 13px sans-serif';ctx.textAlign='left';ctx.fillText(_t('Score: ')+score,8,18);
  ctx.textAlign='right';ctx.fillText(_t('Lives: ')+'♥'.repeat(lives),W-8,18);
  if(level>1){ctx.textAlign='center';ctx.fillStyle='#4a5568';ctx.font='11px sans-serif';ctx.fillText(_t('Level ')+level,W/2,18)}
  if(!running&&!dead){
    ctx.fillStyle='rgba(13,13,26,0.5)';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#e0e0e0';ctx.font='bold 16px sans-serif';ctx.textAlign='center';
    ctx.fillText(_t('Click to start'),W/2,H/2);
    ctx.fillStyle='#4a5568';ctx.font='12px sans-serif';
    ctx.fillText(_t('Control the paddle with the mouse'),W/2,H/2+22);
  }
  if(dead){
    ctx.fillStyle='rgba(13,13,26,0.6)';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#ff6b6b';ctx.font='bold 20px sans-serif';ctx.textAlign='center';
    ctx.fillText(_t('Game over'),W/2,H/2-12);
    ctx.fillStyle='#8892a4';ctx.font='14px sans-serif';
    ctx.fillText(_t('Score: ')+score,W/2,H/2+12);
    ctx.fillStyle='#4a5568';ctx.font='12px sans-serif';
    ctx.fillText(_t('Click to restart'),W/2,H/2+32);
  }
}

var lastTime=0;
function loop(ts){
  var dt=Math.min((ts-lastTime)/1000,0.05);
  lastTime=ts;
  update(dt);draw();
  requestAnimationFrame(loop);
}
init();requestAnimationFrame(function(ts){lastTime=ts;loop(ts)});
})();
