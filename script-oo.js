"use strict";

class Player {
    constructor(x, y, angle) {
        this.x = x;
        this.y = y;
        this.angle = angle;
    }

    update(input, timeDelta, map) {
        if (input.leftright !== 0) {
            this.angle += input.leftright * 0.1 * timeDelta * 0.01;
        }
        if (input.forwardbackward !== 0) {
            this.x -= input.forwardbackward * Math.sin(this.angle) * timeDelta * 0.05;
            this.y -= input.forwardbackward * Math.cos(this.angle) * timeDelta * 0.05;
        }
    }
}

class Camera {
    constructor(x, y, height, angle, horizon, distance) {
        this.x = x;
        this.y = y;
        this.height = height;
        this.angle = angle;
        this.horizon = horizon;
        this.distance = distance;
    }

    update(input, timeDelta, map) {
        // if (input.leftright !== 0) {
        //     this.angle += input.leftright * 0.1 * timeDelta * 0.03;
        // }
        // if (input.forwardbackward !== 0) {
        //     this.x -= input.forwardbackward * Math.sin(this.angle) * timeDelta * 0.05;
        //     this.y -= input.forwardbackward * Math.cos(this.angle) * timeDelta * 0.05;
        // }
        if (input.updown !== 0) {
            this.height += input.updown * timeDelta * 0.03;
        }
        if (input.lookup) {
            this.horizon += 2 * timeDelta * 0.1;
        }
        if (input.lookdown) {
            this.horizon -= 2 * timeDelta * 0.1;
        }

        const mapOffset = ((Math.floor(this.y) & (map.width - 1)) << map.shift) + (Math.floor(this.x) & (map.height - 1));
        if ((map.altitude[mapOffset] + 10) > this.height) {
            this.height = map.altitude[mapOffset] + 10;
        }
    }
}

class Map {
    constructor(width, height, shift) {
        this.width = width;
        this.height = height;
        this.shift = shift;
        this.altitude = new Uint8Array(width * height);
        this.color = new Uint32Array(width * height);
    }
}

class ScreenData {
    constructor() {
        this.canvas = null;
        this.context = null;
        this.imageData = null;
        this.bufArray = null;
        this.buf8 = null;
        this.buf32 = null;
        // Careful, it's backward. For example 0xFF0099FF == #ff9900
        this.backgroundColor = 0xFFE5C341;
    }

    drawVerticalLine(x, yTop, yBottom, col) {
        x = x | 0;
        yTop = yTop | 0;
        yBottom = yBottom | 0;
        col = col | 0;
        if (yTop < 0) yTop = 0;
        if (yTop > yBottom) return;

        let offset = ((yTop * this.canvas.width) + x) | 0;
        for (let k = yTop | 0; k < yBottom | 0; k = k + 1 | 0) {
            this.buf32[offset | 0] = col | 0;
            offset = offset + this.canvas.width | 0;
        }
    }

    drawBackground() {
        this.buf32.fill(this.backgroundColor | 0);
    }

    flip() {
        this.imageData.data.set(this.buf8);
        this.context.putImageData(this.imageData, 0, 0);
    }

    render(camera, player, map) {
        const screenWidth = this.canvas.width | 0;

        camera.x = player.x + Math.cos(player.angle) * 30;
        camera.y = player.y + Math.sin(player.angle) * 30;
        camera.angle = Math.PI / 2 - player.angle;


        const sinAngle = Math.sin(camera.angle);
        const cosAngle = Math.cos(camera.angle);

        const hiddenY = new Int32Array(screenWidth).fill(this.canvas.height);

        let deltaZ = 1;

        for (let z = 1; z < camera.distance; z += deltaZ) {
            let plx = -cosAngle * z - sinAngle * z;
            let ply = sinAngle * z - cosAngle * z;
            const prx = cosAngle * z - sinAngle * z;
            const pry = -sinAngle * z - cosAngle * z;

            const dx = (prx - plx) / screenWidth;
            const dy = (pry - ply) / screenWidth;

            plx += camera.x;
            ply += camera.y;

            const invZ = 1. / z * 240;
            for (let i = 0; i < screenWidth; i++) {
                const mapOffset = ((Math.floor(ply) & (map.width - 1)) << map.shift) + (Math.floor(plx) & (map.height - 1));
                const heightOnScreen = (camera.height - map.altitude[mapOffset]) * invZ + camera.horizon | 0;
                this.drawVerticalLine(i, heightOnScreen | 0, hiddenY[i], map.color[mapOffset]);
                if (heightOnScreen < hiddenY[i]) hiddenY[i] = heightOnScreen;
                plx += dx;
                ply += dy;
            }
            deltaZ += 0.005;
        }
    }
}

