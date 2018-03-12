#version 300 es
precision highp float;

uniform sampler2D tex_Color;

in vec4 fs_Pos;        
in vec2 fs_UV;

out vec4 out_Col;

void main() {
	out_Col = vec4(pow(texture(tex_Color, fs_UV), vec4(2.2)));
}