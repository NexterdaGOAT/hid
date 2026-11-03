// --- INITIAL CANVAS & UI CONFIGURATION ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');

const MAP_SIZE = 16;
let currentLevel = 1;
let gameState = 'START_SCREEN'; // START_SCREEN, PLAYING, JUMPSCARE, GAMEOVER, WIN
let jumpscareTimer = 0; // New timer to track head-biting cinematic frames

const baseMapLayout = [
    "1111111111111111",
    "1000000100000001",
    "1011010101111101",
    "1010010000000101",
    "1011110111100101",
    "1000000100000101",
    "1011110101111101",
    "1010000000000001",
    "1010111111111001",
    "1010100000001001",
    "1000101111001001",
    "1111101001011001",
    "1000001001000001",
    "1111001111011111",
    "1000000000000001",
    "1111111111111111"
];

let islandMap = [];
let player = { 
    x: 1.5, 
    y: 1.5, 
    angle: 0.5, 
    fov: Math.PI / 3, 
    speed: 0.05, 
    isShooting: false, 
    weaponRecoil: 0, 
    ammo: 7,
    maxAmmo: 7,
    isReloading: false,
    reloadTimer: 0
};

// Andy config: Tailored as a tall, lanky 6th-grade boy
let andy = { x: 14.5, y: 14.5, speed: 0.024, state: 'hunting', stunTimer: 0, heightModifier: 1.45, widthModifier: 0.40 };
let batteries = [];
let keys = {};
let score = 0;

// --- LEVEL INITIALIZATION ---
function initializeLevel(level) {
    score = 0;
    if(scoreEl) scoreEl.innerText = score;
    if(levelEl) levelEl.innerText = level;
    
    player.x = 1.5; player.y = 1.5; player.angle = 0.5; player.ammo = player.maxAmmo;
    player.isReloading = false; player.reloadTimer = 0;
    andy.x = 14.5; andy.y = 14.5; andy.state = 'hunting';
    
    // EASIER EARLY LEVELS: Andy moves much slower on early levels, ramping up heavily later!
    if (level === 1) {
        andy.speed = 0.012; // Very slow, easy to manage and outrun
    } else if (level === 2) {
        andy.speed = 0.018; // Moderate speed
    } else {
        andy.speed = 0.022 + (level * 0.005); // Original aggressive curve for hard levels
    }

    islandMap = [];
    for(let r = 0; r < MAP_SIZE; r++) {
        let row = [];
        for(let c = 0; c < MAP_SIZE; c++) {
            row.push(parseInt(baseMapLayout[r][c]));
        }
        islandMap.push(row);
    }

    // FIXED EASY SPINS: Kept simple layouts for Levels 1 and 2
    batteries = [];
    if (level === 1) {
        batteries = [{x: 1.5, y: 13.5, collected: false}, {x: 13.5, y: 1.5, collected: false}, {x: 8.5, y: 9.5, collected: false}];
    } else if (level === 2) {
        batteries = [{x: 6.5, y: 7.5, collected: false}, {x: 14.5, y: 7.5, collected: false}, {x: 1.5, y: 14.5, collected: false}];
    } else {
        let possiblePositions = [
            {x: 4.5, y: 9.5}, {x: 12.5, y: 13.5}, {x: 14.5, y: 3.5},
            {x: 6.5, y: 1.5}, {x: 1.5, y: 5.5}, {x: 9.5, y: 12.5}
        ];
        for(let i=0; i<3; i++) {
            let index = Math.floor(Math.random() * possiblePositions.length);
            let pos = possiblePositions.splice(index, 1)[0];
            batteries.push({x: pos.x, y: pos.y, collected: false});
        }
    }
}
initializeLevel(currentLevel);

// --- INPUT & EVENT LISTENERS ---
canvas.addEventListener('click', () => {
    if (gameState !== 'PLAYING') return;
    canvas.focus();
    if (!document.pointerLockElement) {
        canvas.requestPointerLock();
    } else {
        if (player.isShooting || player.ammo <= 0 || player.isReloading) return;
        fireWeapon();
    }
});

