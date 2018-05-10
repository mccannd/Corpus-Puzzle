import {mat4, vec4, vec3, vec2} from 'gl-matrix';
import Drawable from './Drawable';
import Texture from './Texture'
import Camera from '../../Camera';
import {gl} from '../../globals';
import ShaderProgram, {Shader} from './ShaderProgram';
import PostProcess from './PostProcess'
import Square from '../../geometry/Square';
import HackingPuzzle from '../../game/HackingPuzzle'

let puzzleQuad: Square;

let environment: Texture;
let brdf: Texture;

class OpenGLRenderer {
  blurDivisor: number = 4;

  gBuffer: WebGLFramebuffer; // framebuffer for deferred rendering
  gbTargets: WebGLTexture[]; // references to different color outputs of the gbuffer
  depthTexture: WebGLTexture;

  // post-processing buffers pre-tonemapping
  post32Buffers: WebGLFramebuffer[];
  post32Targets: WebGLTexture[];

  // post-processing buffers post-tonemapping
  post8Buffers: WebGLFramebuffer[];
  post8Targets: WebGLTexture[];

  // post processing shader lists, try to limit the number for performance reasons
  post8Passes: PostProcess[];
  post32Passes: PostProcess[];

  currentTime: number; // timer number to apply to all drawing shaders

  // the shader that renders from the gbuffers into the postbuffers
  deferredShader :  PostProcess = new PostProcess(
    new Shader(gl.FRAGMENT_SHADER, require('../../shaders/deferred-render.glsl'))
    );

  // shader that maps 32-bit color to 8-bit color
  tonemapPass : PostProcess = new PostProcess(
    new Shader(gl.FRAGMENT_SHADER, require('../../shaders/tonemap-frag.glsl'))
    );

  dofSeparator : PostProcess = new PostProcess(
    new Shader(gl.FRAGMENT_SHADER, require('../../shaders/separatePass-frag.glsl'))
    );

  dofComposite : PostProcess = new PostProcess(
    new Shader(gl.FRAGMENT_SHADER, require('../../shaders/dofComposite-frag.glsl'))
    );

  dofHorizPass: PostProcess = new PostProcess(
    new Shader(gl.FRAGMENT_SHADER, require('../../shaders/blurHorizontal-frag.glsl'))
    );

  dofVertPass: PostProcess = new PostProcess(
    new Shader(gl.FRAGMENT_SHADER, require('../../shaders/blurVertical-frag.glsl'))
    );

  highpass: PostProcess = new PostProcess(
    new Shader(gl.FRAGMENT_SHADER, require('../../shaders/highpass-frag.glsl'))
    );

  additive: PostProcess = new PostProcess(
    new Shader(gl.FRAGMENT_SHADER, require('../../shaders/add-frag.glsl'))
    );

  blurBuffers: WebGLFramebuffer[];
  blurSeparator: WebGLFramebuffer;
  blurTargets: WebGLTexture[];

  add8BitPass(pass: PostProcess) {
    this.post8Passes.push(pass);
  }


  add32BitPass(pass: PostProcess) {
    this.post32Passes.push(pass);
  }