class Input {
    constructor() {
        this.forwardbackward = 0;
        this.leftright = 0;
        this.updown = 0;
        this.lookup = false;
        this.lookdown = false;
        this.mousePosition = null;
        this.keyPressed = false;
    }

    reset() {
        this.forwardbackward = 0;
        this.leftright = 0;
        this.updown = 0;
        this.lookup = false;
        this.lookdown = false;
        this.mousePosition = null;
        this.keyPressed = false;
    }
}

class Viewer {
    constructor() {
        this.player = new Player(300, 800, 0);
        this.camera = new Camera(350, 800, 78, 0, 50, 800);
        this.map = new Map(1024, 1024, 10);
        this.screenData = new ScreenData();
        this.input = new Input();
        this.updateRunning = false;
        this.time = Date.now();
        this.frames = 0;
        this.timeLastFrame = Date.now();
        this.init();
    }

    updateCamera() {
        const currentTime = Date.now();
        const timeDelta = currentTime - this.time;

        this.camera.update(this.input, timeDelta, this.map);
        this.player.update(this.input, timeDelta, this.map);
        this.time = currentTime;
    }

    draw() {
        this.updateRunning = true;
        this.updateCamera();
        this.screenData.drawBackground();
        this.screenData.render(this.camera, this.player, this.map);
        this.screenData.flip();
        this.frames++;

        window.requestAnimationFrame(this.draw.bind(this));
    }

    loadMap(filenames) {
        const files = filenames.split(";");
        this.downloadImagesAsync(["maps/" + files[0] + ".png", "maps/" + files[1] + ".png"])
            .then(this.onLoadedImages.bind(this));
    }

    onLoadedImages(result) {
        const dataColor = result[0];
        const dataHeight = result[1];
        for (let i = 0; i < this.map.width * this.map.height; i++) {
            this.map.color[i] = 0xFF000000 | (dataColor[(i << 2) + 2] << 16) | (dataColor[(i << 2) + 1] << 8) | dataColor[(i << 2)];
            this.map.altitude[i] = dataHeight[i << 2];
        }
        this.draw();
    }

    downloadImagesAsync(urls) {
        return new Promise((resolve, reject) => {
            var pending = urls.length;
            const result = [];

            if (pending === 0) {
                resolve([]);
                return;
            }

            urls.forEach((url, i) => {
                const image = new Image();
                image.onload = () => {
                    const tempCanvas = document.createElement("canvas");
                    const tempContext = tempCanvas.getContext("2d");
                    tempCanvas.width = this.map.width;
                    tempCanvas.height = this.map.height;
                    tempContext.drawImage(image, 0, 0, this.map.width, this.map.height);
                    result[i] = tempContext.getImageData(0, 0, this.map.width, this.map.height).data;
                    pending--;
                    if (pending === 0) {
                        resolve(result);
                    }
                };
                image.src = url;
            });
        });
    }

    handleResize() {
        this.screenData.canvas = document.getElementById('fullscreenCanvas');

        const aspect = window.innerWidth / window.innerHeight;

        this.screenData.canvas.width = window.innerWidth < 800 ? window.innerWidth : 800;
        this.screenData.canvas.height = this.screenData.canvas.width / aspect;

        if (this.screenData.canvas.getContext) {
            this.screenData.context = this.screenData.canvas.getContext('2d');
            this.screenData.imageData = this.screenData.context.createImageData(this.screenData.canvas.width, this.screenData.canvas.height);
        }

        this.screenData.bufArray = new ArrayBuffer(this.screenData.imageData.width * this.screenData.imageData.height * 4);
        this.screenData.buf8 = new Uint8Array(this.screenData.bufArray);
        this.screenData.buf32 = new Uint32Array(this.screenData.bufArray);
        this.draw();
    }

