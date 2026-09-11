'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('screen');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('x5-playsinline', '');
  video.setAttribute('muted', '');
  video.setAttribute('aria-hidden', 'true');
  video.tabIndex = -1;
  video.className = 'source-video';
  // Keep the inline decoder in the document for mobile WebViews. The canvas
  // remains the visible screen; this element never handles pointer input.
  $('viewer').appendChild(video);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { angle: 180, effect: true, playing: !reducedMotion, fit: 'cover', source: 'demo', animation: null, demoTime: 0, lastTime: 0, objectURL: null, mediaGeneration: 0, frame: 0, dirty: true, textureDirty: true, videoFramePending: false, width: 0, height: 0 };
  let renderer, pointer = null, destroyed = false, photo = null, lastTap = null;
  let fallbackFullscreen = false, fullscreenBusy = false;
  let videoWantsPlay = false, playRequest = 0, playPending = false, playbackBlocked = false;
  const settings = $('settings');
  const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
  function status(text = '', isError = false) {
    $('status').textContent = text;
    $('status').classList.toggle('error', isError);
  }
  function initializeRenderer() { renderer = new window.FoldRenderer(gl); state.textureDirty = true; }
  function render() {
    if (!gl || destroyed) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    // Keep native detail on Retina displays without an unbounded drawing buffer.
    const dpr = Math.min(window.devicePixelRatio || 1, 3, Math.sqrt(4000000/(bounds.width*bounds.height)));
    const width = Math.round(bounds.width*dpr), height = Math.round(bounds.height*dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width=width; canvas.height=height; }
    state.width=width; state.height=height;
    const isVideo=state.source==='video';
    const ready=(isVideo&&video.readyState>=2)||(state.source==='image'&&!!photo);
    const media=isVideo?video:photo;
    const mediaWidth=ready?(isVideo?video.videoWidth:(media.naturalWidth||media.width)):0;
    const mediaHeight=ready?(isVideo?video.videoHeight:(media.naturalHeight||media.height)):0;
    const textureDirty=state.textureDirty || (isVideo && ready && !('requestVideoFrameCallback' in video) && !video.paused);
    // Fit the actual projected silhouette, including its depth. This gives
    // portrait and landscape devices the largest view without clipping corners.
    const q=(180-state.angle)*Math.PI/180,c=Math.cos(q),sn=Math.sin(q);
    const center=125*(1-Math.max(c,0));
    let extentX=0,extentY=0;
    for(const moving of [false,true])for(const x of [0,250])for(const z of [0,-8]){
      const wx=moving?-c*x+sn*z:x;
      const wz=moving?sn*x+c*z+.45*(1-c):z;
      const perspective=1600/(1600-wz);
      extentX=Math.max(extentX,Math.abs(wx*perspective-center));
      extentY=Math.max(extentY,178.572*perspective);
    }
    const scale=Math.max(.05,Math.min((bounds.width-24)/(2*extentX),(bounds.height-28)/(2*extentY+6)))*dpr;
    renderer.render({ width,height,scale,
      angle:state.angle,effect:state.effect,demoTime:state.demoTime,fit:state.fit,media,mediaWidth,mediaHeight,ready,textureDirty });
    state.textureDirty=false; state.dirty=false;
  }
  function requestFrame() {
    if(!state.frame && !destroyed && !document.hidden) state.frame=requestAnimationFrame(tick);
  }
  function tick(now) {
    state.frame=0;
    const dt=Math.min((now-(state.lastTime || now))/1000,0.05);
    state.lastTime=now;
    if(state.playing && state.source==='demo') state.demoTime+=dt;
    if(state.animation) {
      const a=state.animation;
      a.elapsed+=dt*Number($('speed').value)*0.65;
      if(a.kind==='preset') {
        const p=clamp(a.elapsed/0.75,0,1), e=p*p*(3-2*p);
        setAngle(a.from+(a.to-a.from)*e,false);
        if(p===1) stopAnimation();
      } else {
        // Open -> fold -> brief hold -> unfold -> settle. Reversible at any frame.
        const t=a.elapsed;
        let angle;
        if(t<0.55) angle=180;
        else if(t<2.9) {const p=(t-0.55)/2.35;angle=180*(1-p*p*(3-2*p));}
        else if(t<3.55) angle=0;
        else if(t<6.25) {const p=(t-3.55)/2.7;angle=180*p*p*(3-2*p);}
        else {angle=180; stopAnimation();}
        setAngle(angle,false);
      }
    }
    if(state.dirty || state.playing || state.animation) render();
    if(state.animation || (state.playing && state.source==='demo') || (state.source==='video' && !video.paused && !('requestVideoFrameCallback' in video))) requestFrame();
  }
  function invalidate(){state.dirty=true;requestFrame();}
  function setAngle(angle, cancel = true) {
    if(cancel) stopAnimation();
    state.angle=clamp(angle,0,180);
    $('angle').value=String(state.angle);
    $('angle').style.setProperty('--range',`${state.angle/1.8}%`);
    $('angleValue').innerHTML=`${Math.round(state.angle)}<span>°</span>`;
    $('angle').setAttribute('aria-valuetext',`${Math.round(state.angle)} 度`);
    $('viewLabel').textContent=state.angle>179?'内屏 · 完全展开':state.angle<1?'外屏 · 完全闭合':state.angle>90?'内屏 · 折叠中':'外屏 · 折叠中';
    document.querySelectorAll('[data-angle]').forEach(b=>{
      const active=Math.abs(Number(b.dataset.angle)-state.angle)<0.5;
      b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
    });
    invalidate();
  }
  function stopAnimation(){state.animation=null; $('animateText').textContent='播放开合动画'; $('animateFold').setAttribute('aria-pressed','false');}
  function animatePreset(to) {
    stopAnimation();
    if(reducedMotion){setAngle(to);return;}
    state.animation={kind:'preset',from:state.angle,to,elapsed:0};state.lastTime=0;requestFrame();
  }
  function playFold() {
    if(state.animation?.kind==='cycle'){stopAnimation();return;}
    setAngle(180);
    state.animation={kind:'cycle',elapsed:0};state.lastTime=0;
    $('animateText').textContent='停止动画'; $('animateFold').setAttribute('aria-pressed','true'); requestFrame();
  }
  function updatePlayback(){
    for(const id of ['playVideo','quickPlayback']){
      const button=$(id),label=state.source==='image'?'静态照片':state.playing?'暂停画面':'播放画面';
      button.innerHTML=state.playing?'<span aria-hidden="true">Ⅱ</span><span>暂停</span>':'<span aria-hidden="true">▷</span><span>播放</span>';
      button.setAttribute('aria-label',label);button.title=label;
      button.disabled=state.source==='image'||state.source==='loading';
      if(state.source==='image')button.textContent='照片';
    }
    $('muteVideo').disabled=state.source!=='video';
    $('muteVideo').innerHTML=video.muted?'♪ <span>已静音</span>':'♪ <span>有声音</span>';
    $('muteVideo').setAttribute('aria-label',video.muted?'开启视频声音':'关闭视频声音');
  }
  async function requestVideoPlayback(){
    if(state.source!=='video'||!videoWantsPlay)return;
    const generation=state.mediaGeneration,request=++playRequest;
    const current=()=>generation===state.mediaGeneration&&request===playRequest&&videoWantsPlay;
    playPending=true;
    try{
      // Call play() before any await, directly from file selection or a button
      // click, so WebViews can use that user activation while it is available.
      await video.play();
      if(!current())return;
      state.playing=!video.paused;playbackBlocked=false;status();
    }catch{
      if(!current())return;
      state.playing=false;playbackBlocked=true;
      status('视频未能自动开始，请点主界面的「播放」按钮。');
    }finally{
      if(current()){playPending=false;updatePlayback();invalidate();}
    }
  }
  function clearVideo(){
    videoWantsPlay=false;playRequest++;playPending=false;playbackBlocked=false;
    video.autoplay=false;video.onloadeddata=null;video.oncanplay=null;video.onerror=null;
    video.pause();video.removeAttribute('src');video.load();
  }
  function resetMedia(){
    state.mediaGeneration++;clearVideo();photo=null;
    if(state.objectURL) URL.revokeObjectURL(state.objectURL);
    state.objectURL=null;state.source='demo';state.playing=!reducedMotion;video.muted=true;
    $('mediaName').textContent='流光 · 内置演示';$('mediaInfo').textContent='动态色彩 / 循环播放';
    $('mediaThumb').style.backgroundImage='';status();updatePlayback();invalidate();
  }
  function loadMedia(file){
    if(!file) return;
    const isImage=file.type.startsWith('image/')||/\.(jpe?g|png|webp|avif|gif|heic|heif|bmp)$/i.test(file.name);
    if(!isImage&&!file.type.startsWith('video/')&&!/\.(mp4|mov|m4v|webm|ogv)$/i.test(file.name)){status('请选择照片或视频，例如 JPG、PNG、MP4 或 MOV。',true);return;}
    state.mediaGeneration++;const generation=state.mediaGeneration;
    clearVideo();photo=null;
    const oldURL=state.objectURL;
    state.objectURL=URL.createObjectURL(file);state.source='loading';state.playing=false;video.muted=true;
    $('mediaName').textContent=file.name; $('mediaName').title=file.name;
    $('mediaInfo').textContent='正在读取…';status('正在本机读取，不会上传…');
    if(oldURL)URL.revokeObjectURL(oldURL);
    if(isImage){
      const image=new Image();image.decoding='async';
      image.onload=()=>{
        if(generation!==state.mediaGeneration)return;
        const limit=Math.min(gl?gl.getParameter(gl.MAX_TEXTURE_SIZE):4096,8192);
        const ratio=Math.min(1,limit/Math.max(image.naturalWidth,image.naturalHeight));
        photo=image;
        if(ratio<1){const resized=document.createElement('canvas');resized.width=Math.round(image.naturalWidth*ratio);resized.height=Math.round(image.naturalHeight*ratio);resized.getContext('2d').drawImage(image,0,0,resized.width,resized.height);photo=resized;}
        state.source='image';state.playing=false;state.textureDirty=true;
        $('mediaInfo').textContent=`${image.naturalWidth} × ${image.naturalHeight} / 照片`;
        status();updatePlayback();invalidate();
      };
      image.onerror=()=>{
        if(generation!==state.mediaGeneration)return;
        resetMedia();status('浏览器无法读取这张照片，请尝试 JPG、PNG 或 WebP。',true);
      };
      image.src=state.objectURL;updatePlayback();invalidate();return;
    }
    // Mark a selected video before decoding so the visible play button is usable
    // even when a WebView waits for another tap before loading the first frame.
    state.source='video';videoWantsPlay=true;video.autoplay=true;
    let retriedWhenReady=false;
    video.onloadeddata=video.oncanplay=()=>{
      if(generation!==state.mediaGeneration) return;
      state.textureDirty=true;
      const seconds=Number.isFinite(video.duration)?Math.round(video.duration):0;
      $('mediaInfo').textContent=`${video.videoWidth} × ${video.videoHeight} / ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
      if(!playbackBlocked)status();
      if(videoWantsPlay&&video.paused&&!playPending&&!retriedWhenReady){
        retriedWhenReady=true;requestVideoPlayback();
      }
      updatePlayback();invalidate();
    };
    video.onerror=()=>{
      if(generation!==state.mediaGeneration) return;
      resetMedia();$('mediaInfo').textContent='所选视频无法解码';
      status('浏览器无法播放此视频。请尝试 H.264 编码的 MP4，或在 Safari 中打开 HEVC 视频。',true);
    };
    video.src=state.objectURL; video.load();
    requestVideoPlayback();
    updatePlayback();invalidate();
  }
  function watchVideoFrames(){
    if(!('requestVideoFrameCallback' in video)||state.videoFramePending||destroyed)return;
    state.videoFramePending=true;
    video.requestVideoFrameCallback(()=>{state.videoFramePending=false;state.textureDirty=true;invalidate();if(!destroyed)watchVideoFrames();});
  }

  $('chooseVideo').addEventListener('click',()=>$('fileInput').click());
  $('fileInput').addEventListener('change',e=>{loadMedia(e.target.files?.[0]);e.target.value='';});
  $('resetMedia').addEventListener('click',resetMedia);
  function togglePlayback(){
    if(state.source==='loading'||state.source==='image')return;
    if(state.source==='video'){
      if(!state.playing){videoWantsPlay=true;video.autoplay=true;requestVideoPlayback();}
      else{
        videoWantsPlay=false;video.autoplay=false;playRequest++;playPending=false;
        video.pause();state.playing=false;status();
      }
    }else state.playing=!state.playing;
    state.lastTime=0;updatePlayback();invalidate();
  }
  $('playVideo').addEventListener('click',togglePlayback);
  $('quickPlayback').addEventListener('click',togglePlayback);
  for(const event of ['playing','pause','ended'])video.addEventListener(event,()=>{
    if(state.source!=='video')return;
    if(!videoWantsPlay&&!video.paused){video.pause();return;}
    state.playing=!video.paused&&video.readyState>=2;
    if(state.playing){playbackBlocked=false;status();}
    updatePlayback();invalidate();
  });
  // A bounded retry when WeChat finishes initializing its browser bridge.
  // An explicit pause always wins over readiness and lifecycle events.
  document.addEventListener('WeixinJSBridgeReady',()=>{
    if(videoWantsPlay&&video.paused&&!playPending)requestVideoPlayback();
  },{once:true});
  $('muteVideo').addEventListener('click',()=>{video.muted=!video.muted;updatePlayback();});
  $('fitMode').addEventListener('change',e=>{state.fit=e.target.value;invalidate();});
  $('angle').addEventListener('input',e=>setAngle(Number(e.target.value)));
  document.querySelectorAll('[data-angle]').forEach(b=>b.addEventListener('click',()=>animatePreset(Number(b.dataset.angle))));
  $('animateFold').addEventListener('click',playFold);
  $('glassEffect').addEventListener('change',e=>{state.effect=e.target.checked;invalidate();});
  // Recognize a double tap on pointer-up, inside the user activation window.
  // A drag, long press or second finger cancels tap recognition.
  canvas.addEventListener('pointerdown',e=>{
    if(!e.isPrimary){pointer=null;lastTap=null;return;}
    if(e.button!==0)return;
    stopAnimation();pointer={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),angle:state.angle,moved:false};canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(pointer?.id!==e.pointerId)return;
    if(Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>8)pointer.moved=true;
    if(pointer.moved){lastTap=null;setAngle(pointer.angle-(e.clientX-pointer.x)*180/(canvas.clientWidth*.65));}
  });
  canvas.addEventListener('pointerup',e=>{
    if(pointer?.id!==e.pointerId)return;
    const p=pointer,now=performance.now();pointer=null;
    if(p.moved||now-p.time>350){lastTap=null;return;}
    if(lastTap&&now-lastTap.time<320&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<26){lastTap=null;toggleFullscreen();}
    else lastTap={x:e.clientX,y:e.clientY,time:now};
  });
  canvas.addEventListener('pointercancel',()=>{pointer=null;lastTap=null;});
  canvas.addEventListener('lostpointercapture',()=>{pointer=null;});
  canvas.addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setAngle(state.angle+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?15:3));}
    else if(e.key==='Home'){e.preventDefault();setAngle(0);}
    else if(e.key==='End'){e.preventDefault();setAngle(180);}
    else if(e.code==='Space'){e.preventDefault();playFold();}
    else if(e.key.toLowerCase()==='f'){e.preventDefault();toggleFullscreen();}
  });
  function syncFullscreen(){
    const native=!!(document.fullscreenElement||document.webkitFullscreenElement);
    document.body.classList.toggle('immersive',native||fallbackFullscreen);
    $('fullscreen').setAttribute('aria-label',native?'退出全屏':fallbackFullscreen?'退出沉浸模式':'进入全屏');
    $('fullscreen').setAttribute('aria-pressed',String(native||fallbackFullscreen));
    invalidate();
  }
  async function toggleFullscreen(){
    if(fullscreenBusy)return;
    fullscreenBusy=true;
    try{
      if(document.fullscreenElement||document.webkitFullscreenElement){
        await (document.exitFullscreen?document.exitFullscreen():document.webkitExitFullscreen());
      }else if(fallbackFullscreen){fallbackFullscreen=false;status();}
      else{
        const root=document.documentElement;
        try{
          if(root.requestFullscreen)await root.requestFullscreen({navigationUI:'hide'});
          else if(root.webkitRequestFullscreen)await root.webkitRequestFullscreen();
          else throw Error('Fullscreen unavailable');
          status();
        }catch{
          fallbackFullscreen=true;
          const notice='当前浏览器无法隐藏地址栏，已切换沉浸模式。再次双击可退出。';
          status(notice);
          window.setTimeout(()=>{if($('status').textContent===notice)status();},6000);
        }
      }
    }catch{status('暂时无法退出全屏，请使用浏览器的退出全屏按钮或 Esc 键。',true);}
    finally{fullscreenBusy=false;syncFullscreen();}
  }
  $('fullscreen').addEventListener('click',toggleFullscreen);
  document.addEventListener('fullscreenchange',syncFullscreen);
  document.addEventListener('webkitfullscreenchange',syncFullscreen);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&fallbackFullscreen){fallbackFullscreen=false;status();syncFullscreen();}});
  $('openSettings').addEventListener('click',()=>{settings.showModal();});
  $('closeSettings').addEventListener('click',()=>settings.close());
  settings.addEventListener('click',e=>{const r=settings.getBoundingClientRect();if(e.target===settings&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))settings.close();});
  let dragDepth=0;
  $('viewer').addEventListener('dragenter',e=>{e.preventDefault();dragDepth++;$('viewer').classList.add('drag-over');});
  $('viewer').addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});
  $('viewer').addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('viewer').classList.remove('drag-over');}});
  $('viewer').addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('viewer').classList.remove('drag-over');loadMedia(e.dataTransfer.files?.[0]);});
  document.addEventListener('dragover',e=>e.preventDefault());
  document.addEventListener('drop',e=>e.preventDefault());
  document.addEventListener('visibilitychange',()=>{state.lastTime=0;if(!document.hidden)invalidate();else if(state.frame){cancelAnimationFrame(state.frame);state.frame=0;}});
  new ResizeObserver(invalidate).observe($('viewer'));
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();destroyed=true;if(state.frame)cancelAnimationFrame(state.frame);state.frame=0;status('图形画面暂时中断，正在等待恢复。',true);});
  canvas.addEventListener('webglcontextrestored',()=>{try{destroyed=false;initializeRenderer();watchVideoFrames();status();invalidate();}catch{status('图形画面无法恢复，请刷新页面。',true);}});
  window.addEventListener('pagehide',()=>{playRequest++;playPending=false;video.pause();if(state.frame)cancelAnimationFrame(state.frame);state.frame=0;});
  window.addEventListener('pageshow',()=>{state.lastTime=0;if(videoWantsPlay&&video.paused)requestVideoPlayback();invalidate();});
  if(gl){try{initializeRenderer();watchVideoFrames();invalidate();}catch(error){console.error('Renderer initialization failed:',error);destroyed=true;$('canvasError').hidden=false;}}
  else{$('canvasError').hidden=false;}
  updatePlayback();

  const modelContext=document.modelContext;
  if(modelContext?.registerTool){
    const lifecycle=new AbortController();
    try{Promise.resolve(modelContext.registerTool({
      name:'set_fold_angle',title:'设置折叠角度',
      description:'Set the visible phone opening angle from 0 (closed) to 180 (open), stop automatic folding, and optionally enable or disable the frosted glass transition. Does not access or upload media.',
      inputSchema:{type:'object',properties:{angle:{type:'number',minimum:0,maximum:180},glassEffect:{type:'boolean'}},required:['angle'],additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:false},
      execute(input){if(!input||typeof input.angle!=='number'||!Number.isFinite(input.angle)||input.angle<0||input.angle>180||Object.keys(input).some(k=>!['angle','glassEffect'].includes(k))||(input.glassEffect!==undefined&&typeof input.glassEffect!=='boolean'))throw new Error('angle must be between 0 and 180; glassEffect must be boolean.');
        if(input.glassEffect!==undefined){state.effect=input.glassEffect;$('glassEffect').checked=state.effect;}
        setAngle(input.angle);return {angle:state.angle,glassEffect:state.effect};}
    },{signal:lifecycle.signal})).catch(()=>{});}catch{/* Browsers without the proposed API keep the same UI. */}
  }
})();