document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas && gameState === 'PLAYING') {
        player.angle += e.movementX * 0.0025;
    }
});

window.addEventListener('keydown', e => {
    let pressedKey = e.key.toLowerCase();
    keys[pressedKey] = true;
    
    // Trigger reload when 'R' is pressed, if not already full or reloading
    if (pressedKey === 'r' && gameState === 'PLAYING') {
        if (!player.isReloading && player.ammo < player.maxAmmo) {
            player.isReloading = true;
            player.reloadTimer = 90; // Takes 90 frames (~1.5 seconds) to reload
        }
    }
    
    if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (gameState === 'START_SCREEN') {
            gameState = 'PLAYING';
            canvas.requestPointerLock();
        } else if (gameState === 'GAMEOVER') {
            currentLevel = 1;
            initializeLevel(currentLevel);
            gameState = 'PLAYING';
            canvas.requestPointerLock();
        } else if (gameState === 'WIN') {
            currentLevel++;
            initializeLevel(currentLevel);
            gameState = 'PLAYING';
            canvas.requestPointerLock();
        }
    }
});

window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// --- WEAPON SYSTEM ---
function fireWeapon() {
    if (player.isReloading) return; // Prevent shooting while reloading!
    
    player.isShooting = true;
    player.weaponRecoil = 40;
    player.ammo--;
    
    let dx = andy.x - player.x;
    let dy = andy.y - player.y;
    let angleToAndy = Math.atan2(dy, dx) - player.angle;
    
    while (angleToAndy < -Math.PI) angleToAndy += Math.PI * 2;
    while (angleToAndy > Math.PI) angleToAndy -= Math.PI * 2;
    
    let dist = Math.hypot(dx, dy);
    if (Math.abs(angleToAndy) < 0.15 && dist < 9 && andy.state !== 'stunned') {
        andy.state = 'stunned';
        andy.stunTimer = 150; 
    }
}

// --- STATE MACHINE UPDATE ENGINE ---
function update() {
    // Progress jumpscare counters if triggered
    if (gameState === 'JUMPSCARE') {
        jumpscareTimer--;
        if (jumpscareTimer <= 0) {
            gameState = 'GAMEOVER';
        }
        return;
    }

    if (gameState !== 'PLAYING') return;

    let ax = player.x - andy.x, ay = player.y - andy.y;
    let distToAndy = Math.hypot(ax, ay);

    let activePlayerSpeed = player.speed;
    if (distToAndy < 2.5 && andy.state !== 'stunned') {
        activePlayerSpeed = player.speed * 0.65; // Fear slow-down modifier
    }

    let moveX = 0, moveY = 0;
    if (keys['w']) { moveX += Math.cos(player.angle) * activePlayerSpeed; moveY += Math.sin(player.angle) * activePlayerSpeed; }
    if (keys['s']) { moveX -= Math.cos(player.angle) * activePlayerSpeed; moveY -= Math.sin(player.angle) * activePlayerSpeed; }
    if (keys['a']) { moveX += Math.sin(player.angle) * activePlayerSpeed; moveY -= Math.cos(player.angle) * activePlayerSpeed; }
    if (keys['d']) { moveX -= Math.sin(player.angle) * activePlayerSpeed; moveY += Math.cos(player.angle) * activePlayerSpeed; }

    if (islandMap[Math.floor(player.y)][Math.floor(player.x + moveX)] === 0) player.x += moveX;
    if (islandMap[Math.floor(player.y + moveY)][Math.floor(player.x)] === 0) player.y += moveY;

    if (player.isShooting) {
        player.weaponRecoil -= 4;
        if (player.weaponRecoil <= 0) { player.weaponRecoil = 0; player.isShooting = false; }
    }

    // Handle Weapon Reload Progression
    if (player.isReloading) {
        player.reloadTimer--;
        if (player.reloadTimer <= 0) {
            player.ammo = player.maxAmmo;
            player.isReloading = false;
        }
    }

    for (let bat of batteries) {
        if (!bat.collected && Math.hypot(player.x - bat.x, player.y - bat.y) < 0.45) {
            bat.collected = true;
            score++;
            if(scoreEl) scoreEl.innerText = score;
            if (score === 3) {
                gameState = 'WIN';
                document.exitPointerLock();
                return;
            }
        }
    }

    if (andy.state === 'stunned') {
        andy.stunTimer--;
        if (andy.stunTimer <= 0) andy.state = 'hunting';
    } else {
        let activeAndySpeed = andy.speed;
        if (distToAndy < 2.5) activeAndySpeed = andy.speed * 1.60; // Behind you sprint velocity boost!

        let ang = Math.atan2(ay, ax);
        let nax = andy.x + Math.cos(ang) * activeAndySpeed;
        let nay = andy.y + Math.sin(ang) * activeAndySpeed;
        if (islandMap[Math.floor(andy.y)][Math.floor(nax)] === 0) andy.x = nax;
        if (islandMap[Math.floor(nay)][Math.floor(andy.x)] === 0) andy.y = nay;
    }

    // Caught trigger transitions directly to the custom head-bite sequence
    if (distToAndy < 0.38) {
        gameState = 'JUMPSCARE';
        jumpscareTimer = 180; // 3 Seconds animation budget at 60 FPS
        document.exitPointerLock();
        return;
    }
}

