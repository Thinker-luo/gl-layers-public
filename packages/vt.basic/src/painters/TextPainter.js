import * as maptalks from 'maptalks';
import Painter from './Painter';
import { reshader, mat4 } from '@maptalks/gl';
import { getCharOffset } from './util/get_char_offset';
import { projectLine } from './util/projection';
import { getLabelBox } from './util/get_label_box';
import { getLabelNormal } from './util/get_label_normal';
import Color from 'color';
import vert from './glsl/text.vert';
import vertAlongLine from './glsl/text.line.vert';
import frag from './glsl/text.frag';
import pickingVert from './glsl/text.picking.vert';

const shaderFilter0 = mesh => {
    return mesh.uniforms['level'] === 0 && !mesh.geometry.properties.aNormal;
};

const shaderFilterN = mesh => {
    return mesh.uniforms['level'] > 0 && !mesh.geometry.properties.aNormal;
};

const shaderLineFilter0 = mesh => {
    return mesh.uniforms['level'] === 0 && mesh.geometry.properties.aNormal;
};

const shaderLineFilterN = mesh => {
    return mesh.uniforms['level'] > 0 && mesh.geometry.properties.aNormal;
};

const defaultUniforms = {
    'textFill' : [0, 0, 0, 1],
    'textOpacity' : 1,
    'pitchWithMap' : 0,
    'rotateWithMap' : 0,
    'textHaloRadius' : 0,
    'textHaloFill' : [1, 1, 1, 1],
    'textHaloBlur' : 0,
    'textHaloOpacity' : 1,
    'isHalo' : 0,
    'textPerspectiveRatio' : 0
};

// temparary variables used later
const PROJ_MATRIX = [], LINE_OFFSET = [];

const BOX = [], BOX0 = [], BOX1 = [];
const EMPTY_ARRAY = [];

const DEFAULT_SCENE_CONFIG = {
    fading : true,
    collision : true
};

class TextPainter extends Painter {
    constructor(regl, layer, sceneConfig) {
        super(regl, layer, sceneConfig);
        this.sceneConfig = maptalks.Util.extend({}, DEFAULT_SCENE_CONFIG, this.sceneConfig);
        this._fadingRecords = {};
    }

    needToRedraw() {
        return this._redraw;
    }

    createGeometry(glData) {
        const geometries = super.createGeometry.apply(this, arguments);
        for (let i = 0; i < geometries.length; i++) {
            if (glData.packs[i].lineVertex) {
                geometries[i].properties.line = glData.packs[i].lineVertex;
                geometries[i].properties.line.id = i;
            }
        }

        return geometries;
    }

