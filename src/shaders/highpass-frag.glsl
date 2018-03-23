#version 300 es
precision highp float;

in vec2 fs_UV;

out vec4 out_Col;

uniform vec2 u_Resolution;
uniform sampler2D u_frame;
uniform float u_Threshold;


void main() {
	vec4 col = texture(u_frame, fs_UV);
	float minT = u_Threshold * 0.5;
	float brightness = dot(col.rgb, vec3(0.213, 0.715, 0.072));
	float t = clamp((brightness - minT) / (u_Threshold * 0.5 + 0.01), 0.0, 1.0);
	t = t * t * (3.0 - 2.0 * t);
	out_Col = vec4(t * col.rgb, 1.0);
}