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
    const pointer = { x: 320, y: 360, targetX: 320, targetY: 360, strength: 0, targetStrength: 0 };
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
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.decoding = "async";
            image.onload = () => resolve({ ...layer, image });
            image.onerror = () => reject(new Error(`Não foi possível carregar ${layer.file}.`));
            image.src = new URL(layer.file, assetRoot).href;
        });
    }

    function composeLayers() {
        sourceRatio = Math.min(2, Math.max(1, ratio * scale));
        for (const buffer of [background, waves]) {
            buffer.width = Math.ceil(sceneWidth * sourceRatio);
            buffer.height = Math.ceil(sceneHeight * sourceRatio);
        }
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
        ripples = ripples.filter((ripple) => now - ripple.started < 2400);

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
            const radius = 8 + age * 230;
            const opacity = Math.max(0, 1 - age / 2.4) * .5;
            const glow = context.createRadialGradient(ripple.x, ripple.y, 0, ripple.x, ripple.y, radius);
            glow.addColorStop(0, `rgba(154, 98, 212, ${opacity * .16})`);
            glow.addColorStop(.8, `rgba(82, 135, 240, ${opacity * .06})`);
            glow.addColorStop(1, "rgba(82, 135, 240, 0)");
            context.fillStyle = glow;
            context.beginPath();
            context.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
            context.fill();
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
        ripples.push({ ...point, started: performance.now() });
        ripples = ripples.slice(-5);
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