    createMesh(geometries, transform, tileData) {
        if (!geometries || !geometries.length) {
            return null;
        }

        const enableCollision = this.layer.options['collision'] && this.sceneConfig['collision'] !== false;

        const packMeshes = tileData.meshes;
        const meshes = [];
        for (let i = 0; i < packMeshes.length; i++) {
            let geometry = geometries[packMeshes[i].pack];
            if (geometry.isDisposed() || geometry.data.aPosition.length === 0) {
                continue;
            }
            const symbol = packMeshes[i].symbol;
            geometry.properties.symbol = symbol;
            const isAlongLine = (symbol['textPlacement'] === 'line');
            const uniforms = {
                tileResolution : geometry.properties.tileResolution,
                tileRatio : geometry.properties.tileRatio
            };
            const { aPosition, aShape0, aGlyphOffset, aDxDy, aRotation, aSegment, aSize } = geometry.data;

            //initialize opacity array
            const aOpacity = new Uint8Array(aSize.length);
            for (let i = 0; i < aOpacity.length; i++) {
                aOpacity[i] = 255;
            }
            geometry.data.aOpacity = {
                usage : 'dynamic',
                data : aOpacity
            };
            if (isAlongLine || true) {
                //TODO collision是否为true
                geometry.properties.aOpacity = aOpacity;
                geometry.properties.aPickingId = geometry.data.aPickingId;
                geometry.properties.aDxDy = aDxDy;
                geometry.properties.aSize = aSize;
                geometry.properties.aRotation = aRotation;
                geometry.properties.aAnchor = aPosition;
                geometry.properties.aShape0 = aShape0;
            }

            if (isAlongLine) {
                geometry.properties.aGlyphOffset = aGlyphOffset;
                geometry.properties.aSegment = aSegment;

                delete geometry.data.aSegment;
                delete geometry.data.aGlyphOffset;

                if (symbol['textPitchAlignment'] === 'map') {
                    //pitch跟随map时，aOffset和aRotation不需要实时计算更新，只需要一次即可
                    geometry.properties.aOffset = geometry.data.aOffset = new aDxDy.constructor(aDxDy.length);
                    geometry.properties.aRotation = geometry.data.aRotation = new aRotation.constructor(aRotation.length);
                } else {
                    geometry.properties.aOffset = geometry.data.aOffset = {
                        usage : 'dynamic',
                        data : new aDxDy.constructor(aDxDy.length)
                    };
                    geometry.properties.aRotation = geometry.data.aRotation = {
                        usage : 'dynamic',
                        data : new aRotation.constructor(aRotation.length)
                    };
                }

                //aNormal = [isFlip * 2 + isVertical, ...];
                geometry.data.aNormal = geometry.properties.aNormal = {
                    usage : 'dynamic',
                    data : new Uint8Array(aDxDy.length / 2)
                };
                //TODO 增加是否是vertical字符的判断
                uniforms.isVerticalChar = true;
            }

            if (isAlongLine || enableCollision) {
                geometry.properties.elements = geometry.elements;
                geometry.properties.elemCtor = geometry.elements.constructor;
            }

            let transparent = false;
            if (symbol['textOpacity'] || symbol['textOpacity'] === 0) {
                uniforms.textOpacity = symbol['textOpacity'];
                if (symbol['textOpacity'] < 1) {
                    transparent = true;
                }
            }

            if (symbol['textFill']) {
                const color = Color(symbol['textFill']);
                uniforms.textFill = color.unitArray();
                if (uniforms.textFill.length === 3) {
                    uniforms.textFill.push(1);
                }
            }

            if (symbol['textHaloFill']) {
                const color = Color(symbol['textHaloFill']);
                uniforms.textHaloFill = color.unitArray();
                if (uniforms.textHaloFill.length === 3) {
                    uniforms.textHaloFill.push(1);
                }
            }

            if (symbol['textHaloBlur']) {
                uniforms.textHaloBlur = symbol['textHaloBlur'];
            }

            if (symbol['textHaloRadius']) {
                uniforms.textHaloRadius = symbol['textHaloRadius'];
                uniforms.isHalo = 1;
            }

            if (symbol['textHaloOpacity']) {
                uniforms.textHaloOpacity = symbol['textHaloOpacity'];
            }

            if (symbol['textPerspectiveRatio']) {
                uniforms.textPerspectiveRatio = symbol['textPerspectiveRatio'];
            } else if (isAlongLine) {
                uniforms.textPerspectiveRatio = 1;
            }

            if (symbol['textRotationAlignment'] === 'map') {
                uniforms.rotateWithMap = 1;
            }

            if (symbol['textPitchAlignment'] === 'map') {
                uniforms.pitchWithMap = 1;
            }

            const glyphAtlas = geometry.properties.glyphAtlas;
            uniforms['texture'] = glyphAtlas;
            uniforms['texSize'] = [glyphAtlas.width, glyphAtlas.height];

            geometry.generateBuffers(this.regl);
            const material = new reshader.Material(uniforms, defaultUniforms);
            const mesh = new reshader.Mesh(geometry, material, {
                transparent,
                castShadow : false,
                picking : true
            });
            mesh.setLocalTransform(transform);
            //设置ignoreCollision，此mesh略掉collision检测
            //halo mesh会进行collision检测，并统一更新elements
            if (symbol['textHaloRadius']) {
                mesh.properties.ignoreCollision = true;
            }
            meshes.push(mesh);

            if (symbol['textHaloRadius']) {
                uniforms.isHalo = 0;
                const material = new reshader.Material(uniforms, defaultUniforms);
                const mesh = new reshader.Mesh(geometry, material, {
                    transparent,
                    castShadow : false,
                    picking : true
                });

                mesh.setLocalTransform(transform);
                meshes.push(mesh);
            }
        }
        return meshes;
    }

