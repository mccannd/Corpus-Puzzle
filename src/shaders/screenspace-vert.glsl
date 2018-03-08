#version 300 es

precision highp float;

in vec4 vs_Pos;
in vec4 vs_Nor;
in vec4 vs_Col;
in vec2 vs_UV;

out vec2 fs_UV;

void main() {
	fs_UV = vs_UV;
	gl_Position = vs_Pos;
}
