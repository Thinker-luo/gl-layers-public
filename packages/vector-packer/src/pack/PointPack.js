import Color from 'color';
import VectorPack from './VectorPack';
import StyledPoint from './StyledPoint';
import IconAtlas from './atlas/IconAtlas';
import GlyphAtlas from './atlas/GlyphAtlas';
import clipLine from './util/clip_line';
import  { getAnchors } from './util/get_anchors';
import classifyRings from './util/classify_rings';
import findPoleOfInaccessibility from './util/find_pole_of_inaccessibility';
import { evaluate } from '../style/Util';
import { fillTypedArray } from './util/array';
import Promise from './util/Promise';
import { getGlyphQuads, getIconQuads } from './util/quads';

const TEXT_MAX_ANGLE = 45 * Math.PI / 100;
const DEFAULT_SPACING = 80;
const PACK_LEN = 17;
//uint32 [anchor.x, anchor.y]
//uint16 [shape.x, shape.y]
//uint16 [tex.x, tex.y]
//uint8 [size.minx, size.miny, size.maxx, size.maxy]
//uint8 [offset.x, offset.y]
//uint8 [r, g, b, a]
//float [rotation]

const PACK_SDF_FORMAT = [
    {
        type : Uint32Array,
        width : 3,
        name : 'a_anchor'
    },
    {
        type : Int16Array,
        width : 2,
        name : 'a_shape'
    },
    {
        type : Uint16Array,
        width : 2,
        name : 'a_texcoord'
    },
    {
        type : Uint8Array,
        width : 4,
        name : 'a_size'
    },
    {
        type : Int8Array,
        width : 2,
        name : 'a_offset'
    },
    {
        type : Uint8Array,
        width : 1,
        name : 'a_opacity'
    },
    {
        type : Float32Array,
        width : 1,
        name : 'a_rotation'
    },
    {
        type : Uint8Array,
        width : 3,
        name : 'a_color'
    },
];

const PACK_MARKER_FORMAT = [
    {
        type : Uint32Array,
        width : 3,
        name : 'a_anchor'
    },
    {
        type : Int16Array,
        width : 2,
        name : 'a_shape'
    },
    {
        type : Uint16Array,
        width : 2,
        name : 'a_texcoord'
    },
    {
        type : Uint8Array,
        width : 4,
        name : 'a_size'
    },
    {
        type : Int8Array,
        width : 2,
        name : 'a_offset'
    },
    {
        type : Uint8Array,
        width : 1,
        name : 'a_opacity'
    },
    {
        type : Float32Array,
        width : 1,
        name : 'a_rotation'
    }
];


/**
 * 点类型数据，负责输入feature和symbol后，生成能直接赋给shader的arraybuffer
 * 设计上能直接在worker中执行
 * 其执行过程：
 * 1. 解析features（ vt 格式或 geojson ）
 * 2. 根据 symbol 设置，设置每个 feature 的 symbol，生成 StyledFeature
 * 3. 遍历 SymbolFeature，生成绘制数据，例如 anchor，glyph 或 icon，旋转角度等
 * 4. 将3中的数据生成 arraybuffer ，如果是动态绘制，则生成基础绘制数据 ( arraybuffer )
 *   4.1 symbol 变化时，则重新生成3中的绘制数据，并重新生成 arraybuffer
 */
export default class PointPack extends VectorPack {
    constructor(features, styles, options) {
        super(features, styles);
        //是否开启碰撞检测
        this.options = options;
        this.points = [];
        this.featureGroup = [];
    }

    load() {
        const minZoom = this.options.minZoom,
            maxZoom = this.options.maxZoom;
        this.points = [];
        this.count = 0;
        const features = this.features;
        if (!features || !features.length) return Promise.resolve();
        const styles = this.styles;
        const iconReqs = {}, glyphReqs = {};
        const pointOptions = { minZoom, maxZoom };
        for (let i = 0, l = features.length; i < l; i++) {
            const feature = features[i];
            let points, feas;
            for (let ii = 0; ii < styles.length; ii++) {
                points = this.points[ii] = this.points[ii] || [];
                feas = this.featureGroup[ii] = this.featureGroup[ii] || [];
                if (styles[ii].filter(feature)) {
                    feas.push(feature);
                    const symbol = styles[ii].symbol;
                    if (Array.isArray(symbol)) {
                        for (let iii = 0; iii < symbol.length; iii++) {
                            this.count++;
                            points[iii] = points[iii] || [];
                            points[iii].push(this._createPoint(feature, symbol[iii], pointOptions, iconReqs, glyphReqs));
                        }
                    } else {
                        this.count++;
                        points.push(this._createPoint(feature, symbol, pointOptions, iconReqs, glyphReqs));
                    }
                    break;
                }
            }
        }

        return new Promise((resolve, reject) => {
            this.fetchAtlas(iconReqs, glyphReqs, (err, icons, glyphs) => {
                if (err) {
                    reject(err);
                    return;
                }
                this.iconAtlas = new IconAtlas(icons);
                this.glyphAtlas = new GlyphAtlas(glyphs);
                resolve(this.iconAtlas, this.glyphAtlas);
            });
        });
    }

