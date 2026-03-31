// --- 1. 卡車模型 (保持原樣，方向燈寫得很好！) ---
function createTruck() {
    const group = new THREE.Group();

    const cargoGeo = new THREE.BoxGeometry(2.5, 3.5, 6);
    const cargoMat = new THREE.MeshPhongMaterial({ color: 0xCCCCCC }); 
    const cargo = new THREE.Mesh(cargoGeo, cargoMat);
    cargo.position.y = 2.5;
    cargo.position.z = 1;
    group.add(cargo);

    const cabinGeo = new THREE.BoxGeometry(2.6, 2.5, 2);
    const cabinMat = new THREE.MeshPhongMaterial({ color: 0xFF0000 }); 
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 2, -3.2); 
    group.add(cabin);

    const wheelGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.6, 12);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const positions = [
        { x: -1.4, z: -3 }, { x: 1.4, z: -3 }, 
        { x: -1.4, z: 0 },  { x: 1.4, z: 0 },  
        { x: -1.4, z: 3 },  { x: 1.4, z: 3 }   
    ];
    positions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos.x, 0.8, pos.z);
        group.add(wheel);
    });

    const lightGeo = new THREE.SphereGeometry(0.3, 8, 8);
    const blinkerMat = new THREE.MeshLambertMaterial({ color: 0xCCAA00 }); 
    
    const leftBlinker = new THREE.Mesh(lightGeo, blinkerMat.clone());
    leftBlinker.position.set(-1.2, 1.5, -4.3); 
    group.add(leftBlinker);

    const rightBlinker = new THREE.Mesh(lightGeo, blinkerMat.clone());
    rightBlinker.position.set(1.2, 1.5, -4.3); 
    group.add(rightBlinker);

    group.userData = { 
        leftLight: leftBlinker, 
        rightLight: rightBlinker,
        blinkState: false, 
        blinkTimer: 0
    };

    return group;
}

// --- 2. 場景邏輯 ---
export default class TruckTurnScenario {
    constructor(allIntersections, pedestrians, bounds) {
        this.name = "路口大型車輛情境";
        this.intersections = allIntersections;
        this.pedestrians = pedestrians;
        this.bounds = bounds; 
        this.truck = null;
        this.active = false;
        this.hasReactionTest = false; 
        
        this.LANE_OFFSET = 3.5;  
        this.SPAWN_DIST = 70;    
        this.DRIVE_OUT_DIST = 60;
        
        this.state = 'IDLE'; 
        this.speed = 0;
        this.MAX_SPEED = 10; 
        
        this.pathCurve = null;
        this.progress = 0;
        this.action = 'straight';
        this.fromDir = ''; 
    }

    start(scene, camera, gameManager) {
        this.gameManager = gameManager; 
        const carPos = camera.position;
        const target = this._findClosestIntersection(carPos, camera);
        if (!target) return;

        this.active = true;
        this.truck = createTruck(); 
        scene.add(this.truck);

        const dx = carPos.x - target.x;
        const dz = carPos.z - target.z;
        
        let playerSide = ''; 
        if (Math.abs(dz) > Math.abs(dx)) {
            playerSide = dz > 0 ? 'S' : 'N'; 
        } else {
            playerSide = dx > 0 ? 'E' : 'W'; 
        }

        const oppositeMap = { 'S': 'N', 'N': 'S', 'E': 'W', 'W': 'E' };
        this.fromDir = oppositeMap[playerSide];

        const actions = ['straight', 'left', 'right'];
        this.action = actions[Math.floor(Math.random() * actions.length)];

        console.log(`[${this.name}] 來源:${this.fromDir}, 行為:${this.action}`);

        // ★ 修改：移除 scene 參數，因為不再需要它來清理事物
        const success = this._buildStrictLanePath(target);

        if (!success) {
            this.active = false; 
            // 在這裡就把它安全移除
            if (this.truck && this.truck.parent) {
                this.truck.parent.remove(this.truck);
            }
            this.truck = null;
            return;
        }

        this.progress = 0;
        this._updateTruckTransform(0); 
        this.state = 'APPROACHING';
    }

