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

var sphereRadius = 1;

var scene, camera, renderer, clock, deltaTime, totalTime;
var arToolkitSource, arToolkitContext;
var markerRoot1;
var sphere;

var shader, uniforms, material;
var pointMesh = [], textMesh = [];
var circleMesh, focusCircles = [], innerRadius;
var cities = [], activeCity = -1;

initialize();
animate();
function initialize() {
    scene = new THREE.Scene();
    let ambientLight = new THREE.AmbientLight(0xcccccc, 0.5);
    scene.add(ambientLight);
    camera = new THREE.Camera();
    scene.add(camera);
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
    });
    renderer.setClearColor(new THREE.Color('lightgrey'), 0)
    renderer.setSize(640, 480);
    renderer.domElement.style.position = 'absolute'
    renderer.domElement.style.top = '0px'
    renderer.domElement.style.left = '0px'
    document.body.appendChild(renderer.domElement);
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
        cameraParametersUrl: 'data/camera_para.dat',
        detectionMode: 'mono'
    });

    // copy projection matrix to camera when initialization complete
    arToolkitContext.init(function onCompleted() {
        camera.projectionMatrix.copy(arToolkitContext.getProjectionMatrix());
    });
    ////////////////////////////////////////////////////////////
    // setup markerRoots
    ////////////////////////////////////////////////////////////
    // build markerControls
    markerRoot1 = new THREE.Group();
    scene.add(markerRoot1);
    let markerControls1 = new THREEx.ArMarkerControls(arToolkitContext, camera, {
        type: 'pattern', patternUrl: "data/hiro.patt", changeMatrixMode: 'cameraTransformMatrix'
    })
    let geometry1 = new THREE.SphereGeometry(sphereRadius, 32, 32);

    shader = Shaders['earth'];
    uniforms = THREE.UniformsUtils.clone(shader.uniforms);
    uniforms['texture'].value = THREE.ImageUtils.loadTexture('images/globe.jpg');
    material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader
    });

    sphere = new THREE.Mesh(geometry1, material);
    scene.add(sphere);

    // atmosphere {{{
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

    atmosphereMesh = new THREE.Mesh(geometry1, material);
    atmosphereMesh.scale.set(1.1, 1.1, 1.1);
    atmosphereMesh.name = 'atmosphere';
    markerRoot1.add(atmosphereMesh);
    // }}}

    // hollow-circle && focus-circle {{{
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
        markerRoot1.add(focusCircles[i]);
    }
    // }}}

    // starfield-background {{{
    var texture = THREE.ImageUtils.loadTexture('images/starfield.png');
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    material = new THREE.MeshBasicMaterial({
        side: THREE.BackSide,
        map: texture,
        blending: THREE.AdditiveBlending,
    });
    var cubeMaterials = [];
    for (var i = 0; i < 6; i++) {
        cubeMaterials.push(material);
    }

    starfieldMesh = new THREE.Mesh(
        new THREE.CubeGeometry(100, 100, 100),
        new THREE.MeshFaceMaterial(cubeMaterials)
    );
    starfieldMesh.name = 'starfield';
    markerRoot1.add(starfieldMesh);
    // }}}
}
function update() {
    if (sphere.visible) {
        sphere.rotation.y += 0.01;
        markerRoot1.rotation.y += 0.01;
    }
    // update artoolkit on every frame
    if (arToolkitSource.ready !== false)
        arToolkitContext.update(arToolkitSource.domElement);
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
    var lat, lng, color, uri, i, colorFnWrapper;

    colorFnWrapper = function (data, i) { return colorFn(data[i][3]); }

    for (i = 0; i < data.length; i += 1) {
        city = data[i][0];
        lat = data[i][1];
        lng = data[i][2];
        color = colorFnWrapper(data, i);
        uri = data[i][4];

        addCity(lat, lng, city, color, uri);
        pointMesh.push(point);
        // textMesh.push(text);
        markerRoot1.add(point);
        // markerRoot1.add(text);
    }
};

function addCity(lat, lng, city, color, uri) {
    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: THREE.FaceColors
    });

    const pointDim = sphereRadius / 100;
    const pointHeight = 0.1;

    const point3d = new THREE.CubeGeometry(pointDim, pointDim, pointHeight);
    point = new THREE.Mesh(point3d, material);

    const phi = (90 - lat) * Math.PI / 180;
    const theta = (180 - lng) * Math.PI / 180;

    point.position.x = sphereRadius * Math.sin(phi) * Math.cos(theta);
    point.position.y = sphereRadius * Math.cos(phi);
    point.position.z = sphereRadius * Math.sin(phi) * Math.sin(theta);
    point.lookAt(sphere.position);

    for (let i = 0; i < point.geometry.faces.length; i++) {
        point.geometry.faces[i].color = color;
    }

    cities.push({ 'position': point.position.clone(), 'name': city, 'uri': uri });

    // text
    /*     var text3d = new THREE.TextGeometry(city, {
            size: 5,
            height: 0.5, // thickness of the text
            curveSegments: 2
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
    
        text.visible = false; */
}