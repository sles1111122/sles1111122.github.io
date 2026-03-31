// js/TrafficJudge.js

export class TrafficJudge {
    constructor(gameManager, camera, allIntersections, pedestrians) {
        this.gameManager = gameManager;
        this.camera = camera;
        this.allIntersections = allIntersections;
        this.pedestrians = pedestrians;
        // --- 狀態變數 ---
        // 這些變數用來追蹤持續性的違規 (例如逆向了幾秒)
        this.isWrongWay = false; 

        // --- 頻率限制 (Cooldown) & 鎖 (Lock) ---
        // 防止一瞬間扣分扣到爆
        this.offRoadCooldown = 0;    // 壓線冷卻
        this.redLightCooldown = 0;   // 闖紅燈冷卻
        this.wrongWayCooldown = 0;   // [新增] 逆向冷卻
        this.turnCheckLock = false;  // 方向燈檢查鎖 (一次轉彎只檢查一次)

        // --- 參數設定 ---
        this.ROAD_WIDTH = 24;
        this.STOP_LINE_DIST = this.ROAD_WIDTH / 2 + 20; 
        this.VIOLATION_DEPTH = 3; 
        this.COLLISION_THRESHOLD = 2.0; 
        
        // 方向燈檢查門檻 (方向盤轉超過 0.4 就算轉彎)
        this.TURN_THRESHOLD = 0.45; 
    }

    /**
     * 主要更新函式
     * @param {string} currentNSState - 南北向紅綠燈狀態
     * @param {string} currentEWState - 東西向紅綠燈狀態
     * @param {number} deltaTime - 時間差 (秒)
     * @param {Object} inputs - 玩家輸入狀態 { steering, leftSignal, rightSignal, isBraking }
     */
    update(currentNSState, currentEWState, deltaTime, inputs) {
        if (!this.gameManager.isRunning) return;

        // 1. 解構輸入資料 (如果沒傳 inputs，預設為空物件以免報錯)
        const { steering = 0, leftSignal = false, rightSignal = false, isBraking = false } = inputs || {};

        // 2. 更新冷卻時間
        if (this.offRoadCooldown > 0) this.offRoadCooldown -= deltaTime;
        if (this.redLightCooldown > 0) this.redLightCooldown -= deltaTime;
        if (this.wrongWayCooldown > 0) this.wrongWayCooldown -= deltaTime; // [新增]
        // 3. 取得車輛物理資訊
        const carPos = this.camera.position;
        const carDir = new THREE.Vector3();
        this.camera.getWorldDirection(carDir);

        // ==========================================
        //        執行各項檢查 (Check Logic)
        // ==========================================

        // [A] 物理環境檢查
        this._checkRedLight(carPos, carDir, currentNSState, currentEWState);
        this._checkPedestrianCollision(carPos);
        this._checkLaneDiscipline(carPos, carDir, deltaTime); // 包含逆向與壓線
        this._checkRedLine(carPos); // 邊界出界

        // [B] 操作習慣檢查 (新增功能)
        this._checkTurnSignals(steering, leftSignal, rightSignal);

        // [C] 反應測試檢查 (新增功能)
        // 如果 DataCollector 正在計時中，且玩家踩了煞車 -> 結算反應時間
    if (isBraking) {
            const reactTime = this.gameManager.dataCollector.recordReaction();
            if (reactTime !== null && this.gameManager.scenarioManager) {
                this.gameManager.recordEventSuccess(this.gameManager.scenarioManager.currentEventType, reactTime);
            }
        }
    }

    // ==========================================
    //           內部判定邏輯
    // ==========================================

