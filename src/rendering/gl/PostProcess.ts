import {vec2} from 'gl-matrix';
import Texture from './Texture';
import {gl} from '../../globals';
import ShaderProgram, {Shader} from './ShaderProgram';
import Drawable from './Drawable';
import Square from '../../geometry/Square';
import {vec3, vec4, mat4} from 'gl-matrix';

class PostProcess extends ShaderProgram {
	static screenQuad: Square = undefined;
	unifFrame: WebGLUniformLocation; 
	unifResolution: WebGLUniformLocation;
	name: string;

	constructor(fragProg: Shader, tag: string = "default") {
		super([new Shader(gl.VERTEX_SHADER, require('../../shaders/screenspace-vert.glsl')),
			fragProg]);

		this.unifFrame = gl.getUniformLocation(this.prog, "u_frame");
		this.use();
		this.name = tag;

		// bind texture unit 0 to this location
		gl.uniform1i(this.unifFrame, 0); // gl.TEXTURE0
		if (PostProcess.screenQuad === undefined) {
			PostProcess.screenQuad = new Square(vec3.fromValues(0, 0, 0));
			PostProcess.screenQuad.create();
		}

		this.unifResolution = gl.getUniformLocation(this.prog, "u_Resolution");
	}

  	draw() {
  		super.draw(PostProcess.screenQuad);
  	}

  	setResolution(x: number, y: number) {
  		this.use();
  		if (this.unifResolution !== -1) {
  			gl.uniform2f(this.unifResolution, x, y);
  		}
  	}

  	getName() : string { return this.name; }

}

export default PostProcess;