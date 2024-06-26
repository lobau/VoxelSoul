"use strict";

// ---------------------------------------------
// Viewer information

// Does nothing yet
var player = {
    x: 512.,
    y: 800.
}

var camera = {
    x: 512.,
    y: 800.,
    // px: 512 + Math.cos(0) * 30,
    // py: 800 + Math.sin(0) * 30,
    height: 78.,
    angle: 0.,
    horizon: 50.,
    distance: 800,
};

// ---------------------------------------------
// Landscape data

var map = {
    width: 1024,
    height: 1024,
    shift: 10, // power of two: 2^10 = 1024
    altitude: new Uint8Array(1024 * 1024), // 1024 * 1024 byte array with height information
    color: new Uint32Array(1024 * 1024) // 1024 * 1024 int array with RGB colors
};

// ---------------------------------------------
// Screen data

var screendata = {
    canvas: null,
    context: null,
    imagedata: null,

    bufarray: null, // color data
    buf8: null, // the same array but with bytes
    buf32: null, // the same array but with 32-Bit words

    backgroundcolor: 0xFFE09090
};

// ---------------------------------------------
// Keyboard and mouse interaction

var input = {
    forwardbackward: 0,
    leftright: 0,
    updown: 0,
    lookup: false,
    lookdown: false,
    mouseposition: null,
    keypressed: false
}

var updaterunning = false;

var time = new Date().getTime();


// for fps display
var timelastframe = new Date().getTime();
var frames = 0;

// Update the camera for next frame. Dependent on keypresses
function UpdateCamera() {
    var current = new Date().getTime();

    input.keypressed = false;
    if (input.leftright != 0) {
        camera.angle += input.leftright * 0.1 * (current - time) * 0.03;
        input.keypressed = true;
    }
    if (input.forwardbackward != 0) {
        camera.x -= input.forwardbackward * Math.sin(camera.angle) * (current - time) * 0.05;
        camera.y -= input.forwardbackward * Math.cos(camera.angle) * (current - time) * 0.05;
        input.keypressed = true;
    }
    if (input.updown != 0) {
        camera.height += input.updown * (current - time) * 0.03;
        input.keypressed = true;
    }
    if (input.lookup) {
        camera.horizon += 2 * (current - time) * 0.1;
        input.keypressed = true;
    }
    if (input.lookdown) {
        camera.horizon -= 2 * (current - time) * 0.1;
        input.keypressed = true;
    }

    // Collision detection. Don't fly below the surface.
    var mapoffset = ((Math.floor(camera.y) & (map.width - 1)) << map.shift) + (Math.floor(camera.x) & (map.height - 1)) | 0;
    if ((map.altitude[mapoffset] + 10) > camera.height) camera.height = map.altitude[mapoffset] + 10;

    // camera.height = map.altitude[mapoffset] + 20;

    time = current;

}

// ---------------------------------------------
// Keyboard and mouse event handlers
// ---------------------------------------------
// Keyboard and mouse event handlers

function GetMousePosition(e) {
    // fix for Chrome
    if (e.type.startsWith('touch')) {
        return [e.targetTouches[0].pageX, e.targetTouches[0].pageY];
    } else {
        return [e.pageX, e.pageY];
    }
}


function DetectMouseDown(e) {
    input.forwardbackward = 3.;
    input.mouseposition = GetMousePosition(e);
    time = new Date().getTime();

    if (!updaterunning) Draw();
    return;
}

function DetectMouseUp() {
    input.mouseposition = null;
    input.forwardbackward = 0;
    input.leftright = 0;
    input.updown = 0;
    return;
}

function DetectMouseMove(e) {
    e.preventDefault();
    if (input.mouseposition == null) return;
    if (input.forwardbackward == 0) return;

    var currentMousePosition = GetMousePosition(e);

    input.leftright = (input.mouseposition[0] - currentMousePosition[0]) / window.innerWidth * 2;
    camera.horizon = 100 + (input.mouseposition[1] - currentMousePosition[1]) / window.innerHeight * 500;
    input.updown = (input.mouseposition[1] - currentMousePosition[1]) / window.innerHeight * 10;
}


