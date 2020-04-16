import Color from 'color';
import BasicPainter from './BasicPainter';
import { reshader } from '@maptalks/gl';
import { mat4 } from '@maptalks/gl';
import vert from './glsl/line.vert';
import frag from './glsl/line.frag';
import pickingVert from './glsl/line.picking.vert';
import { setUniformFromSymbol, createColorSetter, extend } from '../Util';
import { prepareFnTypeData, updateGeometryFnTypeAttrib } from './util/fn_type_util';
import { piecewiseConstant, interpolated } from '@maptalks/function-type';
import { OFFSET_FACTOR_SCALE } from './Constant';

class LinePainter extends BasicPainter {
    constructor(...args) {
        super(...args);
        this._fnTypeConfig = this._getFnTypeConfig();
    }

    needToRedraw() {
        const animation = this.sceneConfig.trailAnimation;

        return this._redraw || animation && animation.enable;
    }

    createMesh(geometry, transform) {
        prepareFnTypeData(geometry, this.symbolDef, this._fnTypeConfig);

        this._colorCache = this._colorCache || {};
        const symbol = this.getSymbol();
        const uniforms = {
            tileResolution: geometry.properties.tileResolution,
            tileRatio: geometry.properties.tileRatio,
            tileExtent: geometry.properties.tileExtent
        };

        setUniformFromSymbol(uniforms, 'lineWidth', symbol, 'lineWidth', 2);
        setUniformFromSymbol(uniforms, 'lineColor', symbol, 'lineColor', '#000', createColorSetter(this._colorCache));
        setUniformFromSymbol(uniforms, 'lineOpacity', symbol, 'lineOpacity', 1);
        setUniformFromSymbol(uniforms, 'lineGapWidth', symbol, 'lineGapWidth', 0);
        setUniformFromSymbol(uniforms, 'lineBlur', symbol, 'lineBlur', 0.4);
        setUniformFromSymbol(uniforms, 'lineOffset', symbol, 'lineOffset', 0);
        setUniformFromSymbol(uniforms, 'lineDx', symbol, 'lineDx', 0);
        setUniformFromSymbol(uniforms, 'lineDy', symbol, 'lineDy', 0);
        setUniformFromSymbol(uniforms, 'lineDasharray', symbol, 'lineDasharray', [0, 0, 0, 0], dasharray => {
            let lineDasharray;
            if (dasharray && dasharray.length) {
                const old = dasharray;
                if (dasharray.length === 1) {
                    lineDasharray = [old[0], old[0], old[0], old[0]];
                } else if (dasharray.length === 2) {
                    lineDasharray = [old[0], old[1], old[0], old[1]];
                } else if (dasharray.length === 3) {
                    lineDasharray = [old[0], old[1], old[2], old[2]];
                } else if (dasharray.length === 4) {
                    lineDasharray = dasharray;
                }
            }
            return lineDasharray || [0, 0, 0, 0];
        }, [0, 0, 0, 0]);
        setUniformFromSymbol(uniforms, 'lineDashColor', symbol, 'lineDashColor', [0, 0, 0, 0], createColorSetter(this._colorCache));

        const iconAtlas = geometry.properties.iconAtlas;
        if (iconAtlas) {
            uniforms.linePatternFile = this.createAtlasTexture(iconAtlas, true);
            uniforms.linePatternSize = iconAtlas ? [iconAtlas.width, iconAtlas.height] : [0, 0];
        }
        //TODO lineDx, lineDy
        // const indices = geometries[i].elements;
        // const projViewMatrix = mat4.multiply([], mapUniforms.projMatrix, mapUniforms.viewMatrix);
        // const projViewModelMatrix = mat4.multiply(new Float32Array(16), projViewMatrix, transform);
        // console.log('projViewModelMatrix', projViewModelMatrix);
        // const pos = geometries[i].data.aPosition;
        // for (let ii = 0; ii < indices.length; ii++) {
        //     const idx = indices[ii] * 3;
        //     // if (ii === 2) {
        //     //     pos[idx + 2] = 8192;
        //     // }
        //     const vector = [pos[idx], pos[idx + 1], pos[idx + 2], 1];
        //     const glPos = vec4.transformMat4([], vector, projViewModelMatrix);
        //     const tilePos = vec4.transformMat4([], vector, transform);
        //     const ndc = [glPos[0] / glPos[3], glPos[1] / glPos[3], glPos[2] / glPos[3]];
        //     console.log(vector, tilePos, glPos, ndc);
        // }

        geometry.generateBuffers(this.regl);

        const material = new reshader.Material(uniforms);
        const mesh = new reshader.Mesh(geometry, material, {
            castShadow: false,
            picking: true
        });
        mesh.setLocalTransform(transform);

        const defines = {};
        if (iconAtlas) {
            defines['HAS_PATTERN'] = 1;
        }
        if (Array.isArray(symbol.lineDasharray) &&
            symbol.lineDasharray.reduce((accumulator, currentValue)=> {
                return accumulator + currentValue;
            }, 0) > 0) {
            defines['HAS_DASHARRAY'] = 1;
        }
        if (geometry.data.aColor) {
            defines['HAS_COLOR'] = 1;
        }
        if (geometry.data.aOpacity) {
            defines['HAS_OPACITY'] = 1;
        }
        if (geometry.data.aLineWidth) {
            defines['HAS_LINE_WIDTH'] = 1;
        }
        if (symbol['lineOffset']) {
            defines['USE_LINE_OFFSET'] = 1;
        }
        if (geometry.data.aUp) {
            defines['HAS_UP'] = 1;
        }
        mesh.setDefines(defines);
        return mesh;
    }