    deleteMesh(meshes) {
        if (!meshes) {
            return;
        }
        for (let i = 0; i < meshes.length; i++) {
            const key = meshes[i].properties.tileKey;
            delete this._fadingRecords[key];
        }
        super.deleteMesh(meshes);
    }

    preparePaint({ timestamp }) {
        this._projectedLinesCache = {};
        this._updateLabels(timestamp);
    }

    callShader(uniforms) {
        this._shader.filter = shaderFilter0;
        this._renderer.render(this._shader, uniforms, this.scene);

        this._shader.filter = shaderFilterN;
        this._renderer.render(this._shader, uniforms, this.scene);

        this._shaderAlongLine.filter = shaderLineFilter0;
        this._renderer.render(this._shaderAlongLine, uniforms, this.scene);

        this._shaderAlongLine.filter = shaderLineFilterN;
        this._renderer.render(this._shaderAlongLine, uniforms, this.scene);
    }

    /**
     * update flip and vertical data for each text
     */
    _updateLabels(/* timestamp */) {
        const meshes = this.scene.getMeshes();
        if (!meshes || !meshes.length) {
            return;
        }
        const map = this.layer.getMap();
        const bearing = -map.getBearing() * Math.PI / 180;
        const angleCos = Math.cos(bearing),
            angleSin = Math.sin(bearing),
            pitchCos = Math.cos(0),
            pitchSin = Math.sin(0);
        const planeMatrix = [
            angleCos, -1.0 * angleSin * pitchCos, angleSin * pitchSin,
            angleSin, angleCos * pitchCos, -1.0 * angleCos * pitchSin,
            0.0, pitchSin, pitchCos
        ];
        const fn = (elements, visibleElements, mesh, label, start, end, mvpMatrix, index) => {
            const key = mesh.properties.tileKey;
            // debugger
            const visible = this._isLabelVisible(mesh, elements, label, start, end, mvpMatrix);
            if (visible) {
                //start end是对应的端点序号，每个文字有4个端点, 而每个文字有6个elements
                //TODO fading显示

                for (let i = start; i < end; i++) {
                    visibleElements.push(elements[i]);
                }
            } else {
                //TODO fading隐藏
            }
        };
        const enableCollision = this.layer.options['collision'] && this.sceneConfig['collision'] !== false;
        for (let m = 0; m < meshes.length; m++) {
            const mesh = meshes[m];
            const geometry = mesh.geometry;
            if (geometry.properties.aNormal) {
                //line placement
                if (!geometry.properties.line) {
                    continue;
                }
                this._updateLineLabel(mesh, planeMatrix);
            } else if (enableCollision && !mesh.properties.ignoreCollision) {
                const elements = geometry.properties.elements;
                const visibleElements = [];
                this._forEachLabel(mesh, elements, (mesh, label, start, end, mvpMatrix) => {
                    fn(elements, visibleElements, mesh, label, start, end, mvpMatrix);
                });
                if (visibleElements.length !== elements.length) {
                    geometry.setElements({
                        usage : 'dynamic',
                        data : new geometry.properties.elemCtor(visibleElements)
                    });
                }
            }
        }
    }

