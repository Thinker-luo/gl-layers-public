/**
 * warpped the WebGLRenderingContext
 * 管理
 * -cache
 * -program
 * -matrix
 * -extension
 * -limits
 * 特点：
 * reference https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmapRenderingContext/transferFromImageBitmap
 * 使用 OffscreenCanvas 创建不可见绘制canvas,后基于此canvas绘制图像，并保存成bitmap缓存帧
 * var htmlCanvas = document.getElementById("htmlCanvas").getContext("bitmaprenderer");
 * //
 * var offscreen = new OffscreenCanvas(256, 256);
 * var gl = offscreen.getContext("webgl");
 * var bitmap = offscreen.transferToImageBitmap();
 * //
 * 预留一定的帧数后，使用bitmaprender绘制bitmap到前端canvas即可
 * htmlCanvas.transferFromImageBitmap(bitmap);
 * @author yellow 2017/6/11
 */
import merge from './../utils/merge';
import GLConstants from './gl/GLConstants';
import GLExtension from './gl/GLExtension';
import GLLimits from './gl/GLLimits';
import GLProgram from './gl/GLProgram';

/**
 * @class Context
 * @example
 *   let cvs = document.createElement('canvas'),
 *       ctx = new Context(cvs);
 */
class Context {
    /**
     * program cache
     */
    _programCache = {};
    /**
     * the useing program
     */
    _currentProgram;
    /**
     * the html canvas
     */
    _canvas;
    /**
     * canvas width
     */
    _width;
    /**
     * canvas height
     */
    _height;

    _renderType;
    /**
     * @type {boolean}
     */
    _isWebgl2;
    /**
     * @type {number}
     */
    _alpha;
    /**
      * gl.attributes
      * 
      */
    _stencil;
    /**
    * gl.attributes
    * 
    */
    _depth;
    /**
        * gl.attributes
        * 
        */
    _antialias;
    /**
        * gl.attributes
        * 
        */
    _premultipliedAlpha;
    /**
        * gl.attributes
        * 
        */
    _preserveDrawingBuffer;

    /**
     * extension attrib
     */
    _validateFramebuffer;

    _validateShaderProgram;

