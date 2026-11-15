"use strict";

// Mapas equiretangulares reais, projetados em esferas no fragment shader.
// A cena comprime tamanhos, distâncias e tempo; não representa efemérides.
(() => {
    const scene = document.getElementById("solarSystem");
    if (!scene) return;
    const orbitCanvas = scene.querySelector(".solar-orbits");
    const bodyCanvas = scene.querySelector(".solar-bodies");
    const orbit = orbitCanvas.getContext("2d");
    const gl = bodyCanvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: true, powerPreference: "low-power" });
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const assetRoot = new URL(scene.dataset.assets, location.href);
    const planets = [
        { id: "mercury", name: "Mercúrio", orbit: .21, size: .23, phase: 3.2, period: 88, spin: .025, tilt: .01, atmosphere: 0 },
        { id: "venus", name: "Vênus", orbit: .31, size: .38, phase: 5.5, period: 225, spin: -.009, tilt: 3.09, atmosphere: .08 },
        { id: "earth", name: "Terra", orbit: .42, size: .40, phase: 5.82, period: 365, spin: .10, tilt: .41, atmosphere: .30 },
        { id: "mars", name: "Marte", orbit: .52, size: .28, phase: 2.62, period: 687, spin: .09, tilt: .44, atmosphere: .03 },
        { id: "jupiter", name: "Júpiter", orbit: .68, size: 1.18, phase: .42, period: 4333, spin: .18, tilt: .05, atmosphere: .07 },
        { id: "saturn", name: "Saturno", orbit: .81, size: .97, phase: 3.72, period: 10759, spin: .16, tilt: -.34, atmosphere: .05, ring: true },
        { id: "uranus", name: "Urano", orbit: .92, size: .66, phase: 4.88, period: 30687, spin: -.12, tilt: 1.71, atmosphere: .15 },
        { id: "neptune", name: "Netuno", orbit: 1, size: .64, phase: 6.10, period: 60190, spin: .13, tilt: .49, atmosphere: .17 },
    ];
    const atmosphereColors = {
        venus: [1, .76, .44], earth: [.22, .53, 1], mars: [.95, .43, .23],
        jupiter: [.84, .77, .63], saturn: [.94, .83, .60], uranus: [.45, .88, .96], neptune: [.25, .48, .96],
    };
    let width = 1, height = 1, dpr = 1, time = 0, last = 0, frame = null;
    let ready = false, lost = false, hover = { x: -1000, y: -1000 };
    let reaction = null;
    let program, uniforms, images = {}, textures = {};
    const fallbackSprites = new Map();
    const solarHalo = createSolarHalo();
    let fallback;

    const vertexSource = [
        "attribute vec2 aPosition; varying vec2 vPoint;",
        "uniform vec2 uCenter; uniform vec2 uViewport; uniform float uRadius; uniform float uExtent;",
        "void main(){ vPoint=aPosition*uExtent; vec2 pixel=uCenter+aPosition*uRadius*uExtent;",
        "gl_Position=vec4(pixel/uViewport*2.0-1.0,0.0,1.0); }",
    ].join("\n");
    const fragmentSource = [
        "#ifdef GL_FRAGMENT_PRECISION_HIGH",
        "precision highp float;",
        "#else",
        "precision mediump float;",
        "#endif",
        "varying vec2 vPoint;",
        "uniform sampler2D uMap; uniform sampler2D uClouds; uniform sampler2D uNight; uniform sampler2D uRings;",
        "uniform vec3 uLight; uniform vec3 uAtmosphereColor; uniform float uPixel; uniform float uBump;",
        "uniform float uSpin; uniform float uTilt; uniform float uAtmosphere;",
        "uniform float uSun; uniform float uEarth; uniform float uRing; uniform float uTime;",
        "const float PI=3.14159265;",
        "vec2 uvFor(vec3 n,float spin){ float c=cos(uTilt),s=sin(uTilt);",
        "n.xy=mat2(c,-s,s,c)*n.xy; return vec2(atan(n.z,n.x)/(2.0*PI)+.5+spin,asin(clamp(n.y,-1.0,1.0))/PI+.5); }",
        "vec3 displayColor(vec3 linearColor){return pow(vec3(1.0)-exp(-linearColor*1.45),vec3(.454545));}",
        "void main(){ vec2 p=vPoint; float r=length(p); vec4 color=vec4(0.0);",
        "if(uSun>.5){",
        "if(r<1.0){ vec3 n=vec3(p,sqrt(1.0-r*r)); vec3 tex=texture2D(uMap,uvFor(n,uSpin)).rgb;",
        "float limb=.52+.48*pow(n.z,.42); vec3 heat=mix(pow(tex,vec3(.82)),vec3(1.0,.90,.65),.28);",
        "color=vec4(displayColor(pow(heat,vec3(2.2))*2.05*limb),1.0-smoothstep(1.0-uPixel,1.0,r)); }",
        "else {discard;}",
        "} else {",
        "vec3 normal=vec3(0.0); float surfaceDepth=-10.0;",
        "if(r<1.0){ normal=vec3(p,sqrt(1.0-r*r)); surfaceDepth=normal.z; vec2 uv=uvFor(normal,uSpin);",
        "vec3 tex=texture2D(uMap,uv).rgb; vec3 shadeNormal=normal;",
        "if(uBump>0.0){ vec3 luma=vec3(.299,.587,.114);float b=dot(tex,luma);",
        "vec2 gradient=vec2(dot(texture2D(uMap,uv+vec2(.001,0.)).rgb,luma)-b,dot(texture2D(uMap,uv+vec2(0.,.001)).rgb,luma)-b);",
        "shadeNormal=normalize(normal+vec3(-gradient*uBump,0.0)); }",
        "float ndotl=dot(shadeNormal,uLight);float diffuse=max(0.0,ndotl);",
        "if(uRing>.5){float a=-.34;vec3 ringNormal=normalize(vec3(-sin(a)*2.963,cos(a)*2.963,1.0));",
        "float denominator=dot(uLight,ringNormal);float distance=-dot(normal,ringNormal)/(abs(denominator)<.001?.001:denominator);",
        "if(distance>0.0){vec3 hit=normal+distance*uLight;vec2 q=mat2(cos(a),-sin(a),sin(a),cos(a))*hit.xy;",
        "float rr=length(vec2(q.x,q.y/.32));if(rr>1.24&&rr<2.32)diffuse*=1.0-texture2D(uRings,vec2((rr-1.24)/1.08,.5)).a*.78;}}",
        "if(uEarth>.5){ float cloud=texture2D(uClouds,uvFor(normal,uSpin+uTime*.001)).r;",
        "float cloudShadow=texture2D(uClouds,uvFor(normal,uSpin+uTime*.001)+uLight.xy*.003).r;tex*=1.0-cloudShadow*.12;",
        "tex=mix(tex,vec3(.96,.98,1.0),smoothstep(.25,.84,cloud)*.87); }",
        "vec3 lit=pow(tex,vec3(2.2))*(.026+diffuse*1.25);",
        "if(uEarth>.5){ lit+=pow(texture2D(uNight,uv).rgb,vec3(2.2))*(1.0-smoothstep(-.12,.18,ndotl))*.48;",
        "float ocean=step(tex.r,tex.b)*step(tex.g,tex.b); vec3 halfLight=normalize(uLight+vec3(0.0,0.0,1.0));",
        "lit+=vec3(.45,.61,.83)*pow(max(0.0,dot(normal,halfLight)),48.0)*ocean*.32; }",
        "float rim=pow(1.0-normal.z,3.2)*uAtmosphere*smoothstep(-.2,.45,ndotl);",
        "lit+=uAtmosphereColor*rim*.65;color=vec4(displayColor(lit),1.0-smoothstep(1.0-uPixel,1.0,r));",
        "} else if(r<1.12){float day=smoothstep(-.22,.45,dot(normalize(vec3(p,0.0)),uLight));",
        "float glow=exp(-(r-1.0)*48.0)*uAtmosphere*.58*day;color=vec4(uAtmosphereColor,glow); }",
        "if(uRing>.5){ float angle=-.34; float c=cos(angle),s=sin(angle); vec2 q=mat2(c,-s,s,c)*p;",
        "float ringRadius=length(vec2(q.x,q.y/.32)); float ringDepth=-q.y/.32*.948;",
        "if(ringRadius>1.24 && ringRadius<2.32 && ringDepth>surfaceDepth){",
        "vec4 ring=texture2D(uRings,vec2((ringRadius-1.24)/1.08,.5));",
        "vec3 position=vec3(p,ringDepth); float toward=dot(position,uLight);",
        "float projected=dot(position,position)-toward*toward;float shadow=toward<0.0?mix(.12,1.0,smoothstep(.9,1.1,projected)):1.0;",
        "ring.rgb=displayColor(pow(ring.rgb,vec3(2.2))*shadow*(.38+.80*abs(uLight.z))); float alpha=ring.a+color.a*(1.0-ring.a);",
        "color=vec4((ring.rgb*ring.a+color.rgb*color.a*(1.0-ring.a))/max(alpha,.001),alpha); } }",
        "} if(color.a<.003) discard; gl_FragColor=color; }",
    ].join("\n");

    function shader(type, source) {
        const compiled = gl.createShader(type);
        gl.shaderSource(compiled, source); gl.compileShader(compiled);
        if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(compiled));
        return compiled;
    }

    function initRenderer() {
        if (!gl) {
            fallback = bodyCanvas.getContext("2d");
            scene.dataset.renderer = "canvas";
            return;
        }
        program = gl.createProgram();
        const vertex = shader(gl.VERTEX_SHADER, vertexSource), fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
        gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
        gl.deleteShader(vertex); gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, "aPosition");
        gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        uniforms = {};
        for (const key of ["Center","Viewport","Radius","Extent","Light","Spin","Tilt","Atmosphere","AtmosphereColor","Pixel","Bump","Sun","Earth","Ring","Time","Map","Clouds","Night","Rings"]) {
            uniforms[key] = gl.getUniformLocation(program, "u" + key);
        }
        for (const [id, image] of Object.entries(images)) {
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            const powerOfTwo = (image.width & (image.width - 1)) === 0 && (image.height & (image.height - 1)) === 0;
            if (powerOfTwo) gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, powerOfTwo ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, id === "saturn-ring" ? gl.CLAMP_TO_EDGE : gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            textures[id] = texture;
        }
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        scene.dataset.renderer = "webgl";
    }

    function geometry() {
        const compact = width < 640;
        const short = height < 600 && !compact;
        return {
            cx: width * .51, cy: height * (compact ? .68 : short ? .66 : .70),
            rx: width * (compact ? .445 : .46),
            ry: Math.min(height * (compact ? .19 : short ? .18 : .235), width * (compact ? .32 : .19)),
            tilt: compact ? -.20 : short ? -.07 : -.10,
            unit: compact ? Math.min(26, width * .062) : Math.min(72, width * .044, height * .09),
            sunRadius: compact ? Math.min(32, width * .073) : Math.min(108, height * .13),
            compact,
        };
    }

    function createSolarHalo() {
        const image = document.createElement("canvas");
        image.width = image.height = 512;
        const paint = image.getContext("2d"), pixels = paint.createImageData(512, 512);
        for (let y=0;y<512;y++) for (let x=0;x<512;x++) {
            const px=(x-256)/85.333,py=(y-256)/85.333,r=Math.hypot(px,py);
            if (r<.98 || r>2.9) continue;
            const d=Math.max(0,r-1),angle=Math.atan2(py,px);
            const filament=.5+.22*Math.sin(angle*11+Math.sin(angle*5)*1.7+d*2)+.15*Math.sin(angle*23-d*3)+.10*Math.sin(angle*37+d);
            const opacity=Math.exp(-d*12)*.58+Math.exp(-d*3)*.16+Math.pow(Math.max(0,filament),4)*Math.exp(-d*2.8)*.08;
            const warm=Math.exp(-d*10),i=(y*512+x)*4;
            pixels.data[i]=255; pixels.data[i+1]=158+69*warm;pixels.data[i+2]=71+95*warm;
            pixels.data[i+3]=Math.min(255,opacity*255);
        }
        paint.putImageData(pixels,0,0);
        return image;
    }

    function point(g, radius, angle) {
        const dx = Math.cos(angle) * g.rx * radius, dy = Math.sin(angle) * g.ry * radius;
        return { x: g.cx + dx * Math.cos(g.tilt) - dy * Math.sin(g.tilt),
            y: g.cy + dx * Math.sin(g.tilt) + dy * Math.cos(g.tilt),
            z: Math.sin(angle) * g.rx * radius * .78 };
    }

    function paintOrbits(g, bodies) {
        orbit.clearRect(0, 0, width, height);
        orbit.save();
        const aura = orbit.createRadialGradient(g.cx,g.cy,g.sunRadius*.75,g.cx,g.cy,g.sunRadius*5.5);
        aura.addColorStop(0,"rgba(255,206,131,.23)"); aura.addColorStop(.25,"rgba(238,162,88,.09)"); aura.addColorStop(1,"rgba(181,82,63,0)");
        orbit.fillStyle = aura; orbit.fillRect(0,0,width,height);
        orbit.save();
        orbit.translate(g.cx,g.cy);orbit.rotate(time*.012);
        const haloRadius=g.sunRadius*3*(1+Math.sin(time*.24)*.006);
        orbit.drawImage(solarHalo,-haloRadius,-haloRadius,haloRadius*2,haloRadius*2);
        orbit.restore();
        orbit.translate(g.cx,g.cy); orbit.rotate(g.tilt);
        orbit.lineWidth = .55;
        for (const planet of planets) {
            const selected = bodies.some((body) => body.id === planet.id && Math.hypot(body.x-hover.x,body.y-hover.y)<body.radius*2+12);
            orbit.strokeStyle = selected ? "rgba(204,190,160,.26)" : "rgba(145,165,198,.065)";
            orbit.beginPath(); orbit.ellipse(0,0,g.rx*planet.orbit,g.ry*planet.orbit,0,0,Math.PI*2); orbit.stroke();
        }
        // Cinturão principal de asteroides entre Marte e Júpiter.
        for (let i=0; i<240; i++) {
            const angle = i*2.39996+time*.006;
            const radius = .575+(Math.sin(i*17.21)*.5+.5)*.048;
            orbit.fillStyle = "rgba(190,176,160,"+(.06+(i%4)*.025)+")";
            orbit.beginPath(); orbit.arc(Math.cos(angle)*g.rx*radius,Math.sin(angle)*g.ry*radius,i%7===0?.9:.5,0,Math.PI*2); orbit.fill();
        }
        orbit.restore();
        orbit.save();
        orbit.textAlign = "center"; orbit.font = (g.compact ? "9" : "11") + "px Segoe UI, Arial, sans-serif";
        orbit.shadowColor = "rgba(0,0,0,.8)"; orbit.shadowBlur = 5;
        for (const body of bodies) {
            if (g.compact && ["mercury","venus","mars"].includes(body.id)) continue;
            const selected = Math.hypot(body.x-hover.x,body.y-hover.y)<body.radius*2+12;
            orbit.fillStyle = selected ? "#fff3dc" : "rgba(199,210,231,.70)";
            let labelY = body.y + body.radius * (body.ring ? 1.05 : 1.4) + (g.compact ? 12 : 17);
            if (labelY > height - (g.compact ? 55 : 35)) labelY = body.y - body.radius - 12;
            orbit.fillText(body.name,Math.max(26,Math.min(width-26,body.x)),labelY);
            if (selected) {
                orbit.strokeStyle="rgba(236,204,155,.4)"; orbit.lineWidth=.8;
                orbit.beginPath(); orbit.arc(body.x,body.y,body.radius*1.35+5,0,Math.PI*2); orbit.stroke();
            }
        }
        if (reaction && !reduced.matches) {
            const age=time-reaction.time;
            if (age<2) {
                orbit.strokeStyle="rgba(234,202,156,"+((1-age/2)*.42)+")"; orbit.lineWidth=.8;
                orbit.beginPath(); orbit.arc(reaction.x,reaction.y,8+age*100,0,Math.PI*2); orbit.stroke();
            } else reaction=null;
        }
        orbit.restore();
    }

    function bindTexture(name, unit, id) {
        gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, textures[id]); gl.uniform1i(uniforms[name], unit);
    }

    function drawBody(body, g) {
        if (!gl) { drawFallback(body); return; }
        bindTexture("Map",0,body.id);
        gl.uniform2f(uniforms.Center,body.x,height-body.y);
        gl.uniform1f(uniforms.Radius,body.radius);
        gl.uniform1f(uniforms.Extent,body.id==="sun"?1.01:body.ring?2.6:1.2);
        const light=[g.cx-body.x,body.y-g.cy,-body.z];
        const norm=Math.hypot(...light)||1;
        gl.uniform3f(uniforms.Light,light[0]/norm,light[1]/norm,light[2]/norm);
        gl.uniform1f(uniforms.Spin,.17+time*(body.spin||.012)*.08);
        gl.uniform1f(uniforms.Tilt,body.tilt||0);
        gl.uniform1f(uniforms.Atmosphere,body.atmosphere||0);
        gl.uniform3fv(uniforms.AtmosphereColor,atmosphereColors[body.id]||[.5,.5,.5]);
        gl.uniform1f(uniforms.Pixel,1/(body.radius*dpr));
        gl.uniform1f(uniforms.Bump,body.id==="mercury"?.75:body.id==="mars"?.45:0);
        gl.uniform1f(uniforms.Sun,body.id==="sun"?1:0);
        gl.uniform1f(uniforms.Earth,body.id==="earth"?1:0);
        gl.uniform1f(uniforms.Ring,body.ring?1:0);
        gl.drawArrays(gl.TRIANGLES,0,6);
    }

    function fallbackSprite(body) {
        if (fallbackSprites.has(body.id)) return fallbackSprites.get(body.id);
        const size=192, sprite=document.createElement("canvas"); sprite.width=sprite.height=size;
        const paint=sprite.getContext("2d"), source=document.createElement("canvas"); source.width=512;source.height=256;
        const sourcePaint=source.getContext("2d"); sourcePaint.drawImage(images[body.id],0,0,512,256);
        const pixels=sourcePaint.getImageData(0,0,512,256).data, result=paint.createImageData(size,size);
        for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
            const nx=(x-size/2)/(size/2), ny=(y-size/2)/(size/2), r=nx*nx+ny*ny;
            if(r>1)continue;
            const nz=Math.sqrt(1-r),u=(Math.atan2(nz,nx)/(Math.PI*2)+.67)%1,v=Math.acos(-ny)/Math.PI;
            const index=(Math.min(255,Math.floor(v*256))*512+Math.floor(u*512))*4, target=(y*size+x)*4;
            const light=body.id==="sun"?1:.2+.8*Math.max(0,-nx*.6-ny*.25+nz*.75);
            for(let c=0;c<3;c++)result.data[target+c]=pixels[index+c]*light;
            result.data[target+3]=255;
        }
        paint.putImageData(result,0,0);fallbackSprites.set(body.id,sprite);return sprite;
    }

    function drawFallback(body) {
        const r=body.radius;
        if(body.ring) {
            fallback.strokeStyle="rgba(206,187,148,.6)";fallback.lineWidth=r*.42;
            fallback.beginPath();fallback.ellipse(body.x,body.y,r*1.8,r*.53,-.34,0,Math.PI*2);fallback.stroke();
        }
        fallback.drawImage(fallbackSprite(body),body.x-r,body.y-r,r*2,r*2);
    }

    function draw(now) {
        frame=null;
        if (!ready || lost || document.hidden || document.body.dataset.view!=="landing") return;
        if(!reduced.matches && last && now-last<1000/30-1){requestFrame();return;}
        if(!reduced.matches && last)time+=Math.min((now-last)/1000,.08);
        last=now;
        const g=geometry();
        const bodies=planets.map(planet=>{
            // Mesmo sentido de translação; maior distância significa período maior.
            const angle=planet.phase-time*.014*Math.pow(365/planet.period,.36);
            const position=point(g,planet.orbit,angle);
            const perspective=1+position.z/g.rx*.12;
            return {...planet,...position,radius:Math.max(g.compact?3.4:6,g.unit*planet.size)*perspective};
        });
        const sun={id:"sun",name:"Sol",x:g.cx,y:g.cy,z:0,radius:g.sunRadius};
        paintOrbits(g,[sun,...bodies]);
        if(gl){
            gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(program);
            gl.uniform2f(uniforms.Viewport,width,height); gl.uniform1f(uniforms.Time,time);
            bindTexture("Clouds",1,"earth-clouds");bindTexture("Night",2,"earth-night");bindTexture("Rings",3,"saturn-ring");
        }else{fallback.clearRect(0,0,width,height);}
        [...bodies,sun].sort((a,b)=>a.z-b.z).forEach(body=>drawBody(body,g));
        scene.dataset.motion=reduced.matches?"reduced":"running";
        scene.dataset.bodyCount="9";
        if(!reduced.matches)requestFrame();
    }

    function requestFrame(){
        if(!ready||lost||document.hidden||document.body.dataset.view!=="landing"||frame!==null)return;
        frame=requestAnimationFrame(draw);
    }

    function resize(){
        width=Math.max(1,innerWidth);height=Math.max(1,innerHeight);dpr=Math.min(devicePixelRatio||1,1.5);
        for(const canvas of [orbitCanvas,bodyCanvas]){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
        orbit.setTransform(dpr,0,0,dpr,0,0);
        if(gl)gl.viewport(0,0,bodyCanvas.width,bodyCanvas.height);
        else if(fallback)fallback.setTransform(dpr,0,0,dpr,0,0);
        requestFrame();
    }

    function sync(){
        if(document.hidden||document.body.dataset.view!=="landing"){
            cancelAnimationFrame(frame);frame=null;last=0;scene.dataset.motion="paused";
        }else{last=0;requestFrame();}
    }

    window.addEventListener("resize",resize,{passive:true});
    document.addEventListener("visibilitychange",sync);
    new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:["data-view"]});
    reduced.addEventListener("change",()=>{cancelAnimationFrame(frame);frame=null;last=0;reaction=null;requestFrame();});
    window.addEventListener("pointermove",event=>{
        hover={x:event.clientX,y:event.clientY};if(reduced.matches)requestFrame();
    },{passive:true});
    window.addEventListener("pointerdown",event=>{
        if(event.button!==0||reduced.matches||event.target.closest("button,a,input,select,summary,label"))return;
        reaction={x:event.clientX,y:event.clientY,time};requestFrame();
    },{passive:true});
    bodyCanvas.addEventListener("webglcontextlost",event=>{event.preventDefault();lost=true;cancelAnimationFrame(frame);frame=null;scene.dataset.motion="paused";});
    bodyCanvas.addEventListener("webglcontextrestored",()=>{lost=false;textures={};initRenderer();resize();sync();});

    const ids=["sun",...planets.map(planet=>planet.id),"earth-clouds","earth-night","saturn-ring"];
    Promise.all(ids.map(id=>new Promise((resolve,reject)=>{
        const image=new Image(); image.decoding="async";
        image.onload=()=>{images[id]=image;resolve();};image.onerror=()=>reject(new Error(id));
        image.src=new URL(id+(id==="saturn-ring"?".png":".webp"),assetRoot).href;
    }))).then(()=>{
        initRenderer();ready=true;scene.dataset.ready="true";resize();
    }).catch(error=>{console.warn("Sistema Solar:",error.message);scene.dataset.ready="error";});
})();