    fetchAtlas(iconReqs, glyphReqs, cb) {
        //TODO 从主线程获取 IconAtlas 和 GlyphAtlas
        return this.options.requestor({ iconReqs, glyphReqs }, cb);
    }

    /**
     * 生成绘制数据
     */
    performLayout(scale) {
        if (!this.count) {
            return null;
        }
        if (scale === undefined || scale === null) {
            throw new Error('layout scale is undefined');
        }
        const styles = this.styles;
        const packs = [], buffers = [];
        for (let i = 0; i < this.styles.length; i++) {
            const symbol = styles[i].symbol;
            if (Array.isArray(symbol)) {
                for (let ii = 0; ii < symbol.length; ii++) {
                    const pack = this._createDataPack(this.points[i][ii], scale);
                    if (!pack) continue;
                    packs.push(pack.data);
                    buffers.push(pack.buffers);
                }
            } else {
                const pack = this._createDataPack(this.points[i], scale);
                if (!pack) continue;
                packs.push(pack.data);
                buffers.push(pack.buffers);
            }
        }
        return {
            features : this.featureGroup,
            packs, buffers,
        };
    }

    _createDataPack(points, scale) {
        if (!points.length) {
            return null;
        }
        //uniforms: opacity, u_size_t

        const data = [],
            elements = [];
        for (let i = 0, l = points.length; i < l; i++) {
            this._placePoint(data, elements, points[i], scale);
        }
        const isText = points[0].symbol['textName'] !== undefined;
        const arrays = fillTypedArray(isText ? PACK_SDF_FORMAT : PACK_MARKER_FORMAT, data);
        const buffers = [];
        for (const p in arrays) {
            buffers.push(arrays[p].buffer);
        }
        return {
            data : arrays,
            buffers
        };
        /*eslint-enable camelcase*/
    }

    _placePoint(data, elements, point, scale) {
        const shape = point.getShape(this.iconAtlas, this.glyphAtlas);
        const anchors = this._getAnchors(point, shape, scale);
        const count = anchors.length;
        if (count === 0) {
            return;
        }
        const currentIdx = data.length / PACK_LEN;
        // const minZoom = this.options.minZoom,
        //     maxZoom = this.options.maxZoom;
        const symbol = point.symbol,
            properties = point.feature.properties;
        const size = point.size;
        const alongLine = point.feature.type === 2 && point.symbol['textPlacement'] === 'line' || point.symbol['markerPlacement'] === 'line';

        const isText = symbol['textName'] !== undefined;
        let quads, dx, dy, rotation, opacity, color;
        if (isText) {
            dx = evaluate(symbol['textDx'], properties) || 0;
            dy = evaluate(symbol['textDy'], properties) || 0;
            const textFill = evaluate(symbol['textFill'], properties) || '#000';
            rotation = evaluate(symbol['textRotation'], properties) || 0;
            color = Color(textFill || '#000').array();
            opacity = evaluate(symbol['textOpacity'], properties);
            if (opacity === undefined) {
                opacity = 1;
            }
            const font = point.getIconAndGlyph().glyph.font;
            quads = getGlyphQuads(shape.horizontal, alongLine, this.glyphAtlas.positions[font]);
        } else {
            dx = evaluate(symbol['markerDx'], properties) || 0;
            dy = evaluate(symbol['markerDy'], properties) || 0;
            rotation = evaluate(symbol['markerRotation'], properties) || 0;
            opacity = evaluate(symbol['markerOpacity'], properties);
            if (opacity === undefined) {
                opacity = 1;
            }
            quads = getIconQuads(shape);
            //TODO icon的情况
        }
        opacity = Math.round(opacity * 255);
        for (let i = 0; i < anchors.length; i++) {
            // const y = symbol.glyphOffset[1];
            // addVertex(layoutVertexArray, labelAnchor.x, labelAnchor.y, tl.x, y + tl.y, tex.x, tex.y, sizeVertex);
            // addVertex(layoutVertexArray, labelAnchor.x, labelAnchor.y, tr.x, y + tr.y, tex.x + tex.w, tex.y, sizeVertex);
            // addVertex(layoutVertexArray, labelAnchor.x, labelAnchor.y, bl.x, y + bl.y, tex.x, tex.y + tex.h, sizeVertex);
            // addVertex(layoutVertexArray, labelAnchor.x, labelAnchor.y, br.x, y + br.y, tex.x + tex.w, tex.y + tex.h, sizeVertex);
            // top-left
            for (const quad of quads) {
                const { tl, tr, bl, br, tex } = quad;
                const y = quad.glyphOffset[1];
                data.push(
                    anchors[i].x, anchors[i].y, 0,
                    tl.x, y + tl.y,
                    tex.x, tex.y,
                    size.min[0], size.min[1], size.max[0], size.max[1],
                    dx, dy,
                    opacity,
                    rotation * Math.PI / 180
                );
                if (isText) {
                    data.push(color[0], color[1], color[2]);
                }

                data.push(
                    anchors[i].x, anchors[i].y, 0,
                    bl.x, y + bl.y,
                    tex.x, tex.y + tex.h,
                    size.min[0], size.min[1], size.max[0], size.max[1],
                    dx, dy,
                    opacity,
                    rotation * Math.PI / 180
                );
                if (isText) {
                    data.push(color[0], color[1], color[2]);
                }

                data.push(
                    anchors[i].x, anchors[i].y, 0,
                    tr.x, y + tr.y,
                    tex.x + tex.w, tex.y,
                    size.min[0], size.min[1], size.max[0], size.max[1],
                    dx, dy,
                    opacity,
                    rotation * Math.PI / 180
                );
                if (isText) {
                    data.push(color[0], color[1], color[2]);
                }

                data.push(
                    anchors[i].x, anchors[i].y, 0,
                    br.x, y + br.y,
                    tex.x + tex.w, tex.y + tex.h,
                    size.min[0], size.min[1], size.max[0], size.max[1],
                    dx, dy,
                    opacity,
                    rotation * Math.PI / 180
                );
                if (isText) {
                    data.push(color[0], color[1], color[2]);
                }

                elements.push(currentIdx, currentIdx + 1, currentIdx + 2);
                elements.push(currentIdx + 1, currentIdx + 2, currentIdx + 3);
            }
        }
    }