    _updateLineLabel(mesh, planeMatrix) {
        const timestamp = this.layer.getRenderer().getFrameTimestamp(),
            map = this.layer.getMap(),
            geometry = mesh.geometry,
            geometryProps = geometry.properties;
        const { aNormal, aOffset, aRotation } = geometryProps;
        //pitch不跟随map时，需要根据屏幕位置实时计算各文字的位置和旋转角度并更新aOffset和aRotation
        //pitch跟随map时，根据line在tile内的坐标计算offset和rotation，只需要计算更新一次
        //aNormal在两种情况都要实时计算更新

        const properties = mesh.geometry.properties;
        let line = properties.line;
        if (!line) {
            return;
        }

        const uniforms = mesh.material.uniforms;
        const isPitchWithMap = uniforms['pitchWithMap'] === 1,
            shouldUpdate = !isPitchWithMap || !geometry.__offsetRotationUpdated;

        //shouldUpdate为真时
        const allElements = geometryProps.elements;

        //pitchWithMap 而且 offset， rotation都更新过了，才能直接用allElements
        const elements = shouldUpdate ? [] : allElements;

        if (!isPitchWithMap) {
            const matrix = mat4.multiply(PROJ_MATRIX, map.projViewMatrix, mesh.localTransform);
            //project line to screen coordinates
            const out = new Array(line.length);
            line = this._projectLine(out, line, matrix, map.width, map.height);
        }
        const enableCollision = !mesh.properties.ignoreCollision && this.layer.options['collision'] && this.sceneConfig['collision'] !== false;
        let visibleElements = enableCollision ? [] : elements;

        const key = mesh.properties.tileKey;
        this._forEachLabel(mesh, allElements, (mesh, label, start, end, mvpMatrix, index) => {
            let visible = this._updateLabelAttributes(mesh, allElements, start, end, line, mvpMatrix, isPitchWithMap ? planeMatrix : null);
            if (!visible) {
                //offset 计算 miss，则立即隐藏文字，不进入fading
                //更新 fadingRecords 的时间戳
                if (!this._fadingRecords[key]) {
                    this._fadingRecords[key] = {};
                }
                this._fadingRecords[key][index] = -timestamp;
                return;
            }
            if (shouldUpdate && isPitchWithMap) {
                //只有pitchWithMap，且offset,Rotation没有更新时（第一次运行），才需要更新elements
                for (let i = start; i < end; i++) {
                    elements.push(allElements[i]);
                }
            }
            if (!enableCollision) {
                return;
            }
            visible = this._isLabelVisible(mesh, allElements, label, start, end, mvpMatrix);
            if (visible) {
                for (let i = start; i < end; i++) {
                    visibleElements.push(allElements[i]);
                }
            }
        });

        geometry.updateData('aNormal', aNormal);
        if (shouldUpdate) {
            if (isPitchWithMap) {
                //pitchWithMap 时，elements只需更新一次，替换掉原elements
                geometryProps.elements = new geometryProps.elemCtor(elements);
            }
            geometry.updateData('aOffset', aOffset);
            geometry.updateData('aRotation', aRotation);
        }
        if (shouldUpdate || visibleElements.length !== elements.length) {
            // geometry.properties.elements = elements;
            geometry.setElements({
                usage : 'dynamic',
                data : new geometryProps.elemCtor(visibleElements)
            });
        }
        //tag if geometry's aOffset and aRotation is updated
        geometry.__offsetRotationUpdated = true;
    }

    _projectLine(out, line, matrix, width, height) {
        const id = line.id + '-' + matrix.join();
        if (this._projectedLinesCache[id]) {
            return this._projectedLinesCache[id];
        }
        const prjLine = projectLine(out, line, matrix, width, height);
        this._projectedLinesCache[id] = prjLine;
        return prjLine;
    }