    // --- 1. 方向燈檢查 (新功能) ---
    _checkTurnSignals(steering, leftOn, rightOn) {
        // 如果方向盤向左轉超過門檻
        if (steering > this.TURN_THRESHOLD) { 
            if (!this.turnCheckLock) {
                // 檢查是否沒打左燈
                if (!leftOn) {
                    //console.log("⚠️ 違規：左轉未打方向燈");
if (this.gameManager && this.gameManager.dataCollector) {
    this.gameManager.dataCollector.recordRegulation("方向燈", true, "轉彎未依規定打方向燈");
}        }
                this.turnCheckLock = true; // 鎖定，直到回正才解開
            }
        } 
        // 如果方向盤向右轉超過門檻
        else if (steering < -this.TURN_THRESHOLD) { 
            if (!this.turnCheckLock) {
                // 檢查是否沒打右燈
                if (!rightOn) {
                    //console.log("⚠️ 違規：右轉未打方向燈");
if (this.gameManager && this.gameManager.dataCollector) {
    this.gameManager.dataCollector.recordRegulation("方向燈", true, "轉彎未依規定打方向燈");
}        }
                this.turnCheckLock = true;
            }
        } 
        // 方向盤回正 (在 -0.1 ~ 0.1 之間) -> 解鎖
        else if (Math.abs(steering) < 0.1) {
            this.turnCheckLock = false; 
        }
    }

// --- 2. 逆向與壓線檢查 (全圖通用版) ---
    _checkLaneDiscipline(carPos, carDir, dt) {
        
        // 1. 定義街區大小 (必須跟你生成地圖時的設定一樣，通常是 100 或 200)
        const BLOCK_SIZE = 300; 

        // 2. 計算「相對」位置
        // Math.round(座標 / 100) * 100 可以算出「最近的路口中心座標」
        // 然後用 車子座標 - 路口中心 = 車子相對於路中心的偏移量 (offsetX, offsetZ)
        const nearestRoadCenterX = Math.round(carPos.x / BLOCK_SIZE) * BLOCK_SIZE;
        const nearestRoadCenterZ = Math.round(carPos.z / BLOCK_SIZE) * BLOCK_SIZE;

        const offsetX = carPos.x - nearestRoadCenterX; // 距離南北路中心的偏移 (負數=左邊, 正數=右邊)
        const offsetZ = carPos.z - nearestRoadCenterZ; // 距離東西路中心的偏移

        // 3. 判斷是否在道路範圍內 (用偏移量來算)
        const onNSRoad = Math.abs(offsetX) < this.ROAD_WIDTH / 2;
        const onEWRoad = Math.abs(offsetZ) < this.ROAD_WIDTH / 2;

        // 4. 路口判定 (如果你同時在南北路範圍 和 東西路範圍，就是在路口)
        if (onNSRoad && onEWRoad) {
            this.isWrongWay = false;
            return;
        }

        let isCurrentlyWrongWay = false;
        const CENTER_BUFFER = 0.5; // 緩衝區，避免壓在正中線上狂閃

        // 5. 南北路逆向判定 (使用 offsetX)
        if (onNSRoad) {
            const roadDirZ = new THREE.Vector3(0, 0, 1);
            const dot = carDir.dot(roadDirZ);
            
            // 原理：offsetX > 0 代表你在路的右側 (以地圖X軸正向為右)
            // 假設：右側車道 (offsetX > 0) 應該往 Z- (北方, dot < 0) 行駛
            //      左側車道 (offsetX < 0) 應該往 Z+ (南方, dot > 0) 行駛
            // (請依照你的遊戲實際車道方向調整以下邏輯，這裡預設是台灣/美國靠右行駛)

            // 如果車子面向 Z+ (dot > 0，往南)，但車子卻在 X+ (offsetX > 0，東側車道)，那就是逆向
            if (dot > 0 && offsetX > CENTER_BUFFER) isCurrentlyWrongWay = true;
            // 如果車子面向 Z- (dot < 0，往北)，但車子卻在 X- (offsetX < -CENTER_BUFFER，西側車道)，也是逆向
            else if (dot < 0 && offsetX < -CENTER_BUFFER) isCurrentlyWrongWay = true;
        } 
        
        // 6. 東西路逆向判定 (使用 offsetZ)
        else if (onEWRoad) {
            const roadDirX = new THREE.Vector3(1, 0, 0);
            const dot = carDir.dot(roadDirX);

            // 如果車子面向 X+ (dot > 0，往東)，但車子卻在 Z- (offsetZ < 0，北側車道)，逆向
            if (dot > 0 && offsetZ < -CENTER_BUFFER) isCurrentlyWrongWay = true;
            // 如果車子面向 X- (dot < 0，往西)，但車子卻在 Z+ (offsetZ > 0，南側車道)，逆向
            else if (dot < 0 && offsetZ > CENTER_BUFFER) isCurrentlyWrongWay = true;
        }

this.isWrongWay = isCurrentlyWrongWay;

        // ★ 累加懲罰 (加入冷卻時間)
        if (this.isWrongWay) {
            if (this.wrongWayCooldown <= 0) {
                //console.log(`逆向! OffsetX: ${offsetX.toFixed(1)}, OffsetZ: ${offsetZ.toFixed(1)}`);
                if (this.gameManager && this.gameManager.dataCollector) {
                    this.gameManager.dataCollector.recordRegulation("雙黃線", true, "逆向/偏離車道");
                }
                this.wrongWayCooldown = 2.0; // 設定 2 秒冷卻，避免狂洗報表
            }
        }
    }

