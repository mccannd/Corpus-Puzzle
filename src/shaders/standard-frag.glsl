#version 300 es
precision highp float;

in vec4 fs_Pos;
in vec4 fs_Nor;            
in vec4 fs_Col;           
in vec2 fs_UV;


out vec4 fragColor[3];

uniform sampler2D tex_Color;

uniform sampler2D tex_PBRInfo;


// Octahedron encoding
vec2 encode(in vec3 nor) {
    nor /= abs(nor.x) + abs(nor.y) + abs(nor.z);
    nor.xy = nor.z >= 0.0 ? nor.xy : (1.0 - abs(nor.yx)) * vec2(sign(nor.x), sign(nor.y));
    nor.xy = nor.xy * 0.5 + 0.5;
    return nor.xy;
}

void main() {
    vec2 N = encode(fs_Nor.xyz);
    vec3 col = texture(tex_Color, fs_UV).xyz;  
    // gamma correct ? 
    col = pow(col, vec3(2.2));  

    vec3 rmo = texture(tex_PBRInfo, fs_UV).xyz;
    rmo = pow(rmo, vec3(2.2));

    fragColor[0] = vec4(fs_Pos.xyz, N.x);
    fragColor[1] = vec4(rmo, N.y); // will replace with something useful later
    fragColor[2] = vec4(col, 1.0);
}