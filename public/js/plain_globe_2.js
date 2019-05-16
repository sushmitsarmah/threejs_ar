var Shaders = {
    'earth': {
        uniforms: {
            'texture': { type: 't', value: null }
        },
        vertexShader: [
            'varying vec3 vNormal;',
            'varying vec2 vUv;',
            'void main() {',
            'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
            'vNormal = normalize( normalMatrix * normal );',
            'vUv = uv;',
            '}'
        ].join('\n'),
        fragmentShader: [
            'uniform sampler2D texture;',
            'varying vec3 vNormal;',
            'varying vec2 vUv;',
            'void main() {',
            'vec3 diffuse = texture2D( texture, vUv ).xyz;',
            'float intensity = 1.05 - dot( vNormal, vec3( 0.0, 0.0, 1.0 ) );',
            'vec3 atmosphere = vec3( 1.0, 1.0, 1.0 ) * pow( intensity, 3.0 );',
            'gl_FragColor = vec4( diffuse + atmosphere, 1.0 );',
            '}'
        ].join('\n')
    },
    'atmosphere': {
        uniforms: {},
        vertexShader: [
            'varying vec3 vNormal;',
            'void main() {',
            'vNormal = normalize( normalMatrix * normal );',
            'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
            '}'
        ].join('\n'),
        fragmentShader: [
            'varying vec3 vNormal;',
            'void main() {',
            'float intensity = pow( 0.8 - dot( vNormal, vec3( 0, 0, 1.0 ) ), 12.0 );',
            'gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 ) * intensity;',
            '}'
        ].join('\n')
    }
};

let sphereRadius = 1;

let scene, camera, renderer, clock, deltaTime, totalTime;
let arToolkitSource, arToolkitContext;
let markerRoot;
let groupPoints;
let meshObjects;
let sphere;

let shader, uniforms, material;
let pointMesh = [], textMesh = [];
let circleMesh, focusCircles = [], innerRadius;
let cities = [], activeCity = -1;

let textFont;

loadFont('helvetiker_regular.typeface.json');
initialize();
animate();

function loadFont(fontfile) {
    var loader = new THREE.FontLoader();

    loader.load(`public/fonts/${fontfile}`, function (font) {
        textFont = font;
    });
}

function initialize() {
    // initialize the scene
    scene = new THREE.Scene();

    // add some ambient light to the scene
    let ambientLight = new THREE.AmbientLight(0xcccccc, 0.5);
    scene.add(ambientLight);

    // initialize the camera. will be used by AR
    camera = new THREE.Camera();
    scene.add(camera);

    // initialize the renderer.
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
    });

    // set the size, position, default color of the renderer
    renderer.setClearColor(new THREE.Color('lightgrey'), 0);
    renderer.setSize(640, 480);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0px';
    renderer.domElement.style.left = '0px';

    // add the renderer to the body of the html
    document.body.appendChild(renderer.domElement);

    // inititalize the clock
    clock = new THREE.Clock();
    deltaTime = 0;
    totalTime = 0;

    ////////////////////////////////////////////////////////////
    // setup arToolkitSource
    ////////////////////////////////////////////////////////////
    arToolkitSource = new THREEx.ArToolkitSource({
        sourceType: 'webcam',
    });
    function onResize() {
        arToolkitSource.onResize()
        arToolkitSource.copySizeTo(renderer.domElement)
        if (arToolkitContext.arController !== null) {
            arToolkitSource.copySizeTo(arToolkitContext.arController.canvas)
        }
    }
    arToolkitSource.init(function onReady() {
        onResize()
    });

    // handle resize event
    window.addEventListener('resize', function () {
        onResize()
    });

    ////////////////////////////////////////////////////////////
    // setup arToolkitContext
    ////////////////////////////////////////////////////////////

    // create atToolkitContext
    arToolkitContext = new THREEx.ArToolkitContext({
        cameraParametersUrl: 'public/data/camera_para.dat',
        detectionMode: 'mono'
    });

    // copy projection matrix to camera when initialization complete
    arToolkitContext.init(function onCompleted() {
        camera.projectionMatrix.copy(arToolkitContext.getProjectionMatrix());
    });

    ////////////////////////////////////////////////////////////
    // setup markerRoots
    ////////////////////////////////////////////////////////////

    // markerControls options
    const ARMarkerOptions = {
        type: 'pattern',
        patternUrl: "public/data/hiro.patt"
        // changeMatrixMode: 'cameraTransformMatrix'
    };

    // create the markerRoot group for AR marker control and add to scene
    markerRoot = new THREE.Group();
    scene.add(markerRoot);

    // AR marker controls. this sets the globe on the marker seen
    const markerControls = new THREEx.ArMarkerControls(
        arToolkitContext,
        markerRoot,
        ARMarkerOptions
    );

    // mesh groups. markerRoot is used by AR. others are used for rotation.
    meshObjects = new THREE.Group();
    groupPoints = new THREE.Group();
    meshObjects.add(groupPoints);
    markerRoot.add(meshObjects);

    // globe earth
    const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 32, 32);

    shader = Shaders['earth'];
    uniforms = THREE.UniformsUtils.clone(shader.uniforms);
    uniforms['texture'].value = THREE.ImageUtils.loadTexture('public/images/globe.jpg');
    material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader
    });

    sphere = new THREE.Mesh(sphereGeometry, material);
    meshObjects.add(sphere);

    // atmosphere
    shader = Shaders['atmosphere'];
    uniforms = THREE.UniformsUtils.clone(shader.uniforms);
    material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true
    });

    atmosphereMesh = new THREE.Mesh(sphereGeometry, material);
    atmosphereMesh.scale.set(1.1, 1.1, 1.1);
    atmosphereMesh.name = 'atmosphere';
    meshObjects.add(atmosphereMesh);

    // hollow-circle && focus-circle
    let geometry = new THREE.Geometry();
    for (var i = 0; i <= 32; i += 1) {
        var x = Math.cos(i / 32 * 2 * Math.PI);
        var y = Math.sin(i / 32 * 2 * Math.PI);
        var vertex = new THREE.Vector3(x, y, 0);
        geometry.vertices.push(vertex);
    }
    material = new THREE.LineBasicMaterial({
        color: 0xcccccc,
        linewidth: 2
    });
    circleMesh = new THREE.Line(geometry, material);
    for (i = 0; i < 3; i += 1) {
        focusCircles.push(circleMesh.clone());
    }
    for (i = 0; i < 3; i += 1) {
        focusCircles[i].visible = false;
        meshObjects.add(focusCircles[i]);
    }
}

