// audio.js（浏览器版）—— 纯前端、零依赖的 MP4 -> M4A 音频抽取。
// 直接移植自 miniprogram/utils/audioExtract.js，逻辑不变，仅改导出为全局。
(function () {
  'use strict'
  function u32(n){const a=new Uint8Array(4);a[0]=(n>>>24)&0xff;a[1]=(n>>>16)&0xff;a[2]=(n>>>8)&0xff;a[3]=n&0xff;return a}
  function u16(n){const a=new Uint8Array(2);a[0]=(n>>>8)&0xff;a[1]=n&0xff;return a}
  function str(s){const a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i)&0xff;return a}
  function concat(arrs){let len=0;for(const a of arrs)len+=a.length;const out=new Uint8Array(len);let p=0;for(const a of arrs){out.set(a,p);p+=a.length;}return out}
  function box(type,...payloads){const body=concat(payloads);return concat([u32(body.length+8),str(type),body])}
  function forEachBox(view,start,end,cb){let off=start;while(off+8<=end){let size=view.getUint32(off);const type=String.fromCharCode(view.getUint8(off+4),view.getUint8(off+5),view.getUint8(off+6),view.getUint8(off+7));let headerLen=8;if(size===1){size=view.getUint32(off+8)*0x100000000+view.getUint32(off+12);headerLen=16;}else if(size===0){size=end-off;}if(size<8||off+size>end)break;cb(type,off,off+size);off+=size;}}
  function findBox(view,start,end,type){let found=null;forEachBox(view,start,end,(t,s,e)=>{if(!found&&t===type)found={start:s,end:e};});return found}
  function readBoxBytes(buf,start,end){return new Uint8Array(buf.slice(start,end))}
  function parseAudioTrack(buf){
    const view=new DataView(buf);const len=buf.byteLength;const moov=findBox(view,0,len,'moov');
    if(!moov)throw new Error('文件缺少 moov 盒子，可能不是标准 MP4');
    let audio=null;
    forEachBox(view,moov.start+8,moov.end,(type,ts,te)=>{
      if(type!=='trak'||audio)return;
      const mdia=findBox(view,ts+8,te,'mdia');if(!mdia)return;
      const hdlr=findBox(view,mdia.start+8,mdia.end,'hdlr');if(!hdlr)return;
      const handlerType=String.fromCharCode(view.getUint8(hdlr.start+16),view.getUint8(hdlr.start+17),view.getUint8(hdlr.start+18),view.getUint8(hdlr.start+19));
      if(handlerType!=='soun')return;
      audio={trakStart:ts,trakEnd:te,mdiaStart:mdia.start,mdiaEnd:mdia.end};
    });
    if(!audio)throw new Error('未找到音频轨道（该视频可能没有音轨或非 AAC）');
    const{mdiaStart,mdiaEnd}=audio;
    const minf=findBox(view,mdiaStart+8,mdiaEnd,'minf');if(!minf)throw new Error('moov 结构异常：缺少 minf');
    const stbl=findBox(view,minf.start+8,minf.end,'stbl');if(!stbl)throw new Error('moov 结构异常：缺少 stbl');
    const mdhd=findBox(view,mdiaStart+8,mdiaEnd,'mdhd');if(!mdhd)throw new Error('缺少 mdhd');
    const timescale=view.getUint32(mdhd.start+20);const duration=view.getUint32(mdhd.start+24);
    const stsd=findBox(view,stbl.start+8,stbl.end,'stsd');const stts=findBox(view,stbl.start+8,stbl.end,'stts');const stsz=findBox(view,stbl.start+8,stbl.end,'stsz');
    if(!stsd||!stts||!stsz)throw new Error('缺少必要音频表（stsd/stts/stsz）');
    const stsdBytes=readBoxBytes(buf,stsd.start,stsd.end);
    const sttsBytes=readBoxBytes(buf,stts.start,stts.end);
    const stszBytes=readBoxBytes(buf,stsz.start,stsz.end);
    const sampleSizeField=view.getUint32(stsz.start+12);const sampleCount=view.getUint32(stsz.start+16);
    const sampleSizes=new Array(sampleCount);
    if(sampleSizeField!==0){for(let i=0;i<sampleCount;i++)sampleSizes[i]=sampleSizeField;}else{let p=stsz.start+20;for(let i=0;i<sampleCount;i++){sampleSizes[i]=view.getUint32(p);p+=4;}}
    const stsc=findBox(view,stbl.start+8,stbl.end,'stsc');if(!stsc)throw new Error('缺少 stsc');
    const stscCount=view.getUint32(stsc.start+12);const stscEntries=[];let p=stsc.start+16;
    for(let i=0;i<stscCount;i++){stscEntries.push({firstChunk:view.getUint32(p),samplesPerChunk:view.getUint32(p+4),sampleDescIndex:view.getUint32(p+8)});p+=12;}
    let chunkOffsets=null;const stco=findBox(view,stbl.start+8,stbl.end,'stco');const co64=findBox(view,stbl.start+8,stbl.end,'co64');
    if(co64){const n=view.getUint32(co64.start+12);chunkOffsets=new Array(n);let q=co64.start+16;for(let i=0;i<n;i++){chunkOffsets[i]=view.getUint32(q)*0x100000000+view.getUint32(q+4);q+=8;}}
    else if(stco){const n=view.getUint32(stco.start+12);chunkOffsets=new Array(n);let q=stco.start+16;for(let i=0;i<n;i++){chunkOffsets[i]=view.getUint32(q);q+=4;}}
    else throw new Error('缺少块偏移表（stco/co64）');
    let global=0;const audioChunks=[];let totalBytes=0;
    for(let ci=0;ci<chunkOffsets.length;ci++){const chunkIndex=ci+1;let spc=0;for(let e=0;e<stscEntries.length;e++){const next=e+1<stscEntries.length?stscEntries[e+1].firstChunk:Infinity;if(chunkIndex>=stscEntries[e].firstChunk&&chunkIndex<next){spc=stscEntries[e].samplesPerChunk;break;}}if(!spc)continue;let inChunkOffset=0;for(let s=0;s<spc;s++){if(global>=sampleCount)break;const size=sampleSizes[global];const fileOff=chunkOffsets[ci]+inChunkOffset;if(fileOff+size<=len){audioChunks.push(new Uint8Array(buf.slice(fileOff,fileOff+size)));totalBytes+=size;}inChunkOffset+=size;global++;}}
    if(!audioChunks.length)throw new Error('未能抽取到任何音频样本');
    const mdatData=concat(audioChunks);
    return{timescale,duration,sampleCount,stsdBytes,sttsBytes,stszBytes,mdatData};
  }
  function buildM4A(track){
    const{timescale,duration,sampleCount,stsdBytes,sttsBytes,stszBytes,mdatData}=track;
    const moovLen=computeMoovLength(timescale,duration,sampleCount,stsdBytes,sttsBytes,stszBytes);
    const ftyp=box('ftyp',str('M4A '),u32(512),str('M4A '),str('isom'),str('iso2'),str('mp41'));
    const mdatPayloadOffset=ftyp.length+moovLen+8;
    const moov=buildMoov(timescale,duration,sampleCount,stsdBytes,sttsBytes,stszBytes,mdatPayloadOffset);
    const mdat=box('mdat',mdatData);
    return concat([ftyp,moov,mdat]).buffer;
  }
  function computeMoovLength(timescale,duration,sampleCount,stsdBytes,sttsBytes,stszBytes){return buildMoov(timescale,duration,sampleCount,stsdBytes,sttsBytes,stszBytes,0).length}
  function buildMoov(timescale,duration,sampleCount,stsdBytes,sttsBytes,stszBytes,mdatOffset){
    const matrix=concat([u32(0x00010000),u32(0),u32(0),u32(0),u32(0x00010000),u32(0),u32(0),u32(0),u32(0x40000000)]);
    const language=u16(0x55c4);
    const mvhd=box('mvhd',u32(0),u32(0),u32(0),u32(timescale),u32(duration),u32(0x00010000),u16(0x0100),u16(0),u32(0),u32(0),matrix,u32(0),u32(0),u32(0),u32(0),u32(0),u32(0),u32(2));
    const tkhd=box('tkhd',u32(0x000007),u32(0),u32(0),u32(1),u32(0),u32(duration),u32(0),u32(0),u16(0),u16(0),u16(0x0100),u16(0),matrix,u32(0),u32(0));
    const mdhd=box('mdhd',u32(0),u32(0),u32(0),u32(timescale),u32(duration),language,u16(0));
    const handlerName=str('SoundHandler\u0000');
    const hdlr=box('hdlr',u32(0),u32(0),str('soun'),u32(0),u32(0),u32(0),handlerName);
    const smhd=box('smhd',u32(0),u16(0),u16(0));
    const dref=box('dref',u32(0),u32(1),box('url ',u32(0x00000001)));
    const dinf=box('dinf',dref);
    const stsc=box('stsc',u32(0),u32(1),u32(1),u32(sampleCount),u32(1));
    const stco=box('stco',u32(0),u32(1),u32(mdatOffset));
    const stbl=box('stbl',stsdBytes,sttsBytes,stsc,stszBytes,stco);
    const minf=box('minf',smhd,dinf,stbl);
    const mdia=box('mdia',mdhd,hdlr,minf);
    const trak=box('trak',tkhd,mdia);
    return box('moov',mvhd,trak);
  }
  function extractAudioM4A(arrayBuffer){
    const track=parseAudioTrack(arrayBuffer);
    const m4a=buildM4A(track);
    return{m4a,info:{timescale:track.timescale,duration:track.duration,sampleCount:track.sampleCount,audioBytes:track.mdatData.length}};
  }
  window.AudioExtract = { extractAudioM4A }
})()
