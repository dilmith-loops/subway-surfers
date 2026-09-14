/**
 * Subway Surfers 3D Engine (Three.js)
 * 3-Track Runner with Jake avatar, oncoming trains, climbable ramps,
 * hurdles, floating 3D Word Hunt letters, coins, and powerups.
 */

class SubwaySurfersGame {
  constructor() {
    this.container = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // Game state
    this.isPlaying = false;
    this.isPaused = false;
    this.isGameOver = false;

    // Movement & Lanes (-1: Left, 0: Center, 1: Right)
    this.laneWidth = 3.5;
    this.currentLane = 0;
    this.targetX = 0;
    this.playerX = 0;
    this.playerY = 0;
    this.playerZ = 0;

    // Physics (Gentle, floaty physics for comfortable reaction time)
    this.gravity = -28;
    this.jumpVelocity = 13.0;
    this.superJumpVelocity = 19;
    this.velocityY = 0;
    this.isGrounded = true;
    this.isJumping = false;
    this.isSliding = false;
    this.slideDuration = 0.85; // seconds
    this.slideTimer = 0;
    this.currentGroundY = 0; // 0 for track, ~3.6 for train roof

    // Speed & Score
    this.speedMode = "relaxed";
    this.baseSpeed = 9.5; // ~57% slower than original 22
    this.currentSpeed = 9.5;
    this.maxSpeed = 15.0;
    this.distanceTraveled = 0;
    this.score = 0;
    this.highScore = parseInt(localStorage.getItem("subway_high_score") || "0", 10);
    this.coins = 0;
    this.multiplier = 1;

    // Powerups
    this.powerups = {
      magnet: { active: false, timer: 0, duration: 12 },
      sneakers: { active: false, timer: 0, duration: 12 },
      multiplier2x: { active: false, timer: 0, duration: 15 },
      hoverboard: { active: false, timer: 0, duration: 20 }
    };

    // World & Object Pools
    this.trackSegments = [];
    this.trackLength = 60;
    this.visibleSegments = 6;
    this.obstacles = []; // Trains, hurdles, duck bars
    this.collectibles = []; // Coins, Letters, Powerups
    this.particles = [];

    // Character model
    this.playerGroup = null;
    this.characterLimbs = {};
    this.runCycle = 0;
    this.playerShadow = null;
    this.hoverboardMesh = null;

    // Environment assets
    this.trainGeometry = null;
    this.coinGeometry = null;
    this.letterTexturesCache = {};

    // Camera settings
    this.cameraOffset = new THREE.Vector3(0, 4.8, 8.5);
    this.cameraLookOffset = new THREE.Vector3(0, 1.8, -10);

    // Clock
    this.clock = new THREE.Clock();

    // Bound loop
    this.loop = this.loop.bind(this);
  }

  init(containerId = "game-canvas-container") {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    // 1. Setup Three.js Scene, Camera, Renderer
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x130e26);
    this.scene.fog = new THREE.FogExp2(0x130e26, 0.009);