    preparePaint(...args) {
        super.preparePaint(...args);
        const meshes = this.scene.getMeshes();
        if (!meshes || !meshes.length) {
            return;
        }
        const zoom = this.getMap().getZoom();
        updateGeometryFnTypeAttrib(this.regl, this.symbolDef, this._fnTypeConfig, meshes, zoom);
    }

    paint(context) {
        const hasShadow = !!context.shadow;
        if (this._hasShadow === undefined) {
            this._hasShadow = hasShadow;
        }
        if (this._hasShadow !== hasShadow) {
            this.shader.dispose();
            this.createShader(context);
        }
        this._hasShadow = hasShadow;
        super.paint(context);
    }

    _getFnTypeConfig() {
        this._aColorFn = piecewiseConstant(this.symbolDef['lineColor']);
        this._aLineWidthFn = interpolated(this.symbolDef['lineWidth']);
        const map = this.getMap();
        const u16 = new Uint16Array(1);
        return [
            {
                //geometry.data 中的属性数据
                attrName: 'aColor',
                //symbol中的function-type属性
                symbolName: 'lineColor',
                type: Uint8Array,
                width: 4,
                define: 'HAS_COLOR',
                evaluate: properties => {
                    let color = this._aColorFn(map.getZoom(), properties);
                    if (!Array.isArray(color)) {
                        color = this._colorCache[color] = this._colorCache[color] || Color(color).array();
                    }
                    if (color.length === 3) {
                        color.push(255);
                    }
                    return color;
                }
            },
            {
                attrName: 'aLineWidth',
                symbolName: 'lineWidth',
                type: Uint8Array,
                width: 1,
                define: 'HAS_LINE_WIDTH',
                evaluate: properties => {
                    const lineWidth = this._aLineWidthFn(map.getZoom(), properties);
                    //乘以2是为了解决 #190
                    u16[0] = Math.round(lineWidth * 2.0);
                    return u16[0];
                }
            }
        ];
    }

    updateSymbol(symbol) {
        super.updateSymbol(symbol);
        this._aColorFn = piecewiseConstant(this.symbolDef['lineColor']);
        this._aLineWidthFn = interpolated(this.symbolDef['lineWidth']);
    }

    updateSceneConfig(config) {
        if (config.trailAnimation) {
            this.createShader(this._context);
        }
    }

    init(context) {
        const regl = this.regl;

        this.renderer = new reshader.Renderer(regl);

        this.createShader(context);

        if (this.pickingFBO) {
            this.picking = new reshader.FBORayPicking(
                this.renderer,
                {
                    vert: pickingVert,
                    uniforms: [
                        'cameraToCenterDistance',
                        'lineWidth',
                        'lineGapWidth',
                        {
                            name: 'projViewModelMatrix',
                            type: 'function',
                            fn: function (context, props) {
                                const projViewModelMatrix = [];
                                mat4.multiply(projViewModelMatrix, props['projViewMatrix'], props['modelMatrix']);
                                return projViewModelMatrix;
                            }
                        },
                        'tileRatio',
                        'resolution',
                        'tileResolution',
                        'lineDx',
                        'lineDy',
                        'lineOffset',
                        'canvasSize'
                    ]
                },
                this.pickingFBO
            );
        }
    }

