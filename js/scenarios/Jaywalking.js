// js/scenarios/Jaywalking.js

function createSimpleHuman() {
    const group = new THREE.Group();

    // 1. 身體 (圓柱體 - 藍色上衣)
    const bodyGeo = new THREE.CylinderGeometry(0.25, 0.2, 0.6, 8);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x0066ff }); 
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.1; 
    group.add(body);

    // 2. 頭部 (球體 - 皮膚色)
    const headGeo = new THREE.SphereGeometry(0.2, 12, 12);
    const headMat = new THREE.MeshPhongMaterial({ color: 0xffcc99 }); 
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.55; 
    group.add(head);

    // 3. 腿部 (簡單長方體 - 深色褲子)
    const legsGeo = new THREE.BoxGeometry(0.35, 0.8, 0.25);
    const legsMat = new THREE.MeshPhongMaterial({ color: 0x333333 }); 
    const legs = new THREE.Mesh(legsGeo, legsMat);
    legs.position.y = 0.4; 
    group.add(legs);
    
    return group;
}

export default class JaywalkingScenario {
    constructor() {
        this.name = "鬼探頭";
        this.npc = null; 
        this.active = false;
        this.moveDirection = new THREE.Vector3(); 
        
        // ★ 修正 1：定義為「每秒移動的公尺數」 (6.0 m/s 約等於時速 21 公里，滿快的衝刺)
        this.speed = 6.0; 
        this.gameManager = null;
        this.animTime = 0;
        this.hasReactionTest = true; 
        
        // ★ 新增：防呆計時器
        this.timer = 0;
        this.maxTimeout = 12; // 12秒後強制結束該事件
    }

    start(scene, camera, gameManager) {
        this.active = true;
        this.animTime = 0; 
        this.timer = 0; // 重置防呆計時器
        this.gameManager = gameManager;
        console.log(`[${this.name}] 情境開始`);

        this.npc = createSimpleHuman();

        const carDir = new THREE.Vector3();
        camera.getWorldDirection(carDir);
        carDir.y = 0;
        carDir.normalize();

        const rightVec = new THREE.Vector3().crossVectors(carDir, new THREE.Vector3(0, 1, 0)).normalize();
        
        const spawnPos = camera.position.clone()
            .add(carDir.clone().multiplyScalar(20)) 
            .add(rightVec.clone().multiplyScalar(6)); 

        this.npc.position.copy(spawnPos);

        const targetPos = spawnPos.clone().sub(rightVec.clone().multiplyScalar(12)); 
        this.moveDirection.subVectors(targetPos, spawnPos).normalize();
        this.npc.lookAt(targetPos);

        scene.add(this.npc);
    }

    update(dt, currentNSState, currentEWState, camera) {
        if (!this.active || !this.npc) return true;

        this.timer += dt;

        // --- ★ 修正 2：乘上 dt，確保所有玩家電腦上的移動速度一致 ---
        // 使用 addScaledVector 提升效能，避免每幀 clone
        this.npc.position.addScaledVector(this.moveDirection, this.speed * dt);

        // --- ★ 修正 3：動畫時間也乘上 dt ---
        // dt * 12 大約等於原本每幀 +0.2 的頻率 (在 60fps 下)
        this.animTime += dt * 12; 
        const jumpHeight = Math.abs(Math.sin(this.animTime)) * 0.3;
        this.npc.position.y = jumpHeight;

        // --- 碰撞偵測 ---
        const dist = this.npc.position.distanceTo(camera.position);
        
        // 稍微調大一點點到 2.5，避免穿模才判定
        if (dist < 2.5) { 
            if (this.gameManager) {
                console.log("💥 突發事件：撞到鬼探頭行人！"); 
                this.gameManager.triggerGameOver("反應不及：撞擊違規穿越馬路的行人");            
            }
            return true;
        }

        // --- 結束條件 ---
        // ★ 新增：加入防呆超時，避免玩家停在原地讓行人無限跑到地圖外
        if (dist > 45 || this.timer > this.maxTimeout) { 
            return true;
        }

        return false;
    }

    stop() { // ★ 修正 4：換上安全的移除寫法，拔掉 scene 參數
        if (this.npc) {
            // 安全移除
            if (this.npc.parent) {
                this.npc.parent.remove(this.npc);
            }
            
            this.npc.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    child.material.dispose();
                }
            });
            
            this.npc = null;
        }
        this.active = false;
        console.log(`[${this.name}] 情境清理完畢`);
    }
}