    this.camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 300);
    this.camera.position.set(0, 5, 9);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 2. Lighting
    this.setupLighting();

    // 3. Build Character & Environment
    this.buildCharacter();
    this.buildEnvironment();

    // 4. Setup Inputs
    this.setupKeyboardControls();
    this.setupTouchControls();

    // 5. Connect Camera Tracker callbacks
    if (window.cameraTracker) {
      window.cameraTracker.onLaneChange = (lane) => {
        if (!this.isPlaying || this.isPaused) return;
        this.setLane(lane);
      };
      window.cameraTracker.onJump = () => {
        if (!this.isPlaying || this.isPaused) return;
        this.jump();
      };
      window.cameraTracker.onDuck = () => {
        if (!this.isPlaying || this.isPaused) return;
        this.slide();
      };
    }

    // 6. Connect Word Hunt callbacks
    if (window.wordHunt) {
      window.wordHunt.onLetterCollected = (data) => {
        this.triggerLetterFlyEffect(data.letter);
        this.addScore(150);
      };
      window.wordHunt.onWordCompleted = (data) => {
        this.addScore(2500);
        this.coins += data.bonusCoins;
        this.updateHUD();
        this.triggerWordCompleteCelebration(data.word, data.bonusCoins);
      };
    }

    // 7. Window Resize
    window.addEventListener("resize", () => this.onWindowResize());

    // Start loop
    this.clock.start();
    requestAnimationFrame(this.loop);
  }

  setupLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xddeeff, 0.7);
    this.scene.add(ambientLight);

    // Main directional sunlight with shadows
    const dirLight = new THREE.DirectionalLight(0xfff3d6, 1.3);
    dirLight.position.set(15, 35, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 5;
    dirLight.shadow.camera.far = 120;
    dirLight.shadow.camera.left = -25;
    dirLight.shadow.camera.right = 25;
    dirLight.shadow.camera.top = 40;
    dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);
    this.sunLight = dirLight;

    // Neon atmospheric rim light (Cyberpunk subway vibes)
    const rimLight = new THREE.DirectionalLight(0x00d4ff, 0.6);
    rimLight.position.set(-20, 10, -30);
    this.scene.add(rimLight);

    const pinkLight = new THREE.DirectionalLight(0xff0077, 0.4);
    pinkLight.position.set(20, 8, -40);
    this.scene.add(pinkLight);
  }

  // --- Build Jake Character ---
  buildCharacter() {
    this.playerGroup = new THREE.Group();

    // Colors
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xffcd94 });
    const hoodieMat = new THREE.MeshLambertMaterial({ color: 0x1d70b8 }); // Blue Jake hoodie
    const vestMat = new THREE.MeshLambertMaterial({ color: 0xededed }); // White inner tee
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x334455 }); // Denim jeans
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0xd92525 }); // Red sneakers
    const capMat = new THREE.MeshLambertMaterial({ color: 0xd92525 }); // Red backwards cap
    const brimMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

    // Torso (Hoodie)
    const torsoGeo = new THREE.BoxGeometry(0.85, 1.05, 0.55);
    const torso = new THREE.Mesh(torsoGeo, hoodieMat);
    torso.position.y = 1.35;
    torso.castShadow = true;
    this.playerGroup.add(torso);

    // Inner Tee vest patch
    const teeGeo = new THREE.PlaneGeometry(0.4, 0.7);
    const tee = new THREE.Mesh(teeGeo, vestMat);
    tee.position.set(0, 1.35, 0.28);
    this.playerGroup.add(tee);

    // Head
    const headGeo = new THREE.BoxGeometry(0.65, 0.65, 0.65);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 2.15;
    head.castShadow = true;
    this.playerGroup.add(head);

    // Backwards Cap
    const capCrownGeo = new THREE.BoxGeometry(0.7, 0.35, 0.7);
    const capCrown = new THREE.Mesh(capCrownGeo, capMat);
    capCrown.position.set(0, 2.38, 0);
    this.playerGroup.add(capCrown);

    const capBrimGeo = new THREE.BoxGeometry(0.55, 0.08, 0.45);
    const capBrim = new THREE.Mesh(capBrimGeo, brimMat);
    capBrim.position.set(0, 2.24, -0.48); // Backwards
    this.playerGroup.add(capBrim);

    // Limbs - Left & Right Arms (Pivoted at shoulders)
    const armGeo = new THREE.BoxGeometry(0.28, 0.8, 0.28);

    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.58, 1.75, 0);
    const leftArm = new THREE.Mesh(armGeo, hoodieMat);
    leftArm.position.y = -0.4;
    leftArm.castShadow = true;
    leftArmGroup.add(leftArm);
    this.playerGroup.add(leftArmGroup);

    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.58, 1.75, 0);
    const rightArm = new THREE.Mesh(armGeo, hoodieMat);
    rightArm.position.y = -0.4;
    rightArm.castShadow = true;
    rightArmGroup.add(rightArm);
    this.playerGroup.add(rightArmGroup);

    // Limbs - Left & Right Legs (Pivoted at hips)
    const legGeo = new THREE.BoxGeometry(0.32, 0.8, 0.32);

    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.24, 0.85, 0);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.y = -0.38;
    leftLeg.castShadow = true;
    leftLegGroup.add(leftLeg);

    // Shoe
    const shoeGeo = new THREE.BoxGeometry(0.36, 0.24, 0.6);
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.74, 0.1);
    leftShoe.castShadow = true;
    leftLegGroup.add(leftShoe);
    this.playerGroup.add(leftLegGroup);

    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.24, 0.85, 0);
    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.y = -0.38;
    rightLeg.castShadow = true;
    rightLegGroup.add(rightLeg);

    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0, -0.74, 0.1);
    rightShoe.castShadow = true;
    rightLegGroup.add(rightShoe);
    this.playerGroup.add(rightLegGroup);

    // Official Subway Surfers Hoverboard model
    const textureLoader = new THREE.TextureLoader();
    const boardTex = textureLoader.load('assets/img/board_tex.png');
    const boardGeo = new THREE.BoxGeometry(1.0, 0.12, 2.2);
    const boardMat = new THREE.MeshStandardMaterial({
      map: boardTex,
      roughness: 0.3,
      metalness: 0.2
    });
    this.hoverboardMesh = new THREE.Mesh(boardGeo, boardMat);
    this.hoverboardMesh.position.set(0, 0.06, 0);
    this.hoverboardMesh.visible = false;
    this.playerGroup.add(this.hoverboardMesh);

    // Official Subway Surfers contact shadow on ground
    const shadowTex = textureLoader.load('assets/img/shadow_mip.png');
    const shadowGeo = new THREE.PlaneGeometry(1.5, 1.5);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    });
    this.playerShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.y = 0.03;
    this.scene.add(this.playerShadow);

    this.characterLimbs = {
      torso,
      head,
      leftArm: leftArmGroup,
      rightArm: rightArmGroup,
      leftLeg: leftLegGroup,
      rightLeg: rightLegGroup
    };

    this.playerGroup.position.set(0, 0, 0);
    this.scene.add(this.playerGroup);
  }

  // --- Environment & Track Setup ---
  buildEnvironment() {
    // Generate initial track segments
    for (let i = 0; i < this.visibleSegments; i++) {
      const zPos = -i * this.trackLength;
      this.createTrackSegment(zPos);
    }
  }

  createTrackSegment(zPos) {
    const segment = new THREE.Group();
    segment.position.z = zPos;

    // Ground gravel ballast
    const groundGeo = new THREE.PlaneGeometry(16, this.trackLength);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x242836,
      roughness: 0.9,
      metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    segment.add(ground);

    // Concrete side walls / Graffiti barriers
    const wallGeo = new THREE.BoxGeometry(1.2, 4.5, this.trackLength);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x3d4354,
      roughness: 0.7
    });

    const leftWall = new THREE.Mesh(wallGeo, wallMat);
    leftWall.position.set(-7.5, 2.25, 0);
    leftWall.receiveShadow = true;
    segment.add(leftWall);

    const rightWall = new THREE.Mesh(wallGeo, wallMat);
    rightWall.position.set(7.5, 2.25, 0);
    rightWall.receiveShadow = true;
    segment.add(rightWall);

    // Graffiti neon decals along walls
    const graffitiColors = [0xff0066, 0x00ffcc, 0xffcc00, 0x9900ff];
    for (let g = 0; g < 3; g++) {
      const gColor = graffitiColors[(Math.floor(Math.random() * graffitiColors.length))];
      const gGeo = new THREE.PlaneGeometry(3.5, 1.8);
      const gMat = new THREE.MeshBasicMaterial({
        color: gColor,
        side: THREE.DoubleSide
      });
      const gMesh = new THREE.Mesh(gGeo, gMat);
      const isLeft = Math.random() > 0.5;
      gMesh.position.set(isLeft ? -6.85 : 6.85, 2.2 + (Math.random() * 0.8), (g - 1) * 18);
      gMesh.rotation.y = isLeft ? Math.PI / 2 : -Math.PI / 2;
      segment.add(gMesh);
    }

    // 3 Tracks (Rails + Wooden Sleepers)
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x99aab5,
      metalness: 0.95,
      roughness: 0.2
    });
    const sleeperMat = new THREE.MeshStandardMaterial({
      color: 0x4a3728,
      roughness: 0.9
    });

    [-this.laneWidth, 0, this.laneWidth].forEach((laneX) => {
      // 2 Steel Rails
      const railGeo = new THREE.BoxGeometry(0.12, 0.15, this.trackLength);
      const leftRail = new THREE.Mesh(railGeo, railMat);
      leftRail.position.set(laneX - 0.7, 0.08, 0);
      leftRail.receiveShadow = true;
      segment.add(leftRail);

      const rightRail = new THREE.Mesh(railGeo, railMat);
      rightRail.position.set(laneX + 0.7, 0.08, 0);
      rightRail.receiveShadow = true;
      segment.add(rightRail);

      // Wooden Sleepers along track (every 2 units)
      const sleeperGeo = new THREE.BoxGeometry(1.8, 0.1, 0.4);
      for (let s = -this.trackLength / 2; s < this.trackLength / 2; s += 2.2) {
        const sleeper = new THREE.Mesh(sleeperGeo, sleeperMat);
        sleeper.position.set(laneX, 0.05, s);
        sleeper.receiveShadow = true;
        segment.add(sleeper);
      }
    });

    // Overhead Cable Gantries (Subway Arch)
    const archGeo = new THREE.BoxGeometry(15, 0.4, 0.4);
    const pillarGeo = new THREE.BoxGeometry(0.4, 6.5, 0.4);
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x22222a });

    const archPillarL = new THREE.Mesh(pillarGeo, metalMat);
    archPillarL.position.set(-6.8, 3.25, 0);
    segment.add(archPillarL);

    const archPillarR = new THREE.Mesh(pillarGeo, metalMat);
    archPillarR.position.set(6.8, 3.25, 0);
    segment.add(archPillarR);

    const archBeam = new THREE.Mesh(archGeo, metalMat);
    archBeam.position.set(0, 6.5, 0);
    segment.add(archBeam);

    // Neon signal light on the gantry
    const lightGlowGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const lightGlowMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const signalLight = new THREE.Mesh(lightGlowGeo, lightGlowMat);
    signalLight.position.set(0, 6.1, 0);
    segment.add(signalLight);

    this.scene.add(segment);
    this.trackSegments.push(segment);

    // If not the first 2 safe segments, spawn obstacles & collectibles
    if (zPos < -this.trackLength) {
      this.populateTrackSegment(zPos);
    }
  }

  // --- Procedural Spawning: Trains, Hurdles, Letters, Coins ---
  populateTrackSegment(segmentZ) {
    const lanes = [-this.laneWidth, 0, this.laneWidth];

    // Pick 1 or 2 lanes for obstacles
    const numObstacles = Math.random() < 0.65 ? 2 : 1;
    const shuffledLanes = [...lanes].sort(() => Math.random() - 0.5);

    for (let i = 0; i < numObstacles; i++) {
      const laneX = shuffledLanes[i];
      const zOffset = (Math.random() * 20) - 10;
      const obstacleZ = segmentZ + zOffset;

      const randType = Math.random();

      if (randType < 0.45) {
        // Subway Train!
        const hasRamp = Math.random() < 0.5; // Climbable ramp car
        this.spawnTrain(laneX, obstacleZ, hasRamp);
      } else if (randType < 0.75) {
        // Low Hurdle (Jump barrier)
        this.spawnHurdle(laneX, obstacleZ);
      } else {
        // High Barrier (Duck / Slide bar)
        this.spawnDuckBarrier(laneX, obstacleZ);
      }
    }

    // Spawn Collectibles in the remaining safe lane or atop obstacles
    const freeLane = shuffledLanes[numObstacles] !== undefined ? shuffledLanes[numObstacles] : lanes[0];

    // Spawn Word Hunt Letter! (Guaranteed to appear frequently)
    if (Math.random() < 0.7) {
      const letterChar = window.wordHunt ? window.wordHunt.getNextSpawnLetter() : "S";
      this.spawn3DLetter(freeLane, segmentZ + (Math.random() * 15 - 7), letterChar);
    }

    // Spawn Coin Line / Arcs
    this.spawnCoinArc(freeLane, segmentZ - 12);
  }

  spawnTrain(laneX, zPos, hasRamp = false) {
    const trainGroup = new THREE.Group();
    trainGroup.position.set(laneX, 0, zPos);

    const trainLen = 22;
    const trainW = 2.8;
    const trainH = 3.6;

    // Train Body
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xcc2222, // Subway Red
      roughness: 0.4,
      metalness: 0.3
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0xdde2e8, // Metallic Roof
      roughness: 0.3,
      metalness: 0.7
    });

    const bodyGeo = new THREE.BoxGeometry(trainW, trainH, trainLen);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = trainH / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    trainGroup.add(body);

    // Train Roof (flat surface you can run on!)
    const roofGeo = new THREE.BoxGeometry(trainW + 0.1, 0.25, trainLen + 0.1);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = trainH + 0.12;
    roof.receiveShadow = true;
    trainGroup.add(roof);

    // Front Windshield & Headlights
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x112233, roughness: 0.1 });
    const glassGeo = new THREE.BoxGeometry(trainW * 0.7, 1.0, 0.2);
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(0, trainH * 0.65, trainLen / 2 + 0.05);
    trainGroup.add(glass);

    // Glowing Yellow Headlights
    const lightGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.1, 12);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffea00 });

    const leftLight = new THREE.Mesh(lightGeo, lightMat);
    leftLight.rotation.x = Math.PI / 2;
    leftLight.position.set(-0.9, 0.9, trainLen / 2 + 0.06);
    trainGroup.add(leftLight);

    const rightLight = new THREE.Mesh(lightGeo, lightMat);
    rightLight.rotation.x = Math.PI / 2;
    rightLight.position.set(0.9, 0.9, trainLen / 2 + 0.06);
    trainGroup.add(rightLight);

    // Optional Climbable Ramp at the front
    if (hasRamp) {
      const rampGeo = new THREE.BoxGeometry(trainW, 0.25, 7.0);
      const ramp = new THREE.Mesh(rampGeo, roofMat);
      ramp.position.set(0, trainH / 2, trainLen / 2 + 3.2);
      ramp.rotation.x = Math.atan2(trainH, 7.0);
      ramp.receiveShadow = true;
      trainGroup.add(ramp);
    }

    trainGroup.userData = {
      type: "TRAIN",
      hasRamp,
      width: trainW,
      height: trainH,
      length: trainLen + (hasRamp ? 6.5 : 0),
      box: new THREE.Box3()
    };

    this.scene.add(trainGroup);
    this.obstacles.push(trainGroup);

    // Spawn coins on top of the train roof!
    if (Math.random() < 0.7) {
      for (let cZ = -trainLen / 2 + 2; cZ < trainLen / 2 - 2; cZ += 3.5) {
        this.spawnCoin(laneX, zPos + cZ, trainH + 1.2);
      }
    }
  }

  spawnHurdle(laneX, zPos) {
    const hurdleGroup = new THREE.Group();
    hurdleGroup.position.set(laneX, 0, zPos);

    // Striped yellow/black barrier (Jump over)
    const barGeo = new THREE.BoxGeometry(2.6, 0.35, 0.25);
    const barMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.4 });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.y = 0.9;
    bar.castShadow = true;
    hurdleGroup.add(bar);

    // Support legs
    const legGeo = new THREE.BoxGeometry(0.2, 1.1, 0.4);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-1.1, 0.55, 0);
    hurdleGroup.add(legL);

    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(1.1, 0.55, 0);
    hurdleGroup.add(legR);

    hurdleGroup.userData = {
      type: "HURDLE",
      height: 1.1,
      width: 2.6,
      depth: 0.5,
      requiresJump: true,
      box: new THREE.Box3()
    };

    this.scene.add(hurdleGroup);
    this.obstacles.push(hurdleGroup);
  }

  spawnDuckBarrier(laneX, zPos) {
    const duckGroup = new THREE.Group();
    duckGroup.position.set(laneX, 0, zPos);

    // High overhead arch bar (Must Slide / Duck under!)
    const archH = 2.9;
    const beamGeo = new THREE.BoxGeometry(2.8, 0.65, 0.35);
    const beamMat = new THREE.MeshStandardMaterial({ color: 0xff0044, roughness: 0.5 });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 1.95; // High up, room to duck
    beam.castShadow = true;
    duckGroup.add(beam);

    // Support posts
    const postGeo = new THREE.BoxGeometry(0.2, archH, 0.25);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x333333 });

    const postL = new THREE.Mesh(postGeo, postMat);
    postL.position.set(-1.25, archH / 2, 0);
    duckGroup.add(postL);

    const postR = new THREE.Mesh(postGeo, postMat);
    postR.position.set(1.25, archH / 2, 0);
    duckGroup.add(postR);

    duckGroup.userData = {
      type: "DUCK_BAR",
      clearanceY: 1.3, // Player head must be lower than this
      height: archH,
      width: 2.8,
      depth: 0.5,
      requiresSlide: true,
      box: new THREE.Box3()
    };

    this.scene.add(duckGroup);
    this.obstacles.push(duckGroup);
  }

  // --- Collectible Coins ---
  spawnCoin(x, z, y = 1.2) {
    if (!this.coinGeometry) {
      this.coinGeometry = new THREE.CylinderGeometry(0.48, 0.48, 0.12, 16);
    }

    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.85,
      roughness: 0.2,
      emissive: 0x553300
    });

    const coin = new THREE.Mesh(this.coinGeometry, coinMat);
    coin.rotation.z = Math.PI / 2;
    coin.position.set(x, y, z);
    coin.castShadow = true;

    coin.userData = {
      type: "COIN",
      value: 1,
      startY: y,
      timeOffset: Math.random() * 10
    };

    this.scene.add(coin);
    this.collectibles.push(coin);
  }

  spawnCoinArc(laneX, startZ) {
    const count = 5;
    for (let i = 0; i < count; i++) {
      const z = startZ - i * 2.5;
      const y = 1.1 + Math.sin((i / (count - 1)) * Math.PI) * 1.8;
      this.spawnCoin(laneX, z, y);
    }
  }

  // --- 3D Word Hunt Floating Letter ---
  spawn3DLetter(laneX, zPos, letterChar) {
    const letterGroup = new THREE.Group();
    letterGroup.position.set(laneX, 1.8, zPos);

    // Render letter onto high-resolution 2D Canvas texture
    let texture = this.letterTexturesCache[letterChar];
    if (!texture) {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");

      // Circular glowing gradient background
      const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 120);
      grad.addColorStop(0, "#ffe066");
      grad.addColorStop(0.7, "#ffaa00");
      grad.addColorStop(1, "#ff6600");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(128, 128, 110, 0, Math.PI * 2);
      ctx.fill();

      // Golden Rim
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(128, 128, 105, 0, Math.PI * 2);
      ctx.stroke();

      // Letter Text
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 130px 'Arial Black', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 6;
      ctx.fillText(letterChar, 128, 134);

      texture = new THREE.CanvasTexture(canvas);
      this.letterTexturesCache[letterChar] = texture;
    }

    // Double-sided 3D Disc
    const discGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.18, 24);
    const sideMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      metalness: 0.9,
      roughness: 0.15,
      emissive: 0x663300
    });
    const faceMat = new THREE.MeshBasicMaterial({ map: texture });

    const letterMesh = new THREE.Mesh(discGeo, [sideMat, faceMat, faceMat]);
    letterMesh.rotation.x = Math.PI / 2;
    letterMesh.castShadow = true;
    letterGroup.add(letterMesh);

    // Glowing Neon Aura Halo
    const haloGeo = new THREE.TorusGeometry(1.2, 0.08, 12, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.8
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    letterGroup.add(halo);

    letterGroup.userData = {
      type: "LETTER",
      letter: letterChar,
      startY: 1.8,
      letterMesh,
      halo,
      timeOffset: Math.random() * 10
    };

    this.scene.add(letterGroup);
    this.collectibles.push(letterGroup);
  }

  // --- Input Handlers ---
  setupKeyboardControls() {
    window.addEventListener("keydown", (e) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) {
        e.preventDefault();
      }

      if (!this.isPlaying) {
        if (e.key === "Enter" || e.key === " ") {
          this.start();
        }
        return;
      }

      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        this.togglePause();
        return;
      }

      if (this.isPaused) return;

      switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          this.setLane(this.currentLane - 1);
          break;
        case "ArrowRight":
        case "d":
        case "D":
          this.setLane(this.currentLane + 1);
          break;
        case "ArrowUp":
        case "w":
        case "W":
        case " ":
          this.jump();
          break;
        case "ArrowDown":
        case "s":
        case "S":
          this.slide();
          break;
      }
    });
  }

  setupTouchControls() {
    let startTouchX = 0;
    let startTouchY = 0;
    const threshold = 35;

    window.addEventListener("touchstart", (e) => {
      if (e.touches.length > 0) {
        startTouchX = e.touches[0].clientX;
        startTouchY = e.touches[0].clientY;
      }
    }, { passive: true });

    window.addEventListener("touchend", (e) => {
      if (!this.isPlaying || this.isPaused || e.changedTouches.length === 0) return;

      const diffX = e.changedTouches[0].clientX - startTouchX;
      const diffY = e.changedTouches[0].clientY - startTouchY;

      if (Math.abs(diffX) > Math.abs(diffY)) {
        // Horizontal swipe
        if (diffX > threshold) {
          this.setLane(this.currentLane + 1);
        } else if (diffX < -threshold) {
          this.setLane(this.currentLane - 1);
        }
      } else {
        // Vertical swipe
        if (diffY < -threshold) {
          this.jump();
        } else if (diffY > threshold) {
          this.slide();
        }
      }
    }, { passive: true });
  }

  setLane(lane) {
    const clampedLane = Math.max(-1, Math.min(1, lane));
    if (clampedLane !== this.currentLane) {
      this.currentLane = clampedLane;
      this.targetX = this.currentLane * this.laneWidth;
      if (window.soundEngine) {
        window.soundEngine.playLaneSwitch();
      }
    }
  }

  setGameSpeed(mode = "normal") {
    if (mode === "relaxed" || mode === "slow") {
      this.speedMode = "relaxed";
      this.baseSpeed = 9.5;
      this.maxSpeed = 15.0;
      this.jumpVelocity = 13.0;
      this.gravity = -28;
    } else if (mode === "fast") {
      this.speedMode = "fast";
      this.baseSpeed = 17.0;
      this.maxSpeed = 26.0;
      this.jumpVelocity = 16.0;
      this.gravity = -40;
    } else {
      // Normal (Default gentle pace)
      this.speedMode = "normal";
      this.baseSpeed = 12.5;
      this.maxSpeed = 20.0;
      this.jumpVelocity = 14.2;
      this.gravity = -32;
    }
    this.currentSpeed = this.baseSpeed;
    this.updateHUD();
    return this.speedMode;
  }

  jump() {
    if (this.isGrounded) {
      const v = this.powerups.sneakers.active ? this.superJumpVelocity : this.jumpVelocity;
      this.velocityY = v;
      this.isGrounded = false;
      this.isJumping = true;
      this.isSliding = false;

      if (window.soundEngine) {
        window.soundEngine.playJump();
      }
    }
  }

  slide() {
    this.isSliding = true;
    this.slideTimer = this.slideDuration;

    // Fast-drop if in air
    if (!this.isGrounded) {
      this.velocityY = -28;
    }

    if (window.soundEngine) {
      window.soundEngine.playSlide();
    }
  }

  // --- Game Lifecycle ---
  start() {
    this.isPlaying = true;
    this.isPaused = false;
    this.isGameOver = false;

    this.score = 0;
    this.coins = 0;
    this.multiplier = 1;
    this.distanceTraveled = 0;
    this.currentSpeed = this.baseSpeed;
    this.currentLane = 0;
    this.targetX = 0;
    this.playerX = 0;
    this.playerY = 0;
    this.playerZ = 0;
    this.velocityY = 0;
    this.isGrounded = true;

    // Reset powerups
    Object.keys(this.powerups).forEach(key => {
      this.powerups[key].active = false;
      this.powerups[key].timer = 0;
    });

    // Reset Word Hunt
    if (window.wordHunt) {
      window.wordHunt.startNewWord();
    }

    // Clean up existing obstacles and collectibles
    this.clearAllObstaclesAndCollectibles();

    // Reset track segments
    this.trackSegments.forEach((segment, idx) => {
      segment.position.z = -idx * this.trackLength;
      if (segment.position.z < -this.trackLength) {
        this.populateTrackSegment(segment.position.z);
      }
    });

    this.updateHUD();

    // UI visibility
    const startMenu = document.getElementById("start-menu");
    const gameOverMenu = document.getElementById("game-over-menu");
    const hud = document.getElementById("game-hud");
    if (startMenu) startMenu.classList.add("hidden");
    if (gameOverMenu) gameOverMenu.classList.add("hidden");
    if (hud) hud.classList.remove("hidden");

    if (window.soundEngine) {
      window.soundEngine.ensureContext();
      window.soundEngine.playStartWhistle();
      window.soundEngine.startBGM();
    }
  }

  togglePause() {
    if (!this.isPlaying || this.isGameOver) return;
    this.isPaused = !this.isPaused;
    const pauseMenu = document.getElementById("pause-menu");
    if (pauseMenu) {
      if (this.isPaused) pauseMenu.classList.remove("hidden");
      else pauseMenu.classList.add("hidden");
    }
  }

  gameOver() {
    this.isPlaying = false;
    this.isGameOver = true;

    if (window.soundEngine) {
      window.soundEngine.playCrash();
    }

    if (this.score > this.highScore) {
      this.highScore = Math.floor(this.score);
      localStorage.setItem("subway_high_score", this.highScore.toString());
    }

    // Trigger Screen Shake
    this.triggerScreenShake();

    setTimeout(() => {
      const gameOverMenu = document.getElementById("game-over-menu");
      const finalScoreEl = document.getElementById("final-score");
      const finalCoinsEl = document.getElementById("final-coins");
      const finalHighEl = document.getElementById("final-highscore");
      const wordStatsEl = document.getElementById("final-word-stats");

      if (finalScoreEl) finalScoreEl.textContent = Math.floor(this.score).toLocaleString();
      if (finalCoinsEl) finalCoinsEl.textContent = this.coins.toLocaleString();
      if (finalHighEl) finalHighEl.textContent = this.highScore.toLocaleString();

      if (wordStatsEl && window.wordHunt) {
        wordStatsEl.textContent = `Words Completed: ${window.wordHunt.wordsCompletedCount}`;
      }

      if (gameOverMenu) gameOverMenu.classList.remove("hidden");
    }, 600);
  }

  clearAllObstaclesAndCollectibles() {
    this.obstacles.forEach(o => this.scene.remove(o));
    this.obstacles = [];
    this.collectibles.forEach(c => this.scene.remove(c));
    this.collectibles = [];
  }

  // --- Main Update Loop ---
  loop() {
    requestAnimationFrame(this.loop);

    const delta = Math.min(this.clock.getDelta(), 0.1);

    if (this.isPlaying && !this.isPaused) {
      this.updatePhysics(delta);
      this.updateEnvironment(delta);
      this.updateCollectibles(delta);
      this.checkCollisions();
      this.updateCharacterAnimation(delta);
      this.updateCamera(delta);
      this.updateScore(delta);
    }

    this.renderer.render(this.scene, this.camera);
  }

  // --- Physics: Smooth Lane Switching, Jump & Gravity ---
  updatePhysics(delta) {
    // Smooth lane transition (Interpolate playerX to targetX)
    const diffX = this.targetX - this.playerX;
    this.playerX += diffX * Math.min(1, 14 * delta);

    // Check if player is running atop a train!
    let detectedRoofY = 0;
    const playerBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(this.playerX, this.playerY + 1.2, this.playerZ),
      new THREE.Vector3(1.2, 2.4, 1.2)
    );

    for (const obstacle of this.obstacles) {
      if (obstacle.userData.type === "TRAIN") {
        const u = obstacle.userData;
        const trainZ = obstacle.position.z;
        const trainX = obstacle.position.x;

        // Is player within X and Z bounds of this train?
        if (Math.abs(this.playerX - trainX) < u.width / 2 + 0.3 &&
            this.playerZ < trainZ + u.length / 2 &&
            this.playerZ > trainZ - u.length / 2) {

          // If player's feet are above or near the train roof, land on it!
          if (this.playerY >= u.height - 0.5) {
            detectedRoofY = u.height + 0.1;
          }
        }
      }
    }

    this.currentGroundY = detectedRoofY;

    // Vertical Physics (Jump & Gravity)
    if (!this.isGrounded) {
      this.velocityY += this.gravity * delta;
      this.playerY += this.velocityY * delta;

      if (this.playerY <= this.currentGroundY) {
        this.playerY = this.currentGroundY;
        this.velocityY = 0;
        this.isGrounded = true;
        this.isJumping = false;
      }
    } else {
      // If we walk off a train, start falling
      if (this.playerY > this.currentGroundY) {
        this.isGrounded = false;
        this.velocityY = 0;
      } else {
        this.playerY = this.currentGroundY;
      }
    }

    // Slide / Roll Timer
    if (this.isSliding) {
      this.slideTimer -= delta;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
      }
    }

    // Update player group position
    this.playerGroup.position.set(this.playerX, this.playerY, this.playerZ);

    // Update shadow
    if (this.playerShadow) {
      this.playerShadow.position.set(this.playerX, this.currentGroundY + 0.03, this.playerZ);
      const heightAboveGround = this.playerY - this.currentGroundY;
      const shadowScale = Math.max(0.4, 1.0 - heightAboveGround * 0.15);
      this.playerShadow.scale.set(shadowScale, shadowScale, 1);
    }
  }

  // --- Track Scrolling & Recycling ---
  updateEnvironment(delta) {
    const moveZ = this.currentSpeed * delta;
    this.distanceTraveled += moveZ;

    // Move track segments backwards
    this.trackSegments.forEach((segment) => {
      segment.position.z += moveZ;
    });

    // Move obstacles & collectibles backwards
    this.obstacles.forEach((obs) => {
      obs.position.z += moveZ;
    });

    this.collectibles.forEach((col) => {
      col.position.z += moveZ;
    });

    // Check if front segment has passed behind camera
    const frontSegment = this.trackSegments[0];
    if (frontSegment.position.z > this.trackLength) {
      // Move to back
      const lastSegment = this.trackSegments[this.trackSegments.length - 1];
      frontSegment.position.z = lastSegment.position.z - this.trackLength;

      // Rotate array
      this.trackSegments.push(this.trackSegments.shift());

      // Spawn new obstacles & collectibles for this recycled segment
      this.populateTrackSegment(frontSegment.position.z);
    }

    // Clean up obstacles that passed behind the player
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      if (obs.position.z > 25) {
        this.scene.remove(obs);
        this.obstacles.splice(i, 1);
      }
    }

    // Clean up collectibles that passed behind
    for (let i = this.collectibles.length - 1; i >= 0; i--) {
      const col = this.collectibles[i];
      if (col.position.z > 25) {
        this.scene.remove(col);
        this.collectibles.splice(i, 1);
      }
    }

    // Gradually ramp up speed very gently
    if (this.currentSpeed < this.maxSpeed) {
      this.currentSpeed += 0.05 * delta;
    }
  }

  // --- Collectible Animations & Coin Magnet ---
  updateCollectibles(delta) {
    const time = this.clock.getElapsedTime();

    this.collectibles.forEach((col) => {
      const u = col.userData;

      if (u.type === "COIN") {
        // Spin and gentle bobbing
        col.rotation.y += 4.5 * delta;
        col.position.y = u.startY + Math.sin(time * 5 + u.timeOffset) * 0.15;

        // Magnet attraction
        if (this.powerups.magnet.active) {
          const dist = col.position.distanceTo(this.playerGroup.position);
          if (dist < 14) {
            col.position.lerp(this.playerGroup.position, 10 * delta);
          }
        }
      } else if (u.type === "LETTER") {
        // Spin 3D Letter & bobbing
        col.rotation.y += 3.2 * delta;
        col.position.y = u.startY + Math.sin(time * 4 + u.timeOffset) * 0.22;
        if (u.halo) {
          u.halo.rotation.z += 2.0 * delta;
        }
      }
    });
  }

  // --- Collision Detection ---
  checkCollisions() {
    const playerRadius = 0.55;
    const playerHeight = this.isSliding ? 0.7 : 2.2;
    const playerBottom = this.playerY;
    const playerTop = this.playerY + playerHeight;

    // 1. Collectibles Check
    for (let i = this.collectibles.length - 1; i >= 0; i--) {
      const col = this.collectibles[i];
      const dist = col.position.distanceTo(new THREE.Vector3(this.playerX, this.playerY + 1.0, this.playerZ));

      if (dist < 1.45) {
        // Collected!
        const u = col.userData;
        if (u.type === "COIN") {
          this.coins += this.powerups.multiplier2x.active ? 2 : 1;
          this.addScore(25);
          if (window.soundEngine) window.soundEngine.playCoin();
          this.triggerCoinPopParticle(col.position);
        } else if (u.type === "LETTER") {
          if (window.wordHunt) {
            window.wordHunt.collectLetter(u.letter);
          }
        }

        this.scene.remove(col);
        this.collectibles.splice(i, 1);
        this.updateHUD();
      }
    }

    // 2. Obstacles Collision Check
    for (const obstacle of this.obstacles) {
      const u = obstacle.userData;
      const obsZ = obstacle.position.z;
      const obsX = obstacle.position.x;

      if (u.type === "TRAIN") {
        // Train collision
        const inLane = Math.abs(this.playerX - obsX) < u.width / 2 + 0.25;
        const inZRange = (this.playerZ < obsZ + u.length / 2) && (this.playerZ > obsZ - u.length / 2);

        if (inLane && inZRange) {
          // If feet are lower than train roof, CRASH!
          if (this.playerY < u.height - 0.4) {
            // Check if hoverboard shields the hit
            if (this.powerups.hoverboard.active) {
              this.powerups.hoverboard.active = false;
              this.hoverboardMesh.visible = false;
              this.triggerScreenShake();
              obstacle.position.z += 10; // Bounce away
              return;
            }
            this.gameOver();
            return;
          }
        }
      } else if (u.type === "HURDLE") {
        // Low barrier: Must JUMP over
        const inLane = Math.abs(this.playerX - obsX) < u.width / 2;
        const inZ = Math.abs(this.playerZ - obsZ) < 0.6;

        if (inLane && inZ) {
          if (playerBottom < u.height - 0.2) {
            if (this.powerups.hoverboard.active) {
              this.powerups.hoverboard.active = false;
              this.hoverboardMesh.visible = false;
              this.triggerScreenShake();
              this.scene.remove(obstacle);
              return;
            }
            this.gameOver();
            return;
          }
        }
      } else if (u.type === "DUCK_BAR") {
        // High barrier: Must SLIDE / DUCK under
        const inLane = Math.abs(this.playerX - obsX) < u.width / 2;
        const inZ = Math.abs(this.playerZ - obsZ) < 0.6;

        if (inLane && inZ) {
          if (playerTop > u.clearanceY) {
            if (this.powerups.hoverboard.active) {
              this.powerups.hoverboard.active = false;
              this.hoverboardMesh.visible = false;
              this.triggerScreenShake();
              this.scene.remove(obstacle);
              return;
            }
            this.gameOver();
            return;
          }
        }
      }
    }
  }

  // --- Procedural Character Animations ---
  updateCharacterAnimation(delta) {
    if (!this.characterLimbs.torso) return;

    const { torso, head, leftArm, rightArm, leftLeg, rightLeg } = this.characterLimbs;

    if (this.isSliding) {
      // Squish down into slide/roll posture
      this.playerGroup.scale.set(1.2, 0.45, 1.2);
      torso.rotation.x = 0.5;
      leftLeg.rotation.x = -1.2;
      rightLeg.rotation.x = -1.2;
      leftArm.rotation.x = -0.5;
      rightArm.rotation.x = -0.5;
    } else {
      this.playerGroup.scale.set(1, 1, 1);

      if (this.isJumping) {
        // Jump pose: legs tucked up, arms outstretched
        torso.rotation.x = 0.1;
        leftLeg.rotation.x = 0.6;
        rightLeg.rotation.x = 0.4;
        leftArm.rotation.x = -1.2;
        rightArm.rotation.x = -1.2;
      } else {
        // Running cycle
        this.runCycle += delta * (this.currentSpeed * 0.7);
        const legAngle = Math.sin(this.runCycle) * 0.75;
        const armAngle = -Math.sin(this.runCycle) * 0.75;

        leftLeg.rotation.x = legAngle;
        rightLeg.rotation.x = -legAngle;
        leftArm.rotation.x = armAngle;
        rightArm.rotation.x = -armAngle;

        // Subtle torso bounce & lean into turns
        torso.position.y = 1.35 + Math.abs(Math.sin(this.runCycle * 2)) * 0.08;
        const laneLean = (this.targetX - this.playerX) * -0.15;
        this.playerGroup.rotation.z = THREE.MathUtils.lerp(this.playerGroup.rotation.z, laneLean, 0.2);
      }
    }
  }

  // --- Dynamic Camera Following ---
  updateCamera(delta) {
    const targetCamX = this.playerX * 0.65;
    const targetCamY = this.playerY + this.cameraOffset.y;
    const targetCamZ = this.playerZ + this.cameraOffset.z;

    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetCamX, 10 * delta);
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetCamY, 12 * delta);
    this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, targetCamZ, 12 * delta);

    const lookTarget = new THREE.Vector3(
      this.playerX * 0.4,
      this.playerY + this.cameraLookOffset.y,
      this.playerZ + this.cameraLookOffset.z
    );
    this.camera.lookAt(lookTarget);
  }

  // --- Scoring & HUD Updates ---
  addScore(amount) {
    this.score += amount * this.multiplier * (this.powerups.multiplier2x.active ? 2 : 1);
  }

  updateScore(delta) {
    this.addScore(this.currentSpeed * delta * 2.5);
    this.updateHUD();
  }

  updateHUD() {
    const scoreEl = document.getElementById("hud-score");
    const coinsEl = document.getElementById("hud-coins");
    const multEl = document.getElementById("hud-multiplier");
    const speedEl = document.getElementById("hud-speed");

    if (scoreEl) scoreEl.textContent = Math.floor(this.score).toLocaleString();
    if (coinsEl) coinsEl.textContent = this.coins.toLocaleString();
    if (multEl) multEl.textContent = `${this.multiplier * (this.powerups.multiplier2x.active ? 2 : 1)}X`;
    if (speedEl) speedEl.textContent = `${Math.floor(this.currentSpeed * 2.5)} km/h`;
  }

  // --- Visual Effects & Celebrations ---
  triggerCoinPopParticle(pos) {
    // Canvas floating text toast or subtle particle
    const toast = document.createElement("div");
    toast.className = "floating-coin-toast";
    toast.textContent = "+1 🪙";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 700);
  }

  triggerLetterFlyEffect(letter) {
    const toast = document.createElement("div");
    toast.className = "letter-collected-banner";
    toast.innerHTML = `<span>⭐ LETTER FOUND!</span> <strong>[ ${letter} ]</strong>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1600);
  }

  triggerWordCompleteCelebration(word, bonusCoins) {
    const banner = document.createElement("div");
    banner.className = "word-complete-modal";
    banner.innerHTML = `
      <div class="word-complete-card">
        <div class="glow-title">✨ WORD HUNT COMPLETED! ✨</div>
        <div class="target-word-display">${word}</div>
        <div class="reward-coins">+${bonusCoins.toLocaleString()} BONUS COINS!</div>
        <div class="reward-box">🎁 SUPER MYSTERY PRIZE UNLOCKED!</div>
      </div>
    `;
    document.body.appendChild(banner);

    this.triggerScreenShake(0.8);

    setTimeout(() => {
      banner.classList.add("fade-out");
      setTimeout(() => banner.remove(), 500);
    }, 2800);
  }

  triggerScreenShake(duration = 0.35) {
    const origPos = this.camera.position.clone();
    const startTime = Date.now();

    const shakeInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed > duration) {
        clearInterval(shakeInterval);
        return;
      }
      const intensity = (1 - elapsed / duration) * 0.45;
      this.camera.position.x += (Math.random() - 0.5) * intensity;
      this.camera.position.y += (Math.random() - 0.5) * intensity;
    }, 16);
  }

  onWindowResize() {
    if (!this.container || !this.camera || !this.renderer) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}

window.subwayGame = new SubwaySurfersGame();
