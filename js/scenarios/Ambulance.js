// --- 輔助函式 (保持不變) ---
function createAmbulanceMesh() {
    const group = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(2.2, 2.2, 5.5);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.1;
    group.add(body);
    
    const crossMat = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 1.5), crossMat);
    hBar.position.set(1.11, 1.5, 0);
    const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.4), crossMat);
    vBar.position.set(1.11, 1.5, 0);
    group.add(hBar, vBar);
    
    const lightGeo = new THREE.BoxGeometry(1.5, 0.3, 0.3);
    const lightMat = new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0xff0000 });
    const light = new THREE.Mesh(lightGeo, lightMat);
    light.position.set(0, 2.35, 0.5);
    light.name = "SirenLight"; 
    group.add(light);
    
    return group;
}

export default class AmbulanceScenario {
    constructor(allIntersections, pedestrians, bounds) { 
        this.name = "救護車直行讓道任務";
        this.pedestrians = pedestrians || [];
        this.bounds = bounds; 
        this.npc = null;
        this.active = false;
        this.hasReactionTest = true; 
        this.maxSpeed = 30.0; 
        this.speed = 0;
        
        this.pathCurve = null;
        this.progress = 0;
        
        this.lightTimer = 0;
        this.LANE_OFFSET = 4.0; 
        this.gameManager = null;
        
        this.blockingTimer = 0;
        this.BLOCKING_LIMIT = 5.0; 

        // 音效系統 
        this.audioContext = null;
        this.oscillator = null;
        this.gainNode = null;

        // UI 與快取 (★ 優化：防止重複操作 DOM)
        this.warningElement = null;
        this.lastWarningText = "";
        this.lastWarningColor = "";
        
        // 燈光快取 (★ 優化：防止每幀搜尋物件)
        this.sirenLightMesh = null;
    }

