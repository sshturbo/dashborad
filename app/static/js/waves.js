"use strict";

// Vetores da capa do Figma, compostos uma vez e animados em uma única camada.
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
    const sky = document.createElement("canvas");
    const skyImage = new Image();
    let skyReady = false;
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
    let seed = 8421;
    function random() {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    }
    const stars = Array.from({ length: 150 }, () => ({
        x: random(), y: random(), radius: .18 + Math.pow(random(), 4) * 1.05,
        depth: .2 + random() * .8, phase: random() * Math.PI * 2,
        warm: random() > .72, twinkle: random() > .83,
    }));

    function composeSky() {
        if (!skyImage.complete || !skyImage.naturalWidth) return;
        sky.width = Math.ceil(width + 96);
        sky.height = Math.ceil(height + 96);
        const paint = sky.getContext("2d");
        paint.fillStyle = "#01040b"; paint.fillRect(0, 0, sky.width, sky.height);
        if (background.dataset.composed) {
            paint.save(); paint.translate(48, 48 + offsetY); paint.scale(scale, scale);
            paint.globalAlpha = .19; paint.drawImage(background, 0, 0, sceneWidth, sceneHeight);
            paint.globalAlpha = .014; paint.drawImage(waves, 0, 0, sceneWidth, sceneHeight);
            paint.restore();
            paint.save(); paint.translate(width + 48, 48 + offsetY); paint.scale(-scale, scale);
            paint.globalAlpha = .006; paint.drawImage(waves, 0, 0, sceneWidth, sceneHeight); paint.restore();
        }
        paint.save();
        paint.globalCompositeOperation = "screen";
        paint.globalAlpha = .86;
        paint.translate(sky.width / 2, sky.height / 2);
        paint.rotate(-.18);
        const cover = Math.max(sky.width / skyImage.width, sky.height / skyImage.height) * 1.24;
        paint.drawImage(skyImage, -skyImage.width * cover / 2, -skyImage.height * cover / 2, skyImage.width * cover, skyImage.height * cover);
        paint.restore();
        paint.save(); paint.translate(48, 48);
        const focus = paint.createRadialGradient(width * .27, height * .18, 0, width * .27, height * .18, Math.max(width * .48, height * .46));
        focus.addColorStop(0, "rgba(1, 5, 14, .48)"); focus.addColorStop(.5, "rgba(1, 5, 14, .16)"); focus.addColorStop(1, "rgba(1, 5, 14, 0)");
        paint.fillStyle = focus; paint.fillRect(-48, -48, sky.width, sky.height);
        const vignette = paint.createRadialGradient(width * .55, height * .6, Math.min(width, height) * .2, width * .55, height * .6, Math.max(width, height) * .7);
        vignette.addColorStop(0, "rgba(0, 0, 0, 0)"); vignette.addColorStop(1, "rgba(0, 0, 0, .48)");
        paint.fillStyle = vignette; paint.fillRect(-48, -48, sky.width, sky.height);
        paint.restore();
        skyReady = true;
        canvas.dataset.skyReady = "true";
    }
    skyImage.decoding = "async";
    skyImage.onload = () => { composeSky(); requestFrame(); };
    skyImage.src = new URL("../solar-system/milky-way.webp", assetRoot).href;

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
        composeSky();
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

    function drawExtendedWaves() {
        context.save();
        context.globalCompositeOperation = "screen";
        context.lineWidth = .7;
        context.globalAlpha = .10;
        const color = context.createLinearGradient(0, height, width, 0);
        color.addColorStop(0, "rgba(104, 102, 235, .28)");
        color.addColorStop(.5, "rgba(102, 133, 220, .14)");
        color.addColorStop(1, "rgba(78, 182, 220, .24)");
        context.strokeStyle = color;
        const count = width < 640 ? 14 : 24;
        const spacing = height / (width < 640 ? 130 : 95);
        for (let band = 0; band < 2; band++) {
            for (let line = 0; line < count; line++) {
                const offset = (line - (count - 1) / 2) * spacing;
                const drift = Math.sin(time * .23 + line * .055 + band) * height * .028;
                context.beginPath();
                if (band === 0) {
                    context.moveTo(-30, height * .14 + offset);
                    context.bezierCurveTo(width * .32, height * .46 + offset * .4 + drift,
                        width * .64, -height * .12 + offset + drift, width + 30, height * .25 + offset);
                } else {
                    context.moveTo(-30, height * .92 + offset);
                    context.bezierCurveTo(width * .3, height * .57 + offset + drift,
                        width * .66, height * 1.12 + offset * .5 - drift, width + 30, height * .73 + offset);
                }
                context.stroke();
            }
        }
        context.restore();
    }

    function drawStars() {
        context.save();
        const count = Math.min(stars.length, Math.max(45, Math.round(width * height / 14000)));
        const parallaxX = (pointer.x * scale - width / 2) * pointer.strength * .006;
        const parallaxY = (pointer.y * scale + offsetY - height / 2) * pointer.strength * .006;
        for (let i = 0; i < count; i++) {
            const star = stars[i];
            const x = ((star.x * width + time * star.depth * .3 + parallaxX * star.depth) % width + width) % width;
            const y = ((star.y * height - time * star.depth * .12 + parallaxY * star.depth) % height + height) % height;
            const alpha = .3 + (star.twinkle ? Math.sin(time * .45 + star.phase) * .13 : .12);
            context.fillStyle = star.warm ? `rgba(255, 228, 190, ${alpha})` : `rgba(209, 226, 255, ${alpha})`;
            context.beginPath();
            context.arc(x, y, star.radius, 0, Math.PI * 2);
            context.fill();
            if (star.radius > 1.04) {
                const halo = context.createRadialGradient(x, y, 0, x, y, 4);
                halo.addColorStop(0, `rgba(185, 210, 255, ${alpha * .4})`);
                halo.addColorStop(1, "rgba(185, 210, 255, 0)");
                context.fillStyle = halo;
                context.beginPath();
                context.arc(x, y, 4, 0, Math.PI * 2); context.fill();
            }
        }
        context.restore();
    }

    function drawSpace(now) {
        context.fillStyle = "#01040b"; context.fillRect(0, 0, width, height);
        if (skyReady) {
            const shiftX = Math.sin(time * .018) * 6 + Math.max(-7, Math.min(7, (pointer.x * scale - width / 2) * pointer.strength * .005));
            const shiftY = Math.cos(time * .015) * 4;
            context.drawImage(sky, -48 + shiftX, -48 + shiftY);
        }
        drawExtendedWaves();
        drawStars();
        context.save();
        context.globalCompositeOperation = "screen";
        for (const ripple of ripples) {
            const age = (now - ripple.started) / 1000;
            const x = ripple.x * scale, y = ripple.y * scale + offsetY;
            const radius = (8 + age * 170) * scale, opacity = Math.max(0, 1 - age / 2.4) * .25;
            const glow = context.createRadialGradient(x, y, 0, x, y, radius);
            glow.addColorStop(0, `rgba(135, 151, 218, ${opacity * .16})`); glow.addColorStop(1, "rgba(135, 151, 218, 0)");
            context.fillStyle = glow; context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
            context.strokeStyle = `rgba(184, 185, 238, ${opacity})`; context.lineWidth = .8;
            context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.stroke();
        }
        context.restore();
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
        if (document.body.dataset.view === "landing") {
            drawSpace(now);
            if (!reducedMotion.matches) requestFrame();
            return;
        }
        context.fillStyle = "#041631";
        context.fillRect(0, 0, width, height);
        context.save();
        context.translate(0, offsetY);
        context.scale(scale, scale);
        context.drawImage(background, 0, 0, sceneWidth, sceneHeight);
        context.globalCompositeOperation = "overlay";
        context.globalAlpha = document.body.dataset.view === "landing" ? .4 : .65;

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
