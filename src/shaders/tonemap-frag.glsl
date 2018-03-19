#version 300 es
precision highp float;

in vec2 fs_UV;
out vec4 out_Col;

uniform sampler2D u_frame;
uniform float u_Time;


const float str_shoulder = 0.22;
const float str_linear = 0.30;
const float ang_linear = 0.1;
const float str_toe = 0.20;
const float toe_num = 0.01;
const float toe_denom = 0.20;

vec3 ucMapStep(in vec3 col) {
	//float ach = sin(u_Time * 3.14159) * 0.5 + 0.5;
	//ach = smoothstep(0.0, 1.0, ach);

	float A = str_shoulder;
	//A = 0.25;//mix(0.1, 0.3, ach);
	float B = str_linear;
	float C = ang_linear;
	//C = mix(0.05, 0.15, ach);
	float D = str_toe;
	float E = toe_num;
	float F = toe_denom;
	return ((col * (A * col + C * B) + D * E) / (col * (A * col + B) + D * F)) - E / F;
}

vec3 tonemapUC2(in vec3 col, in float gamma, in float exposure, in float whitePoint) {
	col *= exposure;
	vec3 mapped = ucMapStep(col);
	vec3 wscale = 1.0 / ucMapStep(vec3(whitePoint));
	mapped *= wscale;
	return pow(mapped, vec3(1.0 / gamma));
}


void main() { 
	// TODO: proper tonemapping
	vec3 color = texture(u_frame, fs_UV).xyz;

	color = tonemapUC2(color, 2.2, 2.0, 11.2);

	// gamma correction
	//color = pow(color, vec3(1.0 / 2.2));
	out_Col = vec4(color, 1.0);
}