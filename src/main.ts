import {vec3, mat4} from 'gl-matrix';
import * as Stats from 'stats-js';
import * as DAT from 'dat-gui';
import Square from './geometry/Square';
import Mesh from './geometry/Mesh';
import HackingPuzzle from './game/HackingPuzzle'
import OpenGLRenderer from './rendering/gl/OpenGLRenderer';
import Camera from './Camera';
import {setGL} from './globals';
import {readTextFile} from './globals';
import ShaderProgram, {Shader} from './rendering/gl/ShaderProgram';
import Texture from './rendering/gl/Texture';

// Define an object with application parameters and button callbacks
const controls = {
  depthFocusNear: 5.0,
  depthFocusFar: 6.0,
  depthRadiusNear: 3.0,
  depthRadiusFar: 3.0,
  bloomThreshold: 2.0,
};


let square: Square;

let obj0: string;
let obj1: string;
let mesh0: Mesh;
let mesh1: Mesh;

let tex0: Texture;
let tex1: Texture;
let tex2: Texture;
let tex3: Texture;

let texs0: Texture;
let texs1: Texture;
let texs2: Texture;
let texs3: Texture;

let texBG: Texture;

let puzzleSpriteSheet: Texture;

let hp: HackingPuzzle;
let hpBackup: HackingPuzzle;

let fixedCamera: boolean = true;

let GameStates = Object.freeze({"starting":1, "ongoing":2, "ending":3});
let state = GameStates.starting;

let bgm = new Audio('./src/resources/sounds/WARFRAME OST March Of The Moa.mp3');

const instructions0 = "Finish each puzzle by connecting the internal circuits.";
const instructions1 = "Rotate each component by left or right clicking.";
const instructions2 = "You have 60 seconds to finish as many as you can."; 
const instructions3 = "Press Enter / Return to start.";

const endPrefix = "You completed ";
const endSuffix = " puzzles. Press Enter / Return to restart.";

let timer = {
  deltaTime: 0.0,
  startTime: 0.0,
  currentTime: 0.0,
  remainingTime: 0.0,
  updateTime: function() {
    var t = Date.now();
    t = (t - timer.startTime) * 0.001;
    timer.deltaTime = t - timer.currentTime;
    timer.currentTime = t;
    timer.remainingTime = timer.remainingTime - timer.deltaTime;
  },
  expired: function() {
    return timer.remainingTime <= 0.0;
  },
};


let textColor = "#f7e9a5";

function loadOBJText() {
  obj0 = readTextFile('./src/resources/obj/combinedScreenpanel.obj')
  obj1 = readTextFile('./src/resources/obj/consoleside.obj')
}

function loadScene() {
  square && square.destroy();
  mesh0 && mesh0.destroy();

  mesh1 && mesh1.destroy();

  square = new Square(vec3.fromValues(0, 0, 0));
  square.create();

  mesh0 = new Mesh(obj0, vec3.fromValues(0, 0, 0));
  mesh0.create();

  mesh1 = new Mesh(obj1, vec3.fromValues(0, 0, 0));
  mesh1.create();

  tex0 = new Texture('./src/resources/textures/Panel_base.png');
  tex1 = new Texture('./src/resources/textures/Panel_pbr.png');
  tex2 = new Texture('./src/resources/textures/Panel_emi.png');
  tex3 = new Texture('./src/resources/textures/Panel_nor.png');

  texs0 = new Texture('./src/resources/textures/Side_base.png');
  texs1 = new Texture('./src/resources/textures/Side_pbr.png');
  texs2 = new Texture('./src/resources/textures/Side_emi.png');
  texs3 = new Texture('./src/resources/textures/Side_nor.png');

  texBG = new Texture('./src/resources/textures/puzzleBG.png');

  puzzleSpriteSheet = new Texture('./src/resources/textures/puzzleSprites_channels.png');

}

function refreshText(c: HTMLCanvasElement) {
  let ctx = c.getContext("2d");
  ctx.fillStyle = "#f7e9a5";
  ctx.font = "24px Lato";
  return ctx;
}

