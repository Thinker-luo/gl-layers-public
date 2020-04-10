import { PolygonPack } from '@maptalks/vector-packer';
import { extend } from '../../common/Util';
import Vector3DLayer from './Vector3DLayer';
import Vector3DLayerRenderer from './Vector3DLayerRenderer';

class PolygonLayer extends Vector3DLayer {

}

PolygonLayer.registerJSONType('PolygonLayer');

const SYMBOL = {
    polygonFill: {
        type: 'identity',
        default: undefined,
        property: '_symbol_polygonFill'
    },
    polygonPatternFile: {
        type: 'identity',
        default: undefined,
        property: '_symbol_polygonPatternFile'
    },
    polygonOpacity: {
        type: 'identity',
        default: undefined,
        property: '_symbol_polygonOpacity'
    }
};

class PolygonLayerRenderer extends Vector3DLayerRenderer {
    constructor(...args) {
        super(...args);
        this.PackClass = PolygonPack;
    }

    createPainter() {
        const FillPainter = Vector3DLayer.getPainterClass('fill');
        this.painterSymbol = extend({}, SYMBOL);
        const painter = new FillPainter(this.regl, this.layer, this.painterSymbol, this.layer.options.sceneConfig, 0);
        if (this.layer.getGeometries()) {
            this.onGeometryAdd(this.layer.getGeometries());
        }
        return painter;
    }
}

PolygonLayer.registerRenderer('gl', PolygonLayerRenderer);
PolygonLayer.registerRenderer('canvas', null);

export default PolygonLayer;
