const fs=require('fs');
global.window=global; global.self=global;
let lastImg=null;
const ctx={createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),putImageData:(img)=>{lastImg=img;},drawImage(){},getImageData(){return{data:[]}}};
global.document={createElement:()=>({setAttribute(){},getContext:()=>ctx}),addEventListener(){}};
global.addEventListener=()=>{};
global.localStorage={getItem:()=>null,setItem(){}};
const files=['util','core','arm','thumb','mmu','io','audio','video','video/proxy','video/software','irq','keypad','sio','savedata','gpio','gba'];
let src=files.map(f=>fs.readFileSync('gbajs/js/'+f+'.js','utf8')).join('\n');
src+='\nglobal.GameBoyAdvance=GameBoyAdvance;';
(0,eval)(src);
const gba=new GameBoyAdvance();
gba.logLevel=gba.LOG_ERROR;
gba.setCanvasDirect({getContext:()=>ctx});
const bios=fs.readFileSync('gbajs/resources/bios.bin');
gba.setBios(bios.buffer.slice(bios.byteOffset,bios.byteOffset+bios.length));
const rom=fs.readFileSync('../dist/BulletStormRaiden_v0.1.gba');
console.log('setRom',gba.setRom(rom.buffer.slice(rom.byteOffset,rom.byteOffset+rom.length)));
const K={A:0,B:1,SEL:2,START:3,R:4,L:5,U:6,D:7};
function frames(n,keys=[]){for(let i=0;i<n;i++){let m=0x3FF;keys.forEach(k=>m&=~(1<<k));gba.keypad.currentDown=m;gba.advanceFrame();}}
function dump(name){const {width,height,data}=lastImg;const out=Buffer.alloc(width*height*3);for(let i=0;i<width*height;i++){out[i*3]=data[i*4];out[i*3+1]=data[i*4+1];out[i*3+2]=data[i*4+2];}fs.writeFileSync('/tmp/'+name+'.rgb',out);console.log('dumped',name,width,height);}
let t=Date.now();
frames(240);dump('g_title');
console.log('240 frames ms',Date.now()-t);
const seq=[[10,['START']],[30,[]],[5,['A']],[30,[]],[5,['A']],[30,[]],[5,['A']],[30,[]],[5,['A']],[30,[]],[5,['START']],[30,[]],[5,['START']],[30,[]],[5,['START']],[200,['A']]];
for(const [n,k] of seq) frames(n,k);
dump('g_play');
frames(300,['A','U']);dump('g_play2');
