import * as maptalks from 'maptalks';
import { extend } from '../../common/Util';

const defaultOptions = {
    picking: true,
    renderer: 'gl',
    collision: false,
    textGamma: 1,
    geometryEvents: true,
    styleScale: 1,
    forceRenderOnZooming: true,
    forceRenderOnMoving: true,
    forceRenderOnRotating: true,
    meshRenderOrder: 0,
    enableBloom: false,
    workarounds: {
        //#94, text rendering crashes on windows with intel gpu
        'win-intel-gpu-crash': true
    }
};

const VECTOR_TILE_SIZE = new maptalks.Size(1, 1);

class Vector3DLayer extends maptalks.OverlayLayer {

    static registerPainter(name, clazz) {
        if (!Vector3DLayer.painters) {
            Vector3DLayer.painters = {};
        }
        Vector3DLayer.painters[name] = clazz;
    }

    static get3DPainterClass(name) {
        return Vector3DLayer.painters[name];
    }

    onConfig(conf) {
        super.onConfig(conf);
        if (conf['enableBloom'] !== undefined) {
            const renderer = this.getRenderer();
            if (renderer) {
                renderer.updateBloom(conf['enableBloom']);
            }
        }
    }

    // constructor(...args) {
    //     super(...args);
    //     if (!this.options.sceneConfig) {
    //         this.options.sceneConfig = {};
    //     }
    //     if (isNil(this.options.sceneConfig.blendSrc)) {
    //         this.options.sceneConfig.blendSrc = 'one';
    //     }
    // }

    updateSymbol(idx, symbol) {
        if (!this.options.style) {
            throw new Error('can\'t call update symbol when style is not set');
        }
        const styles = Array.isArray(this.options.style) ? this.options.style : this.options.style.style;
        if (!styles[idx]) {
            throw new Error(`invalid style at ${idx}`);
        }
        extend(styles[idx].symbol, symbol);
        this.setStyle(this.options.style);
        return this;
    }

    /**
     * 获取图层的polygonOffsetCount
     * 用于GroupGLLayer全局管理polygonOffset
     */
    getPolygonOffsetCount() {
        return 1;
    }

    /**
     * 获取图层的polygonOffset
     * 用于GroupGLLayer全局管理polygonOffset
     */
    getPolygonOffset() {
        return this._polygonOffset || 0;
    }

    setPolygonOffset(offset, total) {
        this._polygonOffset = offset;
        this._totalPolygonOffset = total;
        return this;
    }

    getTotalPolygonOffset() {
        return this._totalPolygonOffset;
    }

    /**
     * Identify the geometries on the given coordinate
     * @param  {maptalks.Coordinate} coordinate   - coordinate to identify
     * @param  {Object} [options=null]  - options
     * @param  {Object} [options.tolerance=0] - identify tolerance in pixel
     * @param  {Object} [options.count=null]  - result count
     * @return {Geometry[]} geometries identified
     */
    identify(coordinate, options = {}) {
        const map = this.getMap();
        const renderer = this.getRenderer();
        if (!map || !renderer) {
            return [];
        }
        const cp = map.coordToContainerPoint(new maptalks.Coordinate(coordinate));
        return this.identifyAtPoint(cp, options);
    }

    /**
     * Identify the geometries on the given container point
     * @param  {maptalks.Point} point   - point to identify
     * @param  {Object} [options=null]  - options
     * @param  {Object} [options.tolerance=0] - identify tolerance in pixel
     * @param  {Object} [options.count=null]  - result count
     * @return {Geometry[]} geometries identified
     */
    identifyAtPoint(point, options = {}) {
        const map = this.getMap();
        const renderer = this.getRenderer();
        if (!map || !renderer) {
            return [];
        }
        const dpr = this.getMap().getDevicePixelRatio();
        return renderer.pick(point.x * dpr, point.y * dpr, options);
    }

    getComputedStyle() {
        return {
            style: this.getStyle() || []
        };
    }

    outlineAll() {
        const renderer = this.getRenderer();
        if (!renderer) {
            return this;
        }
        renderer.outlineAll();
        return this;

    }

    outline(geoIds) {
        if (!Array.isArray(geoIds) || !geoIds.length) {
            return this;
        }
        const renderer = this.getRenderer();
        if (!renderer) {
            return this;
        }
        renderer.outline(geoIds);
        return this;
    }

    cancelOutline() {
        const renderer = this.getRenderer();
        if (!renderer) {
            return this;
        }
        renderer.cancelOutline();
        return this;
    }

    /**
     * Export the Layer's JSON. <br>
     * @return {Object} layer's JSON
     */
    toJSON() {
        const profile = {
            'type': this.getJSONType(),
            'id': this.getId(),
            'options': this.config()
        };
        profile.geometries = [];
        const geometries = this.getGeometries();
        for (let i = 0, len = geometries.length; i < len; i++) {
            const geo = geometries[i];
            const json = geo.toJSON();
            profile.geometries.push(json);
        }
        return profile;
    }

    getTileSize() {
        // default tile size for painters
        return VECTOR_TILE_SIZE;
    }
}

Vector3DLayer.mergeOptions(defaultOptions);

export default Vector3DLayer;
