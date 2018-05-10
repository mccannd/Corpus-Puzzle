#version 300 es
precision highp float;

in vec4 fs_Pos;
in vec4 fs_Nor;            
in vec4 fs_Col;           
in vec2 fs_UV;
in vec4 fs_vUp;

out vec4 fragColor[4];

uniform sampler2D tex_Color;
uniform sampler2D tex_PBRInfo;
uniform sampler2D tex_Emissive;
uniform sampler2D tex_Nor;

uniform float u_emissiveStrength;


vec3 applyNormalMap(vec3 geomnor, vec3 normap) {
    normap = normap * 2.0 - 1.0;
    vec3 up = fs_vUp.xyz;
    vec3 surftan = normalize(cross(geomnor, up));
    vec3 surfbinor = cross(geomnor, surftan);
    return normap.y * surftan + normap.x * surfbinor + normap.z * geomnor;
}

// Octahedron encoding
vec2 encode(in vec3 nor) {
    nor /= abs(nor.x) + abs(nor.y) + abs(nor.z);
    nor.xy = nor.z >= 0.0 ? nor.xy : (1.0 - abs(nor.yx)) * vec2(sign(nor.x), sign(nor.y));
    nor.xy = nor.xy * 0.5 + 0.5;
    return nor.xy;
}

void main() {   
    vec3 col = texture(tex_Color, fs_UV).xyz; //vec3(1.0, 0.66, 0.33);
    vec4 pbr = texture(tex_PBRInfo, fs_UV);
    vec3 emm = texture(tex_Emissive, fs_UV).xyz;
    vec3 nor = texture(tex_Nor, fs_UV).xyz;

    // inverse gamma correct
    col = pow(col, vec3(2.2));

    vec3 norN = abs(dot(nor, vec3(1))) > 0.0 ? applyNormalMap(normalize(fs_Nor.xyz), nor) : normalize(fs_Nor.xyz);

    fragColor[0] = vec4(encode(norN), u_emissiveStrength, fs_Pos.z);
    fragColor[1] = vec4(pbr);
    fragColor[2] = vec4(col, 1.0);
    fragColor[3] = vec4(emm, 1.0);
}