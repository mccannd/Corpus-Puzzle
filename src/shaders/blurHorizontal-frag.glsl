#version 300 es
precision highp float;

in vec2 fs_UV;

out vec4 out_Col;

uniform vec2 u_Resolution;
uniform sampler2D u_frame;
uniform float alphaBlur;


void main() {

	vec3 offset = vec3( 0.0, 1.3846153846, 3.2307692308 );
    vec3 weight = vec3( 0.2270270270, 0.3162162162, 0.0702702703 );

	vec4 col = texture(u_frame, fs_UV);
	float a = col.w;
	col *= weight[0];

	for (int i = 1; i < 3; i++) {
		col += weight[i] * texture(u_frame, fs_UV + vec2(offset[i] / u_Resolution.x, 0.0));
		col += weight[i] * texture(u_frame, fs_UV - vec2(offset[i] / u_Resolution.x, 0.0));
	}

	out_Col = vec4(col.rgb, mix(col.a, a, 1.0 - alphaBlur));
}