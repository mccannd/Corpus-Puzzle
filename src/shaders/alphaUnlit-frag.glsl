#version 300 es
precision highp float;

uniform sampler2D tex_Color;

in vec4 fs_Pos;        
in vec2 fs_UV;

out vec4 out_Col;
uniform float u_highlight;
uniform float u_alpha;
uniform float u_Time;

void main() {
	vec4 cs = pow(texture(tex_Color, fs_UV), vec4(2.2));
	// base color
	vec3 col = pow(vec3(pow(cs.r, 2.2)), vec3(3.0, 0.45, 0.42));
	col += vec3(2.3, 2.3, 2.0) * u_highlight * vec3(cs.g) * (0.75 + 0.5 * sin(u_Time * 3.14));
	out_Col = vec4(col, cs.a * u_alpha);
}