    createShader(context) {
        this._context = context;
        const uniforms = context.shadow && context.shadow.uniformDeclares.slice(0) || [];
        const defines = context.shadow && context.shadow.defines || {};
        if (this.sceneConfig.trailAnimation && this.sceneConfig.trailAnimation.enable) {
            defines['HAS_TRAIL'] = 1;
        }
        uniforms.push(
            'cameraToCenterDistance',
            'lineWidth',
            'lineGapWidth',
            'lineBlur',
            'lineOpacity',
            'lineDasharray',
            'lineDashColor',
            {
                name: 'projViewModelMatrix',
                type: 'function',
                fn: function (context, props) {
                    const projViewModelMatrix = [];
                    mat4.multiply(projViewModelMatrix, props['projViewMatrix'], props['modelMatrix']);
                    return projViewModelMatrix;
                }
            },
            'tileRatio',
            'resolution',
            'tileResolution',
            'tileExtent',
            'lineDx',
            'lineDy',
            'lineOffset',
            'canvasSize',

            'enableTrail',
            'trailLength',
            'trailSpeed',
            'trailCircle',
            'currentTime'
        );

        const stencil = this.layer.getRenderer().isEnableTileStencil && this.layer.getRenderer().isEnableTileStencil();
        const canvas = this.canvas;
        const viewport = {
            x: 0,
            y: 0,
            width: () => {
                return canvas ? canvas.width : 1;
            },
            height: () => {
                return canvas ? canvas.height : 1;
            }
        };
        const depthRange = this.sceneConfig.depthRange;
        const layer = this.layer;
        this.shader = new reshader.MeshShader({
            vert, frag,
            uniforms,
            defines,
            extraCommandProps: {
                viewport,
                stencil: {
                    enable: true,
                    mask: 0xFF,
                    func: {
                        cmp: () => {
                            return stencil ? '=' : '<=';
                        },
                        ref: (context, props) => {
                            return stencil ? props.stencilRef : props.level;
                        },
                        mask: 0xFF
                    },
                    op: {
                        fail: 'keep',
                        zfail: 'keep',
                        zpass: 'replace'
                    }
                },
                depth: {
                    enable: true,
                    range: depthRange || [0, 1],
                    func: this.sceneConfig.depthFunc || '<='
                },
                blend: {
                    enable: true,
                    func: {
                        src: (context, props) => {
                            return props['linePatternFile'] ? 'src alpha' : this.sceneConfig.blendSrc || 'one';
                        },
                        dst: this.sceneConfig.blendDst || 'one minus src alpha'
                    },
                    equation: 'add'
                },
                polygonOffset: {
                    enable: true,
                    offset: {
                        factor: () => { return -OFFSET_FACTOR_SCALE * (layer.getPolygonOffset() + this.pluginIndex + 1) / layer.getTotalPolygonOffset(); },
                        units: () => { return -(layer.getPolygonOffset() + this.pluginIndex + 1); }
                    }
                }
            }
        });
    }

    getUniformValues(map, context) {
        const projViewMatrix = map.projViewMatrix,
            cameraToCenterDistance = map.cameraToCenterDistance,
            resolution = map.getResolution(),
            canvasSize = [map.width, map.height];
        const animation = this.sceneConfig.trailAnimation || {};
        const uniforms = {
            projViewMatrix, cameraToCenterDistance, resolution, canvasSize,
            trailSpeed: animation.speed || 1,
            trailLength: animation.trailLength || 500,
            trailCircle: animation.trailCircle || 1000,
            currentTime: this.layer.getRenderer().getFrameTimestamp() || 0
        };

        if (context && context.shadow && context.shadow.renderUniforms) {
            extend(uniforms, context.shadow.renderUniforms);
        }
        return uniforms;
    }
}

export default LinePainter;