// --- GRAPHICS RENDERING SYSTEM ---
function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (gameState === 'START_SCREEN') {
        ctx.fillStyle = '#100a05'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#050508'; ctx.fillRect(320, 150, 160, 300);
        ctx.fillStyle = '#e5cbbd'; ctx.fillRect(370, 180, 60, 60); 
        ctx.fillStyle = '#ffffff'; ctx.fillRect(385, 205, 6, 4); ctx.fillRect(410, 205, 6, 4); // Glowing eyes
        ctx.fillStyle = '#1a1a24'; ctx.fillRect(340, 240, 120, 210); // Tall hoodie frame build

        ctx.fillStyle = '#ff1111'; ctx.font = 'bold 36px Courier New'; ctx.textAlign = 'center';
        ctx.fillText("ANDY'S FACTORY", canvas.width / 2, 90);
        
        ctx.fillStyle = '#ffffff'; ctx.font = '14px Courier New';
        ctx.fillText("Andy is a tall, lanky 6th grader stalking the facility corridors.", canvas.width / 2, 480);
        ctx.fillText("Find all 3 hidden batteries. When he screams right behind you, DON'T PANIC.", canvas.width / 2, 510);
        
        ctx.fillStyle = '#00ffff'; ctx.font = 'bold 18px Courier New';
        ctx.fillText("PRESS [SPACEBAR] TO DEPLOY TACTICAL OPERATOR", canvas.width / 2, 560);
        return;
    }

    if (gameState === 'GAMEOVER') {
        ctx.fillStyle = '#ff1111'; ctx.font = 'bold 36px Courier New'; ctx.textAlign = 'center';
ctx.fillText("ANDY CAUGHT YOU", canvas.width / 2, canvas.height / 2 - 20);
ctx.fillStyle = '#ffffff'; ctx.font = '16px Courier New';
ctx.fillText(Failed on Escape Level ${currentLevel}, canvas.width / 2, canvas.height / 2 + 20);
ctx.fillText("PRESS [SPACEBAR] TO RESTART ENTIRE MISSION", canvas.width / 2, canvas.height / 2 + 60);
return;
}
if (gameState === 'WIN') {
ctx.fillStyle = '#00ff66'; ctx.font = 'bold 36px Courier New'; ctx.textAlign = 'center';
ctx.fillText("FACTORY ESCAPED!", canvas.width / 2, canvas.height / 2 - 20);
ctx.fillStyle = '#ffffff'; ctx.font = '16px Courier New';
ctx.fillText(Level ${currentLevel} cleared. Next deployment will be much harder., canvas.width / 2, canvas.height / 2 + 20);
ctx.fillText("PRESS [SPACEBAR] FOR NEXT LOCATIONS LEVEL", canvas.width / 2, canvas.height / 2 + 60);
return;
}
// --- CINEMATIC HEAD-BITE JUMPSCARE ANIMATION FRAME ---
if (gameState === 'JUMPSCARE') {
ctx.fillStyle = '#050202';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.textAlign = 'center';
if (jumpscareTimer > 120) {
// STAGE 1: Andy lunges forward and hoists the screen up
let scaleOffset = (180 - jumpscareTimer) * 4;
ctx.fillStyle = '#1a1a24'; // Towering dark hoodie structure
ctx.fillRect(150 - scaleOffset, 50, canvas.width - 300 + (scaleOffset * 2), canvas.height);
ctx.fillStyle = '#e5cbbd'; // Approaching face box
ctx.fillRect(250 - scaleOffset, 100, canvas.width - 500 + (scaleOffset * 2), 200 + scaleOffset);
ctx.fillStyle = '#ff1111'; // Piercing wide eyes
ctx.fillRect(320 - scaleOffset, 180, 25 + scaleOffset * 0.1, 20);
ctx.fillRect(455 + scaleOffset, 180, 25 + scaleOffset * 0.1, 20);
ctx.fillStyle = '#ff3333';
ctx.font = 'bold 28px Courier New';
ctx.fillText("ANDY PICKS YOU UP...", canvas.width / 2, canvas.height - 80);
} else if (jumpscareTimer > 30) {
// STAGE 2: Blood splatter profile overlay and head decapitation chomp lines
ctx.fillStyle = '#4a0000'; // Bloodstained frame
ctx.fillRect(0, 0, canvas.width, canvas.height);
// Jagged pitch black teeth/jaws closing together
let biteCloseness = (120 - jumpscareTimer) * 4.5;
ctx.fillStyle = '#000000';
ctx.fillRect(0, 0, canvas.width, 140 + biteCloseness);
ctx.fillRect(0, canvas.height - (140 + biteCloseness), canvas.width, canvas.height);
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 54px Courier New';
ctx.fillText("* CHOMP *", canvas.width / 2, canvas.height / 2 - 15);
ctx.fillStyle = '#ff2222';
ctx.font = 'bold 22px Courier New';
ctx.fillText("HE BIT YOUR HEAD OFF!", canvas.width / 2, canvas.height / 2 + 45);
} else {
// STAGE 3: Total blackout decay transition frames
ctx.fillStyle = '#000000';
ctx.fillRect(0, 0, canvas.width, canvas.height);
}
return;
}
// --- 3D FIRST-PERSON GRAPHICS RENDERING SYSTEM ---
ctx.fillStyle = '#050c05'; ctx.fillRect(0, 0, canvas.width, canvas.height / 2);
ctx.fillStyle = '#140f0b'; ctx.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2);
let depthBuffer = [];
const numRays = canvas.width;
for (let i = 0; i < numRays; i++) {
let rayAngle = (player.angle - player.fov / 2) + (i / numRays) * player.fov;
let distanceToWall = 0; let hitWall = false;
let eyeX = Math.cos(rayAngle), eyeY = Math.sin(rayAngle);
while (!hitWall && distanceToWall < 16) {
distanceToWall += 0.035;
let checkX = Math.floor(player.x + eyeX * distanceToWall);
let checkY = Math.floor(player.y + eyeY * distanceToWall);
if (checkX < 0 || checkX >= MAP_SIZE || checkY < 0 || checkY >= MAP_SIZE) {
hitWall = true; distanceToWall = 16;
} else if (islandMap[checkY][checkX] > 0) {
hitWall = true;
}
}
let correctedDist = distanceToWall * Math.cos(rayAngle - player.angle);
depthBuffer.push(correctedDist);
let ceiling = (canvas.height / 2) - (canvas.height / correctedDist);
let floor = canvas.height - ceiling;
let wallHeight = floor - ceiling;
let brightness = Math.max(0, 1 - (correctedDist / 12));
// Smooth Steel Wall Renderer
ctx.fillStyle = rgba(130, 138, 145, ${brightness});
ctx.fillRect(i, ceiling, 1, wallHeight);
// Clean vertical steel panel grooves every 80px instead of random lines
if (i % 80 === 0) {
ctx.fillStyle = rgba(50, 54, 57, ${brightness * 1.1});
ctx.fillRect(i, ceiling, 2, wallHeight);
}
}
let sprites = [];
for (let bat of batteries) { if (!bat.collected) sprites.push({ x: bat.x, y: bat.y, type: 'battery' }); }
sprites.push({ x: andy.x, y: andy.y, type: 'andy' });
sprites.sort((a, b) => Math.hypot(player.x - b.x, player.y - b.y) - Math.hypot(player.x - a.x, player.y - a.y));
sprites.forEach(sprite => {
let sx = sprite.x - player.x, sy = sprite.y - player.y;
let spriteAngle = Math.atan2(sy, sx) - player.angle;
while (spriteAngle < -Math.PI) spriteAngle += Math.PI * 2;
while (spriteAngle > Math.PI) spriteAngle -= Math.PI * 2;
let dist = Math.hypot(sx, sy);
if (dist < 0.15 || Math.abs(spriteAngle) > player.fov) return;
let spriteSize = Math.abs(canvas.height / dist);
let spriteScreenX = (canvas.width / 2) + (Math.tan(spriteAngle) * (canvas.width / 2)) - (spriteSize / 2);
let spriteScreenY = (canvas.height / 2) - (spriteSize / 2);
let alpha = Math.max(0, 1 - (dist / 11));
if (sprite.type === 'andy') {
let tallHeight = spriteSize * andy.heightModifier;
let narrowWidth = spriteSize * andy.widthModifier;
let tallScreenY = (canvas.height / 2) - (tallHeight / 1.6);
let adjustedScreenX = (canvas.width / 2) + (Math.tan(spriteAngle) * (canvas.width / 2)) - (narrowWidth / 2);
for (let col = 0; col < narrowWidth; col++) {
let pixelX = Math.floor(adjustedScreenX + col);
if (pixelX >= 0 && pixelX < canvas.width && depthBuffer[pixelX] > dist) {
ctx.fillStyle = andy.state === 'stunned' ? rgba(0, 180, 255, ${alpha * 0.8}) : rgba(25, 25, 35, ${alpha});
ctx.fillRect(pixelX, tallScreenY, 1, tallHeight);
ctx.fillStyle = rgba(215, 195, 185, ${alpha});
ctx.fillRect(adjustedScreenX + (narrowWidth * 0.35), tallScreenY + (tallHeight * 0.05), narrowWidth * 0.3, tallHeight * 0.15);
ctx.fillStyle = '#ffffff';
ctx.fillRect(adjustedScreenX + (narrowWidth * 0.42), tallScreenY + (tallHeight * 0.09), narrowWidth * 0.06, tallHeight * 0.02);
ctx.fillRect(adjustedScreenX + (narrowWidth * 0.54), tallScreenY + (tallHeight * 0.09), narrowWidth * 0.06, tallHeight * 0.02);
}
}
} else {
// EASIER BATTERY RENDERER: Early levels give batteries a wider neon outline
let isEasyLevel = (currentLevel <= 2);
let renderWidth = isEasyLevel ? spriteSize * 1.4 : spriteSize;
for (let col = 0; col < renderWidth; col++) {
let pixelX = Math.floor(spriteScreenX + col);
if (pixelX >= 0 && pixelX < canvas.width && depthBuffer[pixelX] > dist) {
ctx.fillStyle = isEasyLevel ? rgba(50, 255, 10, ${alpha * 1.5}) : rgba(240, 240, 10, ${alpha});
ctx.fillRect(pixelX, spriteScreenY + (spriteSize * 0.35), 1, spriteSize * 0.35);
}
}
}
});
let lightGrad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 20, canvas.width / 2, canvas.height / 2, 320);
lightGrad.addColorStop(0, 'rgba(255,255,235,0.06)'); lightGrad.addColorStop(0.5, 'rgba(0,0,0,0.55)'); lightGrad.addColorStop(1, 'rgba(0,0,0,0.98)');
ctx.fillStyle = lightGrad; ctx.fillRect(0, 0, canvas.width, canvas.height);
// Compute closest battery distance context hints
let closestBatDist = 999;
for (let bat of batteries) {
if (!bat.collected) {
let d = Math.hypot(player.x - bat.x, player.y - bat.y);
if (d < closestBatDist) closestBatDist = d;
}
}
let batteryHint = "";
if (currentLevel <= 2) {
if (closestBatDist < 3) batteryHint = " | BATTERY: NEAR";
else if (closestBatDist < 6) batteryHint = " | BATTERY: MEDIUM";
else batteryHint = " | BATTERY: FAR";
}
let weaponStatus = Ammo: ${player.ammo}/${player.maxAmmo};
if (player.isReloading) {
weaponStatus = <span style="color:#ffaa00;">RELOADING...</span>;
} else if (player.ammo === 0) {
weaponStatus = <span style="color:#ff1111; font-weight:bold;">PRESS [R] TO RELOAD</span>;
}
let statsEl = document.getElementById('stats');
if (andy.state === 'stunned' && statsEl) {
statsEl.innerHTML = ${weaponStatus} | Batteries: <span id="score">${score}</span>/3${batteryHint} | <span style="color:#00ffff;">STUNNED!</span>;
} else if (Math.hypot(player.x - andy.x, player.y - andy.y) < 2.5 && statsEl) {
statsEl.innerHTML = ${weaponStatus} | Batteries: <span id="score">${score}</span>/3 | <span style="color:#ff1111; font-weight:bold;">HE'S BEHIND YOU!</span>;
} else if (statsEl) {
statsEl.innerHTML = ${weaponStatus} | Batteries: <span id="score">${score}</span>/3${batteryHint} | Escape Level: <span id="level">${currentLevel}</span>;
}
ctx.fillStyle = 'rgba(0, 255, 100, 0.7)'; ctx.fillRect(canvas.width / 2 - 2, canvas.height / 2 - 2, 4, 4);
ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1.5; ctx.strokeRect(canvas.width / 2 - 12, canvas.height / 2 - 12, 24, 24);
ctx.save();
let gunX = canvas.width / 2 + 90; let gunY = canvas.height - 130 - player.weaponRecoil;
ctx.fillStyle = '#141518'; ctx.fillRect(gunX, gunY, 40, 150);
ctx.fillStyle = '#0a0a0d'; ctx.fillRect(gunX - 65, gunY + 5, 110, 32);
if (player.isShooting && player.weaponRecoil > 25) {
let flashGrad = ctx.createRadialGradient(gunX - 65, gunY + 21, 2, gunX - 65, gunY + 21, 55);
flashGrad.addColorStop(0, '#ffffff'); flashGrad.addColorStop(0.2, '#ffaa00'); flashGrad.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = flashGrad; ctx.beginPath(); ctx.arc(gunX - 65, gunY + 21, 55, 0, Math.PI * 2); ctx.fill();
}
ctx.restore();
}
// --- CORE GAME LOOP ---
function loop() {
update();
draw();
requestAnimationFrame(loop);
}
loop();