    // ★ 修改：移除 scene 參數
    _buildStrictLanePath(target) {
        const center = new THREE.Vector3(target.x, 0, target.z);
        
        const dirs = {
            'N': { forward: new THREE.Vector3(0, 0, 1),  right: new THREE.Vector3(-1, 0, 0) }, 
            'S': { forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) },  
            'E': { forward: new THREE.Vector3(-1, 0, 0), right: new THREE.Vector3(0, 0, -1) }, 
            'W': { forward: new THREE.Vector3(1, 0, 0),  right: new THREE.Vector3(0, 0, 1) }   
        };

        const dirVecs = dirs[this.fromDir];
        const fwd = dirVecs.forward;   
        const right = dirVecs.right;   

        const startPos = center.clone()
            .add(fwd.clone().multiplyScalar(-this.SPAWN_DIST))
            .add(right.clone().multiplyScalar(this.LANE_OFFSET));

        if (this.bounds) {
            const isOutX = startPos.x < this.bounds.minX - 10 || startPos.x > this.bounds.maxX + 10;
            const isOutZ = startPos.z < this.bounds.minZ - 10 || startPos.z > this.bounds.maxZ + 10;
            if (isOutX || isOutZ) {
                // 如果出界，回傳 false 讓 start() 處理清理
                return false;
            }
        }

        this.pathCurve = new THREE.CurvePath();

        if (this.action === 'straight') {
            const endPos = startPos.clone().add(fwd.clone().multiplyScalar(this.SPAWN_DIST + this.DRIVE_OUT_DIST));
            this.pathCurve.add(new THREE.LineCurve3(startPos, endPos));
        } 
        else {
            const turnDir = this.action === 'right' ? right.clone() : right.clone().negate();
            const turnInDist = this.action === 'right' ? (this.SPAWN_DIST - 1) : (this.SPAWN_DIST + 6);
            const bezierRadius = 6.0;

            const pEntry = startPos.clone().add(fwd.clone().multiplyScalar(turnInDist - bezierRadius)); 
            const pCorner = startPos.clone().add(fwd.clone().multiplyScalar(turnInDist));                
            const pExit = pCorner.clone().add(turnDir.clone().multiplyScalar(bezierRadius));            
            const pEnd = pExit.clone().add(turnDir.clone().multiplyScalar(this.DRIVE_OUT_DIST));        

            this.pathCurve.add(new THREE.LineCurve3(startPos, pEntry));
            this.pathCurve.add(new THREE.QuadraticBezierCurve3(pEntry, pCorner, pExit));
            this.pathCurve.add(new THREE.LineCurve3(pExit, pEnd));
        }

        return true;
    }

