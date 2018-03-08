#version 300 es

// This is a fragment shader. If you've opened this file first, please
// open and read lambert.vert.glsl before reading on.
// Unlike the vertex shader, the fragment shader actually does compute
// the shading of geometry. For every pixel in your program's output
// screen, the fragment shader is run for every bit of geometry that
// particular pixel overlaps. By implicitly interpolating the position
// data passed into the fragment shader by the vertex shader, the fragment shader
// can compute what color to apply to its pixel based on things like vertex
// position, light position, and vertex color.
precision highp float;

uniform vec4 u_Color; // The color with which to render this instance of geometry.

// These are the interpolated values out of the rasterizer, so you can't know
// their specific values without knowing the vertices that contributed to them
in vec4 fs_Nor;
in vec4 fs_LightVec;
in vec4 fs_Col;
in vec2 fs_UV;

out vec4 out_Col; // This is the final output color that you will see on your
                  // screen for the pixel that is currently being processed.

vec3 tonemapExp(in vec3 col, in float gamma, in float exposure) {
    vec3 mapped = 1.0 - exp(-col * exposure);
    return pow(mapped, vec3(1.0 / gamma));
}

void main()
{
    // Material base color (before shading)
        vec4 diffuseColor = u_Color;
        vec3 N = normalize(fs_Nor.xyz);
        vec3 L = normalize(fs_LightVec.xyz);

        // Compute final shaded color
        vec3 diffuse1 = fs_Col.xyz * u_Color.xyz * max(0.0, dot(N, L)) * 2.0 * vec3(1.0, 0.6, 0.3);
        vec3 diffuse2 = fs_Col.xyz * u_Color.xyz * (0.5 + 0.5 * N.y) * vec3(0.2, 0.22, 0.5);
        out_Col = vec4(tonemapExp(diffuse1 + diffuse2, 2.2, 1.0), diffuseColor.a);
        
}
