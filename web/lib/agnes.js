// agnes.js（浏览器版）—— 前端直连 Agnes，去掉 wx.request 用 fetch。
// 逻辑移植自 miniprogram/utils/agnes.js。仅限自玩：key 暴露在前端。
(function () {
  const AGNES_KEYS = [
    'sk-ARmqRfh2NcYE45ImmKoERDSFa5Oeev6GGEGIJV2BaZjn9VdD',
    'sk-1xkrNsXLHg8WwwmvOXPD1WsTMH0UcfXNKsX81gvFebypgSPK',
    'sk-xS9U1pAQ0zGfzx0k0Jrmrs91vHRZOtTEvLQufZXV2et10zll',
    'sk-OavrZnwFzj4LZivTUt39E4jj6yVOpXAI3Bsb1zVdmEThzjqm',
  ]
  const AGNES_BASE = 'https://apihub.agnes-ai.com/v1'
  const AGNES_ROOT = 'https://apihub.agnes-ai.com'

  const VIDEO_FPS = 24
  const VIDEO_QUALITY = '1080p'
  const VIDEO_SECONDS = 7
  const MAX_FRAMES = 441
  const MAX_SECONDS = MAX_FRAMES / VIDEO_FPS

  const IMAGE_RESOLUTIONS = {
    '1080p': { '16:9':{w:1920,h:1080},'9:16':{w:1080,h:1920},'1:1':{w:1440,h:1440},'4:3':{w:1440,h:1080},'3:4':{w:1080,h:1440},'3:2':{w:1620,h:1080},'2:3':{w:1080,h:1620} },
    '4K': { '16:9':{w:3840,h:2160},'9:16':{w:2160,h:3840},'1:1':{w:2880,h:2880},'4:3':{w:2880,h:2160},'3:4':{w:2160,h:2880},'3:2':{w:3240,h:2160},'2:3':{w:2160,h:3240} },
  }
  const VIDEO_RESOLUTIONS = {
    '1080p': { '16:9':{w:1920,h:1080},'9:16':{w:1080,h:1920},'1:1':{w:1080,h:1080},'4:3':{w:1440,h:1080},'3:4':{w:1080,h:1440},'3:2':{w:1620,h:1080},'2:3':{w:1080,h:1620} },
    '720p': { '16:9':{w:1280,h:720},'9:16':{w:720,h:1280},'1:1':{w:1024,h:1024},'4:3':{w:1024,h:768},'3:4':{w:768,h:1024},'3:2':{w:1152,h:768},'2:3':{w:768,h:1152} },
  }

  function frameCountFromSeconds(seconds){const s=Math.max(0.5,Math.min(MAX_SECONDS,seconds));const t=Math.floor(s*VIDEO_FPS);const n=Math.round((t-1)/8);return Math.min(MAX_FRAMES,Math.max(1,n*8+1))}
  const LOCKED_FRAMES = frameCountFromSeconds(VIDEO_SECONDS)
  const REQUESTED_SECONDS = LOCKED_FRAMES / VIDEO_FPS
  function videoResolution(ratio){const m=VIDEO_RESOLUTIONS[VIDEO_QUALITY]||VIDEO_RESOLUTIONS['720p'];return m[ratio]||m['16:9']}
  function resolveImageResolution(req){const want=(req||'1080p').toLowerCase();const rank=want==='4k'?2:1;if(rank>2)return '1080p';return want==='4k'?'4K':'1080p'}
  function imageResolutionSize(resolution,ratio){const m=IMAGE_RESOLUTIONS[resolution]||IMAGE_RESOLUTIONS['1080p'];return m[ratio]||m['16:9']}

  const ROTATION_WINDOW_MS = 2000
  let _keys = AGNES_KEYS.filter(k=>typeof k==='string'&&k.startsWith('sk-')&&k.length>10)
  let _idx = _keys.length ? Math.floor(Date.now()/ROTATION_WINDOW_MS)%_keys.length : 0
  function maskKey(k){if(!k||k.length<=12)return k||'';return k.slice(0,8)+'…'+k.slice(-4)}
  function pickKey(){if(_keys.length===0)return null;const i=_idx;_idx=(_idx+1)%_keys.length;return{index:i,key:_keys[i],mask:maskKey(_keys[i])}}

  async function agnPost(path, body, key, timeoutMs){
    const ctrl = (timeoutMs&&AbortController)?new AbortController():null
    let timer
    if(ctrl){timer=setTimeout(()=>ctrl.abort(),timeoutMs||60000)}
    try{
      const res = await fetch(AGNES_BASE+path,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:ctrl?ctrl.signal:undefined})
      if(timer)clearTimeout(timer)
      let data=null
      try{data=await res.json()}catch(e){data=null}
      return {statusCode:res.status,data}
    }catch(e){
      if(timer)clearTimeout(timer)
      return {statusCode:0,data:null,error:e&&e.message?e.message:String(e)}
    }
  }
  async function agnGet(url,key){
    try{
      const res = await fetch(url,{method:'GET',headers:{Authorization:'Bearer '+key}})
      let data=null
      try{data=await res.json()}catch(e){data=null}
      return {statusCode:res.status,data}
    }catch(e){
      return {statusCode:0,data:null,error:e&&e.message?e.message:String(e)}
    }
  }
  function errText(r){let t='';try{t=typeof r.data==='string'?r.data:JSON.stringify(r.data)}catch(e){t=''}return t}
  function verifyVideoOutput(data){
    const actualSeconds=Number(data.seconds||data.duration||0)
    const secondsMatch=actualSeconds>0&&Math.abs(actualSeconds-REQUESTED_SECONDS)<=0.75
    const actualSize=String(data.size||'')
    return {requested_seconds:Number(REQUESTED_SECONDS.toFixed(2)),requested_frames:LOCKED_FRAMES,requested_quality:VIDEO_QUALITY,requested_fps:VIDEO_FPS,actual_seconds:actualSeconds,actual_size:actualSize,seconds_match:secondsMatch,all_match:secondsMatch,mismatch:secondsMatch?'':`输出时长 ${actualSeconds||'?'}s 与锁死 ${VIDEO_SECONDS}s 不一致`}
  }

  async function doVideo(data){
    const picked=pickKey();if(!picked)throw new Error('未配置 Agnes key')
    const res=videoResolution(data.ratio||'16:9');const numFrames=LOCKED_FRAMES;const size=`${res.w}x${res.h}`
    const payload={model:'agnes-video-v2.0',prompt:data.prompt,width:res.w,height:res.h,num_frames:numFrames,frame_rate:VIDEO_FPS}
    if(data.negative_prompt)payload.negative_prompt=data.negative_prompt
    if(data.image)payload.image=data.image
    const up=await agnPost('/videos',payload,picked.key,60000)
    if(up.statusCode!==200)throw new Error('Agnes video 创建失败（HTTP '+up.statusCode+'）'+errText(up))
    const d=up.data||{};const realSeconds=d.seconds?Number(d.seconds):VIDEO_SECONDS;const realSize=d.size||size
    return {success:true,task_id:d.task_id||d.id,video_id:d.video_id||'',data:d,keyIndex:picked.index,keyMask:picked.mask,keyTotal:_keys.length,locked:{quality:VIDEO_QUALITY,fps:VIDEO_FPS,requested_seconds:VIDEO_SECONDS,requested_frames:numFrames,requested_size:size,seconds:realSeconds,size:realSize,num_frames:numFrames}}
  }
  async function doVideoStatus(data){
    let i=(typeof data.keyIndex==='number'&&data.keyIndex>=0&&data.keyIndex<_keys.length)?data.keyIndex:(_keys.length?_idx:0)
    const key=_keys.length?_keys[i]:''
    if(!key)throw new Error('未配置 Agnes key')
    let up
    if(data.video_id)up=await agnGet(AGNES_ROOT+'/agnesapi?video_id='+encodeURIComponent(data.video_id),key)
    else up=await agnGet(AGNES_BASE+'/videos/'+data.task_id,key)
    if(up.statusCode!==200)throw new Error('查询失败（HTTP '+up.statusCode+'）'+errText(up))
    const d=up.data||{}
    const verification=(d.status==='completed'||d.seconds)?verifyVideoOutput(d):null
    return {success:true,data:d,verification,keyIndex:i,keyMask:maskKey(key),keyTotal:_keys.length}
  }
  async function doImage(data){
    const picked=pickKey();if(!picked)throw new Error('未配置 Agnes key')
    const resolution=resolveImageResolution(data.resolution);const dims=imageResolutionSize(resolution,data.ratio||'16:9');const size=`${dims.w}x${dims.h}`
    const payload={model:data.model||'agnes-image-2.1-flash',prompt:data.prompt,size,ratio:data.ratio||'16:9'}
    if(data.image){payload.extra_body={image:Array.isArray(data.image)?data.image:[data.image],response_format:data.response_format||'url'}}
    else if(data.response_format){payload.extra_body={response_format:data.response_format}}
    const up=await agnPost('/images/generations',payload,picked.key,90000)
    if(up.statusCode!==200)throw new Error('Agnes image 失败（HTTP '+up.statusCode+'）'+errText(up))
    const d=up.data||{}
    return {success:true,data:d,keyIndex:picked.index,keyMask:picked.mask,keyTotal:_keys.length,resolution,size}
  }
  const PROMPT_ENHANCE_SYSTEM_TMPL=(type)=>`你是一位顶尖的 AI ${type}生成提示词（Prompt）工程师，精通 Midjourney、Stable Diffusion、Sora、Agnes 等模型的提示词写法。\n\n用户会给你一段用于 AI ${type}生成的提示词（可能非常简单）。请把它扩充为一段专业、详尽、可直接用于生成的提示词，并给出点评与建议。\n\n必须只返回一个 JSON 对象，不要任何额外说明、不要 markdown 代码块。格式严格如下：\n{\n  "critique": "对原始提示词的书面点评（中文，2-4 句，指出优点与不足）",\n  "suggestions": ["具体可操作的改进建议 1（中文）", "建议 2", "建议 3"],\n  "improved_prompt": "优化后的【完整提示词】（以英文为主，可直接粘贴到生成框使用；必须极其详细：包含 主体与细节、动作/变化、场景与环境、镜头与构图、光影与氛围、风格参考；至少 80-150 词）",\n  "details": {\n    "camera": "运镜 / 镜头说明（如 slow push-in, handheld tracking, aerial drone shot, static wide；${type==='视频'?'必填':'无则填 无'}）",\n    "style": "风格 / 美术参考（如 cinematic, photorealistic, anime, oil painting；无则填 无）",\n    "positive": "正向提示词要点（提炼出的核心正向描述关键词，英文，逗号分隔）",\n    "negative": "反向提示词（不希望出现的元素，英文，逗号分隔；如无需则填 无）"\n  }\n}`
  async function doEnhance(data){
    const prompt=(data.prompt||'').trim();if(!prompt)throw new Error('prompt 必填')
    const picked=pickKey();if(!picked)throw new Error('未配置 Agnes key')
    const type=data.type==='video'?'视频':'图片'
    const payload={model:'agnes-2.0-flash',messages:[{role:'system',content:PROMPT_ENHANCE_SYSTEM_TMPL(type)},{role:'user',content:`请优化这段${type}生成提示词：\n${prompt}`}],temperature:0.6,max_tokens:3000}
    const up=await agnPost('/chat/completions',payload,picked.key,60000)
    if(up.statusCode!==200)throw new Error('提示词优化失败（HTTP '+up.statusCode+'）'+errText(up))
    const d=up.data||{};const content=(d&&d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content)||''
    try{
      const cleaned=content.replace(/```json\s?/gi,'').replace(/```/g,'').trim()
      const parsed=JSON.parse(cleaned)
      return {success:true,critique:parsed.critique||'',suggestions:Array.isArray(parsed.suggestions)?parsed.suggestions:[],improved_prompt:parsed.improved_prompt||'',details:parsed.details||{},keyIndex:picked.index,keyMask:picked.mask,keyTotal:_keys.length}
    }catch(e){
      return {success:true,critique:'（模型未返回结构化结果，以下是原文建议）',suggestions:[],improved_prompt:content.trim(),details:{},keyIndex:picked.index,keyMask:picked.mask,keyTotal:_keys.length,raw:true}
    }
  }
  async function agnesRequest(action,data={}){
    switch(action){
      case 'video':return doVideo(data)
      case 'video-status':return doVideoStatus(data)
      case 'image':return doImage(data)
      case 'enhance-prompt':return doEnhance(data)
      default:throw new Error('未知 action: '+action)
    }
  }
  function getLockedConfig(){
    return {videoQuality:VIDEO_QUALITY,videoFps:VIDEO_FPS,videoLockedSeconds:VIDEO_SECONDS,videoLockedFrames:LOCKED_FRAMES,videoMaxSeconds:MAX_SECONDS,videoMaxFrames:MAX_FRAMES,imageMaxSize:'4K',imageDefaultResolution:'1080p',imageResolutionOptions:['1080p','4K']}
  }
  window.Agnes = { agnesRequest, getLockedConfig }
})()
