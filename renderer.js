'use strict';

// Both displays sample a stationary image plane. The housing is a pair of
// rounded, extruded solids; UI is composited before the spatial frost pass.
window.FoldRenderer = class FoldRenderer {
  constructor(gl) {
    this.gl = gl;
    this.lastComposite = '';
    const vertex = `attribute vec2 aPosition; varying vec2 vUV;
      void main(){vUV=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}`;
    const media = `
      uniform sampler2D uVideo;
      uniform float uUseVideo,uTime,uAspect,uContain;
      vec3 demo(vec2 p){
        float t=uTime*.13;
        float wave=p.x*.76+p.y*.33+.19*sin(p.y*3.7+t);
        float ribbon=sin(wave*7.4-t)*.5+.5;
        vec3 c=mix(vec3(.055,.075,.25),vec3(.29,.60,.84),smoothstep(.08,.64,ribbon));
        c=mix(c,vec3(1.,.49,.30),smoothstep(.59,.9,ribbon));
        c=mix(c,vec3(1.,.82,.60),pow(ribbon,10.)*.95);
        c*=.69+.31*smoothstep(0.,.5,.5+.5*sin(wave*19.+p.y*1.4-t));
        return c+vec3(.025,.03,.06)*sin(p.y*3.);
      }
      vec3 wallpaper(vec2 uv,float displayAspect){
        if(uUseVideo<.5)return demo(uv);
        vec2 p=uv-.5;float ratio=displayAspect/uAspect;
        if(uContain>.5){if(ratio>1.)p.x*=ratio;else p.y/=ratio;}
        else{if(ratio>1.)p.y/=ratio;else p.x*=ratio;}
        vec3 color=texture2D(uVideo,clamp(p+.5,0.,1.)).rgb;
        if(uContain>.5&&(abs(p.x)>.5||abs(p.y)>.5))color=vec3(.006);
        return color;
      }`;
    const scene = `precision highp float;
      ${media}
      uniform vec2 uResolution;
      uniform float uScale,uAngle,uEffect;
      uniform sampler2D uInner,uOuter,uHUDInner,uHUDOuter;
      const float W=250.;
      const float H=357.142857;
      const float T=8.;
      const float B=8.;
      const float R=31.;
      const float CAMERA=1600.;
      float box(vec2 p,vec2 b,float r){vec2 d=abs(p)-b+r;return min(max(d.x,d.y),0.)+length(max(d,0.))-r;}
      float shape(vec2 p,float inset,bool continuous){
        float radius=p.x>W*.5?R:1.2;
        float d=box(p-vec2(W*.5,0.),vec2(W*.5-inset,H*.5-inset),max(.1,radius-inset));
        // A continuous display has no vertical mask or bezel along its hinge.
        if(continuous&&p.x<W*.5)d=abs(p.y)-(H*.5-inset);
        return d;
      }
      vec3 clearContent(vec2 uv,bool outer){
        vec3 color=wallpaper(uv,outer?(W-2.*B)/(H-2.*B):(2.*W-2.*B)/(H-2.*B));
        vec4 hud;
        if(outer)hud=texture2D(uHUDOuter,uv);else hud=texture2D(uHUDInner,uv);
        return mix(color,hud.rgb,hud.a);
      }
      vec3 content(vec2 uv,bool outer,float blur){
        // Endpoints sample the original video and high-resolution vector HUD.
        // They never pass through the lower-resolution frosted image pyramid.
        if(blur<.00001)return clearContent(uv,outer);
        float naturalLod=log2(max(1.,1024./((H-2.*B)*uScale)));
        float lod=log2(max(1.,blur*1024.))-naturalLod;
        vec2 delta=vec2(blur*(outer?1.46:.70),blur)*.36;
        if(outer){
          vec3 c=texture2D(uOuter,uv,lod).rgb*.4;
          c+=(texture2D(uOuter,uv+vec2(delta.x,0.),lod).rgb+texture2D(uOuter,uv-vec2(delta.x,0.),lod).rgb)*.15;
          c+=(texture2D(uOuter,uv+vec2(0.,delta.y),lod).rgb+texture2D(uOuter,uv-vec2(0.,delta.y),lod).rgb)*.15;
          if(blur<.0015)c=mix(clearContent(uv,true),c,smoothstep(0.,.0015,blur));
          return c;
        }
        vec3 c=texture2D(uInner,uv,lod).rgb*.4;
        c+=(texture2D(uInner,uv+vec2(delta.x,0.),lod).rgb+texture2D(uInner,uv-vec2(delta.x,0.),lod).rgb)*.15;
        c+=(texture2D(uInner,uv+vec2(0.,delta.y),lod).rgb+texture2D(uInner,uv-vec2(0.,delta.y),lod).rgb)*.15;
        if(blur<.0015)c=mix(clearContent(uv,false),c,smoothstep(0.,.0015,blur));
        return c;
      }
      vec3 face(vec2 p,vec3 world,bool moving,bool outer,float sn){
        bool continuous=!outer;
        float edge=shape(p,0.,continuous);
        float rimLight=.43+.20*cos(p.y/H*5.+p.x/W*1.5);
        vec3 metal=vec3(.87,.92,1.)*rimLight;
        // Thin polished lip and graphite glass border, measured from the video.
        vec3 color=metal;
        if(edge< -.85)color=vec3(.10,.115,.13)+vec3(.13)*exp(-pow((edge+1.8)*1.1,2.));
        if(edge< -2.8)color=vec3(.015,.018,.021);
        float se=shape(p,B,continuous);
        float aa=.7/uScale;
        if(se<aa){
          vec2 projectedPoint=world.xy*CAMERA/(CAMERA-world.z);
          vec2 halfSize=outer?vec2(W*.5-B,H*.5-B):vec2(W-B,H*.5-B);
          vec2 origin=outer?vec2(W*.5,0.):vec2(0.);
          vec2 localImage=outer?vec2(p.x-W*.5,p.y):vec2(moving?-p.x:p.x,p.y);
          float opening=abs(sn);
          // The back surface has physical depth; suppress its tiny perspective
          // offset at closure so the settled cover fills the display exactly.
          float projection=uEffect*(outer?smoothstep(0.,.035,opening):1.);
          vec2 imagePoint=mix(localImage,projectedPoint-origin,projection);
          vec2 uv=imagePoint/(2.*halfSize)*vec2(1.,-1.)+.5;
          float angleBlur=pow(opening,.8)*smoothstep(0.,.04,opening);
          // Linear in distance from the hinge, in display space (not UV space).
          float blur=moving?uEffect*.045*angleBlur*clamp(p.x/W,0.,1.):0.;
          vec3 picture=content(clamp(uv,0.,1.),outer,blur);
          // Anchor the lateral mask to the glass. A stationary x cutoff pulls
          // away from the hinge as the thick cover rotates, creating a gap.
          vec2 maskPoint=vec2(localImage.x,imagePoint.y);
          float imageRadius=outer?(maskPoint.x<0.?1.:R-B):R-B;
          float projectionEdge=box(maskPoint,halfSize,imageRadius);
          // Frost diffuses picture light into the projected dark margin. Its
          // mask has the same spatial blur footprint as the image, rather than
          // cutting the already-blurred image off with a sharp black polygon.
          float diffusion=max(.65,blur*(H-2.*B)*2.6);
          float projectionMask=1.-smoothstep(-diffusion,diffusion,projectionEdge);
          picture*=projectionMask;
          float glass=blur/.045;
          picture=mix(picture,picture*.89+vec3(.055,.06,.065)*projectionMask,glass*.40);
          // Smooth, restrained edge shading remains inside the projected image.
          float sideShade=moving?.18*uEffect*angleBlur*pow(p.x/W,2.):0.;
          picture*=1.-sideShade;
          color=mix(color,picture,1.-smoothstep(-aa,aa,se));
          if(outer){
            // This is physical hardware, so the camera never enters the blur pass.
            vec2 lens=p-vec2(W-31.,H*.5-31.);
            float d=length(lens);
            vec3 lensColor=vec3(.008,.010,.014);
            lensColor+=vec3(.025,.033,.055)*exp(-pow((d-3.7)*.8,2.));
            lensColor+=vec3(.065,.078,.115)*exp(-dot(lens-vec2(-1.7,2.0),lens-vec2(-1.7,2.0))*.6);
            color=mix(color,lensColor,1.-smoothstep(8.5,9.1,d));
          }
        }
        return color;
      }
      vec3 side(vec3 p,vec3 n,bool moving){
        float depth=clamp(-p.z/T,0.,1.);
        float band=.14+.32*pow(.5+.5*cos(depth*6.283-1.2),3.);
        band+=.32*exp(-pow((depth-.10)*25.,2.));
        band+=.22*exp(-pow((depth-.90)*24.,2.));
        float reflect=.55+.45*abs(n.x*.8+n.y*.3);
        vec3 color=vec3(.86,.91,.96)*band*reflect;
        float antenna=1.-smoothstep(1.25,1.8,abs(abs(p.y)-H*.39));
        if(p.x>W-5.)color=mix(color,vec3(.39,.42,.44),antenna*.85);
        // A side-key inset on the stationary body's outside rail.
        if(!moving&&p.x>W-.2&&p.y>38.&&p.y<77.&&depth>.22&&depth<.78)color*=.48;
        return color;
      }
      void candidate(float t,vec3 n,vec3 o,vec3 d,inout float nearest,inout vec3 hitNormal){
        if(t<=.0001||t>=nearest)return;
        vec3 p=o+d*t;
        if(p.z< -T-.001||p.z>.001)return;
        if(p.x<-.001||p.x>W+.001||abs(p.y)>H*.5+.001)return;
        // Plane portions exclude rounded corners, which the cylinders handle.
        float rr=p.x>W*.5?R:1.2;
        if(abs(n.x)>.5&&abs(p.y)>H*.5-rr)return;
        if(abs(n.y)>.5&&(p.x<1.2||p.x>W-R))return;
        nearest=t;hitNormal=n;
      }
      vec4 trace(vec3 eye,vec3 ray,vec3 axis,vec3 normal,vec3 hinge,bool moving,float sn,out float distance){
        vec3 delta=eye-hinge;
        vec3 o=vec3(dot(delta,axis),delta.y,dot(delta,normal));
        vec3 d=vec3(dot(ray,axis),ray.y,dot(ray,normal));
        float nearest=10000.;vec3 hitNormal=vec3(0.);
        bool outer=moving&&d.z>0.;
        float coverage=1.;
        if(abs(d.z)>.00001){
          float z=d.z<0.?0.:-T;
          float t=(z-o.z)/d.z;
          vec3 p=o+d*t;
          float edge=shape(p.xy,0.,!outer);
          if(t>.0001&&p.x>=0.&&p.x<=W+.7/uScale&&edge<.7/uScale){
            nearest=t;hitNormal=vec3(0.,0.,d.z<0.?1.:-1.);
            coverage=1.-smoothstep(-.7/uScale,.7/uScale,edge);
          }
        }
        float faceDistance=nearest;
        if(abs(d.x)>.00001){
          candidate(-o.x/d.x,vec3(-1.,0.,0.),o,d,nearest,hitNormal);
          candidate((W-o.x)/d.x,vec3(1.,0.,0.),o,d,nearest,hitNormal);
        }
        if(abs(d.y)>.00001){
          candidate((H*.5-o.y)/d.y,vec3(0.,1.,0.),o,d,nearest,hitNormal);
          candidate((-H*.5-o.y)/d.y,vec3(0.,-1.,0.),o,d,nearest,hitNormal);
        }
        // Four extruded quarter-circles close the rail around its rounded corners.
        float qa=dot(d.xy,d.xy);
        for(int ix=0;ix<2;ix++)for(int iy=0;iy<2;iy++){
          float sx=ix==0?-1.:1.,sy=iy==0?-1.:1.;
          float r=ix==0?1.2:R;
          vec2 center=vec2(ix==0?r:W-r,sy*(H*.5-r));
          vec2 off=o.xy-center;
          float qb=dot(off,d.xy),qc=dot(off,off)-r*r;
          float discriminant=qb*qb-qa*qc;
          if(qa>.00001&&discriminant>=0.){
            float t=(-qb-sqrt(discriminant))/qa;
            vec3 p=o+d*t;
            vec2 q=p.xy-center;
            if(t>.0001&&t<nearest&&p.z>=-T&&p.z<=0.&&q.x*sx>=0.&&q.y*sy>=0.){
              nearest=t;hitNormal=vec3(q/r,0.);
            }
          }
        }
        distance=nearest;
        if(nearest>9999.)return vec4(0.);
        vec3 p=o+d*nearest;
        if(abs(hitNormal.z)>.5){
          return vec4(face(p.xy,eye+ray*nearest,moving,outer,sn),coverage);
        }
        return vec4(side(p,hitNormal,moving),1.);
      }
      void main(){
        float q=(180.-uAngle)*.01745329252;
        float c=cos(q),sn=sin(q);
        float center=W*.5*(1.-max(c,0.));
        vec2 pixel=(gl_FragCoord.xy-uResolution*.5)/uScale;pixel.y-=3.;
        vec3 eye=vec3(0.,0.,CAMERA),ray=vec3(pixel.x+center,pixel.y,-CAMERA);
        float fixedDistance,movingDistance;
        vec4 base=trace(eye,ray,vec3(1.,0.,0.),vec3(0.,0.,1.),vec3(0.),false,sn,fixedDistance);
        vec4 cover=trace(eye,ray,vec3(-c,0.,sn),vec3(sn,0.,c),vec3(0.,0.,.45*(1.-c)),true,sn,movingDistance);
        vec4 front=movingDistance<fixedDistance?cover:base;
        vec4 back=movingDistance<fixedDistance?base:cover;
        float alpha=front.a+back.a*(1.-front.a);
        vec3 color=(front.rgb*front.a+back.rgb*back.a*(1.-front.a))/max(alpha,.0001);
        gl_FragColor=vec4(color,alpha);
      }`;
    const compose = `precision highp float; varying vec2 vUV;
      ${media}
      uniform sampler2D uHUD;
      uniform float uDisplayAspect;
      void main(){
        vec3 color=wallpaper(vUV,uDisplayAspect);
        vec4 hud=texture2D(uHUD,vUV);
        gl_FragColor=vec4(mix(color,hud.rgb,hud.a),1.);
      }`;
    this.main = this.program(vertex,scene,['Resolution','Scale','Angle','Effect','Inner','Outer','Video','HUDInner','HUDOuter','UseVideo','Time','Aspect','Contain']);
    this.compose = this.program(vertex,compose,['Video','HUD','UseVideo','Time','Aspect','DisplayAspect','Contain']);
    this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    this.video=this.makeTexture(0,1,1,false);
    this.inner=this.makeTexture(1,1024,1024,true);
    this.outer=this.makeTexture(2,512,1024,true);
    this.hudInner=this.makeTexture(3,2048,1450,false,this.hud(false));
    this.hudOuter=this.makeTexture(4,1024,1450,false,this.hud(true));
    this.framebuffer=gl.createFramebuffer();
  }
  program(vertex,fragment,names){
    const gl=this.gl,p=gl.createProgram();
    for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
      gl.attachShader(p,shader);gl.deleteShader(shader);
    }
    gl.bindAttribLocation(p,0,'aPosition');gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
    return {program:p,uniforms:Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(p,'u'+n)]))};
  }
  makeTexture(unit,w,h,mip,source){
    const gl=this.gl,texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,mip?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR);
    if(source)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
    else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    if(mip)gl.generateMipmap(gl.TEXTURE_2D);
    return {texture,unit,w,h};
  }
  hud(outer){
    const c=document.createElement('canvas');c.width=outer?1024:2048;c.height=1450;
    const ctx=c.getContext('2d'),h=341.142857,w=outer?234:484;
    ctx.scale(c.width/w,c.height/h);ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.lineCap='round';ctx.lineJoin='round';
    const textX=outer?w*.44:w*.5;
    ctx.textAlign='center';ctx.font='500 9.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
    ctx.globalAlpha=.90;ctx.fillText('Wed Apr 1',textX,h*.083);
    // Dedicated condensed clock outlines: consistent on Windows and iOS,
    // without squeezing a platform UI font or rescaling rasterized letters.
    ctx.save();ctx.translate(textX-57,h*.12);ctx.globalAlpha=.97;
    ctx.lineWidth=8.1;ctx.lineCap='butt';ctx.lineJoin='round';
    ctx.stroke(new Path2D('M 4.5 67 L 4.5 75 C 4.5 94 30.5 94 30.5 75 L 30.5 18 C 30.5 -1 4.5 -1 4.5 18 L 4.5 39 C 4.5 58 30.5 58 30.5 39'));
    ctx.stroke(new Path2D('M 82 5 L 62 72 L 92 72 M 82 5 L 82 92 M 97 15 L 111 5 L 111 92'));
    for(const y of [28,68]){ctx.beginPath();ctx.arc(45,y,5.1,0,Math.PI*2);ctx.fill();}
    ctx.restore();
    const x=w-h*.073;
    {
      const y=h*(outer?.162:.076),r=h*.027;
      ctx.globalAlpha=.96;ctx.lineWidth=1.25;ctx.beginPath();ctx.arc(x,y,r,Math.PI*.78,Math.PI*2.22);ctx.stroke();
      for(let i=0;i<5;i++){const a=Math.PI*.25+i*Math.PI*.125;ctx.beginPath();ctx.arc(x+Math.cos(a)*r,y+Math.sin(a)*r,.70,0,Math.PI*2);ctx.fill();}
      for(const radius of [4.5,2.8]){ctx.lineWidth=.9;ctx.beginPath();ctx.arc(x,y+2,radius,Math.PI*1.20,Math.PI*1.80);ctx.stroke();}
      ctx.beginPath();ctx.arc(x,y+1.8,.8,0,Math.PI*2);ctx.fill();
    }
    const roundRect=(x,y,w,h,r)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);};
    for(const [kind,y] of [['flash',h*.81],['camera',h*.915]]){
      const r=h*.0355;ctx.globalAlpha=.19;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=.36;ctx.lineWidth=.55;ctx.stroke();ctx.globalAlpha=.97;
      if(kind==='flash'){
        roundRect(x-2.0,y-2.8,4,8.5,1);ctx.fill();
        ctx.beginPath();ctx.moveTo(x-3.1,y-5);ctx.lineTo(x+3.1,y-5);ctx.lineTo(x+2,y-2.5);ctx.lineTo(x-2,y-2.5);ctx.closePath();ctx.fill();
        roundRect(x-3.2,y-6.6,6.4,1,0.4);ctx.fill();
        ctx.globalCompositeOperation='destination-out';roundRect(x-.55,y-.6,1.1,2.8,.5);ctx.fill();ctx.globalCompositeOperation='source-over';
      }else{
        roundRect(x-5.5,y-3.6,11,8,1.6);ctx.fill();roundRect(x-2.8,y-5.0,5.5,2,1);ctx.fill();
        ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.arc(x,y+.3,2.7,0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation='source-over';
        ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y+.3,2,0,Math.PI*2);ctx.stroke();
        ctx.beginPath();ctx.arc(x+3.6,y-1.9,.55,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.globalAlpha=.95;const bar=outer?h*.25:h*.40;
    roundRect(w*.5-bar*.5,h*.981-1.1,bar,2.2,1.1);ctx.fill();
    return c;
  }
  use(p){const gl=this.gl;gl.useProgram(p.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);}
  render(s){
    const gl=this.gl;
    if(s.ready&&s.textureDirty){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.video.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,s.media);}
    const key=`${s.ready}/${s.fit}/${s.mediaWidth}/${s.mediaHeight}/${s.ready?0:s.demoTime}`;
    if(s.textureDirty||key!==this.lastComposite){
      this.use(this.compose);const u=this.compose.uniforms;
      gl.uniform1i(u.Video,0);gl.uniform1f(u.UseVideo,s.ready?1:0);gl.uniform1f(u.Time,s.demoTime);
      gl.uniform1f(u.Aspect,s.ready?s.mediaWidth/s.mediaHeight:1.4);gl.uniform1f(u.Contain,s.fit==='contain'?1:0);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);
      for(const [target,hud,aspect] of [[this.inner,this.hudInner,484/341.142857],[this.outer,this.hudOuter,234/341.142857]]){
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target.texture,0);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Display buffer unavailable');
        gl.viewport(0,0,target.w,target.h);gl.uniform1i(u.HUD,hud.unit);gl.uniform1f(u.DisplayAspect,aspect);gl.drawArrays(gl.TRIANGLES,0,6);
        gl.activeTexture(gl.TEXTURE0+target.unit);gl.bindTexture(gl.TEXTURE_2D,target.texture);gl.generateMipmap(gl.TEXTURE_2D);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);this.lastComposite=key;
    }
    this.use(this.main);const u=this.main.uniforms;gl.viewport(0,0,s.width,s.height);
    gl.uniform2f(u.Resolution,s.width,s.height);gl.uniform1f(u.Scale,s.scale);gl.uniform1f(u.Angle,s.angle);gl.uniform1f(u.Effect,s.effect?1:0);
    gl.uniform1i(u.Inner,1);gl.uniform1i(u.Outer,2);gl.uniform1i(u.Video,0);
    gl.uniform1i(u.HUDInner,3);gl.uniform1i(u.HUDOuter,4);
    gl.uniform1f(u.UseVideo,s.ready?1:0);gl.uniform1f(u.Time,s.demoTime);
    gl.uniform1f(u.Aspect,s.ready?s.mediaWidth/s.mediaHeight:1.4);
    gl.uniform1f(u.Contain,s.fit==='contain'?1:0);gl.drawArrays(gl.TRIANGLES,0,6);
  }
};