function update() {
    if (markerRoot.visible) {
        meshObjects.rotation.y += 0.01;
    }
    // update artoolkit on every frame
    if (arToolkitSource.ready !== false) {
        arToolkitContext.update(arToolkitSource.domElement);
    }
}
function render() {
    renderer.render(scene, camera);
}
function animate() {
    requestAnimationFrame(animate);
    deltaTime = clock.getDelta();
    totalTime += deltaTime;
    update();
    render();
}

function colorFn(hue) {
    var c = new THREE.Color();
    c.setHSL(hue, 1.0, 0.5);
    return c;
};

function addData(data) {
    let lat, lng, color, uri, i, colorFnWrapper;

    colorFnWrapper = (data, i) => colorFn(data[i][3]);

    for (i = 0; i < data.length; i += 1) {
        city = data[i][0];
        lat = data[i][1];
        lng = data[i][2];
        color = colorFnWrapper(data, i);
        uri = data[i][4];

        addCity(lat, lng, city, color, uri);
    }
};

function addCity(lat, lng, city, color, uri) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (180 + lng) * Math.PI / 180;

    addPoints(phi, theta, color);

    cities.push({
        'position': point.position.clone(),
        'name': city,
        'uri': uri
    });

}

function addPoints(phi, theta, color) {
    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: THREE.FaceColors
    });

    const pointDim = sphereRadius / 100;
    const pointHeight = 0.1;

    const point3d = new THREE.CubeGeometry(pointDim, pointDim, pointHeight);
    point = new THREE.Mesh(point3d, material);

    point.position.x = -sphereRadius * Math.sin(phi) * Math.cos(theta);
    point.position.y = sphereRadius * Math.cos(phi);
    point.position.z = sphereRadius * Math.sin(phi) * Math.sin(theta);
    point.lookAt(sphere.position);

    for (let i = 0; i < point.geometry.faces.length; i++) {
        point.geometry.faces[i].color = color;
    }

    pointMesh.push(point);
    groupPoints.add(point);
}

function addText(city, phi, theta, color) {
    var text3d = new THREE.TextGeometry(city, {
        size: 5,
        height: 0.5, // thickness of the text
        curveSegments: 2,
        font: textFont
    });
    text = new THREE.Mesh(text3d, material);

    text.position.x = sphereRadius * Math.sin(phi) * Math.cos(theta - Math.PI / 120);
    text.position.y = sphereRadius * Math.cos(phi);
    text.position.z = sphereRadius * Math.sin(phi) * Math.sin(theta - Math.PI / 120);
    text.position.multiplyScalar(1.001);
    text.scale.x = 0;
    text.scale.y = 0;
    text.updateMatrix();

    text.lookAt(text.position.clone().multiplyScalar(2));

    for (var i = 0; i < text.geometry.faces.length; i++) {
        text.geometry.faces[i].color = color;
    }

    text.visible = true;

    textMesh.push(text);
    groupPoints.add(text);
}