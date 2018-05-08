import {vec3} from 'gl-matrix';
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
let mesh0: Mesh;

let tex0: Texture;
let tex1: Texture;
let puzzleSpriteSheet: Texture;

let hp: HackingPuzzle;
let hpBackup: HackingPuzzle;

let fixedCamera: boolean = true;

let GameStates = Object.freeze({"starting":1, "ongoing":2, "ending":3});
let state = GameStates.starting;

let bgm = new Audio('./src/resources/sounds/WARFRAME OST March Of The Moa.mp3');

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




function loadOBJText() {
  obj0 = readTextFile('./src/resources/obj/lopolyLessCheek2.obj')

}

function loadScene() {
  square && square.destroy();
  mesh0 && mesh0.destroy();



  square = new Square(vec3.fromValues(0, 0, 0));
  square.create();

  mesh0 = new Mesh(obj0, vec3.fromValues(0, 0, 0));
  mesh0.create();

  tex0 = new Texture('./src/resources/textures/sgrassCol.png');
  tex1 = new Texture('./src/resources/textures/sgrassPBR.png');
  puzzleSpriteSheet = new Texture('./src/resources/textures/puzzleSprites_channels.png');

}


function main() {
  bgm.volume = 0.0;

  // Initial display for framerate
  // const stats = Stats();
  // stats.setMode(0);
  // stats.domElement.style.position = 'absolute';
  // stats.domElement.style.left = '0px';
  // stats.domElement.style.top = '0px';
  // document.body.appendChild(stats.domElement);

  // Add controls to the gui
  const gui = new DAT.GUI();
  var focusSlider0 = gui.add(controls, 'depthFocusNear', 0.1, 50.0).step(0.1).listen();
  var focusSlider1 = gui.add(controls, 'depthFocusFar', 0.1, 50.0).step(0.1).listen();
  var focusSlider2 = gui.add(controls, 'depthRadiusNear', 0.1, 20.0).step(0.1);
  var focusSlider3 = gui.add(controls, 'depthRadiusFar', 0.1, 20.0).step(0.1);
  var bloomSlider0 = gui.add(controls, 'bloomThreshold', 0.1, 20.0).step(0.1);

  // get canvas and webgl context
  const canvas = <HTMLCanvasElement> document.getElementById('canvas');
  const gl = <WebGL2RenderingContext> canvas.getContext('webgl2');
  if (!gl) {
    alert('WebGL 2 not supported!');
  }
  // `setGL` is a function imported above which sets the value of `gl` in the `globals.ts` module.
  // Later, we can import `gl` from `globals.ts` to access it
  setGL(gl);

  // Initial call to load scene
  loadScene();

  const camera = new Camera(vec3.fromValues(3.5, 0, 5.5), vec3.fromValues(0, 0, 0));
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

  focusSlider0.onChange(function(value: number) {
    if (controls.depthFocusFar < value) controls.depthFocusFar = value;
    renderer.setDOFFocus(controls.depthFocusNear, controls.depthFocusFar, controls.depthRadiusNear, controls.depthRadiusFar);
  });

  focusSlider1.onChange(function(value: number) {
    if (controls.depthFocusNear > value) controls.depthFocusNear = value;
    renderer.setDOFFocus(controls.depthFocusNear, controls.depthFocusFar, controls.depthRadiusNear, controls.depthRadiusFar);
  });

  focusSlider2.onChange(function(value: number) {
    renderer.setDOFFocus(controls.depthFocusNear, controls.depthFocusFar, controls.depthRadiusNear, controls.depthRadiusFar);
  });

  focusSlider3.onChange(function(value: number) {
    renderer.setDOFFocus(controls.depthFocusNear, controls.depthFocusFar, controls.depthRadiusNear, controls.depthRadiusFar);
  });

  bloomSlider0.onChange(function(value: number) {
    renderer.setBloomThreshold(value);
  });

  standardDeferred.setupTexUnits(["tex_Color", "tex_PBRInfo"]);
  puzzleShader.setupTexUnits(["tex_Color"]);
  puzzleShader.setupIntUnits(["u_spriteFrame"]);
  puzzleShader.setupFloatUnits(["u_highlight"]);

  hp = new HackingPuzzle();
  hpBackup = new HackingPuzzle(); // switched upon win with old

  // This function will be called every frame
  let frame = 0;
  function tick() {
    //camera.updateFixed();
    //stats.begin();
    if (!fixedCamera) {
      camera.update();
    }
    gl.viewport(0, 0, window.innerWidth, window.innerHeight);
    timer.updateTime();
    renderer.updateTime(timer.deltaTime, timer.currentTime);

    standardDeferred.bindTexToUnit("tex_Color", tex0, 0);
    standardDeferred.bindTexToUnit("tex_PBRInfo", tex1, 1);

    renderer.clear();
    renderer.clearGB();
    renderer.renderToGBuffer(camera, standardDeferred, [mesh0]);
    renderer.renderFromGBuffer(camera);
    renderer.renderPostProcessHDR();

    // make a better unified translucency pass
    puzzleShader.bindTexToUnit("tex_Color", puzzleSpriteSheet, 0);
    renderer.renderPuzzle(hp, camera, puzzleShader);

    renderer.renderToneMap();
    renderer.renderPostProcessLDR();

    // Tell the browser to call `tick` again whenever it renders a new frame
    frame++;
    if (state == GameStates.ongoing) {
      requestAnimationFrame(tick);
    } 
    // setTimeout(tick, 1000);
    //if (timer.expired()) state = GameStates.ending;
  }

  window.addEventListener('resize', function() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.setAspectRatio(window.innerWidth / window.innerHeight);
    camera.updateProjectionMatrix();
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


  window.addEventListener('contextmenu', function(evt) {
    hp.rightClick(timer.currentTime);
    if (hp.verify()) console.log('shit dude');
    return false;
  }, false);

  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.setAspectRatio(window.innerWidth / window.innerHeight);
  camera.updateProjectionMatrix();

  function beginGame() {
    timer.remainingTime = 60.0;

    state = GameStates.ongoing;
    tick();
    bgm.play();
  }

  function switchPuzzles() {
    hp = hpBackup;
    hpBackup = new HackingPuzzle();
  }

  // Start the render loop
  
  beginGame();
}







function setup() {
  timer.startTime = Date.now();
  loadOBJText();
  main();

}



setup();