    start(scene, camera, gameManager) {
        if (this.active) return;

        this.gameManager = gameManager; 
        this.blockingTimer = 0; 

        console.log("--- 🚑 救護車出動！ ---");

        this._startSirenSound();
        this._showWarningUI();

        const rawDir = new THREE.Vector3();
        camera.getWorldDirection(rawDir);
        rawDir.y = 0; rawDir.normalize();

        const playerDir = new THREE.Vector3(0, 0, 0);
        if (Math.abs(rawDir.x) > Math.abs(rawDir.z)) {
            playerDir.x = Math.sign(rawDir.x) || 1; // 避免為 0
        } else {
            playerDir.z = Math.sign(rawDir.z) || 1;
        }
        playerDir.normalize(); 

        const playerPos = camera.position.clone();
        playerPos.y = 0;

        const spawnDistBehind = 40; 
        const startPos = playerPos.clone().add(playerDir.clone().multiplyScalar(-spawnDistBehind)); 

        if (this.bounds) {
            if (startPos.x < this.bounds.minX || startPos.x > this.bounds.maxX ||
                startPos.z < this.bounds.minZ || startPos.z > this.bounds.maxZ) {
                console.warn("⚠️ 救護車生成點超出邊界，取消生成");
                this.stop(); // ★ 改用安全的全域停止
                return false;;
            }
        }

        this.active = true;
        this.npc = createAmbulanceMesh();
        
        // ★ 快取燈光物件
        this.sirenLightMesh = this.npc.getObjectByName("SirenLight");
        
        this.npc.position.copy(startPos); 
        scene.add(this.npc);

        const endPos = startPos.clone().add(playerDir.clone().multiplyScalar(300));
        this._buildStraightPath(startPos, endPos);

        this.progress = 0;
        this.speed = this.maxSpeed;
        this._updateTransform(0);
    }

update(dt, nsState, ewState, camera) {
        if (!this.active || !this.npc) return true; 

        this._updateLights(dt);
        this._updateSirenPitch(dt);

        const distToPlayer = this.npc.position.distanceTo(camera.position);
        if (distToPlayer < 3.5) { 
            console.log("💥 撞到救護車！");
            if (this.gameManager) this.gameManager.triggerGameOver("發生車禍: 與救護車相撞");
            return true;
        }

        let targetSpeed = this.maxSpeed;
        let isBlocking = false;

        if (this._checkPlayerBlocking(camera)) {
            targetSpeed = 0; 
            isBlocking = true;
        } else if (this._checkPedestriansAhead()) {
            targetSpeed = 0;
        }

        // --- ★ 優化後的 UI 更新邏輯 ---
        if (isBlocking) {
            this.blockingTimer += dt;
            
            if (this.warningElement) {
                // 每 200ms 閃爍一次
                const newColor = (Math.floor(Date.now() / 200) % 2 === 0) ? "red" : "black";
                const newText = `⚠️ 讓道！救護車接近中！ (${Math.max(0, this.BLOCKING_LIMIT - this.blockingTimer).toFixed(1)})`;
                
                // 只有改變時才動 DOM
                if (this.lastWarningColor !== newColor) {
                    this.warningElement.style.backgroundColor = newColor;
                    this.lastWarningColor = newColor;
                }
                if (this.lastWarningText !== newText) {
                    this.warningElement.innerText = newText;
                    this.lastWarningText = newText;
                }
            }

            if (this.blockingTimer > this.BLOCKING_LIMIT) {
                if (this.gameManager) {
                    this.gameManager.triggerGameOver("任務失敗：未禮讓救護車 (超過5秒)");
                }
                return true; 
            }
        } else {
            this.blockingTimer = 0;
            if (this.warningElement) {
                const defaultColor = "rgba(255, 0, 0, 0.8)";
                const defaultText = "🚑 禮讓救護車先行！ 🚑";
                
                if (this.lastWarningColor !== defaultColor) {
                    this.warningElement.style.backgroundColor = defaultColor;
                    this.lastWarningColor = defaultColor;
                }
                if (this.lastWarningText !== defaultText) {
                    this.warningElement.innerText = defaultText;
                    this.lastWarningText = defaultText;
                }
            }
        }

        this.speed = THREE.MathUtils.lerp(this.speed, targetSpeed, dt * 2);

        if (!this.pathCurve) return true;

        const pathLen = this.pathCurve.getLength();
        const moveRatio = (this.speed * dt) / pathLen;
        this.progress += moveRatio;

        const currentPos = this.npc.position;
        
        // ★ 判定成功 1：救護車順利走完路線
        if (this.progress >= 1) {
            console.log("🚑 救護車任務完成");
            if (this.gameManager && typeof this.gameManager.recordEventSuccess === 'function') {
                this.gameManager.recordEventSuccess('ambulance', null);
            }
            this.stop(); 
            return true; 
        }

        if (this.bounds) {
            const isOut = currentPos.x < this.bounds.minX || currentPos.x > this.bounds.maxX ||
                          currentPos.z < this.bounds.minZ || currentPos.z > this.bounds.maxZ;
            // ★ 判定成功 2：救護車開出邊界 (也是一種順利通過)
            if (isOut) {
                if (this.progress > 0.1 && this.gameManager && typeof this.gameManager.recordEventSuccess === 'function') {
                    this.gameManager.recordEventSuccess('ambulance', null);
                }
                this.stop(); 
                return true;
            }
        }

        this._updateTransform(this.progress);
        return false;
    }

    _buildStraightPath(start, end) {
        this.pathCurve = new THREE.LineCurve3(start, end);
    }

    _updateTransform(t) {
        if (!this.pathCurve || !this.npc) return;
        const point = this.pathCurve.getPoint(t);
        const tangent = this.pathCurve.getTangent(t).normalize();
        
        this.npc.position.copy(point);
        const lookTarget = point.clone().add(tangent);
        this.npc.lookAt(lookTarget);
        this.npc.rotateY(Math.PI); 
    }