    _forEachLabel(mesh, elements, fn) {
        const map = this.layer.getMap();
        const matrix = mat4.multiply(PROJ_MATRIX, map.projViewMatrix, mesh.localTransform);
        const geometry = mesh.geometry,
            geometryProps = geometry.properties;
        const pickingId = geometryProps.aPickingId;

        let index = 0;

        let idx = elements[0];
        let start = 0, current = pickingId[idx];
        //每个文字有6个element
        for (let i = 0; i <= elements.length; i += 6) {
            idx = elements[i];
            //pickingId发生变化，新的feature出现
            if (pickingId[idx] !== current || i === elements.length) {
                const end = i/*  === elements.length - 6 ? elements.length : i */;
                const feature = geometryProps.features[current];
                const text = feature.textName = feature.textName || resolveText(geometryProps.symbol.textName, feature.feature.properties);
                const charCount = text.length;
                for (let ii = start; ii < end; ii += charCount * 6) {
                    //start end是端点序号，每个文字有4个，而element每个文字有6个，所以需要 * 4 / 6
                    fn.call(this, mesh, text, ii, ii + charCount * 6, matrix, index++);
                }
                current = pickingId[idx];
                start = i;
            }
        }
    }

    // start and end is the start and end index of a label
    _updateLabelAttributes(mesh, meshElements, start, end, line, mvpMatrix, planeMatrix) {
        const map = this.layer.getMap();
        const geometry = mesh.geometry;

        const uniforms = mesh.material.uniforms;
        const isPitchWithMap = uniforms['pitchWithMap'] === 1,
            //should update aOffset / aRotation?
            shouldUpdate = !isPitchWithMap || !geometry.__offsetRotationUpdated;
        const aOffset = geometry.properties.aOffset.data || geometry.properties.aOffset,
            aRotation = geometry.properties.aRotation.data || geometry.properties.aRotation,
            aNormal = geometry.properties.aNormal;

        const isProjected = !planeMatrix;
        const scale = isProjected ? 1 : this.layer.options['extent'] / this.layer.options['tileSize'][0];

        let visible = true;
        //if planeMatrix is null, line is in tile coordinates
        // line = planeMatrix ? line.line : line;
        if (shouldUpdate) {
            //array to store current text's elements
            for (let j = start; j < end; j += 6) {
                const vertexStart = meshElements[j];
                const offset = getCharOffset(LINE_OFFSET, mesh, line, vertexStart, mvpMatrix, map.width, map.height, isProjected, scale);
                if (!offset) {
                    //remove whole text if any char is missed
                    visible = false;
                    break;
                }
                for (let ii = 0; ii < 4; ii++) {
                    aOffset[2 * (vertexStart + ii)] = offset[0];
                    aOffset[2 * (vertexStart + ii) + 1] = offset[1];
                    aRotation[vertexStart + ii] = offset[2];
                }
                //every character has 4 vertice, and 6 indexes
                //j, j + 1, j + 2 is the left-top triangle
                //j + 1, j + 2, j + 3 is the right-bottom triangle
                // labelElements.push(meshElements[j], meshElements[j + 1], meshElements[j + 2]);
                // labelElements.push(meshElements[j + 3], meshElements[j + 4], meshElements[j + 5]);
            }
        }
        if (visible) {
            //updateNormal
            //normal decides whether to flip and vertical
            const firstChrIdx = meshElements[start],
                lastChrIdx = meshElements[end - 1];
            // debugger
            this._updateNormal(aNormal, aOffset, uniforms['isVerticalChar'], firstChrIdx, lastChrIdx, planeMatrix);
        }

        return visible;
    }

    _updateNormal(aNormal, aOffset, isVertical, firstChrIdx, lastChrIdx, planeMatrix) {
        const map = this.layer.getMap(),
            aspectRatio = map.width / map.height;
        const normal = getLabelNormal(aOffset, firstChrIdx, lastChrIdx, isVertical, aspectRatio, planeMatrix);
        // console.log(normal);
        //更新normal
        for (let i = firstChrIdx; i <= lastChrIdx; i++) {
            aNormal.data[i] = normal;
        }
    }

