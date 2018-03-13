import * as CameraControls from '3d-view-controls';
import {vec3, mat4} from 'gl-matrix';

class Camera {
  controls: any;
  projectionMatrix: mat4 = mat4.create();
  viewMatrix: mat4 = mat4.create();
  fovy: number = 45 * 3.1415962 / 180.0;
  aspectRatio: number = 1;
  near: number = 0.1;
  far: number = 1000;
  position: vec3 = vec3.create();
  direction: vec3 = vec3.create();
  target: vec3 = vec3.create();
  up: vec3 = vec3.create();
  right: vec3 = vec3.create();
  forward: vec3 = vec3.create();

  constructor(position: vec3, target: vec3) {
    this.controls = CameraControls(document.getElementById('canvas'), {
      eye: position,
      center: target,
    });
    this.controls.mode = 'turntable';
    vec3.add(this.target, this.position, this.direction);
    mat4.lookAt(this.viewMatrix, this.controls.eye, this.controls.center, this.controls.up);
  }

  setAspectRatio(aspectRatio: number) {
    this.aspectRatio = aspectRatio;
  }

  updateProjectionMatrix() {
    mat4.perspective(this.projectionMatrix, this.fovy, this.aspectRatio, this.near, this.far);
  }

  update() {
    this.controls.tick();

    vec3.add(this.target, this.position, this.direction);
    mat4.lookAt(this.viewMatrix, this.controls.eye, this.controls.center, this.controls.up);
  
    vec3.sub(this.forward, this.controls.center, this.controls.eye);
    vec3.normalize(this.forward, this.forward);
    vec3.cross(this.right, this.forward, this.controls.up);
    vec3.normalize(this.right, this.right);
    vec3.cross(this.up, this.right, this.forward);
    vec3.normalize(this.up, this.up);

    //console.log(this.forward);
    //console.log(this.right);
    //console.log(this.up);
  }

  // returns origin and direction
  raycast(u: number, v: number) : [vec3, vec3] {
    //console.log(this.forward);
    //console.log(this.up);
    //console.log(this.right);
    let len = this.near;
    var fc = vec3.create();
    vec3.scale(fc, this.forward, len);
    var rrc = vec3.create();
    var ta = Math.tan(this.fovy / 2.0);
    vec3.scale(rrc, this.right, u * len * ta * this.aspectRatio);
    var urc = vec3.create();
    vec3.scale(urc, this.up, v * len * ta);
    vec3.add(urc, urc, rrc);
    vec3.add(fc, urc, fc);
    var dir = vec3.create();
    vec3.normalize(dir, fc);
    //console.log('ro: ' + this.controls.eye + " rd: " + dir);
    //vec3.add(fc, fc, this.controls.eye);
    return [this.controls.eye, dir];
  }
};

export default Camera;
