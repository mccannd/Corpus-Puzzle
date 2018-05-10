#version 300 es
precision highp float;

in vec2 fs_UV;

out vec4 out_Col;

uniform vec2 u_Resolution;
uniform sampler2D u_frame;
uniform float u_Threshold;


void main() {
	vec4 col = texture(u_frame, fs_UV);
	float minT = max(u_Threshold - 1.0, 0.0);
	float brightness = dot(col.rgb, vec3(0.213, 0.715, 0.072));
	float t = clamp((brightness - minT) / (u_Threshold - minT + 0.01), 0.0, 1.0);
	t = t * t * (3.0 - 2.0 * t);
	//t = 1.0;
	out_Col = vec4(t * col.rgb, 1.0);
}