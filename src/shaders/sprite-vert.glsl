#version 300 es



uniform mat4 u_Model;

uniform mat4 u_View;   
uniform mat4 u_Proj; 

uniform int u_spriteFrame;

in vec4 vs_Pos;

out vec4 fs_Pos;   
out vec2 fs_UV;

void main()
{
    fs_Pos = u_View * u_Model * vs_Pos;

    // get the UV positions from position and sprite frame

    float frame = float(u_spriteFrame);
    float sx = mod(frame, 4.0);
    float sy = floor(frame / 4.0);
    vec2 center = 0.25 * vec2(sx, sy) + vec2(0.125);
    fs_UV = center + 0.125 * vs_Pos.xy;
    fs_UV.y *= -1.0;
    
    gl_Position = u_Proj * u_View * u_Model * vs_Pos;

}
