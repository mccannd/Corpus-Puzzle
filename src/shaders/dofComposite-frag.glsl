#version 300 es
precision highp float;

in vec2 fs_UV;

// output into foreground and background
out vec4 out_Col;

uniform sampler2D u_frame;
uniform sampler2D u_nearFrame; // gbuffer with depth component in .w
uniform sampler2D u_farFrame;

void main() {
	vec3 col = texture(u_frame, fs_UV).rgb;
	vec4 near = texture(u_nearFrame, fs_UV);

	float nearGain = 1.5;
	near.w = clamp(nearGain * near.w, 0.0, 1.0);
	near.w *= near.w;
	vec3 orig = col;

	vec4 far = texture(u_farFrame, fs_UV);
	col = mix(col, far.rgb, far.w);
	col = (1.0 - near.w) * col + near.rgb * near.w;

	out_Col = vec4(col.rgb, 1.0);
}