  constructor(public canvas: HTMLCanvasElement) {

    brdf = new Texture('./src/resources/textures/brdfLUT.png');
    environment = new Texture('./src/resources/textures/environment_hacky2.png');

    this.currentTime = 0.0;
    this.gbTargets = [undefined, undefined, undefined, undefined];
    this.post8Buffers = [undefined, undefined];
    this.post8Targets = [undefined, undefined];
    this.post8Passes = [];

    this.post32Buffers = [undefined, undefined];
    this.post32Targets = [undefined, undefined];
    this.post32Passes = [];

    this.blurBuffers = [undefined, undefined, undefined];
    this.blurTargets = [undefined, undefined, undefined];
    this.blurSeparator = undefined;

    this.deferredShader.setupFloatUnits(['u_aspect', 'u_tanAlpha'])

    if (!gl.getExtension("OES_texture_float_linear")) {
      console.error("OES_texture_float_linear not available");
    }

    if (!gl.getExtension("EXT_color_buffer_float")) {
      console.error("FLOAT color buffer not available");
    }

    var gb0loc = gl.getUniformLocation(this.deferredShader.prog, "u_gb0");
    var gb1loc = gl.getUniformLocation(this.deferredShader.prog, "u_gb1");
    var gb2loc = gl.getUniformLocation(this.deferredShader.prog, "u_gb2");  
    var gb3loc = gl.getUniformLocation(this.deferredShader.prog, "u_gb3");

    this.deferredShader.use();
    gl.uniform1i(gb0loc, 0);
    gl.uniform1i(gb1loc, 1);
    gl.uniform1i(gb2loc, 2);
    gl.uniform1i(gb3loc, 3);

    this.deferredShader.setupTexUnits(['tex_BRDF', 'tex_env']);

    puzzleQuad = new Square(vec3.fromValues(0, 0, 0));
    puzzleQuad.create();

    // depth of field constants
    var dofSepLoc = gl.getUniformLocation(this.dofSeparator.prog, "u_posGB");
    this.dofSeparator.use();
    gl.uniform1i(dofSepLoc, 1);
    this.dofSeparator.setupFloatUnits(["u_focusDistNear", "u_focusDistFar", "u_focusRadNear", "u_focusRadFar"]);
    this.dofSeparator.setFloatUniform("u_focusDistNear", 10.0);
    this.dofSeparator.setFloatUniform("u_focusDistFar", 20.0);
    this.dofSeparator.setFloatUniform("u_focusRadNear", 3.0);
    this.dofSeparator.setFloatUniform("u_focusRadFar", 3.0);
    

    var dofCompLoc0 = gl.getUniformLocation(this.dofComposite.prog, "u_nearFrame");
    var dofCompLoc1 = gl.getUniformLocation(this.dofComposite.prog, "u_farFrame");
    this.dofComposite.use();
    gl.uniform1i(dofCompLoc0, 1);
    gl.uniform1i(dofCompLoc1, 2);

    var addLoc0 = gl.getUniformLocation(this.additive.prog, "u_overlay");
    this.additive.use();
    gl.uniform1i(addLoc0, 1);

    this.dofVertPass.setupFloatUnits(["alphaBlur"]);
    this.dofHorizPass.setupFloatUnits(["alphaBlur"]);
    this.highpass.setupFloatUnits(["u_Threshold"]);

    this.highpass.setFloatUniform("u_Threshold", 2.0);
  }


  setClearColor(r: number, g: number, b: number, a: number) {
    gl.clearColor(r, g, b, a);
  }


