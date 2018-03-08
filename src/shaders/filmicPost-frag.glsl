#version 300 es
precision highp float;

in vec2 fs_UV;
out vec4 out_Col;

uniform sampler2D u_frame;
uniform float u_Time;

float rNoise(in float x, in float y) {
	return fract(sin(dot(vec2(x, y), vec2(12.9898, 78.233))) * 43758.5453);
}

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

vec3 tonemapExp(in vec3 col, in float gamma, in float exposure) {
    col = max(vec3(0.0), col);
    vec3 mapped = 1.0 - exp(-col * exposure);
    return pow(mapped, vec3(1.0 / gamma));
}

void main() { 
	vec3 color = texture(u_frame, fs_UV).xyz;
	float noise = rNoise(fs_UV.x + rNoise(fs_UV.y, u_Time), fs_UV.y + rNoise(u_Time, fs_UV.x));
	//vec3 expcolor = tonemapExp(color, 2.2, 1.0);

	float testVal = sin(u_Time) * 0.5 + 0.5;

	color = tonemapUC2(color, 2.2, 2.0, 11.2);

	//color = mix(color, expcolor, smoothstep(0.0, 1.0, testVal));

	color = mix(color, vec3(pow(noise * 0.5 + 0.5, 1.0)), 0.1);
	out_Col = vec4(color, 1.0);
}