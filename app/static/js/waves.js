"use strict";

// Fundo compartilhado entre a tela inicial e a área de análise.
(() => {
    const canvas = document.getElementById("waveBackground");
    const context = canvas?.getContext("2d", { alpha: false });
    if (!context) return;

    const sceneWidth = 1280;
    const sceneHeight = 720;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const assetRoot = new URL(canvas.dataset.assets, window.location.href);
    const background = document.createElement("canvas");
    const waves = document.createElement("canvas");
    const rippleWaves = document.createElement("canvas");
    const pointer = { x: 320, y: 360, targetX: 320, targetY: 360, strength: 0, targetStrength: 0 };
    const rippleSpeed = 520;
    const wireSwayDuration = .68;
    const maxRipples = 5;
    const rippleRenderer = createRippleRenderer();
    let layers;
    let width = 1;
    let height = 1;
    let ratio = 1;
    let sourceRatio = 1;
    let scale = 1;
    let offsetY = 0;
    let frame = null;
    let lastFrame = 0;
    let time = 0;
    let ripples = [];

    function loadLayer(layer) {
        const url = new URL(layer.file, assetRoot).href;
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.decoding = "async";
            image.onload = () => resolve({ ...layer, image });
            image.onerror = () => reject(new Error(`Não foi possível carregar ${layer.file}.`));
            image.src = url;
        });
    }

    function createRippleRenderer() {
        const vertexSource = `
            attribute vec2 position;
            varying vec2 textureCoordinate;
            void main() {
                textureCoordinate = position * 0.5 + 0.5;
                gl_Position = vec4(position, 0.0, 1.0);
            }
        `;
        const fragmentSource = `
            precision highp float;
            varying vec2 textureCoordinate;
            uniform sampler2D sourceTexture;
            uniform vec2 sourceSize;
            uniform vec4 ripples[5];
            uniform float speed;
            void main() {
                vec2 pixel = vec2(textureCoordinate.x, 1.0 - textureCoordinate.y) * sourceSize;
                vec2 samplePixel = pixel;
                for (int index = 0; index < 5; index++) {
                    if (ripples[index].w > 0.5) {
                        vec2 offset = pixel - ripples[index].xy;
                        float distanceToTap = length(offset);
                        float sinceArrival = ripples[index].z - distanceToTap / speed;
                        if (distanceToTap > 0.01 && sinceArrival >= 0.0 && sinceArrival < ${wireSwayDuration.toFixed(2)}) {
                            float sway = sin(sinceArrival * 15.08) * exp(-sinceArrival * 3.6) * 13.0;
                            samplePixel -= normalize(offset) * sway;
                        }
                    }
                }
                vec2 sampleCoordinate = vec2(samplePixel.x / sourceSize.x, 1.0 - samplePixel.y / sourceSize.y);
                sampleCoordinate = clamp(sampleCoordinate, vec2(0.0), vec2(1.0));
                gl_FragColor = texture2D(sourceTexture, sampleCoordinate);
            }
        `;
        let gl;
        try {
            gl = rippleWaves.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
        } catch {
            return null;
        }
        if (!gl) return null;

        function compileShader(type, source) {
            const shader = gl.createShader(type);
            if (!shader) throw new Error("Não foi possível criar o shader de ondulação.");
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                const message = gl.getShaderInfoLog(shader) || "Shader inválido.";
                gl.deleteShader(shader);
                throw new Error(message);
            }
            return shader;
        }

        try {
            const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
            const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
            const program = gl.createProgram();
            if (!program) throw new Error("Não foi possível criar o renderizador de ondulação.");
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                throw new Error(gl.getProgramInfoLog(program) || "Não foi possível vincular o shader de ondulação.");
            }

            const buffer = gl.createBuffer();
            const texture = gl.createTexture();
            if (!buffer || !texture) throw new Error("Não foi possível reservar a textura de ondulação.");
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            return {
                gl,
                program,
                buffer,
                texture,
                position: gl.getAttribLocation(program, "position"),
                sourceTexture: gl.getUniformLocation(program, "sourceTexture"),
                sourceSize: gl.getUniformLocation(program, "sourceSize"),
                ripples: gl.getUniformLocation(program, "ripples[0]"),
                speed: gl.getUniformLocation(program, "speed"),
            };
        } catch (error) {
            console.warn("Distorção dos fios:", error.message);
            return null;
        }
    }

    function composeLayers() {
        sourceRatio = Math.min(2, Math.max(1, ratio * scale));
        for (const buffer of [background, waves]) {
            buffer.width = Math.ceil(sceneWidth * sourceRatio);
            buffer.height = Math.ceil(sceneHeight * sourceRatio);
        }
        rippleWaves.width = waves.width;
        rippleWaves.height = waves.height;
        const base = background.getContext("2d");
        const wire = waves.getContext("2d");
        base.scale(sourceRatio, sourceRatio);
        wire.scale(sourceRatio, sourceRatio);
        for (const layer of layers) {
            const target = layer.kind === "wave" ? wire : base;
            target.globalCompositeOperation = layer.blend || "source-over";
            target.filter = layer.blend === "screen" ? "blur(64px)" : "none";
            target.globalAlpha = layer.blend === "screen" ? .55 : 1;
            target.drawImage(layer.image, layer.x, layer.y, layer.width, layer.height);
        }
        if (rippleRenderer) {
            const { gl } = rippleRenderer;
            gl.bindTexture(gl.TEXTURE_2D, rippleRenderer.texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, waves);
        }
    }

    function resize() {
        width = Math.max(1, window.innerWidth);
        height = Math.max(1, window.innerHeight);
        const nextRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        const nextScale = Math.max(width / sceneWidth, height / sceneHeight);
        const rebuild = nextRatio !== ratio || Math.abs(nextScale - scale) > .05;
        ratio = nextRatio;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        scale = nextScale;
        offsetY = (height - sceneHeight * scale) / 2;
        if (layers && (rebuild || !background.dataset.composed)) {
            composeLayers();
            background.dataset.composed = "true";
        }
        requestFrame();
    }

    function requestFrame() {
        if (!layers || document.hidden || frame !== null) return;
        canvas.dataset.motion = reducedMotion.matches ? "reduced" : "running";
        frame = window.requestAnimationFrame(draw);
    }

    function paintWaves(...rectangle) {
        // A capa aplica overlay tanto ao grupo quanto aos traçados individuais.
        context.drawImage(waves, ...rectangle);
        context.drawImage(waves, ...rectangle);
    }

    function renderRippleWaves(now) {
        if (!rippleRenderer) return false;
        const { gl } = rippleRenderer;
        const activeRipples = ripples.filter((ripple) => (now - ripple.started) / 1000 < ripple.lifetime);
        const rippleData = new Float32Array(maxRipples * 4);
        activeRipples.slice(0, maxRipples).forEach((ripple, index) => {
            rippleData[index * 4] = ripple.x * sourceRatio;
            rippleData[index * 4 + 1] = ripple.y * sourceRatio;
            rippleData[index * 4 + 2] = (now - ripple.started) / 1000;
            rippleData[index * 4 + 3] = 1;
        });

        gl.viewport(0, 0, rippleWaves.width, rippleWaves.height);
        gl.useProgram(rippleRenderer.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, rippleRenderer.buffer);
        gl.enableVertexAttribArray(rippleRenderer.position);
        gl.vertexAttribPointer(rippleRenderer.position, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, rippleRenderer.texture);
        gl.uniform1i(rippleRenderer.sourceTexture, 0);
        gl.uniform2f(rippleRenderer.sourceSize, waves.width, waves.height);
        gl.uniform4fv(rippleRenderer.ripples, rippleData);
        gl.uniform1f(rippleRenderer.speed, rippleSpeed * sourceRatio);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return gl.getError() === gl.NO_ERROR;
    }

    function paintRippleFallback(now) {
        for (let y = 0; y < sceneHeight; y += 4) {
            const stripHeight = Math.min(4, sceneHeight - y);
            let shiftX = Math.sin(time * .42) * 12 + Math.sin(y * .009 + time * .42) * 6 * pointer.strength;
            let shiftY = Math.sin(time * .28) * 7 + Math.sin(y * .015 + time * .28) * 1.5 * pointer.strength;
            let stretch = 0;
            const proximity = Math.exp(-(((y - pointer.y) / 110) ** 2)) * pointer.strength;
            shiftX += proximity * (pointer.x - 320) * .022;
            for (const ripple of ripples) {
                const age = (now - ripple.started) / 1000;
                const distance = Math.abs(y - ripple.y);
                const arrival = age - distance / rippleSpeed;
                const envelope = arrival >= 0 && arrival < wireSwayDuration ? Math.exp(-arrival * 3.6) : 0;
                const pulse = Math.sin(arrival * 15.08) * envelope;
                shiftX += pulse * 13;
                shiftY += pulse * 5;
                stretch += pulse * .006;
            }
            paintWaves(
                0, y * sourceRatio, sceneWidth * sourceRatio, stripHeight * sourceRatio,
                shiftX, y + shiftY, sceneWidth * (1 + stretch), stripHeight + .35,
            );
        }
    }

    function paintRippleLayer(now) {
        if (!renderRippleWaves(now)) {
            paintRippleFallback(now);
            return;
        }

        if (pointer.strength < .05) {
            const shiftX = Math.sin(time * .42) * 12;
            const shiftY = Math.sin(time * .28) * 7;
            context.drawImage(rippleWaves, shiftX, shiftY, sceneWidth, sceneHeight);
            context.drawImage(rippleWaves, shiftX, shiftY, sceneWidth, sceneHeight);
            return;
        }

        for (let y = 0; y < sceneHeight; y += 4) {
            const stripHeight = Math.min(4, sceneHeight - y);
            let shiftX = Math.sin(time * .42) * 12 + Math.sin(y * .009 + time * .42) * 6 * pointer.strength;
            const shiftY = Math.sin(time * .28) * 7 + Math.sin(y * .015 + time * .28) * 1.5 * pointer.strength;
            const proximity = Math.exp(-(((y - pointer.y) / 110) ** 2)) * pointer.strength;
            shiftX += proximity * (pointer.x - 320) * .022;
            const source = [0, y * sourceRatio, sceneWidth * sourceRatio, stripHeight * sourceRatio];
            const destination = [shiftX, y + shiftY, sceneWidth, stripHeight + .35];
            context.drawImage(rippleWaves, ...source, ...destination);
            context.drawImage(rippleWaves, ...source, ...destination);
        }
    }

    function draw(now) {
        frame = null;
        if (document.hidden) return;
        if (!reducedMotion.matches && lastFrame && now - lastFrame < 1000 / 30 - 1) {
            requestFrame();
            return;
        }
        const elapsed = lastFrame ? Math.min((now - lastFrame) / 1000, .08) : 0;
        lastFrame = now;
        if (!reducedMotion.matches) time += elapsed;
        pointer.x += (pointer.targetX - pointer.x) * .12;
        pointer.y += (pointer.targetY - pointer.y) * .12;
        pointer.strength += (pointer.targetStrength - pointer.strength) * .1;
        ripples = ripples.filter((ripple) => (now - ripple.started) / 1000 < ripple.lifetime);

        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.imageSmoothingQuality = "high";
        context.fillStyle = "#041631";
        context.fillRect(0, 0, width, height);
        context.save();
        context.translate(0, offsetY);
        context.scale(scale, scale);
        context.drawImage(background, 0, 0, sceneWidth, sceneHeight);
        context.globalCompositeOperation = "overlay";
        context.globalAlpha = .65;

        if (reducedMotion.matches) {
            paintWaves(0, 0, sceneWidth, sceneHeight);
        } else if (ripples.length) {
            paintRippleLayer(now);
        } else if (!ripples.length && pointer.strength < .05) {
            paintWaves(Math.sin(time * .42) * 12, Math.sin(time * .28) * 7, sceneWidth, sceneHeight);
        } else {
            // Pequenas faixas mantêm os traçados originais e permitem uma deformação fluida.
            for (let y = 0; y < sceneHeight; y += 4) {
                const stripHeight = Math.min(4, sceneHeight - y);
                let shiftX = Math.sin(time * .42) * 12 + Math.sin(y * .009 + time * .42) * 6 * pointer.strength;
                let shiftY = Math.sin(time * .28) * 7 + Math.sin(y * .015 + time * .28) * 1.5 * pointer.strength;
                let stretch = 0;
                const proximity = Math.exp(-(((y - pointer.y) / 110) ** 2)) * pointer.strength;
                shiftX += proximity * (pointer.x - 320) * .022;
                for (const ripple of ripples) {
                    const age = (now - ripple.started) / 1000;
                    const distance = Math.abs(y - ripple.y);
                    const envelope = Math.exp(-age * 1.5) * Math.exp(-(((distance - age * 210) / 110) ** 2));
                    const pulse = Math.sin(distance * .045 - age * 9) * envelope;
                    shiftX += pulse * 34;
                    shiftY += pulse * 4;
                    stretch += pulse * .018;
                }
                paintWaves(
                    0, y * sourceRatio, sceneWidth * sourceRatio, stripHeight * sourceRatio,
                    shiftX - pointer.x * stretch, y + shiftY, sceneWidth * (1 + stretch), stripHeight + .35,
                );
            }
        }

        context.globalAlpha = 1;
        context.globalCompositeOperation = "screen";
        for (const ripple of ripples) {
            const age = (now - ripple.started) / 1000;
            const radius = 3 + age * rippleSpeed;
            const opacity = Math.max(0, 1 - age / ripple.lifetime) * .58;
            const ring = context.createRadialGradient(
                ripple.x, ripple.y, Math.max(0, radius - 32), ripple.x, ripple.y, radius + 22,
            );
            ring.addColorStop(0, "rgba(82, 135, 240, 0)");
            ring.addColorStop(.45, `rgba(185, 205, 255, ${opacity * .18})`);
            ring.addColorStop(.72, `rgba(182, 151, 255, ${opacity * .48})`);
            ring.addColorStop(1, "rgba(82, 135, 240, 0)");
            context.fillStyle = ring;
            context.beginPath();
            context.arc(ripple.x, ripple.y, radius + 22, 0, Math.PI * 2);
            context.arc(ripple.x, ripple.y, Math.max(0, radius - 32), 0, Math.PI * 2, true);
            context.fill("evenodd");
            context.strokeStyle = `rgba(161, 153, 255, ${opacity})`;
            context.lineWidth = 1;
            context.beginPath();
            context.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
            context.stroke();
        }
        context.restore();
        if (!reducedMotion.matches) requestFrame();
    }

    function belongsToInterface(target) {
        return Boolean(target?.closest?.("button, input, select, textarea, summary, a, label, .card, .chart-engine, [role='button']"));
    }

    function scenePoint(event) {
        return { x: event.clientX / scale, y: (event.clientY - offsetY) / scale };
    }

    window.addEventListener("pointermove", (event) => {
        if (belongsToInterface(event.target) || event.pointerType === "touch") {
            pointer.targetStrength = 0;
            return;
        }
        const point = scenePoint(event);
        pointer.targetX = point.x;
        pointer.targetY = point.y;
        pointer.targetStrength = 1;
    }, { passive: true });
    document.addEventListener("pointerleave", () => { pointer.targetStrength = 0; });
    window.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || belongsToInterface(event.target) || reducedMotion.matches) return;
        const point = scenePoint(event);
        const farthestCorner = Math.hypot(
            Math.max(point.x, sceneWidth - point.x),
            Math.max(point.y, sceneHeight - point.y),
        );
        ripples.push({ ...point, started: performance.now(), lifetime: farthestCorner / rippleSpeed + .45 });
        ripples = ripples.slice(-maxRipples);
        pointer.targetX = point.x;
        pointer.targetY = point.y;
        canvas.dataset.reactionCount = String((Number(canvas.dataset.reactionCount) || 0) + 1);
        requestFrame();
    }, { passive: true });
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            window.cancelAnimationFrame(frame);
            frame = null;
            canvas.dataset.motion = "paused";
        } else {
            lastFrame = 0;
            requestFrame();
        }
    });
    reducedMotion.addEventListener("change", () => {
        window.cancelAnimationFrame(frame);
        frame = null;
        lastFrame = 0;
        ripples = [];
        requestFrame();
    });
    new MutationObserver(requestFrame).observe(document.body, { attributes: true, attributeFilter: ["data-view"] });

    fetch(new URL("manifest.json", assetRoot))
        .then((response) => {
            if (!response.ok) throw new Error("Não foi possível carregar o fundo.");
            return response.json();
        })
        .then((manifest) => Promise.all(manifest.layers.map(loadLayer)))
        .then((loaded) => {
            layers = loaded;
            resize();
            canvas.dataset.ready = "true";
        })
        .catch((error) => { console.warn("Fundo de ondas:", error.message); });
})();