function DetectKeysDown(e) {
    switch (e.keyCode) {
        case 37: // left cursor
        case 65: // a
            input.leftright = +1.;
            break;
        case 39: // right cursor
        case 68: // d
            input.leftright = -1.;
            break;
        case 38: // cursor up
        case 87: // w
            input.forwardbackward = 1.;
            break;
        case 40: // cursor down
        case 83: // s
            input.forwardbackward = -1.;
            break;
        case 82: // r
            input.updown = +2.;
            break;
        case 70: // f
            input.updown = -2.;
            break;
        case 69: // e
            input.lookup = true;
            break;
        case 81: //q
            input.lookdown = true;
            break;
        default:
            return;
            break;
    }

    if (!updaterunning) {
        time = new Date().getTime();
        Draw();
    }
    return false;
}

function DetectKeysUp(e) {
    switch (e.keyCode) {
        case 37: // left cursor
        case 65: // a
            input.leftright = 0;
            break;
        case 39: // right cursor
        case 68: // d
            input.leftright = 0;
            break;
        case 38: // cursor up
        case 87: // w
            input.forwardbackward = 0;
            break;
        case 40: // cursor down
        case 83: // s
            input.forwardbackward = 0;
            break;
        case 82: // r
            input.updown = 0;
            break;
        case 70: // f
            input.updown = 0;
            break;
        case 69: // e
            input.lookup = false;
            break;
        case 81: //q
            input.lookdown = false;
            break;
        default:
            return;
            break;
    }
    return false;
}

// ---------------------------------------------
// Fast way to draw vertical lines

function DrawVerticalLine(x, ytop, ybottom, col) {
    x = x | 0;
    ytop = ytop | 0;
    ybottom = ybottom | 0;
    col = col | 0;
    var buf32 = screendata.buf32;
    var screenwidth = screendata.canvas.width | 0;
    if (ytop < 0) ytop = 0;
    if (ytop > ybottom) return;

    // get offset on screen for the vertical line
    var offset = ((ytop * screenwidth) + x) | 0;
    for (var k = ytop | 0; k < ybottom | 0; k = k + 1 | 0) {
        buf32[offset | 0] = col | 0;
        offset = offset + screenwidth | 0;
    }
}

// ---------------------------------------------
// Basic screen handling

function DrawBackground() {
    var buf32 = screendata.buf32;
    var color = screendata.backgroundcolor | 0;
    for (var i = 0; i < buf32.length; i++) buf32[i] = color | 0;
}

// Show the back buffer on screen
function Flip() {
    screendata.imagedata.data.set(screendata.buf8);
    screendata.context.putImageData(screendata.imagedata, 0, 0);
}

// ---------------------------------------------
// The main render routine

function Render() {
    var mapwidthperiod = map.width - 1;
    var mapheightperiod = map.height - 1;

    var screenwidth = screendata.canvas.width | 0;
    var sinang = Math.sin(camera.angle);
    var cosang = Math.cos(camera.angle);

    var hiddeny = new Int32Array(screenwidth);
    for (var i = 0; i < screendata.canvas.width | 0; i = i + 1 | 0)
        hiddeny[i] = screendata.canvas.height;

    var deltaz = 1.;

    // Draw from front to back
    for (var z = 1; z < camera.distance; z += deltaz) {
        // 90 degree field of view
        var plx = -cosang * z - sinang * z;
        var ply = sinang * z - cosang * z;
        var prx = cosang * z - sinang * z;
        var pry = -sinang * z - cosang * z;

        var dx = (prx - plx) / screenwidth;
        var dy = (pry - ply) / screenwidth;

        plx += camera.x;
        ply += camera.y;

        var invz = 1. / z * 240;
        for (var i = 0; i < screenwidth | 0; i = i + 1 | 0) {
            var mapoffset = ((Math.floor(ply) & mapwidthperiod) << map.shift) + (Math.floor(plx) & mapheightperiod) | 0;
            var heightonscreen = (camera.height - map.altitude[mapoffset]) * invz + camera.horizon | 0;
            DrawVerticalLine(i, heightonscreen | 0, hiddeny[i], map.color[mapoffset]);
            if (heightonscreen < hiddeny[i]) hiddeny[i] = heightonscreen;
            plx += dx;
            ply += dy;
        }
        deltaz += 0.005;
    }
}


