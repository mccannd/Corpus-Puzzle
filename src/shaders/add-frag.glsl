#version 300 es
precision highp float;

in vec2 fs_UV;

out vec4 out_Col;

uniform sampler2D u_frame;
uniform sampler2D u_overlay;

void main() {
	vec4 col = texture(u_frame, fs_UV);
	vec4 col2 = texture(u_overlay, fs_UV);
	out_Col = vec4(col2.rgb + col.rgb, 1.0);
	//out_Col.rgb = col2.rgb;
}