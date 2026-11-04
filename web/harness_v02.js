// Headless gbajs check for v0.2: node harness_v02.js [rom] [outdir]  -> raw .rgb dumps (convert with Pillow)
const fs=require('fs');
global.window=global; global.self=global;
let lastImg=null;
const ctx={createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),putImageData:(img)=>{lastImg=img;},drawImage(){},getImageData(){return{data:[]}}};
global.document={createElement:()=>({setAttribute(){},getContext:()=>ctx}),addEventListener(){}};
global.addEventListener=()=>{};
global.localStorage={getItem:()=>null,setItem(){}};
const files=['util','core','arm','thumb','mmu','io','audio','video','video/proxy','video/software','irq','keypad','sio','savedata','gpio','gba'];
let src=files.map(f=>fs.readFileSync(__dirname+'/gbajs/js/'+f+'.js','utf8')).join('\n');
src+='\nglobal.GameBoyAdvance=GameBoyAdvance;';
(0,eval)(src);
const gba=new GameBoyAdvance();
gba.logLevel=gba.LOG_ERROR;
gba.setCanvasDirect({getContext:()=>ctx});
// use the BIOS + ROM embedded in the bundle, exactly what the web page runs
const bundle=fs.readFileSync(__dirname+'/bsr-player.js','utf8');
const romB64=(process.argv[2]||'')?null:/BSR_ROM_B64\s*=\s*"([^"]*)"/.exec(bundle)[1];
const biosB64=/BSR_BIOS_B64\s*=\s*"([^"]*)"/.exec(bundle)[1];
const bios=Buffer.from(biosB64,'base64'); gba.setBios(bios.buffer.slice(bios.byteOffset,bios.byteOffset+bios.length));
const rom=process.argv[2]?fs.readFileSync(process.argv[2]):Buffer.from(romB64,'base64');
console.log('rom bytes',rom.length,'setRom',gba.setRom(rom.buffer.slice(rom.byteOffset,rom.byteOffset+rom.length)));
const out=process.argv[3]||'/tmp/gbajs';
fs.mkdirSync(out,{recursive:true});
const K={A:0,B:1,SELECT:2,START:3,RIGHT:4,LEFT:5,UP:6,DOWN:7,R:8,L:9};
let audioSamples=0;
function frames(n,keys=[]){for(let i=0;i<n;i++){let m=0x3FF;keys.forEach(k=>m&=~(1<<K[k]));gba.keypad.currentDown=m;gba.advanceFrame();}}
function press(k){frames(3,[k]);frames(3);}
function dump(name){const {width,height,data}=lastImg;const o=Buffer.alloc(width*height*3);for(let i=0;i<width*height;i++){o[i*3]=data[i*4];o[i*3+1]=data[i*4+1];o[i*3+2]=data[i*4+2];}fs.writeFileSync(out+'/'+name+'.rgb',o);console.log('dumped',name);}
const script=fs.readFileSync(__dirname+'/../tests/v02_gbajs.txt','utf8').split('\n');
let t=Date.now();
for(const line of script){const p=line.trim().split(/\s+/);if(!p[0]||p[0][0]=='#')continue;
 if(p[0]=='wait')frames(+p[1]);else if(p[0]=='press')press(p[1]);else if(p[0]=='hold')frames(+p[2],p[1].split('+'));else if(p[0]=='shot')dump(p[1]);}
console.log('done ms',Date.now()-t);
