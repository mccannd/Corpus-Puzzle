import {mat4, vec4, vec3, vec2} from 'gl-matrix';
import Drawable from './Drawable';
import Camera from '../../Camera';
import {gl} from '../../globals';
import ShaderProgram, {Shader} from './ShaderProgram';
import PostProcess from './PostProcess'
import Square from '../../geometry/Square';
import HackingPuzzle from '../../game/HackingPuzzle'

let puzzleQuad: Square;

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
    this.currentTime = 0.0;
    this.gbTargets = [undefined, undefined, undefined];
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

    // TODO: these are placeholder post shaders, replace them with something good
    //this.add8BitPass(new PostProcess(new Shader(gl.FRAGMENT_SHADER, require('../../shaders/examplePost-frag.glsl'))));
    //this.add8BitPass(new PostProcess(new Shader(gl.FRAGMENT_SHADER, require('../../shaders/examplePost2-frag.glsl'))));
    //this.add32BitPass(new PostProcess(new Shader(gl.FRAGMENT_SHADER, require('../../shaders/examplePost3-frag.glsl'))));

    if (!gl.getExtension("OES_texture_float_linear")) {
      console.error("OES_texture_float_linear not available");
    }

    if (!gl.getExtension("EXT_color_buffer_float")) {
      console.error("FLOAT color buffer not available");
    }

    var gb0loc = gl.getUniformLocation(this.deferredShader.prog, "u_gb0");
    var gb1loc = gl.getUniformLocation(this.deferredShader.prog, "u_gb1");
    var gb2loc = gl.getUniformLocation(this.deferredShader.prog, "u_gb2");

    this.deferredShader.use();
    gl.uniform1i(gb0loc, 0);
    gl.uniform1i(gb1loc, 1);
    gl.uniform1i(gb2loc, 2);

    puzzleQuad = new Square(vec3.fromValues(0, 0, 0));
    puzzleQuad.create();

    // depth of field constants
    var dofSepLoc = gl.getUniformLocation(this.dofSeparator.prog, "u_posGB");
    this.dofSeparator.use();
    gl.uniform1i(dofSepLoc, 1);
    this.dofSeparator.setupFloatUnits(["u_focusDist", "u_focusRadNear", "u_focusRadFar"]);
    this.dofSeparator.setFloatUniform("u_focusDist", 5.0);
    this.dofSeparator.setFloatUniform("u_focusRadNear", 3.0);
    this.dofSeparator.setFloatUniform("u_focusRadFar", 3.0);
    

    var dofCompLoc0 = gl.getUniformLocation(this.dofComposite.prog, "u_nearFrame");
    var dofCompLoc1 = gl.getUniformLocation(this.dofComposite.prog, "u_farFrame");
    this.dofComposite.use();
    gl.uniform1i(dofCompLoc0, 1);
    gl.uniform1i(dofCompLoc1, 2);

    this.dofVertPass.setupFloatUnits(["alphaBlur"]);
    this.dofHorizPass.setupFloatUnits(["alphaBlur"]);
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
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);

    for (let i = 0; i < 3; i ++) {
      this.gbTargets[i] = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.gbTargets[i]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
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
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
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


  renderToGBuffer(camera: Camera, gbProg: ShaderProgram, drawables: Array<Drawable>) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.gBuffer);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    let model = mat4.create();
    let viewProj = mat4.create();
    let view = camera.viewMatrix;
    let proj = camera.projectionMatrix;
    let color = vec4.fromValues(0.5, 0.5, 0.5, 1);
   
    let ry = mat4.create();
    let sc = mat4.create();
    mat4.fromScaling(sc, vec3.fromValues(3.0, 3.0, 3.0));
    mat4.fromYRotation(ry, Math.PI);
    mat4.fromTranslation(model, vec3.fromValues(0, 0.5, -4.0));
    mat4.multiply(ry, sc, ry);
    mat4.multiply(model, model, ry);
    //mat4.identity(model);
    mat4.multiply(viewProj, camera.projectionMatrix, camera.viewMatrix);
    gbProg.setModelMatrix(model);
    gbProg.setViewProjMatrix(viewProj);
    gbProg.setGeometryColor(color);
    gbProg.setViewMatrix(view);
    gbProg.setProjMatrix(proj);


    gbProg.setTime(this.currentTime);

    for (let drawable of drawables) {
      gbProg.draw(drawable);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  }

  setDOFFocus(focus: number) {
    this.dofSeparator.setFloatUniform("u_focusDist", focus);
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

    for (let i = 0; i < 3; i ++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.gbTargets[i]);     
    }

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

    // let i = 0;
    // for (i = 0; i < this.post32Passes.length; i++){
    //   // pingpong framebuffers for each pass
    //   // after last pass, will be tonemapped
    //   gl.bindFramebuffer(gl.FRAMEBUFFER, this.post32Buffers[(i + 1) % 2]);
     
    //   gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    //   gl.disable(gl.DEPTH_TEST);
    //   gl.enable(gl.BLEND);
    //   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    //   gl.activeTexture(gl.TEXTURE0);
    //   gl.bindTexture(gl.TEXTURE_2D, this.post32Targets[(i) % 2]);

    //   this.post32Passes[i].draw();

    //   //console.log(i);
    //   // bind default
    //   gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // }

    // apply tonemapping
    // if (this.post8Passes.length > 0) gl.bindFramebuffer(gl.FRAMEBUFFER, this.post8Buffers[0]);
    // else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
     
    // gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    // gl.disable(gl.DEPTH_TEST);
    // gl.enable(gl.BLEND);
    // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // gl.activeTexture(gl.TEXTURE0);
    // // bound texture is the last one processed before

    // gl.bindTexture(gl.TEXTURE_2D, this.post32Targets[Math.max(0, i) % 2]);

    // this.tonemapPass.draw();

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

    gl.bindTexture(gl.TEXTURE_2D, this.post32Targets[1]);

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
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.post32Buffers[1]);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    let t: mat4[] = hp.drawMatrices(this.currentTime);
    let frames: number[] = hp.drawImageTypes();
    let highlightIdx: number = hp.drawHighlightIndex();

    let view = camera.viewMatrix;
    let proj = camera.projectionMatrix;

    prog.setViewMatrix(view);
    prog.setProjMatrix(proj);

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

};

export default OpenGLRenderer;
