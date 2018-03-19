#version 300 es
precision highp float;

in vec4 fs_Pos;
in vec4 fs_Nor;            
in vec4 fs_Col;           
in vec2 fs_UV;

out vec4 fragColor[3];

uniform sampler2D tex_Color;
uniform sampler2D tex_PBRInfo;


void main() {   
    vec3 col = texture(tex_Color, fs_UV).xyz; //vec3(1.0, 0.66, 0.33);
    vec4 pbr = texture(tex_PBRInfo, fs_UV);

    // inverse gamma correct
    col = pow(col, vec3(2.2));
    pbr = pow(pbr, vec4(2.2));

    fragColor[0] = vec4(normalize(fs_Nor.xyz), fs_Pos.z);
    fragColor[1] = vec4(pbr);
    fragColor[2] = vec4(col, 1.0);
}