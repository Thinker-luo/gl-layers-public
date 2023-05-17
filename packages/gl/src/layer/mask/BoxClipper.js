import { Point } from 'maptalks';
import { vec2 } from 'gl-matrix';

const LEFT_POINT = new Point(0, 0), RIGHT_POINT = new Point(0, 0), CENTER_POINT = new Point(0, 0), TEMP_POINT = new Point(0, 0);

export default class BoxClipper {
    constructor(position, options) {
        this._position = position;
        this.options = options;
    }

    addTo(layer) {
        if (this._layer) {
            return this;
        }
        this._layer = layer;
        const map = this._layer.getMap();
        if (map) {
            this._update();
            this._layer.setMask(this._clipper);
        }
        return this;
    }

    remove() {
        this._clipper.remove();
        delete this._layer;
    }

    setPosition(position) {
        this._position = position;
        this._update();
    }

    getPosition() {
        return this._position;
    }

    setWidth(width) {
        this.options['width'] = width;
        this._update();
    }

    setLength(length) {
        this.options['length'] = length;
        this._update();
    }

    setHeight(height) {
        this.options['height'] = height;
        this._update();
    }

    setRotation(rotation) {
        this.options['rotation'] = rotation;
        this._update();
    }

    getCoordinates() {
        return this._clipper.getCoordinates();
    }

    getHeightRange() {
        return this._clipper.getHeightRange();
    }

    _update() {
        const map = this._layer.getMap();
        if (map) {
            const { length, width, height } = this.options;
            const center = this._position;
            const rotation = this.options['rotation'] || 0;
            const { coordinates, heightRange } = this._generateCoordinates(map, center, length, width, height, rotation);
            this._clipper.setCoordinates(coordinates);
            this._clipper.setHeightRange(heightRange);
        }
    }

    _generateCoordinates(map, center, length, width, height, rotation) {
        const glRes = map.getGLRes();
        const pointLeft = map.distanceToPointAtRes(width / 2, 0, glRes, LEFT_POINT);
        const pointTop = map.distanceToPointAtRes(0, length / 2, glRes, RIGHT_POINT);
        const pointCenter = map.coordinateToPointAtRes(center, glRes, CENTER_POINT);
        const leftPointX = pointCenter.x - pointLeft.x;
        const rightPointX = pointCenter.x + pointLeft.x;
        const topPointY = pointCenter.y + pointTop.y;
        const buttomPointY = pointCenter.y - pointTop.y;
        const points = this._rotatePoint([[leftPointX, topPointY], [rightPointX, topPointY], [rightPointX, buttomPointY], [leftPointX, buttomPointY]], pointCenter, rotation);
        TEMP_POINT.set(points[0][0], points[0][1]);
        const lt = map.pointAtResToCoordinate(TEMP_POINT, glRes);
        TEMP_POINT.set(points[1][0], points[1][1]);
        const rt = map.pointAtResToCoordinate(TEMP_POINT, glRes);
        TEMP_POINT.set(points[2][0], points[2][1]);
        const rb = map.pointAtResToCoordinate(TEMP_POINT, glRes);
        TEMP_POINT.set(points[3][0], points[3][1]);
        const lb = map.pointAtResToCoordinate(TEMP_POINT, glRes);
        const buttom = center.z - height / 2;
        const top = center.z + height / 2;
        const heightRange = [buttom, top];
        const coordinates = [[lt.x, lt.y, buttom], [rt.x, rt.y, buttom], [rb.x, rb.y, buttom], [lb.x, lb.y, buttom], [lt.x, lt.y, buttom]];
        return { coordinates, heightRange };
    }

    _rotatePoint(points, center, rotation) {
        for (let i = 0; i < points.length; i++) {
            vec2.rotate(points[i], points[i], [center.x, center.y], rotation * Math.PI / 180);
        }
        return points;
    }
}
