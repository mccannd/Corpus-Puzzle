#version 300 es
precision highp float;

#define EPS 0.0001
#define PI 3.1415962

in vec2 fs_UV;
out vec4 out_Col;

uniform sampler2D u_gb0;
uniform sampler2D u_gb1;
uniform sampler2D u_gb2;
uniform sampler2D u_gb3;

uniform sampler2D tex_BRDF;
uniform sampler2D tex_env;

uniform float u_Time;

uniform mat4 u_View;
uniform vec4 u_CamPos;   

uniform float u_aspect;
uniform float u_tanAlpha;


vec3 decodeNormal(in vec2 enc) {
    enc = 2.0 * enc - 1.0;
    vec3 n;
    n.z = 1.0 - abs(enc.x) - abs(enc.y);
    n.xy = n.z >= 0.0 ? enc.xy : (1.0 - abs(enc.yx)) * vec2(sign(enc.x), sign(enc.y));
    return normalize(n);
}

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
	float NdotV = max(dot(N, V), EPS);
	float NdotH = max(dot(N, H), EPS);

	float D = distGGX(roughness, NdotH);
	float G = geometricOcclusion(NdotL, NdotV, roughness);

	return D * G / (4.0 * NdotL * NdotV);
}

vec3 PBRDiffuse(in vec3 diffuse) {
	return diffuse / PI;
}

vec3 environmentHack(in vec3 refl, in vec3 nor, in float rough, in float ndv, in vec3 spec, in vec3 diff) {

	vec3 vup = (u_View * vec4(0, 0, 1, 0)).xyz;
	vec3 vri = (u_View * vec4(1, 0, 0, 0)).xyz;

	vec2 brdf = texture(tex_BRDF, vec2(ndv, 1.0 - rough)).rg;

	//return vec3(brdf, 0.0);

	vec2 uv0 = vec2(dot(vri, refl) * 0.5 + 0.5, dot(vup, refl) * 0.5 + 0.5); // pure garbage but fast
	//vec2 uv1 = vec2(dot(vri, nor) * 0.5 + 0.5, dot(vup, nor) * 0.5 + 0.5); // pure garbage but fast
	

	vec3 env = texture(tex_env, uv0, rough * 12.0).xyz;

	env = -log(vec3(1.0) - min(vec3(0.999), env));
	env *= (spec * brdf.x + brdf.y);

	//vec3 env2 = texture(tex_env, uv1, 12.0).xyz;
	env += (0.5 + 0.5 * dot(nor, vup)) * vec3(0.1, 0.3, 0.5) * diff;

	//return vec3(dot(vup, nor) *0.5 + 0.5);
	return env;
}

vec3 PBRColor(float rough, float metal, vec3 color, vec3 N, vec3 P) {
	vec3 V = -normalize(P);
	N = faceforward(N, V, -N);
	if (dot(N, V) < 0.01) return color / PI; // eh
	float roughness = rough;
	roughness = clamp(roughness, 0.03, 1.0);
	float metallic = metal;
	vec3 f0 = vec3(0.04);
	vec3 diffuse = mix(color * (1.0 - f0), vec3(0.0), metallic);
	vec3 specular = mix(f0, color, metallic);
	float NdotV = max(EPS, dot(N, V));

	vec3 refl0 = specular;
	vec3 refl90 = vec3(clamp(max(max(specular.r, specular.b), specular.g) * 25.0, 0.0, 1.0));

	vec3 F = fresnelSchlick(refl0, refl90, NdotV);

	// TODO: light with good UBO

	vec3 lightPos[2];
	lightPos[0] = (u_View * vec4(0.0, 0.0, 0.0, 1)).xyz;
	lightPos[1] = (u_View * vec4(-3.0, -3.0, -1.0, 1)).xyz;

	vec3 lightCol[2];
	lightCol[0] = 24.0 * vec3(0.2, 1.0, 0.8);
	lightCol[1] = 32.0 * vec3(1.0, 0.05, 0.05) * smoothstep(0.0, 1.0, (0.5 + 0.5 * cos(3.14 * u_Time)));

	vec3 accumCol = vec3(0.0);
	for (int i = 0; i < 2; i++) {
		vec3 lightDisp = lightPos[i] - P;
		vec3 L = normalize(lightDisp);
		vec3 lightRad = lightCol[i] / (1.0 + dot(lightDisp, lightDisp));

		vec3 diffuseCol = PBRDiffuse(diffuse);
		float specCol = PBRSpec(roughness, N, L, V);
		specCol *= step(0.01, dot(N, L));
		vec3 finalCol = (vec3(1.0) - F) * (diffuseCol) + F * specCol;

		finalCol *= lightRad * max(0.0, dot(N, L));

		accumCol += finalCol;
	}

	// directional light
	vec3 L = normalize((u_View * vec4(1.0, 1.0, 1.0, 0.0)).xyz);
	vec3 diffuseCol = PBRDiffuse(diffuse);
	float specCol = PBRSpec(roughness, N, L, V);
	specCol *= step(0.01, dot(N, L));
	vec3 finalCol = (vec3(1.0) - F) * (diffuseCol) + F * specCol;
	finalCol *= 0.5 * vec3(1.0, 0.9, 0.8) * max(0.0, dot(N, L));
	accumCol += finalCol;

	vec3 refl = normalize(reflect(-V, N));
	vec3 envLighting = environmentHack(refl, N, rough, abs(dot(N, V)), specular, diffuse);

	accumCol += 0.5 * envLighting;


	return accumCol;
}



void main() { 
	// read from GBuffers
	vec4 gb0 = texture(u_gb0, fs_UV);
	vec4 gb1 = texture(u_gb1, fs_UV);
	vec4 gb2 = texture(u_gb2, fs_UV);	
	vec4 gb3 = texture(u_gb3, fs_UV);

	if (gb0.w > 0.0){
		out_Col = vec4(0.0, 0.0, 0.0, 1.0);
		return;
	} 

	vec3 P = recoverPosition(gb0.w);
	vec3 N = decodeNormal(gb0.xy);
	vec3 V = -normalize(P);

	
	
	float rough = gb1.r;
	float metal = gb1.g;
	float occ = gb1.b;

	
	vec3 emissive = gb0.z * pow(gb3.xyz, vec3(2.2));

	vec3 col = gb2.xyz;
	vec3 color = (dot(vec3(1.0), abs(P)) < EPS) ? vec3(0): PBRColor(rough, metal, col, N, P);

	color = mix(color, vec3(0), 1.0 - occ) + emissive;
	//color = 0.5 + 0.5 * refl;
	//color = 0.5 * N + 0.5;
	//color = mix(color, vec3(0), 0.5); // for this game, want to see the puzzle...
	color = min(color, vec3(4.0));
	out_Col = vec4(color, 1.0);
	//out_Col = gb3;
}