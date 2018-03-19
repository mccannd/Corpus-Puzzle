#version 300 es
precision highp float;

in vec2 fs_UV;
out vec4 out_Col;

uniform sampler2D u_frame;
uniform float u_Time;

void main() { 
	vec3 color = texture(u_frame, fs_UV).xyz;
	vec3 color2 = pow(color, vec3(1.0, 1.5, 0.3));
	color = mix(color, color2, smoothstep(0.0, 1.0, cos(2.0 * 3.14 * u_Time) * 0.5 + 0.5));
	out_Col = vec4(color, 1.0);
}