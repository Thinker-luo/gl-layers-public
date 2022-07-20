attribute vec3 aPosition;
uniform mat4 viewModelMatrix;
uniform mat4 projMatrix;
uniform mat4 modelMatrix;
uniform mat4 positionMatrix;
#include <get_output>
varying vec4 vWorldPosition;
void main()
{
    mat4 localPositionMatrix = getPositionMatrix();
    vec4 worldPosition = modelMatrix * localPositionMatrix * getPosition(aPosition);
    vWorldPosition = worldPosition;
    gl_Position = projMatrix * viewModelMatrix * localPositionMatrix * getPosition(aPosition);
}
