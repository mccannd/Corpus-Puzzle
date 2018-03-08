#version 300 es
precision highp float;

in vec2 fs_UV;
out vec4 out_Col;

void main() { 
	out_Col = vec4(fs_UV, 0.0, 1.0);
}