    _isLabelVisible(mesh, elements, text, start, end, mvpMatrix) {
        const symbol = mesh.geometry.properties.symbol;
        if (symbol['textIgnorePlacement'] && symbol['textAllowOverlap']) {
            return true;
        }
        const boxes = this._isLabelCollides(mesh, elements, text, start, end, mvpMatrix);
        if (!boxes.length && !symbol['textAllowOverlap']) {
            //boxes为0，说明collides
            return false;
        }
        if (!symbol['textIgnorePlacement']) {
            for (let i = 0; i < boxes.length; i++) {
                this.insertCollisionBox(boxes[i]);
            }
        }
        return true;
    }

    _isLabelCollides(mesh, elements, text, start, end, matrix) {
        const map = this.layer.getMap();
        const geoProps = mesh.geometry.properties,
            symbol = geoProps.symbol,
            isAlongLine = (symbol['textPlacement'] === 'line'),
            debugCollision = this.layer.options['debugCollision'];
        let hasCollides = false;
        const charCount = text.length;
        const boxes = [];
        //iterate feature's labels
        // for (let i = start; i < end; i += charCount * 4) {
        //TODO
        //1, 获取每个label的collision boxes
        //2, 将每个box在collision index中测试
        //   2.1 如果不冲突，则显示label
        //   2.2 如果冲突，则隐藏label
        if (!isAlongLine && mesh.material.uniforms['rotateWithMap'] !== 1 && !symbol['textRotation']) {
            // 既没有沿线绘制，也没有随地图旋转时，文字本身也没有旋转时
            // 可以直接用第一个字的tl和最后一个字的br生成box，以减少box数量
            const firstChrIdx = elements[start],
                lastChrIdx = elements[start + charCount * 6 - 6];
            const tlBox = getLabelBox(BOX0, mesh, firstChrIdx, matrix, map),
                brBox = getLabelBox(BOX1, mesh, lastChrIdx, matrix, map);
            const box = BOX;
            box[0] = Math.min(tlBox[0], brBox[0]);
            box[1] = Math.min(tlBox[1], brBox[1]);
            box[2] = Math.max(tlBox[2], brBox[2]);
            box[3] = Math.max(tlBox[3], brBox[3]);
            if (this.isCollides(box)) {
                hasCollides = true;
                if (!debugCollision) {
                    return EMPTY_ARRAY;
                }
            }
            boxes.push(box.slice(0));
        } else {
            //insert every character's box into collision index
            for (let j = start; j < start + charCount * 6; j += 6) {
                //use int16array to save some memory
                const box = getLabelBox(BOX, mesh, elements[j], matrix, map);
                if (this.isCollides(box)) {
                    // console.log(box);
                    hasCollides = true;
                    if (!debugCollision) {
                        return EMPTY_ARRAY;
                    }
                }
                boxes.push(box.slice(0));
            }
        }
        // }
        this.layer.fire('hehe', { boxes });
        if (debugCollision) {
            this.addCollisionDebugBox(boxes, hasCollides ? 0 : 1);
            // console.log(hasCollides, text, boxes.join());
        }
        return hasCollides ? EMPTY_ARRAY : boxes;
    }

    remove() {
        this._shader.dispose();
        this._shaderAlongLine.dispose();
        delete this._projectedLinesCache;
        this._fadingRecords = {};
    }

