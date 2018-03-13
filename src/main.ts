import {vec3} from 'gl-matrix';
import * as Stats from 'stats-js';
import * as DAT from 'dat-gui';
import Icosphere from './geometry/Icosphere';
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
  tesselations: 5,
  'Load Scene': loadScene, 
};

let icosphere: Icosphere;
let square: Square;

let obj0: string;
let mesh0: Mesh;

let tex0: Texture;
let tex1: Texture;
let puzzleSpriteSheet: Texture;

var timer = {
  deltaTime: 0.0,
  startTime: 0.0,
  currentTime: 0.0,
  updateTime: function() {
    var t = Date.now();
    t = (t - timer.startTime) * 0.001;
    timer.deltaTime = t - timer.currentTime;
    timer.currentTime = t;
  },
};


function loadOBJText() {
  obj0 = readTextFile('../resources/obj/lopolyLessCheek2.obj')

}

function loadScene() {
  icosphere && icosphere.destroy();
  square && square.destroy();
  mesh0 && mesh0.destroy();


  icosphere = new Icosphere(vec3.fromValues(0, 0, 0), 1, controls.tesselations);
  icosphere.create();
  square = new Square(vec3.fromValues(0, 0, 0));
  square.create();

  mesh0 = new Mesh(obj0, vec3.fromValues(0, 0, 0));
  mesh0.create();

  tex0 = new Texture('../resources/textures/sgrassCol.png');
  tex1 = new Texture('../resources/textures/sgrassPBR.png');
  puzzleSpriteSheet = new Texture('../resources/textures/puzzleSprites.png');

}


function main() {
  // Initial display for framerate
  const stats = Stats();
  stats.setMode(0);
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.left = '0px';
  stats.domElement.style.top = '0px';
  document.body.appendChild(stats.domElement);

  // Add controls to the gui
  const gui = new DAT.GUI();
  gui.add(controls, 'tesselations', 0, 8).step(1);
  gui.add(controls, 'Load Scene');

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

  const camera = new Camera(vec3.fromValues(0, 0, 5), vec3.fromValues(0, 0, 0));

  const renderer = new OpenGLRenderer(canvas);
  renderer.setClearColor(0, 0, 0, 1);
  gl.enable(gl.DEPTH_TEST);

  const lambert = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/lambert-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/lambert-frag.glsl')),
  ]);

  const screenTest = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/screenspace-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/screenspace-frag.glsl')),
    ]);

  const standardDeferred = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/standard-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/standard-frag.glsl')),
    ]);

  const puzzleShader = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/sprite-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/alphaUnlit-frag.glsl')),
    ]);

  standardDeferred.setupTexUnits(["tex_Color", "tex_PBRInfo"]);
  puzzleShader.setupTexUnits(["tex_Color"]);
  puzzleShader.setupIntUnits(["u_spriteFrame"]);

  let hp: HackingPuzzle = new HackingPuzzle();

  // This function will be called every frame
  let frame = 0;
  function tick() {
    camera.update();
    stats.begin();
    gl.viewport(0, 0, window.innerWidth, window.innerHeight);
    timer.updateTime();
    renderer.updateTime(timer.deltaTime, timer.currentTime);

    standardDeferred.bindTexToUnit("tex_Color", tex0, 0);
    standardDeferred.bindTexToUnit("tex_PBRInfo", tex1, 1);

    

    renderer.clear();
    renderer.clearGB();
    renderer.renderToGBuffer(camera, standardDeferred, [mesh0]);
    renderer.renderFromGBuffer(camera);

    puzzleShader.bindTexToUnit("tex_Color", puzzleSpriteSheet, 0);
    renderer.renderPuzzle(hp, camera, puzzleShader);

    renderer.renderPostProcess();
    stats.end();

    // Tell the browser to call `tick` again whenever it renders a new frame
    frame++;
    requestAnimationFrame(tick);
    // setTimeout(tick, 1000);
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
    var ray = camera.raycast(u, v);
    hp.highlight(ray[0], ray[1]);
    //console.log(u + ', ' + v);
  });

  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.setAspectRatio(window.innerWidth / window.innerHeight);
  camera.updateProjectionMatrix();

  // Start the render loop
  tick();
}


function setup() {
  timer.startTime = Date.now();
  loadOBJText();
  main();
}

setup();
