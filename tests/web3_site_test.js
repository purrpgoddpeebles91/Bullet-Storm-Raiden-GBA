// Headless check of site/ (web v3). Needs: chromium + puppeteer-core (npm i puppeteer-core) ; serve site/ on :8766.
// node tests/web3_site_test.js [outdir]
const P=require(process.env.PUPPETEER||'/tmp/pt/node_modules/puppeteer-core');
const out=process.argv[2]||__dirname+'/../dist/screens';
const URL='http://localhost:8766/index.html';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await P.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-webgpu','--enable-features=Vulkan,WebGPU','--use-webgpu-adapter=swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required','--enable-unsafe-swiftshader','--disable-vulkan-surface','--use-vulkan=swiftshader']});
 const pg=await b.newPage();
 const logs=[];pg.on('console',m=>logs.push(m.type()+': '+m.text()));pg.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
 await pg.setViewport({width:430,height:932,deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await pg.goto(URL);await sleep(1500);
 await pg.screenshot({path:out+'/web3_01_phone_poweroff.png'});
 const info0=await pg.evaluate(()=>BSRAppInstance.info());console.log('info0',JSON.stringify(info0));
 // tap the screen to start
 const dev=await pg.$('.bsr-device');const box=await dev.boundingBox();
 await pg.touchscreen.tap(box.x+box.width/2,box.y+box.height*0.25);
 await sleep(4000);
 await pg.screenshot({path:out+'/web3_02_phone_title.png'});
 console.log('started',await pg.evaluate(()=>BSRPlayer.isStarted()));
 // input test: map zone coordinates to page px and press via CDP touch events
 const S=await pg.evaluate(()=>{const s=BSRAppInstance.shell();return {W:s.W,H:s.H,m:s.meta,z:s.zones}});
 const toPx=(x,y)=>({x:box.x+x/S.W*box.width,y:box.y+y/S.H*box.height});
 const cdp=await pg.target().createCDPSession();
 async function touch(type,pts){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map((p,i)=>({x:p.x,y:p.y,id:p.id??i}))});}
 const held=()=>pg.evaluate(()=>BSRPlayer.held());
 const dp=S.m.dpad.c, a=S.m.a, bb=S.m.b;
 let r={};
 // D-pad right + A simultaneously (multi-touch)
 const pR=toPx(dp[0]+90,dp[1]), pA=toPx(a[0],a[1]);
 await touch('touchStart',[{...pR,id:1}]);await touch('touchStart',[{...pR,id:1},{...pA,id:2}]);await sleep(60);
 r.rightPlusA=await held();
 // slide d-pad finger to up-left diagonal
 const pUL=toPx(dp[0]-70,dp[1]-70);
 await touch('touchMove',[{...pUL,id:1},{...pA,id:2}]);await sleep(40);r.upLeftPlusA=await held();
 await touch('touchEnd',[]);await sleep(20);r.afterQuickRelease=await held();await sleep(150);r.afterHold=await held();
 // quick tap on B: must stay down >=100ms
 const pB=toPx(bb[0],bb[1]);await touch('touchStart',[{...pB,id:3}]);await touch('touchEnd',[]);await sleep(30);r.bAt30ms=await held();await sleep(120);r.bAt150ms=await held();
 // L shoulder, start
 const L=S.z.find(z=>z.k==='L').rect;const pL=toPx(L[0]+L[2]/2,L[1]+L[3]/2);await touch('touchStart',[{...pL,id:4}]);await sleep(30);r.L=await held();await touch('touchEnd',[]);await sleep(150);
 console.log('input bits (A=1,B=2,SEL=4,START=8,RIGHT=16,LEFT=32,UP=64,DOWN=128,R=256,L=512):',JSON.stringify(r));
 // press START via shell to go into menus, screenshot with button pressed state visible
 const st=toPx(S.m.start[0],S.m.start[1]);await touch('touchStart',[{...st,id:5}]);await sleep(80);
 await pg.screenshot({path:out+'/web3_03_phone_start_pressed.png'});
 await touch('touchEnd',[]);await sleep(1500);
 await pg.screenshot({path:out+'/web3_04_phone_menu.png'});
 // settings panel
 await pg.evaluate(()=>BSRAppInstance.togglePanel());await sleep(800);
 await pg.screenshot({path:out+'/web3_05_phone_settings.png'});
 await pg.evaluate(()=>BSRAppInstance.togglePanel());
 console.log('info1',JSON.stringify(await pg.evaluate(()=>BSRAppInstance.info())));
 console.log('logs',logs.slice(0,20).join('\n'));
 setTimeout(()=>process.exit(0),500);b.close();
})();