    _checkPlayerBlocking(camera) {
        if (!this.npc) return false;

        const ambPos = this.npc.position;
        const playerPos = camera.position;
        const dist = ambPos.distanceTo(playerPos);

        const toPlayer = new THREE.Vector3().subVectors(playerPos, ambPos);
        const forward = new THREE.Vector3();
        this.npc.getWorldDirection(forward);
        forward.negate(); 

        if (dist < 25 && forward.dot(toPlayer) > 0) { 
            const right = new THREE.Vector3(-forward.z, 0, forward.x);
            const lateralDist = Math.abs(toPlayer.dot(right));
            if (lateralDist < 2.5) {
                return true;
            }
        }
        return false;
    }

    _checkPedestriansAhead() {
        if (!this.pedestrians || !this.pathCurve || !this.npc) return false;
        const myPos = this.npc.position;
        const p1 = this.pathCurve.getPoint(this.progress);
        const p2 = this.pathCurve.getPoint(Math.min(this.progress + 0.01, 1));
        const forward = new THREE.Vector3().subVectors(p2, p1).normalize();

        for (let ped of this.pedestrians) {
            if (!ped.mesh) continue;
            const dist = myPos.distanceTo(ped.mesh.position);
            if (dist < 10) {
                const vecToPed = new THREE.Vector3().subVectors(ped.mesh.position, myPos).normalize();
                if (forward.dot(vecToPed) > 0.8) return true;
            }
        }
        return false;
    }

    _updateLights(dt) {
        // ★ 優化：直接使用快取的材質，不再每幀 getObjectByName
        if (!this.sirenLightMesh) return;
        
        this.lightTimer += dt * 8; 
        const state = Math.floor(this.lightTimer) % 2;
        
        if (state === 0) {
            this.sirenLightMesh.material.color.setHex(0xff0000); 
            this.sirenLightMesh.material.emissive.setHex(0xff0000);
        } else {
            this.sirenLightMesh.material.color.setHex(0x0000ff); 
            this.sirenLightMesh.material.emissive.setHex(0x0000ff);
        }
    }

    _startSirenSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            
            this.oscillator = this.audioContext.createOscillator();
            this.oscillator.type = 'sawtooth'; 
            
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 0.1; 
            
            this.oscillator.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
            
            this.oscillator.start();
            this.sirenTime = 0;
        } catch (e) {
            console.error("無法啟動音效:", e);
        }
    }

    _updateSirenPitch(dt) {
        if (this.oscillator && this.audioContext && this.audioContext.state === 'running') {
            this.sirenTime += dt * 3; 
            const frequency = 750 + Math.sin(this.sirenTime) * 150; 
            this.oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        }
    }

    _stopSirenSound() {
        if (this.oscillator) {
            try {
                this.oscillator.stop();
                this.oscillator.disconnect();
            } catch(e) {}
            this.oscillator = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }

    _showWarningUI() {
        if (document.getElementById('ambulance-alert')) return;

        const div = document.createElement('div');
        div.id = 'ambulance-alert';
        
        Object.assign(div.style, {
            position: 'fixed',
            top: '50px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(255, 0, 0, 0.8)', 
            color: 'white',
            padding: '15px 30px',
            fontSize: '24px',
            fontWeight: 'bold',
            borderRadius: '10px',
            zIndex: '9999',
            boxShadow: '0 0 20px rgba(255, 0, 0, 0.8)',
            animation: 'pulse 1s infinite'
        });

        document.body.appendChild(div);
        this.warningElement = div;
        
        // 初始化快取狀態
        this.lastWarningText = "";
        this.lastWarningColor = "rgba(255, 0, 0, 0.8)";
    }

    _hideWarningUI() {
        const div = document.getElementById('ambulance-alert');
        if (div) {
            div.remove();
        }
        this.warningElement = null;
    }

stop() { 
        this._stopSirenSound();
        this._hideWarningUI();

        if (this.npc) {
            // ★ 修正：改回相容所有 Three.js 版本的安全移除寫法
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
            this.sirenLightMesh = null; // 清空快取
        }
        this.active = false;
        this.pathCurve = null;
    }
}