#version 300 es
precision highp float;

in vec2 fs_UV;

uniform float u_focusDist;
uniform float u_focusRadNear;
uniform float u_focusRadFar;

// output into foreground and background
out vec4 fgbg[2];

uniform sampler2D u_frame;
uniform sampler2D u_posGB; // gbuffer with depth component in .w

void main() {
	float zdepth = texture(u_posGB, fs_UV).w;
	if (zdepth >= 0.0){
		fgbg[0] = vec4(0.0, 0.0, 0.0, 0.0);
		fgbg[1] = vec4(0.0, 0.0, 0.0, 0.0);
		return;
	} 
	vec4 col = texture(u_frame, fs_UV);
	float near = clamp((u_focusDist + zdepth) / u_focusRadNear, 0.0, 1.0);
	float far = clamp((-zdepth - u_focusDist) / u_focusRadFar, 0.0, 1.0);

	fgbg[0] = vec4(col.rgb, near);
	fgbg[1] = vec4(col.rgb, far);
	//fgbg[0].rgb = vec3(zdepth);
}