// --- 獨立的造景函式 (保持不變，寫得很好) ---
function createConstructionSite() {
    const group = new THREE.Group();
    const size = 6;     // 6x6 大小
    const half = size / 2;

    // 1. 產生警示紋理 (黃黑斜紋)
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#FFC107'; // 黃底
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#111';    // 黑紋
    ctx.beginPath();
    for(let i=-64; i<128; i+=20) {
        ctx.moveTo(i,0); ctx.lineTo(i+10,0); ctx.lineTo(i-20,64); ctx.lineTo(i-30,64);
    }
    ctx.fill();
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;

    const matRail = new THREE.MeshPhongMaterial({ map: tex });
    const matCone = new THREE.MeshPhongMaterial({ color: 0xFF5722 }); 
    const matGround = new THREE.MeshLambertMaterial({ color: 0x222222 }); 

    // 2. 地面
    const ground = new THREE.Mesh(new THREE.BoxGeometry(size, 0.1, size), matGround);
    ground.position.y = 0;
    group.add(ground);

    // 3. 四周護欄
    const h = 0.8; const t = 0.3; 
    const railGeo = new THREE.BoxGeometry(size, h, t);
    
    const r1 = new THREE.Mesh(railGeo, matRail); r1.position.set(0, h/2, -half+t/2); group.add(r1);
    const r2 = new THREE.Mesh(railGeo, matRail); r2.position.set(0, h/2, half-t/2); group.add(r2);
    const r3 = new THREE.Mesh(railGeo, matRail); r3.rotation.y = Math.PI/2; r3.position.set(half-t/2, h/2, 0); group.add(r3);
    const r4 = new THREE.Mesh(railGeo, matRail); r4.rotation.y = Math.PI/2; r4.position.set(-half+t/2, h/2, 0); group.add(r4);

    // 4. 角落三角錐
    const coneGeo = new THREE.ConeGeometry(0.3, 1.0, 16);
    [ -1, 1 ].forEach(dx => {
        [ -1, 1 ].forEach(dz => {
            const cone = new THREE.Mesh(coneGeo, matCone);
            cone.position.set(dx * (half + 0.6 ), 0.5, dz * (half + 0.6 ));
            group.add(cone);
        });
    });

    return group;
}

// --- 主要類別 ---
export default class ConstructionScenario {
    constructor() {
        this.name = "前方施工";
        this.meshGroup = null; 
        this.active = false;
        this.timer = 0;
        
        // ★ 修正：拔除不合理的 5 秒限制，改為防呆超時(30秒)
        this.maxTimeout = 30; 
        
        this.gameManager = null; 
        this.hasReactionTest = true; 
    }

start(scene, camera, gameManager) {
        this.active = true;
        this.timer = 0;
        this.gameManager = gameManager; 
        console.log(`[${this.name}] 情境開始`);

        this.meshGroup = createConstructionSite();

        const carPos = camera.position;
        const carDir = new THREE.Vector3();
        camera.getWorldDirection(carDir);
        carDir.y = 0; 
        carDir.normalize();

        // --- ★ 修正開始：鎖定絕對軸向 ---
        const snapDir = new THREE.Vector3();
        
        // 判斷車子現在主要是往東西開，還是南北開？
        if (Math.abs(carDir.x) > Math.abs(carDir.z)) {
            // 主要為東西向 (X軸)
            snapDir.x = Math.sign(carDir.x); // 只取 1 或 -1
            snapDir.z = 0; // 強制歸零 Z 軸偏差
        } else {
            // 主要為南北向 (Z軸)
            snapDir.x = 0; // 強制歸零 X 軸偏差
            snapDir.z = Math.sign(carDir.z);
        }

        // 用鎖定後的方向推算 40 公尺
        const spawnPos = carPos.clone().add(snapDir.multiplyScalar(40));
        spawnPos.y = 0;
        // --- ★ 修正結束 ---

        this.meshGroup.position.copy(spawnPos);
        scene.add(this.meshGroup);
    }

    update(dt, currentNSState, currentEWState, camera) {
        if (!this.active || !this.meshGroup) return true;

        this.timer += dt; 

        const carPos = camera.position;
        const obstaclePos = this.meshGroup.position;

        // ★ 修正：使用 Math.hypot 計算 2D 距離，簡潔且不考慮 Y 軸高度誤差
        const dist = Math.hypot(carPos.x - obstaclePos.x, carPos.z - obstaclePos.z);

        const COLLISION_THRESHOLD = 5.0; 

        // 1. 碰撞判定
        if (dist < COLLISION_THRESHOLD) {
            console.log("💥 撞到施工路障！");
            if (this.gameManager) {
                this.gameManager.triggerGameOver("你撞到了施工地區");
            }
            return true; 
        }

        // ★ 修正：移除魔法消失，改為「玩家開離超過 50 公尺」才清理，加上超時防呆
        // (生成在 40 米前，大於 50 米代表已經繞過或開走了)
        const hasPassedObstacle = (this.timer > 2.0 && dist > 50.0);
        const isTimeout = (this.timer > this.maxTimeout);

        if (hasPassedObstacle || isTimeout) {
            console.log(`[${this.name}] 玩家已駛離或超時，清理施工區`);
            return true;
        }

        return false;
    }

    stop() { // ★ 修正：不再需要依賴傳入的 scene
        if (this.meshGroup) {
            // ★ 安全移除
            if (this.meshGroup.parent) {
                this.meshGroup.parent.remove(this.meshGroup);
            }
            
            this.meshGroup.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if(child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            });
            this.meshGroup = null;
        }
        this.active = false;
        console.log(`[${this.name}] 情境清理完畢`);
    }
}