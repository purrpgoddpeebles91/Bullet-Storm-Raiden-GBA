/* BSR player API (bundled after gbajs + BIOS + ROM by tools/build_web_player.py)
   BSRPlayer.start(canvasElement)              legacy: gbajs draws 240x160 straight into a 2D canvas
   BSRPlayer.start(null, {onFrame, onTick, onKey, keyboard, gamepad})
                                               host renderer mode: onFrame(Uint8Array rgba 240x160) per emulated frame,
                                               onTick() once per animation frame, onKey(name, down, source) for feedback
   BSRPlayer.key(name, isDown)  name in A,B,SELECT,START,R,L,UP,DOWN,LEFT,RIGHT
   BSRPlayer.pulse(name)        release a held key for exactly one emulated frame (host-side hold-to-repeat)
   BSRPlayer.unlockAudio()  BSRPlayer.setPaused(bool)  BSRPlayer.isPaused()  BSRPlayer.reset()  BSRPlayer.toggleSound()
   BSRPlayer.frames() (emulated frame count)  BSRPlayer.isStarted()    BSRPlayer.romInfo  {title, code, maker, bytes} */
(function(){
  try { window.localStorage; } catch(e) {}
  GameBoyAdvanceKeypad.prototype.registerHandlers = function(){};
  GameBoyAdvance.prototype.retrieveSavedata = function(){};
  GameBoyAdvance.prototype.storeSavedata = function(){};
  function b64(s){var bin=atob(s),n=bin.length,u=new Uint8Array(n);for(var i=0;i<n;i++)u[i]=bin.charCodeAt(i);return u.buffer;}
  var KEYS={A:0,B:1,SELECT:2,START:3,RIGHT:4,LEFT:5,UP:6,DOWN:7,R:8,L:9};
  var NAMES=['A','B','SELECT','START','RIGHT','LEFT','UP','DOWN','R','L'];
  var held=0, padHeld=0, pulseMask=0, frames=0, gba=null, paused=false, last=0, acc=0, started=false, opts={};
  var KB={90:'A',88:'B',13:'START',16:'SELECT',8:'SELECT',65:'L',83:'R',38:'UP',40:'DOWN',37:'LEFT',39:'RIGHT',32:'A'};
  function apply(){ if(gba) gba.keypad.currentDown = (~((held|padHeld) & ~pulseMask)) & 0x3FF; }
  function romInfo(){
    try { var u=new Uint8Array(b64(BSR_ROM_B64)); var t=''; for(var i=0xA0;i<0xAC;i++){ if(u[i]) t+=String.fromCharCode(u[i]); }
      var c=''; for(i=0xAC;i<0xB0;i++) c+=String.fromCharCode(u[i]); var m=String.fromCharCode(u[0xB0],u[0xB1]);
      return {title:t.trim(), code:c, maker:m, bytes:u.length}; } catch(e){ return {}; }
  }
  function isField(e){ var t=e.target&&e.target.tagName; return t==='SELECT'||t==='INPUT'||t==='TEXTAREA'||t==='BUTTON'&&(e.keyCode===13||e.keyCode===32); }
  var P = window.BSRPlayer = {
    romInfo: romInfo(),
    start: function(c, o){
      if(started) return;
      started=true; opts=o||{};
      gba = new GameBoyAdvance();
      gba.logLevel = gba.LOG_ERROR;
      if(c && !opts.onFrame){ c.width=240; c.height=160; gba.setCanvasDirect(c); }
      else {
        var view=null;
        var fakeCtx={
          createImageData:function(w,h){ return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)}; },
          putImageData:function(img){ if(!view||view.buffer!==img.data.buffer) view=new Uint8Array(img.data.buffer); if(opts.onFrame) opts.onFrame(view); },
          drawImage:function(){}, getImageData:function(){ return {data:[]}; }
        };
        gba.setCanvasDirect({getContext:function(){ return fakeCtx; }, width:240, height:160});
      }
      gba.setBios(b64(BSR_BIOS_B64));
      gba.setRom(b64(BSR_ROM_B64));
      try { gba.audio.pause(false); } catch(e){}
      if(opts.keyboard!==false){
        document.addEventListener('keydown', function(e){ if(isField(e)) return; var k=KB[e.keyCode]; if(k){ if(!e.repeat) P.key(k,true,'kb'); e.preventDefault(); P.unlockAudio(); } });
        document.addEventListener('keyup', function(e){ var k=KB[e.keyCode]; if(k){ P.key(k,false,'kb'); e.preventDefault(); } });
      }
      requestAnimationFrame(loop);
    },
    key: function(name, down, src){ var b=KEYS[name]; if(b===undefined) return; var was=(held>>b)&1; if(down) held|=(1<<b); else held&=~(1<<b); apply(); if(opts.onKey && was!==((held>>b)&1)) opts.onKey(name, !!down, src||'api'); },
    pulse: function(name){ var b=KEYS[name]; if(b!==undefined && (held>>b)&1){ pulseMask|=(1<<b); apply(); } },
    unlockAudio: function(){ try{ var ac=gba&&gba.audio&&gba.audio.context; if(ac&&ac.state!=='running') ac.resume(); }catch(e){} },
    setPaused: function(p){ paused=!!p; try{ gba.audio.pause(paused); }catch(e){} },
    isPaused: function(){ return paused; },
    isStarted: function(){ return started; },
    reset: function(){ held=0; padHeld=0; pulseMask=0; gba.setRom(b64(BSR_ROM_B64)); try{ gba.audio.pause(false);}catch(e){} },
    toggleSound: function(){ if(!gba||!gba.audio) return true; gba.audio.masterEnable=!gba.audio.masterEnable; return gba.audio.masterEnable; },
    held: function(){ return held|padHeld; },
    frames: function(){ return frames; },
    _gba: function(){ return gba; },
    _step: function(n){ for(var i=0;i<(n||1);i++){ apply(); gba.advanceFrame(); pulseMask=0; frames++; } }
  };
  // standard-mapping gamepads: East/North = A, South/West = B, LB/LT = L, RB/RT = R, Back = Select, Start = Start, D-pad + left stick
  function pollPads(){
    if(opts.gamepad===false || !navigator.getGamepads) return;
    var pads; try { pads=navigator.getGamepads(); } catch(e){ return; }
    var m=0;
    for(var i=0;i<pads.length;i++){ var g=pads[i]; if(!g||!g.connected) continue;
      var bt=function(j){ var x=g.buttons[j]; return x&&(x.pressed||x.value>0.5); };
      if(bt(1)||bt(3)) m|=1<<KEYS.A; if(bt(0)||bt(2)) m|=1<<KEYS.B;
      if(bt(4)||bt(6)) m|=1<<KEYS.L; if(bt(5)||bt(7)) m|=1<<KEYS.R;
      if(bt(8)) m|=1<<KEYS.SELECT; if(bt(9)) m|=1<<KEYS.START;
      var ax=g.axes[0]||0, ay=g.axes[1]||0;
      if(bt(12)||ay<-0.5) m|=1<<KEYS.UP; if(bt(13)||ay>0.5) m|=1<<KEYS.DOWN;
      if(bt(14)||ax<-0.5) m|=1<<KEYS.LEFT; if(bt(15)||ax>0.5) m|=1<<KEYS.RIGHT;
    }
    if(m!==padHeld){ var ch=m^padHeld; padHeld=m; apply(); if(opts.onKey) for(var b=0;b<10;b++) if((ch>>b)&1) opts.onKey(NAMES[b], !!((m>>b)&1), 'pad'); if(m) P.unlockAudio(); }
  }
  function loop(t){
    requestAnimationFrame(loop);
    pollPads();
    if(!last){ last=t; return; }
    var dt=Math.min(100, t-last); last=t;
    if(!paused){
      acc+=dt; var n=0;
      while(acc>=16.7427 && n<4){ apply(); try{ gba.advanceFrame(); }catch(e){ console.error(e); } pulseMask=0; frames++; acc-=16.7427; n++; }
      if(n===4) acc=0;
    }
    if(opts.onTick) try{ opts.onTick(); }catch(e){ console.error(e); }
  }
})();