    handleMouseDown(e) {
        this.input.forwardbackward = 0.5;
        this.input.mousePosition = this.getMousePosition(e);
        this.time = Date.now();

        if (!this.updateRunning) this.draw();
    }

    handleMouseUp() {
        this.input.mousePosition = null;
        this.input.forwardbackward = 0;
        this.input.leftright = 0;
        this.input.updown = 0;
    }

    handleMouseMove(e) {
        e.preventDefault();
        if (!this.input.mousePosition) return;
        if (this.input.forwardbackward === 0) return;

        const currentMousePosition = this.getMousePosition(e);

        this.input.leftright = (this.input.mousePosition[0] - currentMousePosition[0]) / window.innerWidth * 2;
        this.camera.horizon = 100 + (this.input.mousePosition[1] - currentMousePosition[1]) / window.innerHeight * 500;
        this.input.updown = (this.input.mousePosition[1] - currentMousePosition[1]) / window.innerHeight * 10;
    }

    handleKeyDown(e) {
        switch (e.keyCode) {
            case 37: // left arrow
            case 65: // a
                this.input.leftright = 1;
                break;
            case 39: // right arrow
            case 68: // d
                this.input.leftright = -1;
                break;
            case 38: // up arrow
            case 87: // w
                this.input.forwardbackward = 1;
                break;
            case 40: // down arrow
            case 83: // s
                this.input.forwardbackward = -1;
                break;
            case 82: // r
                this.input.updown = 2;
                break;
            case 70: // f
                this.input.updown = -2;
                break;
            case 69: // e
                this.input.lookup = true;
                break;
            case 81: // q
                this.input.lookdown = true;
                break;
        }

        if (!this.updateRunning) {
            this.time = Date.now();
            this.draw();
        }
    }

    handleKeyUp(e) {
        switch (e.keyCode) {
            case 37: // left arrow
            case 65: // a
            case 39: // right arrow
            case 68: // d
                this.input.leftright = 0;
                break;
            case 38: // up arrow
            case 87: // w
            case 40: // down arrow
            case 83: // s
                this.input.forwardbackward = 0;
                break;
            case 82: // r
            case 70: // f
                this.input.updown = 0;
                break;
            case 69: // e
                this.input.lookup = false;
                break;
            case 81: // q
                this.input.lookdown = false;
                break;
        }
    }

    getMousePosition(e) {
        return e.type.startsWith('touch') ? [e.targetTouches[0].pageX, e.targetTouches[0].pageY] : [e.pageX, e.pageY];
    }

    init() {
        for (let i = 0; i < this.map.width * this.map.height; i++) {
            this.map.color[i] = 0xFF007050;
            this.map.altitude[i] = 0;
        }

        this.loadMap("C1W;D1");
        this.handleResize();

        const canvas = document.getElementById("fullscreenCanvas");
        window.addEventListener('keydown', this.handleKeyDown.bind(this));
        window.addEventListener('keyup', this.handleKeyUp.bind(this));
        canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        canvas.addEventListener('touchstart', this.handleMouseDown.bind(this));
        canvas.addEventListener('touchend', this.handleMouseUp.bind(this));
        canvas.addEventListener('touchmove', this.handleMouseMove.bind(this));
        window.addEventListener('resize', this.handleResize.bind(this));

        setInterval(() => {
            const current = Date.now();
            document.getElementById('fps').innerText = (this.frames / (current - this.timeLastFrame) * 1000).toFixed(1) + " fps";
            this.frames = 0;
            this.timeLastFrame = current;
        }, 2000);
    }
}

const viewer = new Viewer();