    // --- 3. 紅燈判定 (維持原樣，加入 cooldown) ---
    _checkRedLight(carPos, carDir, nsState, ewState) {
        if (this.redLightCooldown > 0) return;

        for (let intersection of this.allIntersections) {
            const vecToCenter = new THREE.Vector3(intersection.x - carPos.x, 0, intersection.z - carPos.z);
            if (carDir.dot(vecToCenter) > 0) {
                const dx = Math.abs(carPos.x - intersection.x);
                const dz = Math.abs(carPos.z - intersection.z);
                const halfRoad = this.ROAD_WIDTH / 2;

                const checkViolation = (dist) => {
                    if (dist < this.STOP_LINE_DIST && dist > (this.STOP_LINE_DIST - this.VIOLATION_DEPTH)) {
                        console.log("🛑 裁判判定：闖紅燈！");
                        this.gameManager.dataCollector.recordRegulation("紅綠燈", true, "闖紅燈");
                        this.redLightCooldown = 5.0; 
                        return true;
                    }
                    return false;
                };

                if (dx < halfRoad && nsState === 'red') {
                    if (checkViolation(dz)) return;
                }
                if (dz < halfRoad && ewState === 'red') {
                    if (checkViolation(dx)) return;
                }
            }
        }
    }

    // --- 4. 行人碰撞判定 ---
    _checkPedestrianCollision(carPos) {
        for (let ped of this.pedestrians) {
            const dist = carPos.distanceTo(ped.mesh.position);
            if (dist < this.COLLISION_THRESHOLD) {
                console.log("🚑 裁判判定：發生車禍 (撞到行人)");
                this.gameManager.dataCollector.report.safety.collisions.push("行人");
                this.gameManager.triggerGameOver("發生車禍:撞到路人");
                return;
            }
        }
    }

    // --- 5. 出界判定 ---
    _checkRedLine(carPos) {
        if (this._isInIntersection(carPos, 4.0)) return; 

        const halfRoad = this.ROAD_WIDTH / 2;
        const limit = halfRoad; // Buffer
        
        const absX = Math.abs(carPos.x);
        const absZ = Math.abs(carPos.z);
        const modX = absX % 100;
        const modZ = absZ % 100;
        const distToVerticalLane = Math.min(modX, 100 - modX);
        const distToHorizontalLane = Math.min(modZ, 100 - modZ);

        const onVerticalRoad = distToVerticalLane < limit;
        const onHorizontalRoad = distToHorizontalLane < limit;

        if (!onVerticalRoad && !onHorizontalRoad) {
            if (this.offRoadCooldown <= 0) {
                console.log("⚠️ 違規：車輛出界");
                this.gameManager.dataCollector.recordRegulation("路面邊線", true, "壓線/出界");
                this.offRoadCooldown = 2.0; 
            }
        }
    }

    // 輔助：判斷是否在路口
    _isInIntersection(carPos, buffer = 0) {
        const checkDist = (this.ROAD_WIDTH / 2) + buffer;
        for (let intersection of this.allIntersections) {
            const dx = Math.abs(carPos.x - intersection.x);
            const dz = Math.abs(carPos.z - intersection.z);
            if (dx < checkDist && dz < checkDist) return true;
        }
        return false;
    }
}