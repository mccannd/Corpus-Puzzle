#version 300 es
precision highp float;

#define EPS 0.0001
#define PI 3.1415962

in vec2 fs_UV;
out vec4 out_Col;

uniform sampler2D u_gb0;
uniform sampler2D u_gb1;
uniform sampler2D u_gb2;

uniform float u_Time;

uniform mat4 u_View;
uniform vec4 u_CamPos;   

uniform float u_aspect;
uniform float u_tanAlpha;


vec3 recoverPosition(in float camDepth) {
	vec2 ndc = fs_UV * 2.0 - 1.0;
	float ny = abs(camDepth) * u_tanAlpha;
	float nx = ny * u_aspect;
	return vec3(nx, ny, 1.0) * vec3(ndc, camDepth);
}

vec3 fresnelSchlick(in vec3 reflectance0, in vec3 reflectance90, in float NdotV) {
	return reflectance0 + (reflectance90 - reflectance0) * pow(clamp(1.0 - NdotV, 0.0, 1.0), 5.0);
}

float smithG1(float NdotV, float r) {
	float ndotv2 = NdotV * NdotV;
	float ts = (1.0 - ndotv2) / max(EPS, ndotv2);
	return 2.0 / (1.0 + sqrt(1.0 + r * r * ts));
}

float geometricOcclusion(in float NdotL, in float NdotV, in float roughness) {
	return smithG1(NdotL, roughness) * smithG1(NdotV, roughness);
}

float distGGX(in float roughness, in float NdotH) {
	float alpha = roughness * roughness;
	float f = (NdotH * alpha - NdotH) * NdotH + 1.0;
	return alpha / (PI * f * f);
}

float PBRSpec(in float roughness, in vec3 N, in vec3 L, in vec3 V) {
	roughness *= roughness;
	vec3 H = normalize(L + V);

	float NdotL = max(dot(N, L), EPS);
	float NdotV = max(dot(N, V), 0.0) + EPS;
	float NdotH = max(dot(N, H), 0.0);

	float D = distGGX(roughness, NdotH);
	float G = geometricOcclusion(NdotL, NdotV, roughness);

	return D * G / (4.0 * NdotL * NdotV);
}

vec3 PBRDiffuse(in vec3 diffuse) {
	return diffuse / PI;
}

vec3 PBRColor(float rough, float metal, vec3 color, vec3 N, vec3 P) {
	vec3 V = -normalize(P);
	N = faceforward(N, V, -N);
	float roughness = rough;
	roughness = clamp(roughness, 0.03, 1.0);
	float metallic = metal;
	vec3 f0 = vec3(0.04);
	vec3 diffuse = mix(color * (1.0 - f0), vec3(0.0), metallic);
	vec3 specular = mix(f0, color, metallic);
	float NdotV = max(0.0, dot(N, V));

	vec3 refl0 = specular;
	vec3 refl90 = vec3(clamp(max(max(specular.r, specular.b), specular.g) * 25.0, 0.0, 1.0));

	vec3 F = fresnelSchlick(refl0, refl90, NdotV);

	// TODO: light with good UBO

	vec3 lightPos[3];
	lightPos[0] = (u_View * vec4(3.0, 3.0 * sin(u_Time), 3.0 * cos(u_Time), 1)).xyz;
	lightPos[1] = (u_View * vec4(-3.0, 3.0 * cos(u_Time * 0.9), 3.0 * sin(u_Time * 0.9), 1)).xyz;
	lightPos[2] = (u_View * vec4(3.0 * cos(u_Time * 0.7), 0.0, 3.0 * sin(u_Time * 0.7), 1)).xyz;

	vec3 lightCol[3];
	lightCol[0] = 21.0 * vec3(1.0, 0.8, 0.7);
	lightCol[1] = 3.0 * vec3(0.1, 0.6, 1.0);
	lightCol[2] = 10.0 * vec3(0.3, 1.0, 0.8);

	vec3 accumCol = vec3(0.0);
	for (int i = 0; i < 3; i++) {
		vec3 lightDisp = lightPos[i] - P;
		vec3 L = normalize(lightDisp);
		vec3 lightRad = lightCol[i] / (1.0 + dot(lightDisp, lightDisp));

		vec3 diffuseCol = PBRDiffuse(diffuse);
		float specCol = PBRSpec(roughness, N, L, V);
		vec3 finalCol = (vec3(1.0) - F) * (diffuseCol) + F * specCol;

		finalCol *= lightRad * max(0.0, dot(N, L));

		accumCol += finalCol;
	}

	return accumCol;
}

void main() { 
	// read from GBuffers
	vec4 gb0 = texture(u_gb0, fs_UV);
	vec4 gb1 = texture(u_gb1, fs_UV);
	vec4 gb2 = texture(u_gb2, fs_UV);

	if (gb0.w > 0.0) return;

	vec3 P = recoverPosition(gb0.w);
	vec3 N = gb0.xyz;
	vec3 V = -normalize(P);
	
	float rough = gb1.r;
	float metal = gb1.g;
	float occ = gb1.b;

	vec3 col = gb2.xyz;
	vec3 color = (dot(vec3(1.0), abs(P)) < EPS) ? vec3(0): PBRColor(rough, metal, col, N, P);

	color = mix(color, vec3(0), 1.0 - occ);

	out_Col = vec4(color, 1.0);
}