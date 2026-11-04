// Headless mGBA runner: runrom ROM SCRIPT OUTDIR [SAVEFILE]
// script lines: wait N | hold KEYS N | press KEYS | shot NAME   (KEYS: A,B,SELECT,START,RIGHT,LEFT,UP,DOWN,R,L joined by +)
#include <mgba/core/core.h>
#include <mgba/core/config.h>
#include <mgba-util/vfs.h>
#include <mgba/core/blip_buf.h>
#include <png.h>
#include <mgba/core/log.h>
static void nolog(struct mLogger*l,int c,enum mLogLevel lv,const char*f,va_list a){(void)l;(void)c;(void)lv;(void)f;(void)a;}
static struct mLogger NL={.log=nolog};
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static struct mCore* core; static color_t* buf; static unsigned W,H; static const char* outdir;
static long frameno=0;
static int audio_ready;static short*abuf;static long alen=0,acap=0;static FILE*wavf=NULL;
static void audio_pull(void){ if(!audio_ready)return; struct blip_t*L=core->getAudioChannel(core,0);int n=blip_samples_avail(L);
 if(n<=0)return; short tmp[4096*2]; if(n>4096)n=4096; blip_read_samples(L,tmp,n,1); blip_read_samples(core->getAudioChannel(core,1),tmp+1,n,1); if(wavf){fwrite(tmp,4,n,wavf); alen+=n;}}
static int parsekeys(char*s){int k=0;char*t=strtok(s,"+");const char*n[]={"A","B","SELECT","START","RIGHT","LEFT","UP","DOWN","R","L"};
 while(t){for(int i=0;i<10;i++)if(!strcmp(t,n[i]))k|=1<<i;t=strtok(NULL,"+");}return k;}
static void wav_close(void){ if(!wavf)return; unsigned int ds=alen*4; fseek(wavf,0,SEEK_SET);
  unsigned char h[44]; memcpy(h,"RIFF",4); unsigned int v=36+ds; memcpy(h+4,&v,4); memcpy(h+8,"WAVEfmt ",8); v=16; memcpy(h+16,&v,4);
  unsigned short f=1,c=2,b=16,ba=4; memcpy(h+20,&f,2); memcpy(h+22,&c,2); v=32768; memcpy(h+24,&v,4); v=32768*4; memcpy(h+28,&v,4); memcpy(h+32,&ba,2); memcpy(h+34,&b,2); memcpy(h+36,"data",4); memcpy(h+40,&ds,4); fwrite(h,1,44,wavf); fclose(wavf); wavf=NULL; alen=0;}
static void wav_open(const char*p){ wav_close(); wavf=fopen(p,"wb");char hdr[44]={0};fwrite(hdr,1,44,wavf);
  /* drain pending samples */ struct blip_t*L=core->getAudioChannel(core,0),*R=core->getAudioChannel(core,1); short tmp[4096*2]; int n; while((n=blip_samples_avail(L))>0){ if(n>4096)n=4096; blip_read_samples(L,tmp,n,1); blip_read_samples(R,tmp,n,1);} }
static void audio_setup(void){ if(audio_ready)return; audio_ready=1; core->setAudioBufferSize(core,4096); blip_set_rates(core->getAudioChannel(core,0),core->frequency(core),32768); blip_set_rates(core->getAudioChannel(core,1),core->frequency(core),32768);}
static void run(int keys,int n){core->setKeys(core,keys);for(int i=0;i<n;i++){core->runFrame(core);frameno++;audio_pull();}}
static void shot(const char*name){char p[512];snprintf(p,512,"%s/%s.png",outdir,name);FILE*f=fopen(p,"wb");
 png_structp pp=png_create_write_struct(PNG_LIBPNG_VER_STRING,0,0,0);png_infop pi=png_create_info_struct(pp);png_init_io(pp,f);
 png_set_IHDR(pp,pi,W*2,H*2,8,PNG_COLOR_TYPE_RGB,0,0,0);png_write_info(pp,pi);unsigned char*row=malloc(W*2*3);
 for(unsigned y=0;y<H*2;y++){for(unsigned x=0;x<W*2;x++){uint32_t c=buf[(y/2)*W+x/2];row[x*3]=c&0xff;row[x*3+1]=(c>>8)&0xff;row[x*3+2]=(c>>16)&0xff;}png_write_row(pp,row);}
 png_write_end(pp,0);fclose(f);free(row);printf("shot %s at frame %ld\n",p,frameno);}
int main(int argc,char**argv){
 if(argc<4){fprintf(stderr,"usage\n");return 1;}outdir=argv[3];
 mLogSetDefaultLogger(&NL);core=mCoreFind(argv[1]);if(!core){fprintf(stderr,"no core\n");return 1;}
 core->init(core);mCoreInitConfig(core,NULL);
 core->desiredVideoDimensions(core,&W,&H);buf=calloc(W*H,sizeof(color_t));core->setVideoBuffer(core,buf,W);
 if(!mCoreLoadFile(core,argv[1])){fprintf(stderr,"load fail\n");return 1;}
 if(argc>4){struct VFile*vf=VFileOpen(argv[4],O_CREAT|O_RDWR);if(vf)core->loadSave(core,vf);}
 core->reset(core);
 audio_setup(); const char*wp=getenv("WAVOUT"); if(wp){wavf=fopen(wp,"wb");char hdr[44]={0};fwrite(hdr,1,44,wavf);}
 FILE*s=fopen(argv[2],"r");char line[256];
 while(fgets(line,256,s)){char cmd[32],a[128];int n=0;a[0]=0;if(sscanf(line,"%31s %127s %d",cmd,a,&n)<1)continue;
  if(cmd[0]=='#')continue;
  if(!strcmp(cmd,"wait"))run(0,atoi(a));
  else if(!strcmp(cmd,"hold"))run(parsekeys(a),n);
  else if(!strcmp(cmd,"press")){run(parsekeys(a),3);run(0,3);}
  else if(!strcmp(cmd,"shot"))shot(a);
  else if(!strcmp(cmd,"wav"))wav_open(a);
  else if(!strcmp(cmd,"wavend"))wav_close();}
 wav_close();
 core->deinit(core);return 0;}