    _logShaderCompilation;
    /**
     * @type {WebGLRenderingContext}
     */
    _gl;
    /**
     * @attribute {GLExtension}
     */
    _glExtension;
    /**
     * @attribute {GLLimits}
     */
    _glLimits;
    /**
     * @param {htmlCanvas} canvas
     * @param {Object} [options]
     * @param {number} [options.width]
     * @param {number} [options.height]
     * @param {String} [options.renderType] 'webgl'、'webgl2'
     * @param {boolean} [options.alpha] default is false,but gl default is true
     * @param {boolean} [options.stencil] default is true,but gl default is false.the stencilBuffer to draw color and depth
     * @param {boolean} [options.depth] enable gl depth
     * @param {boolean} [options.antialias] enable antialias,default is false
     * @param {boolean} [options.premultipliedAlpha] enable premultipliedAlpha,default is true , webgl2
     * @param {boolean} [options.preserveDrawingBuffer] enable preserveDrawingBuffer,default is false , webgl2
     */
    constructor(canvas, options) {
        options = options || {};
        this._canvas = canvas;
        this._width = options.width || canvas.width;
        this._height = options.height || canvas.height;
        this._renderType = options.renderType || 'webgl2';
        this._isWebgl2 = this._renderType === 'webgl2' ? true : false;
        this._alpha = options.alpha || false;
        this._stencil = options.stencil || true;
        this._depth = options.depth || true;
        this._antialias = options.antialias || false;
        this._premultipliedAlpha = options.premultipliedAlpha || true;
        this._preserveDrawingBuffer = options.preserveDrawingBuffer || false;
        this._allowTextureFilterAnisotropic = options.allowTextureFilterAnisotropic || true;
        //validation and logging disabled by default for speed.
        this._validateFramebuffer = false;
        this._validateShaderProgram = false;
        this._logShaderCompilation = false;
        //get glContext
        this._gl = canvas.getContext(this._renderType, this.getContextAttributes()) || canvas.getContext('experimental-' + this._renderType, this.getContextAttributes()) || undefined;
        //get extension
        this._includeExtension(this._gl);
        //get parameter and extensions
        this._includeParameter(this._gl);
        //setup env
        this._setup(this._gl);
    };
    /**
     * get context attributes
     * include webgl2 attributes
     * reference https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext
     * 
     */
    getContextAttributes() {
        return {
            alpha: this._alpha,
            depth: this._depth,
            stencil: this._stencil,
            antialias: this._antialias,
            premultipliedAlpha: this._premultipliedAlpha,
            preserveDrawingBuffer: this._preserveDrawingBuffer,
            //如果系统性能较低，也会创建context
            failIfMajorPerformanceCaveat:true,  
        }
    };
    /**
     * 设置绘制区域的规则
     * 1. 混合颜色
     * 2. 深度
     * 3.
     * @param {WebGLRenderingContext} gl [WebGL2RenderingContext]
     */
    _setup(gl){
        //reference http://www.cppblog.com/wc250en007/archive/2012/07/18/184088.html
        //gl.ONE 使用1.0作为因子，相当于完全使用了这种颜色参与混合运算
        //gl.ONE_MINUS_SRC_ALPHA 使用1.0-源颜色alpha值作为因子，
        //作用为：源颜色的alpha作为不透明度，即源颜色alpha值越大，混合时占比越高，混合时最常用的方式
        gl.enable(GLConstants.BLEND);
        gl.blendFunc(GLConstants.ONE,GLConstants.ONE_MINUS_SRC_ALPHA);
        //为了模仿真实物体和透明物体的混合颜色，需要使用深度信息
        //http://www.cnblogs.com/aokman/archive/2010/12/13/1904723.html
        //模版缓存区测试，用来对比当前值与预设值，用以判断是否更新此值
        //顺序为：(framment + associated data) - pixel ownership test - scissor test
        //       - alpha test - stencil test - depth test
        //       - blending - dithering - logic op - framebuffer
        //在模板测试的过程中，可以先使用一个比较用掩码（comparison mask）与模板缓冲区中的值进行位与运算，
        //再与参考值进行比较，从而实现对模板缓冲区中的值的某一位上的置位状态的判断。
        gl.enable(GLConstants.STENCIL_TEST);
        //gl.stencilFunc(gl)
        gl.enable(GLConstants.DEPTH_TEST);
        gl.depthFunc(GLConstants.LEQUAL); //深度参考值小于模版值时，测试通过
        gl.depthMask(false);
    }
    /**
     * Query and initialize extensions
     * @param {glContext} gl 
     */
    _includeExtension(gl) {
        this._glExtension = new GLExtension(gl);
    };
    /**
     * hardware
     * @param {glContext} gl 
     */
    _includeParameter(gl) {
        this._glLimits = new GLLimits(gl);
    };
    /**
     * 清理颜色缓冲
     */
    clearColor(){
        const gl = this._gl;
        gl.clearColor(0,0,0,0);
        gl.clear(GLConstants.COLOR_BUFFER_BIT);
    };
    /**
     * 清理模版缓冲
     */
    clearStencil(){
        const gl = this._gl;
        gl.clearStencil(0x0);
        gl.stencilMask(0xFF);
        gl.clear(GLConstants.STENCIL_BUFFER_BIT);
    };
    /**
     * 清理深度缓冲
     */
    clearDepth(){
         const gl = this._gl;
         gl.clearDepth(0x1);
         gl.clear(GLConstants.DEPTH_BUFFER_BIT);
    };

    _getProgram(programName,programConfiguration){
        let cache = this._programCache;
        const key = `${programName}`;
        if(!!cache[key])
            return cache[key];
        else{
            //create program
        }
    };

    useProgram(programName,programConfiguration){

    };


}


export default Context;