function main() {
  bgm.volume = 0.0;

  // get canvas and webgl context
  const canvas = <HTMLCanvasElement> document.getElementById('canvas');
  const gl = <WebGL2RenderingContext> canvas.getContext('webgl2');
  if (!gl) {
    alert('WebGL 2 not supported!');
  }
  const canvas2d = <HTMLCanvasElement> document.getElementById("overlay");
  canvas2d.height = window.innerHeight;
  canvas2d.width =  window.innerWidth;
  let ctx2d = refreshText(canvas2d);
  let score = 0;

  setGL(gl);

  // Initial call to load scene
  loadScene();

  const camera = new Camera(vec3.fromValues(6, 2, 10), vec3.fromValues(0, 0, 0));
  camera.update();
  camera.updateFixed(0.0, 0.0);

  const renderer = new OpenGLRenderer(canvas);
  renderer.setClearColor(0, 0, 0, 1);
  gl.enable(gl.DEPTH_TEST);

  const standardDeferred = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/standard-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/standard-frag.glsl')),
    ]);

  const puzzleShader = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/sprite-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/alphaUnlit-frag.glsl')),
    ]);

  const puzzleBGShader = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/standard-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/alphaUnlit-frag.glsl')),
    ]);


  standardDeferred.setupTexUnits(["tex_Color", "tex_PBRInfo", "tex_Emissive", "tex_Nor"]);
  standardDeferred.setupFloatUnits(["u_emissiveStrength"]);
  standardDeferred.setFloatUniform("u_emissiveStrength", 0.5);

  puzzleShader.setupTexUnits(["tex_Color"]);
  puzzleShader.setupIntUnits(["u_spriteFrame"]);
  puzzleShader.setupFloatUnits(["u_highlight", "u_alpha"]);

  puzzleBGShader.setupTexUnits(["tex_Color"]);
  puzzleBGShader.setupFloatUnits(["u_alpha"]);

  hp = new HackingPuzzle();
  hpBackup = new HackingPuzzle(); // switched upon win with old

  let panelSRT = mat4.create();
  let panelT = mat4.create();
  mat4.fromTranslation(panelT, vec3.fromValues(0, -1, -4));
  mat4.fromXRotation(panelSRT, Math.PI * 0.5 - 0.2);
  mat4.multiply(panelSRT, panelT, panelSRT);

  let sideSRT = mat4.create();
  let sideSRT2 = mat4.create();
  let sideT = mat4.create();
  let sideT2 = mat4.create();
  let sideS = mat4.create();
  mat4.fromScaling(sideS, vec3.fromValues(2.0, 2.0, 2.0));
  mat4.fromTranslation(sideT, vec3.fromValues(-7, -2, -2));
  mat4.fromTranslation(sideT2, vec3.fromValues(7, -2, -2));
  let sideRX = mat4.create();
  mat4.fromXRotation(sideRX, Math.PI * 0.5);
  let sideRY = mat4.create();
  mat4.fromYRotation(sideRY, 0.5);
  let sideRY2 = mat4.create();
  mat4.fromYRotation(sideRY2, -0.5);

  mat4.multiply(sideSRT, sideRY, sideRX);
  mat4.multiply(sideSRT2, sideRY2, sideRX);
  mat4.multiply(sideSRT, sideS, sideSRT);
  mat4.multiply(sideSRT2, sideS, sideSRT2);
  mat4.multiply(sideSRT2, sideT2, sideSRT2);
  mat4.multiply(sideSRT, sideT, sideSRT);
  // This function will be called every frame
  let frame = 0;
  function tick() {

    timer.updateTime();

    if (state == GameStates.starting) {
      ctx2d.fillStyle = "black";
      ctx2d.beginPath()
      ctx2d.rect(0, 0, window.innerWidth, window.innerHeight);
      ctx2d.fill();
      ctx2d.fillStyle = textColor;
      ctx2d.fillText(instructions0, 100, 200);
      ctx2d.fillText(instructions1, 100, 250);
      ctx2d.fillText(instructions2, 100, 300);
      ctx2d.fillText(instructions3, 100, 350);

    } else if (state == GameStates.ongoing) {
      ctx2d.clearRect(0, 0, 500, 500);
      if (!fixedCamera) {
        camera.update();
      }

      gl.viewport(0, 0, window.innerWidth, window.innerHeight);

      if (hp.verify()) {
        //switchPuzzles();
        hp.lockInteraction(timer.currentTime);
        hp.startWinAnimation(timer.currentTime);
        score += 1;
      }

      if (hp.isDead(timer.currentTime)) {
        switchPuzzles();
      }
     
      renderer.updateTime(timer.deltaTime, timer.currentTime);

      standardDeferred.bindTexToUnit("tex_Color", tex0, 0);
      standardDeferred.bindTexToUnit("tex_PBRInfo", tex1, 1);
      standardDeferred.bindTexToUnit("tex_Emissive", tex2, 2);
      standardDeferred.bindTexToUnit("tex_Nor", tex3, 3);
      

      renderer.clear();
      renderer.clearGB();

      renderer.renderToGBuffer(camera, standardDeferred, [mesh0], [panelSRT]);

      standardDeferred.bindTexToUnit("tex_Color", texs0, 0);
      standardDeferred.bindTexToUnit("tex_PBRInfo", texs1, 1);
      standardDeferred.bindTexToUnit("tex_Emissive", texs2, 2);
      standardDeferred.bindTexToUnit("tex_Nor", texs3, 3);

      renderer.renderToGBuffer(camera, standardDeferred, [mesh1, mesh1], [sideSRT, sideSRT2]);

      renderer.renderFromGBuffer(camera);
      renderer.renderPostProcessHDR();

      puzzleBGShader.bindTexToUnit("tex_Color", texBG, 0);
      renderer.renderPuzzleBG(camera, puzzleBGShader);

      // make a better unified translucency pass
      puzzleShader.bindTexToUnit("tex_Color", puzzleSpriteSheet, 0);
      renderer.renderPuzzle(hp, camera, puzzleShader);

      renderer.renderToneMap();
      renderer.renderPostProcessLDR();

      ctx2d.fillText((timer.remainingTime).toFixed(1).toString(), 100, 100);
      ctx2d.fillText(score.toString(), 100, 200);

      if (timer.expired()) {
        // end it all
        state = GameStates.ending;
      }

    } else if (state == GameStates.ending) {
      ctx2d.clearRect(0, 0, 500, 500);
      ctx2d.fillText("You completed " + score + " puzzles.", 100, 200);     
      ctx2d.fillText("Press Enter / Return to restart.", 100, 250);

    }
    
    bgm.volume = Math.max(0.1, Math.min(1.0, 1.0 + timer.remainingTime / 10.0)); 
    frame++; // currently unused
    requestAnimationFrame(tick);   
  }

  window.addEventListener('resize', function() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.setAspectRatio(window.innerWidth / window.innerHeight);
    camera.updateProjectionMatrix();
    canvas2d.height = window.innerHeight;
    canvas2d.width = window.innerWidth;
    refreshText(canvas2d)
  }, false);

  window.addEventListener('mousemove', function(evt) {
    var u = evt.x / window.innerWidth;
    var v = 1.0 - evt.y / window.innerHeight;
    u = 2.0 * u - 1.0;
    v = 2.0 * v - 1.0;
    if (fixedCamera) {
      camera.updateFixed(u, v);
    }
    var ray = camera.raycast(u, v);
    hp.highlight(ray[0], ray[1]);
  }, false);

  window.addEventListener('click', function(evt) {
    hp.leftClick(timer.currentTime);
    if (hp.verify()) console.log('shit dude');
    return false;
  }, false);

  canvas2d.oncontextmenu = function (e) {
    e.preventDefault();
  };

  window.addEventListener('contextmenu', function(evt) {
    hp.rightClick(timer.currentTime);
    if (hp.verify()) console.log('shit dude');
    return false;
  }, false);

  window.addEventListener('keydown', function(evt) {
    if (state == GameStates.ongoing) return;
    if (evt.keyCode == 13) beginGame();
    ctx2d.clearRect(0, 0, window.innerWidth, window.innerHeight);
    return false;
  }, false);

  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.setAspectRatio(window.innerWidth / window.innerHeight);
  camera.updateProjectionMatrix();

  function beginGame() {
    timer.remainingTime = 60.0;

    state = GameStates.ongoing;
    //tick();
    bgm.currentTime = 0;
    bgm.play();
    bgm.volume = 1.0;
    score = 0;
    hp = hpBackup;
    hpBackup = new HackingPuzzle();
    hp.startIntroAnimation(timer.currentTime);
  }

  function switchPuzzles() {
    hp = hpBackup;
    hpBackup = new HackingPuzzle();
    hp.startIntroAnimation(timer.currentTime);
  }

  // Start the render loop
  
  tick();
}


function setup() {
  timer.startTime = Date.now();
  loadOBJText();
  main();

}



setup();