    init() {
        // const map = this.layer.getMap();
        const regl = this.regl;
        const canvas = this.canvas;

        this._renderer = new reshader.Renderer(regl);

        const viewport = {
            x : 0,
            y : 0,
            width : () => {
                return canvas ? canvas.width : 1;
            },
            height : () => {
                return canvas ? canvas.height : 1;
            }
        };

        const uniforms = [
            'cameraToCenterDistance',
            {
                name : 'projViewModelMatrix',
                type : 'function',
                fn : function (context, props) {
                    return mat4.multiply([], props['projViewMatrix'], props['modelMatrix']);
                }
            },
            'textPerspectiveRatio',
            'texSize',
            'canvasSize',
            'glyphSize',
            'pitchWithMap',
            'mapPitch',
            'texture',
            'gammaScale',
            'textFill',
            'textOpacity',
            'textHaloRadius',
            'textHaloFill',
            'textHaloBlur',
            'textHaloOpacity',
            'isHalo',
            {
                name : 'zoomScale',
                type : 'function',
                fn : function (context, props) {
                    return props['tileResolution'] / props['resolution'];
                }
            },
            'planeMatrix',
            'rotateWithMap',
            'mapRotation',
            'tileRatio'
        ];

        const extraCommandProps = {
            viewport,
            blend: {
                enable: true,
                func: {
                    // src: 'src alpha',
                    // dst: 'one minus src alpha'
                    src : 'one',
                    dst: 'one minus src alpha'
                },
                equation: 'add'
            },
            depth: {
                enable: true,
                func : 'always'
            },
        };

        this._shader = new reshader.MeshShader({
            vert, frag,
            uniforms,
            extraCommandProps
        });
        this._shaderAlongLine = new reshader.MeshShader({
            vert : vertAlongLine, frag,
            uniforms,
            extraCommandProps
        });
        if (this.pickingFBO) {
            this.picking = new reshader.FBORayPicking(
                //TODO 需要创建两个picking对象
                this._renderer,
                {
                    vert : pickingVert,
                    uniforms
                },
                this.pickingFBO
            );
        }
    }

    getUniformValues(map) {
        const projViewMatrix = map.projViewMatrix,
            cameraToCenterDistance = map.cameraToCenterDistance,
            canvasSize = [this.canvas.width, this.canvas.height];
        //手动构造map的x与z轴的三维旋转矩阵
        //http://planning.cs.uiuc.edu/node102.html
        // const pitch = map.getPitch(),
        //     bearing = -map.getBearing();
        // const q = quat.fromEuler([], pitch, 0, bearing);
        // const planeMatrix = mat4.fromRotationTranslation([], q, [0, 0, 0]);

        const pitch = map.getPitch() * Math.PI / 180,
            bearing = -map.getBearing() * Math.PI / 180;
        const angleCos = Math.cos(bearing),
            angleSin = Math.sin(bearing),
            pitchCos = Math.cos(pitch),
            pitchSin = Math.sin(pitch);
        const planeMatrix = [
            angleCos, -1.0 * angleSin * pitchCos, angleSin * pitchSin,
            angleSin, angleCos * pitchCos, -1.0 * angleCos * pitchSin,
            0.0, pitchSin, pitchCos
        ];

        return {
            mapPitch : map.getPitch() * Math.PI / 180,
            mapRotation : map.getBearing() * Math.PI / 180,
            projViewMatrix,
            cameraToCenterDistance, canvasSize,
            glyphSize : 24,
            // gammaScale : 0.64,
            gammaScale : 1.0,
            resolution : map.getResolution(),
            planeMatrix
        };
    }
}

export default TextPainter;

const contentExpRe = /\{([\w_]+)\}/g;
/**
 * Replace variables wrapped by square brackets ({foo}) with actual values in props.
 * @example
 *     // will returns 'John is awesome'
 *     const actual = replaceVariable('{foo} is awesome', {'foo' : 'John'});
 * @param {String} str      - string to replace
 * @param {Object} props    - variable value properties
 * @return {String}
 * @memberOf StringUtil
 */
export function resolveText(str, props) {
    return str.replace(contentExpRe, function (str, key) {
        if (!props) {
            return '';
        }
        const value = props[key];
        if (value === null || value === undefined) {
            return '';
        } else if (Array.isArray(value)) {
            return value.join();
        }
        return value;
    });
}