    _getAnchors(point, shape, scale) {
        const feature = point.feature,
            type = point.feature.type,
            symbol = point.symbol,
            placement = this._getPlacement(symbol);

        let anchors = [];
        const glyphSize = 24,
            textMaxBoxScale = 1, //TODO 可能的最大的 textMaxSize / glyphSize
            spacing = (symbol['markerSpacing'] || symbol['textSpacing'] || DEFAULT_SPACING) * scale;
        if (placement === 'line') {
            const EXTENT = this.options.EXTENT;
            let lines = feature.geometry;
            if (EXTENT) {
                lines = clipLine(feature.geometry, 0, 0, EXTENT, EXTENT);
            }

            for (const line of lines) {
                anchors.push.apply(
                    anchors,
                    getAnchors(line,
                        spacing,
                        TEXT_MAX_ANGLE,
                        shape.vertical || shape.horizontal || shape,
                        null, //shapedIcon,
                        glyphSize,
                        scale * textMaxBoxScale,
                        1, //bucket.overscaling,
                        EXTENT || Infinity
                    )
                );
            }

        } else if (type === 3) {
            for (const polygon of classifyRings(feature.geometry, 0)) {
                // 16 here represents 2 pixels
                const poi = findPoleOfInaccessibility(polygon, 16);
                anchors.push(poi);
            }
        } else if (feature.type === 2) {
            // https://github.com/mapbox/mapbox-gl-js/issues/3808
            for (const line of feature.geometry) {
                anchors.push(line[0]);
            }
        } else if (feature.type === 1) {
            for (const points of feature.geometry) {
                for (const point of points) {
                    anchors.push(point);
                }
            }
        }
        //TODO 还需要mergeLines
        return anchors;
    }

    _createPoint(feature, symbol, options, iconReqs, glyphReqs) {
        //每个point的icon和text
        const point = new StyledPoint(feature, symbol, options);
        const iconGlyph = point.getIconAndGlyph();
        if (iconGlyph.icon) {
            if (!iconReqs[iconGlyph.icon]) {
                iconReqs[iconGlyph.icon] = 1;
            }
        }
        if (iconGlyph.glyph) {
            const { font, text } = iconGlyph.glyph;
            const fontGlphy = glyphReqs[font] = glyphReqs[font] || {};
            for (let i = 0; i < text.length; i++) {
                fontGlphy[text.charCodeAt(i)] = 1;
                //TODO mapbox-gl 这里对 vertical 字符做了特殊处理
            }
        }
        return point;
    }

    _getPlacement(symbol) {
        return symbol.markerPlacement || symbol.textPlacement;
    }
}