// ---------------------------------------------
// Draw the next frame

function Draw() {
    updaterunning = true;
    UpdateCamera();
    DrawBackground();
    Render();
    Flip();
    frames++;

    if (!input.keypressed) {
        updaterunning = false;
    } else {
        window.requestAnimationFrame(Draw, 0);
    }
}

// ---------------------------------------------
// Init routines

// Util class for downloading the png
function DownloadImagesAsync(urls) {
    return new Promise(function(resolve, reject) {

        var pending = urls.length;
        var result = [];
        if (pending === 0) {
            resolve([]);
            return;
        }
        urls.forEach(function(url, i) {
            var image = new Image();
            //image.addEventListener("load", function() {
            image.onload = function() {
                var tempcanvas = document.createElement("canvas");
                var tempcontext = tempcanvas.getContext("2d");
                tempcanvas.width = map.width;
                tempcanvas.height = map.height;
                tempcontext.drawImage(image, 0, 0, map.width, map.height);
                result[i] = tempcontext.getImageData(0, 0, map.width, map.height).data;
                pending--;
                if (pending === 0) {
                    resolve(result);
                }
            };
            image.src = url;
        });
    });
}

function LoadMap(filenames) {
    var files = filenames.split(";");
    DownloadImagesAsync(["maps/" + files[0] + ".png", "maps/" + files[1] + ".png"]).then(OnLoadedImages);
}

function OnLoadedImages(result) {
    var datac = result[0];
    var datah = result[1];
    for (var i = 0; i < map.width * map.height; i++) {
        map.color[i] = 0xFF000000 | (datac[(i << 2) + 2] << 16) | (datac[(i << 2) + 1] << 8) | datac[(i << 2) + 0];
        map.altitude[i] = datah[i << 2];
    }
    Draw();
}

function OnResizeWindow() {
    screendata.canvas = document.getElementById('fullscreenCanvas');

    var aspect = window.innerWidth / window.innerHeight;

    screendata.canvas.width = window.innerWidth < 800 ? window.innerWidth : 800;
    screendata.canvas.height = screendata.canvas.width / aspect;

    if (screendata.canvas.getContext) {
        screendata.context = screendata.canvas.getContext('2d');
        screendata.imagedata = screendata.context.createImageData(screendata.canvas.width, screendata.canvas.height);
    }

    screendata.bufarray = new ArrayBuffer(screendata.imagedata.width * screendata.imagedata.height * 4);
    screendata.buf8 = new Uint8Array(screendata.bufarray);
    screendata.buf32 = new Uint32Array(screendata.bufarray);
    Draw();
}

function Init() {
    for (var i = 0; i < map.width * map.height; i++) {
        map.color[i] = 0xFF007050;
        map.altitude[i] = 0;
    }

    LoadMap("C1W;D1");
    OnResizeWindow();

    // set event handlers for keyboard, mouse, touchscreen and window resize
    var canvas = document.getElementById("fullscreenCanvas");
    window.onkeydown = DetectKeysDown;
    window.onkeyup = DetectKeysUp;
    canvas.onmousedown = DetectMouseDown;
    canvas.onmouseup = DetectMouseUp;
    canvas.onmousemove = DetectMouseMove;
    canvas.ontouchstart = DetectMouseDown;
    canvas.ontouchend = DetectMouseUp;
    canvas.ontouchmove = DetectMouseMove;

    window.onresize = OnResizeWindow;

    window.setInterval(function() {
        var current = new Date().getTime();
        document.getElementById('fps').innerText = (frames / (current - timelastframe) * 1000).toFixed(1) + " fps";
        frames = 0;
        timelastframe = current;
    }, 2000);

}

Init();
