//DEPRECATED
#version 100
precision highp float;
uniform float uBloomFactor;
uniform float uBloomRadius;
uniform float uRGBMRange;
uniform sampler2D TextureBloomBlur1;
uniform sampler2D TextureBloomBlur2;
uniform sampler2D TextureBloomBlur3;
uniform sampler2D TextureBloomBlur4;
uniform sampler2D TextureBloomBlur5;
uniform sampler2D TextureInput;
uniform sampler2D TextureSource;
uniform vec2 uTextureOutputSize;
#define SHADER_NAME bloomCombine

vec2 gTexCoord;
float linearTosRGB(const in float color) {
    return  color < 0.0031308 ? color * 12.92 : 1.055 * pow(color, 1.0/2.4) - 0.055;
}
vec3 linearTosRGB(const in vec3 color) {
    return vec3( color.r < 0.0031308 ? color.r * 12.92 : 1.055 * pow(color.r, 1.0/2.4) - 0.055, color.g < 0.0031308 ? color.g * 12.92 : 1.055 * pow(color.g, 1.0/2.4) - 0.055, color.b < 0.0031308 ? color.b * 12.92 : 1.055 * pow(color.b, 1.0/2.4) - 0.055);
}
vec4 linearTosRGB(const in vec4 color) {
    return vec4( color.r < 0.0031308 ? color.r * 12.92 : 1.055 * pow(color.r, 1.0/2.4) - 0.055, color.g < 0.0031308 ? color.g * 12.92 : 1.055 * pow(color.g, 1.0/2.4) - 0.055, color.b < 0.0031308 ? color.b * 12.92 : 1.055 * pow(color.b, 1.0/2.4) - 0.055, color.a);
}
float sRGBToLinear(const in float color) {
    return  color < 0.04045 ? color * (1.0 / 12.92) : pow((color + 0.055) * (1.0 / 1.055), 2.4);
}
vec3 sRGBToLinear(const in vec3 color) {
    return vec3( color.r < 0.04045 ? color.r * (1.0 / 12.92) : pow((color.r + 0.055) * (1.0 / 1.055), 2.4), color.g < 0.04045 ? color.g * (1.0 / 12.92) : pow((color.g + 0.055) * (1.0 / 1.055), 2.4), color.b < 0.04045 ? color.b * (1.0 / 12.92) : pow((color.b + 0.055) * (1.0 / 1.055), 2.4));
}
vec4 sRGBToLinear(const in vec4 color) {
    return vec4( color.r < 0.04045 ? color.r * (1.0 / 12.92) : pow((color.r + 0.055) * (1.0 / 1.055), 2.4), color.g < 0.04045 ? color.g * (1.0 / 12.92) : pow((color.g + 0.055) * (1.0 / 1.055), 2.4), color.b < 0.04045 ? color.b * (1.0 / 12.92) : pow((color.b + 0.055) * (1.0 / 1.055), 2.4), color.a);
}
vec3 RGBMToRGB( const in vec4 rgba ) {
    const float maxRange = 8.0;
    return rgba.rgb * maxRange * rgba.a;
}
const mat3 LUVInverse = mat3( 6.0013, -2.700, -1.7995, -1.332, 3.1029, -5.7720, 0.3007, -1.088, 5.6268 );
vec3 LUVToRGB( const in vec4 vLogLuv ) {
    float Le = vLogLuv.z * 255.0 + vLogLuv.w;
    vec3 Xp_Y_XYZp;
    Xp_Y_XYZp.y = exp2((Le - 127.0) / 2.0);
    Xp_Y_XYZp.z = Xp_Y_XYZp.y / vLogLuv.y;
    Xp_Y_XYZp.x = vLogLuv.x * Xp_Y_XYZp.z;
    vec3 vRGB = LUVInverse * Xp_Y_XYZp;
    return max(vRGB, 0.0);
}
vec4 encodeRGBM(const in vec3 color, const in float range) {
    if(range <= 0.0) return vec4(color, 1.0);
    vec4 rgbm;
    vec3 col = color / range;
    rgbm.a = clamp( max( max( col.r, col.g ), max( col.b, 1e-6 ) ), 0.0, 1.0 );
    rgbm.a = ceil( rgbm.a * 255.0 ) / 255.0;
    rgbm.rgb = col / rgbm.a;
    return rgbm;
}
vec3 decodeRGBM(const in vec4 color, const in float range) {
    if(range <= 0.0) return color.rgb;
    return range * color.rgb * color.a;
}
float getRadiusFactored(const float value, const float middle) {
    return mix(value, middle * 2.0 - value, uBloomRadius);
}
vec4 bloomCombine() {
    vec3 bloom = vec3(0.0);
    const float midVal = 0.6;
    const float factor1 = 1.1;
    const float factor2 = 0.9;
    const float factor3 = 0.6;
    const float factor4 = 0.3;
    const float factor5 = 0.1;
    bloom += (vec4(decodeRGBM(texture2D(TextureBloomBlur1, gTexCoord), uRGBMRange), 1.0)).rgb * getRadiusFactored(factor1, midVal);
    bloom += (vec4(decodeRGBM(texture2D(TextureBloomBlur2, gTexCoord), uRGBMRange), 1.0)).rgb * getRadiusFactored(factor2, midVal);
    bloom += (vec4(decodeRGBM(texture2D(TextureBloomBlur3, gTexCoord), uRGBMRange), 1.0)).rgb * getRadiusFactored(factor3, midVal);
    bloom += (vec4(decodeRGBM(texture2D(TextureBloomBlur4, gTexCoord), uRGBMRange), 1.0)).rgb * getRadiusFactored(factor4, midVal);
    bloom += (vec4(decodeRGBM(texture2D(TextureBloomBlur5, gTexCoord), uRGBMRange), 1.0)).rgb * getRadiusFactored(factor5, midVal);
    vec4 color = texture2D(TextureInput, gTexCoord);
    color.rgb = mix(vec3(0.0), color.rgb, sign(color.a));

    float srcAlpha = mix(sqrt((bloom.r + bloom.g + bloom.b) / 3.0), color.a, sign(color.a));

    float dstAlpha = 1.0 - srcAlpha;

    vec4 srcColor = texture2D(TextureSource, gTexCoord);

    return vec4(srcColor.rgb * dstAlpha + color.rgb + linearTosRGB(bloom.rgb * uBloomFactor), srcAlpha + srcColor.a * dstAlpha);
}
void main(void) {
    gTexCoord = gl_FragCoord.xy / uTextureOutputSize.xy;
    vec4 color = bloomCombine();
    // color.rgb = linearTosRGB(color.rgb);
    gl_FragColor = color;
}