update(dt, nsState, ewState, camera) {
        if (!this.active || !this.truck) { return true; }
        const carPos = camera.position;
        const truckPos = this.truck.position; 

        // ★ 簡化：使用 Math.hypot
        const dist = Math.hypot(carPos.x - truckPos.x, carPos.z - truckPos.z);
        const COLLISION_THRESHOLD = 5.0; 

        if (dist < COLLISION_THRESHOLD) {
            console.log("💥 撞到轉彎大卡車！");
            if (this.gameManager) { 
                this.gameManager.triggerGameOver("與轉彎中的大型車輛發生碰撞！");
            }
            return true; 
        }
        
        this._updateBlinkers(dt);

        let targetSpeed = this.MAX_SPEED;
        const isApproachingIntersection = this.progress < 0.35; 

        if (isApproachingIntersection && this.state === 'APPROACHING') {
            let signal = 'green';
            if (this.fromDir === 'N' || this.fromDir === 'S') signal = nsState;
            else signal = ewState;

            if (signal === 'red' || signal === 'yellow') {
                if (this.progress > 0.25) { 
                    targetSpeed = 0;
                }
            }
        }

        if (this._checkPedestriansAhead()) targetSpeed = 0;

        this.speed = THREE.MathUtils.lerp(this.speed, targetSpeed, dt * 2);
        
        if (!this.pathCurve) return true;

        const pathLen = this.pathCurve.getLength();
        this.progress += (this.speed * dt) / pathLen;

        // ★ 修正：先更新變換矩陣，再檢查是否超過 1 (結束)
        // 確保最後一幀跑到終點不會閃爍
        const t = Math.min(this.progress, 1); 
        this._updateTruckTransform(t);

        if (this.progress >= 1) {
            // ★ 新增：卡車順利開完路線，代表玩家沒有撞到它，記錄成功！
            if (this.gameManager && typeof this.gameManager.recordEventSuccess === 'function') {
                this.gameManager.recordEventSuccess('truck', null);
            }
            // ★ 別忘了呼叫 stop 清理卡車
            this.stop();
            return true; 
        }

        return false; 
    }

    _updateTruckTransform(t) {
        if (!this.truck || !this.pathCurve) return;
        const point = this.pathCurve.getPoint(t);
        const tangent = this.pathCurve.getTangent(t).normalize();
        
        this.truck.position.copy(point);
        const lookTarget = point.clone().add(tangent);
        this.truck.lookAt(lookTarget);
        this.truck.rotateY(Math.PI); 
    }

    _updateBlinkers(dt) {
        if (!this.truck) return;
        const data = this.truck.userData;
        if (this.action === 'straight') {
            data.leftLight.material.emissive.setHex(0x000000);
            data.rightLight.material.emissive.setHex(0x000000);
            return;
        }
        
        data.blinkTimer += dt;
        if (data.blinkTimer > 0.4) {
            data.blinkTimer = 0;
            data.blinkState = !data.blinkState;
            const color = data.blinkState ? 0xFFFF00 : 0xCCAA00; 
            const emissive = data.blinkState ? 0xFFFF00 : 0x000000;

            if (this.action === 'left') {
                data.leftLight.material.color.setHex(color);
                data.leftLight.material.emissive.setHex(emissive);
                data.rightLight.material.emissive.setHex(0x000000);
            } else if (this.action === 'right') {
                data.rightLight.material.color.setHex(color);
                data.rightLight.material.emissive.setHex(emissive);
                data.leftLight.material.emissive.setHex(0x000000);
            }
        }
    }

    _findClosestIntersection(carPos, camera) {
        const carDir = new THREE.Vector3();
        camera.getWorldDirection(carDir);
        let closestDist = Infinity;
        let target = null;
        
        this.intersections.forEach(node => {
            // ★ 簡化運算，減少記憶體浪費
            const dx = node.x - carPos.x;
            const dz = node.z - carPos.z;
            const dist = Math.hypot(dx, dz);
            
            if (dist < closestDist && dist > 40) {
                // 將車子方向向量與路口相對向量做內積，判斷路口是否在前方
                // (dx * carDir.x + dz * carDir.z) > 0 代表在前方
                if ((dx * carDir.x + dz * carDir.z) > 0) {
                    closestDist = dist;
                    target = node;
                }
            }
        });
        return target;
    }
    
    _checkPedestriansAhead() {
        if (!this.pedestrians || !this.truck) return false;
        const truckPos = this.truck.position;
        const truckDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.truck.quaternion);

        for (let ped of this.pedestrians) {
            if (!ped.mesh) continue;
            const dist = truckPos.distanceTo(ped.mesh.position);
            if (dist < 8) {
                const vecToPed = new THREE.Vector3().subVectors(ped.mesh.position, truckPos).normalize();
                if (truckDir.dot(vecToPed) > 0.7) return true; 
            }
        }
        return false;
    }

    // ★ 修改：拔掉 scene，安全移除
    stop() {
        if (this.truck) {
            if (this.truck.parent) {
                this.truck.parent.remove(this.truck);
            }
            this.truck.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    child.material.dispose();
                }
            });
            this.truck = null;
        }
        this.active = false;
        this.pathCurve = null;
    }
}