#ifdef HAS_VIEWSHED
    uniform sampler2D viewshed_depthMapFromViewpoint;
    uniform vec4 viewshed_visibleColor;
    uniform vec4 viewshed_invisibleColor;
    varying vec4 viewshed_positionFromViewpoint;

float viewshed_unpack(const in vec4 rgbaDepth) {
    const vec4 bitShift = vec4(1.0, 1.0/256.0, 1.0/(256.0*256.0), 1.0/(256.0*256.0*256.0));
    float depth = dot(rgbaDepth, bitShift);
    return depth;
}

void viewshed_draw() {
    vec3 shadowCoord = (viewshed_positionFromViewpoint.xyz / viewshed_positionFromViewpoint.w)/2.0 + 0.5;
    vec4 rgbaDepth = texture2D(viewshed_depthMapFromViewpoint, shadowCoord.xy);
    float depth = viewshed_unpack(rgbaDepth); // Retrieve the z-value from R
    if (shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0 && shadowCoord.z <= 1.0) {
        if (shadowCoord.z <= depth + 0.002) {
            gl_FragColor = viewshed_visibleColor;
        } else {
            gl_FragColor = viewshed_invisibleColor;
        }
    }
}
#endif