  setSize(width: number, height: number) {
    console.log(width, height);
    this.canvas.width = width;
    this.canvas.height = height;

    // --- GBUFFER CREATION START ---
    // refresh the gbuffers
    this.gBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.gBuffer);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]);

    for (let i = 0; i < 4; i ++) {
      this.gbTargets[i] = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.gbTargets[i]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
      if (i == 0) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, gl.drawingBufferWidth, gl.drawingBufferHeight, 0, gl.RGBA, gl.FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.drawingBufferWidth, gl.drawingBufferHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, this.gbTargets[i], 0);
    }
    // depth attachment
    this.depthTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, gl.drawingBufferWidth, gl.drawingBufferHeight, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depthTexture, 0);
    
    var FBOstatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (FBOstatus != gl.FRAMEBUFFER_COMPLETE) {
        console.error("GL_FRAMEBUFFER_COMPLETE failed, CANNOT use FBO[0]\n");
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // create the framebuffers for post processing
    for (let i = 0; i < this.post8Buffers.length; i++) {

      // 8 bit buffers have unsigned byte textures of type gl.RGBA8
      this.post8Buffers[i] = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.post8Buffers[i]);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

      this.post8Targets[i] = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.post8Targets[i]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); 
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.drawingBufferWidth, gl.drawingBufferHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.post8Targets[i], 0);

      FBOstatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (FBOstatus != gl.FRAMEBUFFER_COMPLETE) {
        console.error("GL_FRAMEBUFFER_COMPLETE failed, CANNOT use 8 bit FBO\n");
      }
    }

    for (let i = 0; i < this.post32Buffers.length; i++) {
      // 32 bit buffers have float textures of type gl.RGBA32F
      this.post32Buffers[i] = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.post32Buffers[i]);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

      this.post32Targets[i] = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.post32Targets[i]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); 
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, gl.drawingBufferWidth, gl.drawingBufferHeight, 0, gl.RGBA, gl.FLOAT, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.post32Targets[i], 0);

      FBOstatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (FBOstatus != gl.FRAMEBUFFER_COMPLETE) {
        console.error("GL_FRAMEBUFFER_COMPLETE failed, CANNOT use 8 bit FBO\n");
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Create buffers for blur effects
    for (let i = 0; i < this.blurBuffers.length; i++) {
      this.blurBuffers[i] = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurBuffers[i]);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

      this.blurTargets[i] = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.blurTargets[i]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); 
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, gl.drawingBufferWidth / this.blurDivisor, gl.drawingBufferHeight / this.blurDivisor, 0, gl.RGBA, gl.FLOAT, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.blurTargets[i], 0);

      FBOstatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (FBOstatus != gl.FRAMEBUFFER_COMPLETE) {
        console.error("GL_FRAMEBUFFER_COMPLETE failed, CANNOT use 8 bit FBO\n");
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this.blurSeparator = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurSeparator);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.blurTargets[0], 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.blurTargets[1], 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // set the resolution of post shaders
    this.dofComposite.setResolution(width, height);
    this.dofHorizPass.setResolution(width / this.blurDivisor, height/ this.blurDivisor);
    this.dofVertPass.setResolution(width/ this.blurDivisor, height/ this.blurDivisor);
  }


  updateTime(deltaTime: number, currentTime: number) {
    this.deferredShader.setTime(currentTime);
    for (let pass of this.post8Passes) pass.setTime(currentTime);
    for (let pass of this.post32Passes) pass.setTime(currentTime);
    this.currentTime = currentTime;
  }

  setDOFFocus(focusN: number, focusF: number, radN: number, radF: number) {
    this.dofSeparator.setFloatUniform("u_focusDistNear", focusN);
    this.dofSeparator.setFloatUniform("u_focusDistFar", focusF);
    this.dofSeparator.setFloatUniform("u_focusRadNear", radN);
    this.dofSeparator.setFloatUniform("u_focusRadFar", radF);
  }

  setBloomThreshold(threshold: number) {
    this.highpass.setFloatUniform("u_Threshold", threshold);
  }

  clear() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }


  clearGB() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.gBuffer);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurSeparator);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.post32Buffers[0]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.post32Buffers[1]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }  


  renderToGBuffer(camera: Camera, gbProg: ShaderProgram, drawables: Array<Drawable>, transforms: Array<mat4>) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.gBuffer);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);


    let viewProj = mat4.create();
    let view = camera.viewMatrix;
    let proj = camera.projectionMatrix;
    let color = vec4.fromValues(0.5, 0.5, 0.5, 1);
   
    gbProg.setViewProjMatrix(viewProj);
    gbProg.setGeometryColor(color);
    gbProg.setViewMatrix(view);
    gbProg.setProjMatrix(proj);

    gbProg.setTime(this.currentTime);

    for (var i = 0; i < drawables.length; i++) {
      gbProg.setModelMatrix(transforms[i]);
      gbProg.draw(drawables[i]);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  }


  renderFromGBuffer(camera: Camera) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.post32Buffers[0]);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    let view = camera.viewMatrix;
    let proj = camera.projectionMatrix;
    this.deferredShader.setViewMatrix(view);
    this.deferredShader.setProjMatrix(proj);
    let frustumInfo = camera.getFrustumInfo();
    this.deferredShader.setFloatUniform('u_tanAlpha', frustumInfo[0])
    this.deferredShader.setFloatUniform('u_aspect', frustumInfo[1]);


    for (let i = 0; i < 4; i ++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.gbTargets[i]);     
    }

    this.deferredShader.bindTexToUnit("tex_BRDF", brdf, 5);
    this.deferredShader.bindTexToUnit("tex_env", environment, 6);

    this.deferredShader.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }



  renderPostProcessHDR() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurSeparator);
    gl.viewport(0, 0, gl.drawingBufferWidth / this.blurDivisor, gl.drawingBufferHeight / this.blurDivisor);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    this.dofSeparator.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.post32Targets[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.gbTargets[0]);
    this.dofSeparator.draw();

    // horizontal far
    this.dofHorizPass.setFloatUniform('alphaBlur', 0.0);   
    this.dofVertPass.setFloatUniform('alphaBlur', 0.0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurBuffers[2]);
    this.dofHorizPass.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.blurTargets[1]);
    this.dofHorizPass.draw();

    // vertical far
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurBuffers[1]);
    this.dofVertPass.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.blurTargets[2]);
    this.dofVertPass.draw();

    // horizontal near
    this.dofHorizPass.setFloatUniform('alphaBlur', 1.0);   
    this.dofVertPass.setFloatUniform('alphaBlur', 1.0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurBuffers[2]);
    this.dofHorizPass.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.blurTargets[0]);
    this.dofHorizPass.draw();

    // vertical far
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurBuffers[0]);
    this.dofVertPass.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.blurTargets[2]);
    this.dofVertPass.draw();

    // DOF composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.post32Buffers[1]);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    this.dofComposite.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.post32Targets[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.blurTargets[0]);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.blurTargets[1]);
    this.dofComposite.draw();

    // high pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurBuffers[0]);
    gl.viewport(0, 0, gl.drawingBufferWidth / this.blurDivisor, gl.drawingBufferHeight / this.blurDivisor);
    this.highpass.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.post32Targets[1]);
    this.highpass.draw();

    for (var blurs = 0; blurs < 2; blurs++) {
      this.dofHorizPass.setFloatUniform('alphaBlur', 0.0);   
      this.dofVertPass.setFloatUniform('alphaBlur', 0.0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurBuffers[1]);
      this.dofHorizPass.use();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.blurTargets[0]);
      this.dofHorizPass.draw();

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurBuffers[0]);
      this.dofVertPass.use();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.blurTargets[1]);
      this.dofVertPass.draw();
    }

    for (var blurs = 0; blurs < 2; blurs++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurBuffers[1]);
      this.dofHorizPass.use();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.blurTargets[0]);
      this.dofHorizPass.draw();

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurBuffers[0]);
      this.dofHorizPass.use();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.blurTargets[1]);
      this.dofHorizPass.draw();
    }





    gl.bindFramebuffer(gl.FRAMEBUFFER, this.post32Buffers[0]);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    this.additive.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.post32Targets[1]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.blurTargets[0]);
    this.additive.draw();

  }

  renderToneMap() {
    // apply tonemapping
    if (this.post8Passes.length > 0) gl.bindFramebuffer(gl.FRAMEBUFFER, this.post8Buffers[0]);
    else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
     
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE0);
    // bound texture is the last one processed before

    gl.bindTexture(gl.TEXTURE_2D, this.post32Targets[0]);

    this.tonemapPass.draw();
  }


  renderPostProcessLDR() {
    for (let i = 0; i < this.post8Passes.length; i++){
      // pingpong framebuffers for each pass
      // if this is the last pass, default is bound
      if (i < this.post8Passes.length - 1) gl.bindFramebuffer(gl.FRAMEBUFFER, this.post8Buffers[(i + 1) % 2]);
      else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
     
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.post8Targets[(i) % 2]);

      this.post8Passes[i].draw();

      // bind default
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }


  renderPuzzle(hp: HackingPuzzle, camera: Camera, prog: ShaderProgram) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.post32Buffers[0]);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.enable(gl.BLEND);
    //gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    gl.blendFunc(gl.ONE, gl.ONE);
    let t: mat4[] = hp.drawMatrices(this.currentTime);
    let frames: number[] = hp.drawImageTypes();
    let highlightIdx: number = hp.drawHighlightIndex();

    let view = camera.viewMatrix;
    let proj = camera.projectionMatrix;
    let alpha = hp.drawAlpha(this.currentTime);
    prog.setFloatUniform('u_alpha', alpha);
    prog.setViewMatrix(view);
    prog.setProjMatrix(proj);
    prog.setTime(this.currentTime);

    for (var i = 0; i < 7; i++) {
      prog.setModelMatrix(t[i]);
      if (i === highlightIdx) {
        prog.setFloatUniform('u_highlight', 1.0);
      } else {
        prog.setFloatUniform('u_highlight', 0.0);
      }
      prog.setIntUniform('u_spriteFrame', frames[i]);
      prog.draw(puzzleQuad);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  renderPuzzleBG(camera: Camera, prog: ShaderProgram) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.post32Buffers[0]);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);  

    let view = camera.viewMatrix;
    let proj = camera.projectionMatrix;

    let m = mat4.create();
    let t = mat4.create();
    mat4.fromTranslation(t, vec3.fromValues(0, 0, -0.1));
    mat4.fromScaling(m, vec3.fromValues(3.8, 3.8, 3.8));
    mat4.multiply(m, t, m);

    prog.setFloatUniform('u_alpha', 1.0);
    prog.setViewMatrix(view);
    prog.setProjMatrix(proj);
    prog.setTime(this.currentTime);
    prog.setModelMatrix(m);

    prog.draw(puzzleQuad);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

};

export default OpenGLRenderer;
