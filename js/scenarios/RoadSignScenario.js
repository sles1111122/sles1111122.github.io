export default class RoadSignScenario {
    constructor() {
        this.name = "Traffic Sign Violation (No Turn)";
        this.isActive = false;
        this.hasReactionTest = false; 
        this.gameManager = null;
        this.signMesh = null;
        
        this.ruleType = null; 
        this.initialDir = null; 
        this.targetIntersection = null; 
        this.hasEnteredIntersection = false; 

        this.config = {
            blockSize: 300,    
            roadWidth: 24,     
            cornerOffset: 20,   
            signHeight: 3,    
            signRadius: 2     
        };

        this.textures = {
            'SPEED_60': this.createTexture('SPEED', 60),
            'NO_LEFT':  this.createTexture('NO_TURN', 'LEFT'),
            'NO_RIGHT': this.createTexture('NO_TURN', 'RIGHT')
        };
    }

    start(scene, camera, gameManager) { 
        if (this.isActive) return;
        this.gameManager = gameManager;
        const playerPos = this.gameManager.player.position;
        
        // ==========================================
        // 🌟 直接從全域公佈欄找導航，取得真實方向
        // ==========================================
        let expectedTurn = 'STRAIGHT'; 
        
        if (window.GlobalNavSystem) {
            expectedTurn = window.GlobalNavSystem.getNextTurnDirection();
            console.log(`📡 [連線成功] 成功從獨立導航取得真實方向：${expectedTurn}`);
        } else {
            console.log("⚠️ [連線失敗] 找不到全域導航系統！請確認 NavigationSystem 有加上 window.GlobalNavSystem = this");
        }

        if (expectedTurn === 'LEFT') {
            this.ruleType = 'NO_LEFT'; 
        } else if (expectedTurn === 'RIGHT') {
            this.ruleType = 'NO_RIGHT'; 
        } else {
            console.log(`❌ [觸發取消] 目前導航顯示為 ${expectedTurn}，不生成陷阱！`);
            return false;
        }

        this.isActive = true;
        
        // --- 算方向與目標 ---
        const forwardVector = new THREE.Vector3(0, 0, -1).applyQuaternion(this.gameManager.player.quaternion);
        let facingDir = 'NORTH';
        if (Math.abs(forwardVector.x) > Math.abs(forwardVector.z)) {
            facingDir = forwardVector.x > 0 ? 'EAST' : 'WEST';
        } else {
            facingDir = forwardVector.z > 0 ? 'SOUTH' : 'NORTH';
        }
        this.initialDir = facingDir;

        let gridX = Math.round(playerPos.x / this.config.blockSize);
        let gridZ = Math.round(playerPos.z / this.config.blockSize);

        if (facingDir === 'NORTH') gridZ = Math.floor(playerPos.z / this.config.blockSize);
        else if (facingDir === 'SOUTH') gridZ = Math.ceil(playerPos.z / this.config.blockSize);
        else if (facingDir === 'EAST') gridX = Math.ceil(playerPos.x / this.config.blockSize);
        else if (facingDir === 'WEST') gridX = Math.floor(playerPos.x / this.config.blockSize);

        this.targetIntersection = { x: gridX * this.config.blockSize, z: gridZ * this.config.blockSize };

        console.log(`=========================================`);
        console.log(`😈 [路牌事件觸發] 導航要求：${expectedTurn}，生成 ${this.ruleType}`);
        console.log(`🚗 玩家觸發時座標：X: ${playerPos.x.toFixed(1)}, Z: ${playerPos.z.toFixed(1)}`);
        console.log(`🎯 鎖定目標路口：X: ${this.targetIntersection.x}, Z: ${this.targetIntersection.z}`);
        console.log(`=========================================`);

        this.createSignAtGrid(scene, gridX, gridZ, facingDir, this.ruleType);
        this.hasEnteredIntersection = false;
    }

// ==========================================
    // ★ 修正：加入方向比對，違規記點但不結束遊戲
    // ==========================================
    update(deltaTime, currentNSState, currentEWState, camera) {
        if (!this.isActive || !this.targetIntersection) return true;

        const playerPos = this.gameManager.player.position;
        const distToIntersection = Math.hypot(playerPos.x - this.targetIntersection.x, playerPos.z - this.targetIntersection.z);

        // 階段 1：等待玩家靠近並進入路口
        if (!this.hasEnteredIntersection) {
            if (distToIntersection < this.config.blockSize * 0.2) {
                this.hasEnteredIntersection = true;
                console.log(`🚩 玩家已進入路口範圍`);
            }
            return false; 
        }

        // 階段 2：等待玩家遠離路口，進行結算
        if (this.hasEnteredIntersection && distToIntersection > this.config.blockSize * 0.3) {
            
            // 1. 取得玩家離開路口時的「最終面向」
            const forwardVector = new THREE.Vector3(0, 0, -1).applyQuaternion(this.gameManager.player.quaternion);
            let exitDir = 'NORTH';
            if (Math.abs(forwardVector.x) > Math.abs(forwardVector.z)) {
                exitDir = forwardVector.x > 0 ? 'EAST' : 'WEST';
            } else {
                exitDir = forwardVector.z > 0 ? 'SOUTH' : 'NORTH';
            }

            // 2. 比對進入與離開方向，判斷轉彎類型
            const turnType = this._getTurnType(this.initialDir, exitDir);
            console.log(`🔍 路牌結算：入口 ${this.initialDir}，出口 ${exitDir} -> 判定為 ${turnType}`);

            // 3. 檢查是否違規
            let isViolation = false;
            if (this.ruleType === 'NO_LEFT' && turnType === 'LEFT') isViolation = true;
            if (this.ruleType === 'NO_RIGHT' && turnType === 'RIGHT') isViolation = true;

            // 4. 結算處置 (直接寫入 GameManager 的 DataCollector)
            if (this.gameManager && this.gameManager.dataCollector) {
                
                // --- 處理法規認知統計 (對應報表的 "禁止通行") ---
                const regStats = this.gameManager.dataCollector.report.regulation.stats;
                if (!regStats['禁止通行']) {
                    regStats['禁止通行'] = { checks: 0, violations: 0 };
                }
                regStats['禁止通行'].checks++; // 只要經過路口就增加 1 次判斷機會

                if (isViolation) {
                    console.log("💥 玩家違規轉彎！(已記一筆違規，遊戲繼續)");
                    regStats['禁止通行'].violations++; // 增加違規次數
                    
                    // ★ 呼叫 recordEventEnd 解除 GameManager 的事件鎖定，但不算成功
                    if (typeof this.gameManager.recordEventEnd === 'function') {
                        this.gameManager.recordEventEnd();
                    }
                } else {
                    console.log(`✅ 玩家未違規，路牌事件平安結束。`);
                    if (typeof this.gameManager.recordEventSuccess === 'function') {
                        this.gameManager.recordEventSuccess('roadsign', null);
                    }
                }
            }

            this.stop(this.gameManager.scene);
            return true; // 事件結束
        }

        return false;
    }

    // ==========================================
    // ★ 補上這個：計算轉彎類型的輔助函數
    // ==========================================
    _getTurnType(entryDir, exitDir) {
        if (entryDir === exitDir) return 'STRAIGHT';
        
        // 判斷是否為迴轉 (U-Turn)
        if ((entryDir === 'NORTH' && exitDir === 'SOUTH') ||
            (entryDir === 'SOUTH' && exitDir === 'NORTH') ||
            (entryDir === 'EAST' && exitDir === 'WEST') ||
            (entryDir === 'WEST' && exitDir === 'EAST')) {
            return 'UTURN';
        }

        // 依據相對方位判斷左右轉 (基於 Three.js 座標系：-Z 為北，+X 為東)
        if (entryDir === 'NORTH') return exitDir === 'WEST' ? 'LEFT' : 'RIGHT'; 
        if (entryDir === 'SOUTH') return exitDir === 'EAST' ? 'LEFT' : 'RIGHT'; 
        if (entryDir === 'EAST')  return exitDir === 'NORTH' ? 'LEFT' : 'RIGHT'; 
        if (entryDir === 'WEST')  return exitDir === 'SOUTH' ? 'LEFT' : 'RIGHT'; 

        return 'STRAIGHT'; // 預設防呆
    }
    
    stop(scene) {
        this.isActive = false;
        if (this.signMesh && scene) {
            scene.remove(this.signMesh);
            this.signMesh = null;
        }
        this.targetIntersection = null;
        this.hasEnteredIntersection = false;
    }

    createSignAtGrid(scene, gx, gz, facingDir, type) {
        const centerX = gx * this.config.blockSize;
        const centerZ = gz * this.config.blockSize;
        
        // 🌟 分離 X 與 Z 的偏移邏輯
        
        // 1. 橫向偏移：決定路牌在「路邊」的位置。
        // 固定等於路寬的一半，加上一點點緩衝(例如 2)避免柱子直接貼在柏油路上
        const sideOffset = (this.config.roadWidth / 2) + 2; 

        // 2. 縱向偏移：決定路牌距離「十字路口中心」有多遠。
        // 這裡才放入你的 cornerOffset，這樣路牌就只會沿著這條軸線退後！
        const forwardOffset = (this.config.roadWidth / 2) + this.config.cornerOffset;

        let signX, signZ, rotationY;

        // 假設你的城市是「右側通行」
        switch(facingDir) {
            case 'NORTH': // 車子往北開 (-Z 方向)
                signX = centerX + sideOffset;      // 卡死在道路右側
                signZ = centerZ + forwardOffset;   // 沿著 Z 軸往後退 (還沒到路口)
                rotationY = Math.PI; 
                break;
            case 'SOUTH': // 車子往南開 (+Z 方向)
                signX = centerX - sideOffset;      // 卡死在道路右側
                signZ = centerZ - forwardOffset;   // 沿著 Z 軸往後退
                rotationY = 0; 
                break;
            case 'EAST':  // 車子往東開 (+X 方向)
                signX = centerX - forwardOffset;   // 沿著 X 軸往後退
                signZ = centerZ + sideOffset;      // 卡死在道路右側
                rotationY = -Math.PI / 2; 
                break;
            case 'WEST':  // 車子往西開 (-X 方向)
                signX = centerX + forwardOffset;   // 沿著 X 軸往後退
                signZ = centerZ - sideOffset;      // 卡死在道路右側
                rotationY = Math.PI / 2; 
                break;
        }

        console.log(`🛑 路牌 3D 模型建立於座標：X: ${signX.toFixed(1)}, Z: ${signZ.toFixed(1)}, 高度(Y): ${this.config.signHeight}`);

        this.signMesh = this.createSign(type, signX, signZ, rotationY);
        scene.add(this.signMesh);
    }

    createSign(type, x, z, rotationY = 0) {
        if (!this.textures[type]) return null;

        const poleRadius = 0.1;
        const poleGeo = new THREE.CylinderGeometry(poleRadius, poleRadius, 5.5, 12); 
        const poleMat = new THREE.MeshPhongMaterial({ color: 0x444444 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, this.config.signHeight, z);
        pole.rotation.y = rotationY;

        const boardGroup = new THREE.Group();
        boardGroup.position.set(0, 1.8, 0); 

        const r = this.config.signRadius; 
        const faceOffset = 0.12; 

        const frontGeo = new THREE.CircleGeometry(r, 32);
        const frontMat = new THREE.MeshBasicMaterial({ map: this.textures[type], side: THREE.FrontSide });
        const frontMesh = new THREE.Mesh(frontGeo, frontMat);
        frontMesh.position.z = faceOffset; 

        const backGeo = new THREE.CircleGeometry(r, 32);
        const backMat = new THREE.MeshBasicMaterial({ map: this.textures[type], side: THREE.FrontSide });
        const backMesh = new THREE.Mesh(backGeo, backMat);
        backMesh.position.z = -faceOffset; 
        backMesh.rotation.y = Math.PI;    

        const rimThickness = faceOffset * 2; 
        const rimGeo = new THREE.CylinderGeometry(r, r, rimThickness, 32, 1, true);
        const rimMat = new THREE.MeshBasicMaterial({ color: 0x111111 }); 
        const rimMesh = new THREE.Mesh(rimGeo, rimMat);
        rimMesh.rotation.x = Math.PI / 2; 

        boardGroup.add(frontMesh);
        boardGroup.add(backMesh);
        boardGroup.add(rimMesh);
        pole.add(boardGroup);

        return pole;
    }

    createTexture(category, value) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, size, size);
        const cx = size / 2;
        const cy = size / 2;
        const radius = size / 2 - 20;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.fillStyle = 'white';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.lineWidth = 60; 
        ctx.strokeStyle = '#cc0000'; 
        ctx.stroke();

        if (category === 'SPEED') {
            ctx.fillStyle = 'black';
            ctx.font = 'bold 260px Arial'; 
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(value, cx, cy + 25); 

        } else if (category === 'NO_TURN') {
            ctx.fillStyle = 'black';
            ctx.save();
            ctx.translate(cx, cy + 20); 
            
            if (value === 'RIGHT') {
                ctx.scale(-1, 1);
            }

            ctx.beginPath();
            ctx.moveTo(30, 120);
            ctx.lineTo(-30, 120);
            ctx.lineTo(-30, -10); 
            ctx.quadraticCurveTo(-30, -90, -110, -90);
            ctx.lineTo(-110, -50);  
            ctx.lineTo(-200, -110); 
            ctx.lineTo(-110, -170); 
            ctx.lineTo(-110, -130);
            ctx.quadraticCurveTo(30, -130, 30, -10);
            ctx.closePath();
            ctx.fill();
            ctx.restore(); 

            ctx.beginPath();
            const slashLen = radius - 35; 
            const angleStart = -Math.PI / 4; 
            const angleEnd = 3 * Math.PI / 4;

            ctx.moveTo(cx + slashLen * Math.cos(angleStart), cy + slashLen * Math.sin(angleStart));
            ctx.lineTo(cx + slashLen * Math.cos(angleEnd), cy + slashLen * Math.sin(angleEnd));
            
            ctx.lineWidth = 50; 
            ctx.strokeStyle = '#cc0000';
            ctx.stroke();
        }

        return new THREE.CanvasTexture(canvas);
    }
}